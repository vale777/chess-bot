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
        <span class="muted small">Higher is more accurate but slower. 12 is good on a phone, 16 on a computer.</span>
      </label>
      <button class="primary">Save</button>
      <span id="saved" class="muted small"></span>
    </form>
    <div class="card form">
      <h3>Storage</h3>
      <p class="muted small">Analyses are stored only in this browser on this device. Clearing removes all saved analyses and settings.</p>
      <button id="clear" class="danger">Clear all data</button>
    </div>
    <p class="muted tiny pad">Engine: Stockfish 19 (lite, WebAssembly, GPLv3) by the Stockfish developers and Nathan Rugg. Game data: chess.com Published-Data API.</p>`;

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
