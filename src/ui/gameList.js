import { fetchArchives, fetchMonth, monthLabel } from "../chesscom.js";
import { getSettings, saveGame, analyzedIds, getCachedMonth, saveCachedMonth } from "../store.js";
import { esc, fmtDate, fmtPct, RESULT_LABEL, TIME_ICON } from "./util.js";

// Kept for the session so going back to the list is instant.
const session = { user: null, archives: null, month: null, filter: "all" };

export async function renderGameList(root) {
  const { username } = await getSettings();
  if (!username) {
    root.innerHTML = `
      <div class="card empty">
        <h2>Welcome!</h2>
        <p>Enter your chess.com username in <a href="#/settings">Settings</a> to load your games.</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <select id="month" aria-label="Month"><option>Loading…</option></select>
      <div class="chips" id="filters">
        ${["all", "bullet", "blitz", "rapid", "daily"]
          .map((f) => `<button data-f="${f}" class="chip ${session.filter === f ? "on" : ""}">${f === "all" ? "All" : TIME_ICON[f] + " " + f}</button>`)
          .join("")}
      </div>
    </div>
    <div id="list"><div class="muted pad">Loading games of <b>${esc(username)}</b>…</div></div>`;

  const monthSel = root.querySelector("#month");
  const list = root.querySelector("#list");

  if (session.user !== username) Object.assign(session, { user: username, archives: null, month: null });
  try {
    session.archives ??= await fetchArchives(username);
  } catch (e) {
    list.innerHTML = `<div class="card error">${esc(e.message)}</div>`;
    return;
  }
  if (!session.archives.length) {
    list.innerHTML = `<div class="card empty">No games found for ${esc(username)}.</div>`;
    return;
  }
  session.month ??= session.archives[0];
  monthSel.innerHTML = session.archives
    .map((u) => `<option value="${esc(u)}" ${u === session.month ? "selected" : ""}>${monthLabel(u)}</option>`)
    .join("");

  let games = [];
  const draw = async () => {
    const done = await analyzedIds();
    const shown = games.filter((g) => session.filter === "all" || g.timeClass === session.filter);
    if (!shown.length) {
      list.innerHTML = `<div class="card empty">No ${session.filter === "all" ? "" : session.filter + " "}games this month.</div>`;
      return;
    }
    list.innerHTML = `<ul class="games">${shown.map((g) => gameRow(g, done.has(g.id))).join("")}</ul>`;
  };

  const load = async () => {
    list.innerHTML = `<div class="muted pad">Loading ${monthLabel(session.month)}…</div>`;
    const isCurrentMonth = session.month === session.archives[0];
    try {
      games = (!isCurrentMonth && (await getCachedMonth(session.month))) || null;
      if (!games) {
        games = await fetchMonth(session.month, username);
        if (!isCurrentMonth) await saveCachedMonth(session.month, games);
      }
    } catch (e) {
      list.innerHTML = `<div class="card error">${esc(e.message)}</div>`;
      return;
    }
    await draw();
  };

  monthSel.addEventListener("change", () => {
    session.month = monthSel.value;
    load();
  });
  root.querySelector("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-f]");
    if (!b) return;
    session.filter = b.dataset.f;
    root.querySelectorAll("#filters .chip").forEach((c) => c.classList.toggle("on", c === b));
    draw();
  });
  list.addEventListener("click", async (e) => {
    const a = e.target.closest("a[data-id]");
    if (!a) return;
    e.preventDefault();
    const g = games.find((x) => x.id === a.dataset.id);
    await saveGame(g);
    location.hash = `#/game/${encodeURIComponent(g.id)}`;
  });

  await load();
}

function gameRow(g, analyzed) {
  const acc = g.chesscomAccuracy?.me;
  return `
    <li>
      <a href="#/game/${encodeURIComponent(g.id)}" data-id="${esc(g.id)}" class="game-row ${g.outcome}">
        <span class="res">${RESULT_LABEL[g.outcome]}</span>
        <span class="who">
          <span class="piece-dot ${g.myColor}"></span>
          vs <b>${esc(g.opp.name)}</b> <span class="muted">(${g.opp.rating})</span>
          <small class="muted">${TIME_ICON[g.timeClass] ?? ""} ${esc(g.timeClass)} · ${fmtDate(g.endTime)} · you ${g.me.rating}</small>
        </span>
        <span class="tags">
          ${analyzed ? `<span class="tag ok">✓ analyzed</span>` : ""}
          ${acc ? `<span class="tag" title="chess.com accuracy">${fmtPct(acc)}%</span>` : ""}
        </span>
      </a>
    </li>`;
}
