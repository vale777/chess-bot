import { allAnalyzed } from "../store.js";
import { estimateElo } from "../metrics.js";
import { buildReport } from "../report.js";
import { esc, fmtPct, fmtDate, RESULT_LABEL, TIME_ICON } from "./util.js";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function aggregate(rows) {
  const n = rows.length;
  const acpl = mean(rows.map((r) => r.s.acpl));
  return {
    n,
    accuracy: mean(rows.map((r) => r.s.accuracy)),
    acpl,
    elo: estimateElo(acpl),
    blunders: n ? rows.reduce((a, r) => a + r.c.blunder, 0) / n : null,
    mistakes: n ? rows.reduce((a, r) => a + r.c.mistake, 0) / n : null,
    missed: n ? rows.reduce((a, r) => a + r.c.miss, 0) / n : null,
    brilliant: n ? rows.reduce((a, r) => a + r.c.brilliant + r.c.great, 0) / n : null,
    rating: mean(rows.map((r) => r.game.me.rating)),
  };
}

export async function renderStats(root) {
  const items = await allAnalyzed();
  if (!items.length) {
    root.innerHTML = `<div class="card empty"><h2>No analyzed games yet</h2>
      <p>Open a game from the <a href="#/">games list</a> and press “Analyze”. Stats are built from all games analyzed on this device.</p></div>`;
    return;
  }

  const rows = (
    await Promise.all(
      items.map(async ({ game, analysis }) => {
        const rep = await buildReport(game, analysis);
        return { game, s: rep.scored.summary[game.myColor], c: rep.counts[game.myColor] };
      })
    )
  )
    .filter((r) => r.s.moves > 0)
    .sort((a, b) => a.game.endTime - b.game.endTime);

  const all = aggregate(rows);
  const byClass = ["bullet", "blitz", "rapid", "daily"]
    .map((tc) => ({ tc, a: aggregate(rows.filter((r) => r.game.timeClass === tc)) }))
    .filter((x) => x.a.n);

  const tile = (big, label, note = "") =>
    `<div class="tile"><div class="big">${big}</div><div class="muted small">${label}</div>${note ? `<div class="muted tiny">${note}</div>` : ""}</div>`;

  root.innerHTML = `
    <h2 class="page-title">Your stats <span class="muted small">· ${all.n} analyzed game${all.n === 1 ? "" : "s"} on this device</span></h2>
    <div class="tiles">
      ${tile(fmtPct(all.accuracy) + "%", "Average accuracy")}
      ${tile(all.elo ?? "–", "Estimated Elo*", `chess.com rating avg ${Math.round(all.rating)}`)}
      ${tile(Math.round(all.acpl), "Avg. centipawn loss")}
      ${tile(all.blunders.toFixed(1), "Blunders / game", `${all.mistakes.toFixed(1)} mistakes · ${all.missed.toFixed(1)} misses · ${all.brilliant.toFixed(1)} brilliant/great`)}
    </div>
    <div class="card">
      <h3>Accuracy per game</h3>
      <div id="chart"></div>
    </div>
    <div class="card">
      <h3>By time control</h3>
      <div class="table-wrap"><table class="datatable">
        <thead><tr><th>Type</th><th>Games</th><th>Accuracy</th><th>ACPL</th><th>Est. Elo*</th><th>Your rating</th><th>Blunders/game</th></tr></thead>
        <tbody>${byClass
          .map(
            ({ tc, a }) => `<tr><td>${TIME_ICON[tc]} ${tc}</td><td>${a.n}</td><td>${fmtPct(a.accuracy)}%</td><td>${Math.round(a.acpl)}</td>
            <td>${a.elo}</td><td>${Math.round(a.rating)}</td><td>${a.blunders.toFixed(1)}</td></tr>`
          )
          .join("")}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h3>Analyzed games</h3>
      <div class="table-wrap"><table class="datatable">
        <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>Accuracy</th><th title="Brilliant">!!</th><th title="Great">!</th><th title="Mistakes">?</th><th title="Misses">✗</th><th title="Blunders">??</th></tr></thead>
        <tbody>${[...rows]
          .reverse()
          .map(
            (r) => `<tr><td>${fmtDate(r.game.endTime)}</td>
            <td><a href="#/game/${encodeURIComponent(r.game.id)}">${esc(r.game.opp.name)}</a> <span class="muted">(${r.game.opp.rating})</span></td>
            <td class="${r.game.outcome}">${RESULT_LABEL[r.game.outcome]}</td><td>${fmtPct(r.s.accuracy)}%</td>
            <td>${r.c.brilliant}</td><td>${r.c.great}</td><td>${r.c.mistake}</td><td>${r.c.miss}</td><td>${r.c.blunder}</td></tr>`
          )
          .join("")}</tbody>
      </table></div>
    </div>
    <p class="muted tiny pad">*The Elo estimate is a rough heuristic from average centipawn loss (≈ 3100·e<sup>−0.01·ACPL</sup>). It gets more meaningful the more games you analyze and works best when compared within the same time control.</p>`;

  renderAccuracyChart(root.querySelector("#chart"), rows);
}

function renderAccuracyChart(el, rows) {
  const W = 800, H = 220, L = 36, R = 10, T = 10, B = 24;
  const n = rows.length;
  const x = (i) => L + (n > 1 ? (i / (n - 1)) * (W - L - R) : (W - L - R) / 2);
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  // 5-game moving average shows the trend without hiding single games.
  const avg = rows.map((_, i) => mean(rows.slice(Math.max(0, i - 4), i + 1).map((r) => r.s.accuracy)));
  const grid = [0, 25, 50, 75, 100]
    .map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`)
    .join("");
  const trend = avg.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const dots = rows
    .map(
      (r, i) => `<g class="pt"><circle cx="${x(i)}" cy="${y(r.s.accuracy)}" r="4" class="acc-dot ${r.game.outcome}"/>
      <circle cx="${x(i)}" cy="${y(r.s.accuracy)}" r="12" class="hit"><title>${fmtDate(r.game.endTime)} vs ${esc(r.game.opp.name)}: ${fmtPct(r.s.accuracy)}% (${RESULT_LABEL[r.game.outcome]})</title></circle></g>`
    )
    .join("");
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="acc-chart" role="img" aria-label="Accuracy per analyzed game with 5-game average">
      ${grid}
      ${n > 1 ? `<polyline points="${trend}" class="trend"/>` : ""}
      ${dots}
    </svg>
    <div class="graph-legend muted tiny"><span><i class="lg dotlg"></i>one game (hover for details)</span><span><i class="lg linelg"></i>5-game average</span></div>`;
}
