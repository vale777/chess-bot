// Stockfish (UCI) wrapper + whole-game analysis.
// The engine talks over a tiny "transport" so the same code runs in the browser
// (Web Worker) and in Node tests (the `stockfish` npm module).
import { Chess } from "chess.js";

/** Browser transport: Stockfish WASM in a Web Worker. */
export function workerTransport(url) {
  const worker = new Worker(url);
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => (worker.onmessage = (e) => cb(String(e.data))),
    terminate: () => worker.terminate(),
  };
}

export function parseInfo(line) {
  if (!line.startsWith("info ") || !line.includes(" score ")) return null;
  const multipv = line.match(/\bmultipv (\d+)/);
  if (multipv && multipv[1] !== "1") return null;
  if (/\b(lowerbound|upperbound)\b/.test(line)) return null;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!score) return null;
  const pv = line.match(/\bpv (.+)$/)?.[1].trim().split(/\s+/) ?? [];
  return { depth, kind: score[1], value: Number(score[2]), pv };
}

export class Engine {
  constructor(transport) {
    this.t = transport;
    this.listeners = new Set();
    this.queue = Promise.resolve();
    transport.onLine((line) => {
      for (const l of [...this.listeners]) l(line);
    });
  }

  waitFor(pred) {
    return new Promise((resolve) => {
      const l = (line) => {
        if (pred(line)) {
          this.listeners.delete(l);
          resolve(line);
        }
      };
      this.listeners.add(l);
    });
  }

  async init() {
    const ok = this.waitFor((l) => l === "uciok");
    this.t.send("uci");
    await ok;
    this.t.send("setoption name Hash value 32");
    await this.ready();
  }

  async ready() {
    const r = this.waitFor((l) => l === "readyok");
    this.t.send("isready");
    await r;
  }

  newGame() {
    this.t.send("ucinewgame");
    return this.ready();
  }

  /**
   * Evaluate one position. Returns { kind, value, pv, bestmove } from the
   * side-to-move's point of view. Rejects with AbortError if `signal` fires.
   */
  evaluate(startFen, movesUci, depth, signal) {
    let last = null;
    const onInfo = (line) => {
      const info = parseInfo(line);
      if (info) last = info;
    };
    this.listeners.add(onInfo);
    const done = this.waitFor((l) => l.startsWith("bestmove"));
    const pos = movesUci.length ? ` moves ${movesUci.join(" ")}` : "";
    this.t.send(`position fen ${startFen}${pos}`);
    this.t.send(`go depth ${depth}`);
    const onAbort = () => this.t.send("stop");
    signal?.addEventListener("abort", onAbort, { once: true });
    return done.then((line) => {
      this.listeners.delete(onInfo);
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
      const bestmove = line.split(/\s+/)[1];
      return { ...(last ?? { kind: "cp", value: 0, pv: [] }), bestmove };
    });
  }

  /** Run `fn` exclusively (one game analysis at a time). */
  exclusive(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  terminate() {
    this.t.terminate?.();
  }
}

function uciOf(move) {
  return move.from + move.to + (move.promotion ?? "");
}

/** Convert a list of UCI moves to SAN from a given FEN (stops at the first illegal move). */
export function uciLineToSan(fen, uciMoves, max = 6) {
  const c = new Chess(fen);
  const out = [];
  for (const u of uciMoves.slice(0, max)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Analyze every position of a game.
 * @returns {{
 *   startFen: string, firstMover: "w"|"b",
 *   moves: Array<{san, uci, from, to, before, after}>,
 *   evals: Array<{cp?:number, mate?:number, winner?:string}>,   // white POV, length = moves+1
 *   best:  Array<{uci, san, pv: string[]} | null>,                 // best move in position i
 *   depth: number
 * }}
 */
export function analyzeGame(engine, pgn, opts = {}) {
  return engine.exclusive(() => analyzeGameNow(engine, pgn, opts));
}

async function analyzeGameNow(engine, pgn, { depth = 14, onProgress, signal } = {}) {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });
  const startFen = history.length ? history[0].before : game.fen();
  const firstMover = startFen.split(" ")[1];

  const moves = history.map((m) => ({
    san: m.san,
    uci: uciOf(m),
    from: m.from,
    to: m.to,
    before: m.before,
    after: m.after,
  }));

  await engine.newGame();
  const replay = new Chess(startFen);
  const evals = [];
  const best = [];
  for (let i = 0; i <= moves.length; i++) {
    if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
    if (i > 0) replay.move(moves[i - 1].san);
    const fen = replay.fen();
    const stm = replay.turn();

    if (replay.isCheckmate()) {
      evals.push({ mate: 0, winner: stm === "w" ? "b" : "w" });
      best.push(null);
    } else if (replay.isDraw()) {
      evals.push({ cp: 0 });
      best.push(null);
    } else {
      const r = await engine.evaluate(startFen, moves.slice(0, i).map((m) => m.uci), depth, signal);
      const sign = stm === "w" ? 1 : -1;
      evals.push(r.kind === "mate" ? { mate: sign * r.value } : { cp: sign * r.value });
      const pvSan = uciLineToSan(fen, r.pv.length ? r.pv : [r.bestmove]);
      best.push({ uci: r.bestmove, san: pvSan[0] ?? r.bestmove, pv: pvSan });
    }
    onProgress?.(i, moves.length);
  }
  return { startFen, firstMover, moves, evals, best, depth };
}
