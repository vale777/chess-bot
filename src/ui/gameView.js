import { Chessboard, COLOR, FEN } from "cm-chessboard/src/Chessboard.js";
import { Arrows, ARROW_TYPE } from "cm-chessboard/src/extensions/arrows/Arrows.js";
import { Markers, MARKER_TYPE } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess } from "chess.js";
import { Engine, workerTransport, analyzeGame } from "../engine.js";
import { scoreGame, formatEval, estimateElo, SYMBOL } from "../metrics.js";
import { getGame, getAnalysis, saveAnalysis, deleteAnalysis, getSettings } from "../store.js";
import { renderEvalGraph } from "./evalGraph.js";
import { esc, fmtPct, fmtDate, RESULT_LABEL } from "./util.js";

const ASSETS = `${import.meta.env.BASE_URL}cm/`;
const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

let enginePromise = null;
function getEngine() {
  enginePromise ??= (async () => {
    const e = new Engine(workerTransport(ENGINE_URL));
    await e.init();
    return e;
  })();
  return enginePromise;
}

const JUDGE_LABEL = { blunder: "Blunder", mistake: "Mistake", inaccuracy: "Inaccuracy" };

export async function renderGameView(root, id) {
  const game = await getGame(id);
  if (!game) {
    root.innerHTML = `<div class="card error">Game not found on this device. <a href="#/">Back to games</a></div>`;
    return;
  }
  const settings = await getSettings();

  // Moves are known from the PGN even before analysis, so the board works right away.
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const history = chess.history({ verbose: true });
  const fens = [history.length ? history[0].before : chess.fen(), ...history.map((m) => m.after)];

  const state = { ply: fens.length - 1, analysis: null, scored: null, abort: null };

  root.innerHTML = `
    <div class="game-head">
      <a href="#/" class="back" aria-label="Back">←</a>
      <div>
        <div class="title"><span class="res-badge ${game.outcome}">${RESULT_LABEL[game.outcome]}</span>
          vs <b>${esc(game.opp.name)}</b> (${game.opp.rating})</div>
        <div class="muted small">${esc(game.timeClass)} · ${fmtDate(game.endTime)} · you played ${game.myColor === "w" ? "White" : "Black"} (${game.me.rating})
          · <a href="${esc(game.url)}" target="_blank" rel="noopener">open on chess.com ↗</a></div>
      </div>
    </div>
    <div class="game-layout">
      <section class="board-col">
        <div id="board" class="board"></div>
        <div class="navbar">
          <button data-nav="first" aria-label="First move">⏮</button>
          <button data-nav="prev" aria-label="Previous move">◀</button>
          <button data-nav="next" aria-label="Next move">▶</button>
          <button data-nav="last" aria-label="Last move">⏭</button>
          <button data-nav="mistake" class="wide" title="Jump to your next mistake">Next mistake ⚑</button>
        </div>
        <div id="moveinfo" class="card moveinfo"></div>
      </section>
      <section class="side-col">
        <div id="analyze" class="card"></div>
        <div id="summary"></div>
        <div id="graph" class="card graph-card" hidden></div>
        <div id="moves" class="card moves"></div>
      </section>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const board = new Chessboard($("#board"), {
    position: fens[state.ply] ?? FEN.start,
    orientation: game.myColor === "w" ? COLOR.white : COLOR.black,
    assetsUrl: ASSETS,
    style: { cssClass: "green", pieces: { file: "pieces/standard.svg" }, animationDuration: 150 },
    extensions: [{ class: Arrows }, { class: Markers, props: { autoMarkers: null } }],
  });

  // ---- rendering --------------------------------------------------------
  function moveNumber(ply) {
    const firstFull = Number(fens[0].split(" ")[5]);
    const blackFirst = fens[0].split(" ")[1] === "b";
    const idx = ply - 1 + (blackFirst ? 1 : 0);
    return { num: firstFull + Math.floor(idx / 2), white: idx % 2 === 0 };
  }

  function showPly(ply) {
    state.ply = Math.max(0, Math.min(fens.length - 1, ply));
    board.setPosition(fens[state.ply], true);
    board.removeArrows();
    board.removeMarkers();

    const info = $("#moveinfo");
    if (state.ply === 0) {
      info.innerHTML = `<span class="muted">Starting position. Use ◀ ▶ or swipe the board.</span>`;
    } else {
      const m = history[state.ply - 1];
      const { num, white } = moveNumber(state.ply);
      const label = `${num}${white ? "." : "…"} ${m.san}`;
      board.addMarker(MARKER_TYPE.square, m.from);
      board.addMarker(MARKER_TYPE.square, m.to);

      if (!state.scored) {
        info.innerHTML = `<b>${esc(label)}</b> <span class="muted">· analyze the game to see evaluations</span>`;
      } else {
        const sm = state.scored.moves[state.ply - 1];
        const best = state.analysis.best[state.ply - 1];
        const evBefore = state.analysis.evals[state.ply - 1];
        const evAfter = state.analysis.evals[state.ply];
        const isBest = best && best.uci === uciOf(m);
        const who = sm.color === game.myColor ? "You" : "Opponent";
        const arrowType = { blunder: ARROW_TYPE.danger, mistake: ARROW_TYPE.danger, inaccuracy: ARROW_TYPE.warning }[sm.judgement] ?? ARROW_TYPE.info;
        board.addArrow(arrowType, m.from, m.to);
        if (best && !isBest && best.uci?.length >= 4) board.addArrow(ARROW_TYPE.success, best.uci.slice(0, 2), best.uci.slice(2, 4));

        const tag = sm.judgement
          ? `<span class="judge ${sm.judgement}">${SYMBOL[sm.judgement]} ${JUDGE_LABEL[sm.judgement]}</span>`
          : isBest ? `<span class="judge best">★ Best move</span>` : `<span class="judge good">✓ Good</span>`;
        const missed = sm.missed ? `<span class="judge missed">💡 Missed opportunity</span>` : "";
        info.innerHTML = `
          <div class="mi-top"><b>${esc(label)}</b> ${tag} ${missed}</div>
          <div class="small">${who} played <b>${esc(m.san)}</b> → ${formatEval(evAfter)}
            <span class="muted">(win chance ${fmtPct(sm.winBefore)}% → ${fmtPct(sm.winAfter)}%, accuracy ${fmtPct(sm.accuracy)}%)</span></div>
          ${best && !isBest
            ? `<div class="small best-line">Best was <b>${esc(best.san)}</b> (${formatEval(evBefore)}) <span class="muted">${esc(best.pv.join(" "))}</span></div>`
            : ""}`;
      }
    }
    root.querySelectorAll(".mv").forEach((el) => el.classList.toggle("cur", Number(el.dataset.ply) === state.ply));
    root.querySelector(`.mv[data-ply="${state.ply}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (state.scored) drawGraph();
  }

  function drawGraph() {
    const g = $("#graph");
    g.hidden = false;
    renderEvalGraph(g, state.scored, state.ply, game.myColor, (p) => showPly(p));
  }

  function renderMoves() {
    const rows = [];
    const blackFirst = fens[0].split(" ")[1] === "b";
    let ply = 1;
    let num = Number(fens[0].split(" ")[5]);
    const cell = (p) => {
      if (p > history.length) return `<span></span>`;
      const sm = state.scored?.moves[p - 1];
      const sym = sm?.judgement ? `<sup class="${sm.judgement}">${SYMBOL[sm.judgement]}</sup>` : "";
      const miss = sm?.missed ? `<sup class="missed">💡</sup>` : "";
      const mine = sm && sm.color === game.myColor ? "mine" : "";
      return `<button class="mv ${mine} ${sm?.judgement ?? ""}" data-ply="${p}">${esc(history[p - 1].san)}${sym}${miss}</button>`;
    };
    if (blackFirst) {
      rows.push(`<span class="num">${num}.</span><span>…</span>${cell(1)}`);
      ply = 2;
      num++;
    }
    for (; ply <= history.length; ply += 2, num++) rows.push(`<span class="num">${num}.</span>${cell(ply)}${cell(ply + 1)}`);
    $("#moves").innerHTML = `<div class="movegrid">${rows.join("")}</div>`;
  }

  function renderSummary() {
    if (!state.scored) {
      $("#summary").innerHTML = "";
      return;
    }
    const me = state.scored.summary[game.myColor];
    const opp = state.scored.summary[game.myColor === "w" ? "b" : "w"];
    const cc = game.chesscomAccuracy;
    const row = (label, a, b, cls = "") => `<tr class="${cls}"><td>${label}</td><td>${a}</td><td>${b}</td></tr>`;
    $("#summary").innerHTML = `
      <div class="card">
        <div class="acc-head">
          <div class="acc mine"><div class="big">${fmtPct(me.accuracy)}</div><div class="muted small">Your accuracy</div></div>
          <div class="acc"><div class="big">${fmtPct(opp.accuracy)}</div><div class="muted small">${esc(game.opp.name)}</div></div>
        </div>
        <table class="sumtable">
          <thead><tr><th></th><th>You</th><th>Opp.</th></tr></thead>
          ${cc ? row("chess.com accuracy", fmtPct(cc.me), fmtPct(cc.opp), "muted") : ""}
          ${row(`<span class="blunder">??</span> Blunders`, me.blunders, opp.blunders)}
          ${row(`<span class="mistake">?</span> Mistakes`, me.mistakes, opp.mistakes)}
          ${row(`<span class="inaccuracy">?!</span> Inaccuracies`, me.inaccuracies, opp.inaccuracies)}
          ${row(`💡 Missed opportunities`, me.missed, opp.missed)}
          ${row("Avg. centipawn loss", Math.round(me.acpl), Math.round(opp.acpl))}
          ${row("Performance estimate*", estimateElo(me.acpl) ?? "–", estimateElo(opp.acpl) ?? "–")}
        </table>
        <p class="muted tiny">*Rough Elo guess from centipawn loss in this single game. It is only meaningful when averaged over many games (see Stats).</p>
      </div>`;
  }

  function renderAnalyzePanel() {
    const p = $("#analyze");
    if (state.abort) return;
    if (state.analysis) {
      p.innerHTML = `<div class="row-between"><span class="muted small">Analyzed with Stockfish 19 (lite) · depth ${state.analysis.depth}</span>
        <button id="reanalyze" class="link">Re-analyze</button></div>`;
      p.querySelector("#reanalyze").onclick = async () => {
        await deleteAnalysis(game.id);
        state.analysis = state.scored = null;
        renderAll();
        runAnalysis();
      };
    } else {
      p.innerHTML = `<button id="go" class="primary">Analyze with Stockfish</button>
        <div class="muted small">Depth ${settings.depth} · runs on this device · ${history.length} moves</div>`;
      p.querySelector("#go").onclick = runAnalysis;
    }
  }

  function renderAll() {
    renderAnalyzePanel();
    renderSummary();
    renderMoves();
    if (!state.scored) $("#graph").hidden = true;
    showPly(state.ply);
  }

  async function runAnalysis() {
    const p = $("#analyze");
    state.abort = new AbortController();
    p.innerHTML = `
      <div class="row-between"><span id="ptext" class="small">Loading engine…</span><button id="cancel" class="link">Cancel</button></div>
      <div class="progress"><div id="pbar"></div></div>`;
    p.querySelector("#cancel").onclick = () => state.abort?.abort();
    const t0 = performance.now();
    try {
      const engine = await getEngine();
      const result = await analyzeGame(engine, game.pgn, {
        depth: settings.depth,
        signal: state.abort.signal,
        onProgress: (i, n) => {
          const pct = Math.round(((i + 1) / (n + 1)) * 100);
          const bar = root.querySelector("#pbar");
          if (bar) bar.style.width = pct + "%";
          const txt = root.querySelector("#ptext");
          if (txt) txt.textContent = `Analyzing move ${Math.min(i + 1, n)} of ${n}…`;
        },
      });
      result.analyzedAt = Date.now();
      result.seconds = Math.round((performance.now() - t0) / 1000);
      await saveAnalysis(game.id, result);
      state.abort = null;
      setAnalysis(result);
      renderAll();
    } catch (e) {
      state.abort = null;
      if (e.name !== "AbortError") {
        console.error(e);
        p.innerHTML = `<div class="error">Analysis failed: ${esc(e.message)}</div>`;
      } else renderAnalyzePanel();
    }
  }

  function setAnalysis(a) {
    state.analysis = a;
    state.scored = scoreGame(a.evals, a.firstMover);
  }

  function nextMistake() {
    if (!state.scored) return;
    const all = state.scored.moves.filter((m) => m.color === game.myColor && (m.judgement === "mistake" || m.judgement === "blunder" || m.missed));
    const next = all.find((m) => m.ply > state.ply) ?? all[0];
    if (next) showPly(next.ply);
  }

  // ---- events -----------------------------------------------------------
  root.querySelector(".navbar").addEventListener("click", (e) => {
    const n = e.target.closest("button")?.dataset.nav;
    if (n === "first") showPly(0);
    else if (n === "prev") showPly(state.ply - 1);
    else if (n === "next") showPly(state.ply + 1);
    else if (n === "last") showPly(fens.length - 1);
    else if (n === "mistake") nextMistake();
  });
  $("#moves").addEventListener("click", (e) => {
    const b = e.target.closest(".mv");
    if (b) showPly(Number(b.dataset.ply));
  });
  const onKey = (e) => {
    if (e.target.matches("input, select, textarea")) return;
    if (e.key === "ArrowLeft") showPly(state.ply - 1);
    else if (e.key === "ArrowRight") showPly(state.ply + 1);
    else if (e.key === "Home") showPly(0);
    else if (e.key === "End") showPly(fens.length - 1);
    else return;
    e.preventDefault();
  };
  document.addEventListener("keydown", onKey);

  let touchX = null;
  const boardEl = $("#board");
  boardEl.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  boardEl.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) showPly(state.ply + (dx < 0 ? 1 : -1));
  });

  // ---- init -------------------------------------------------------------
  const cached = await getAnalysis(game.id);
  if (cached) setAnalysis(cached);
  renderAll();

  return () => {
    state.abort?.abort();
    document.removeEventListener("keydown", onKey);
    board.destroy();
  };
}

function uciOf(m) {
  return m.from + m.to + (m.promotion ?? "");
}
