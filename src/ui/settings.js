import { getSettings, saveSettings } from "../store.js";
import { clear } from "idb-keyval";
import { esc } from "./util.js";

export async function renderSettings(root) {
  const s = await getSettings();
  root.innerHTML = `
    <form class="card form" id="f">
      <h2>Settings</h2>
      <label>chess.com username
        <input name="username" value="${esc(s.username)}" autocomplete="off" autocapitalize="none" spellcheck="false" required placeholder="e.g. hikaru">
      </label>
      <label>Engine depth
        <select name="depth">
          ${[10, 12, 14, 16, 18, 20].map((d) => `<option ${d === s.depth ? "selected" : ""}>${d}</option>`).join("")}
        </select>
        <span class="muted small">Higher is more accurate but slower. 12 is good on a phone, 14 on a computer. The accuracy formula was calibrated at depth 12.</span>
      </label>
      <button class="primary">Save</button>
      <span id="saved" class="muted small"></span>
    </form>
    <div class="card form">
      <h3>Storage</h3>
      <p class="muted small">Analyses are stored only in this browser on this device. Clearing removes all saved analyses and settings.</p>
      <button id="clear" class="danger">Clear all data</button>
    </div>
    <div class="muted tiny pad credits">
      <p><strong>Credits &amp; licenses</strong></p>
      <p>Engine: <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">Stockfish 19</a>
        (lite, WebAssembly) by the Stockfish developers and Nathan Rugg
        (<a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener">source</a>),
        <a href="${import.meta.env.BASE_URL}stockfish/Copying.txt" target="_blank">GPLv3</a>.</p>
      <p>Chess pieces by <a href="https://en.wikipedia.org/wiki/User:Cburnett" target="_blank" rel="noopener">Cburnett</a>
        (<a href="https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces/Standard" target="_blank" rel="noopener">Wikimedia Commons</a>),
        <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>, adapted by cm-chessboard.</p>
      <p>Libraries: cm-chessboard (MIT), chess.js (BSD-2-Clause), idb-keyval (Apache-2.0).
        Opening names: Lichess opening list (CC0).
        <a href="${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt" target="_blank">Full license texts</a>.</p>
      <p>Game data: chess.com Published-Data API. This is an independent hobby project and is not
        affiliated with, endorsed by, or sponsored by Chess.com.</p>
    </div>`;

  root.querySelector("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await saveSettings({ username: fd.get("username").trim(), depth: Number(fd.get("depth")) });
    root.querySelector("#saved").textContent = "Saved ✓";
    setTimeout(() => (location.hash = "#/"), 400);
  });
  root.querySelector("#clear").addEventListener("click", async () => {
    if (!confirm("Delete all saved analyses and settings on this device?")) return;
    await clear();
    location.hash = "#/settings";
    location.reload();
  });
}
