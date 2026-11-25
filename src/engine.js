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
  const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
  if (/\b(lowerbound|upperbound)\b/.test(line)) return null;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!score) return null;
  const pv = line.match(/\bpv (.+)$/)?.[1].trim().split(/\s+/) ?? [];
  return { depth, multipv, kind: score[1], value: Number(score[2]), pv };
}

export class Engine {
  /** @param {{multiPV?: number}} opts  multiPV 2 lets us detect "only good move" (Great) moves */
  constructor(transport, { multiPV = 1 } = {}) {
    this.t = transport;
    this.multiPV = multiPV;
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
    this.t.send(`setoption name MultiPV value ${this.multiPV}`);
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
   * Evaluate one position. Returns { kind, value, pv, bestmove, second } from the
   * side-to-move's point of view (`second` = 2nd-best line when MultiPV >= 2).
   * Rejects with AbortError if `signal` fires.
   */
  evaluate(startFen, movesUci, depth, signal) {
    const lines = [];
    const onInfo = (line) => {
      const info = parseInfo(line);
      if (info) lines[info.multipv] = info;
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
      const first = lines[1] ?? { kind: "cp", value: 0, pv: [] };
      return { ...first, bestmove, second: lines[2] ?? null };
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
 *   best:  Array<{uci, san, pv: string[], second?: eval|null} | null>,  // engine's choice in position i
 *   legalCounts: number[],                                         // legal moves in position i
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
  const legalCounts = [];
  for (let i = 0; i <= moves.length; i++) {
    if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
    if (i > 0) replay.move(moves[i - 1].san);
    const fen = replay.fen();
    const stm = replay.turn();
    legalCounts.push(replay.moves().length);

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
      const toWhite = (x) => (x.kind === "mate" ? { mate: sign * x.value } : { cp: sign * x.value });
      best.push({ uci: r.bestmove, san: pvSan[0] ?? r.bestmove, pv: pvSan, second: r.second ? toWhite(r.second) : null });
    }
    onProgress?.(i, moves.length);
  }
  return { version: 2, startFen, firstMover, moves, evals, best, legalCounts, depth };
}
