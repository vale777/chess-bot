import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/arrows/arrows.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "./style.css";
import { renderGameList } from "./ui/gameList.js";
import { renderGameView } from "./ui/gameView.js";
import { renderStats } from "./ui/stats.js";
import { renderSettings } from "./ui/settings.js";

const app = document.getElementById("app");
let cleanup = null;

async function route() {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  const hash = location.hash.replace(/^#/, "") || "/";
  const [, page, arg] = hash.split("/");
  document.querySelectorAll("nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === (page || "games") || (page === "game" && a.dataset.route === "games"));
  });
  app.innerHTML = "";
  try {
    if (page === "game" && arg) cleanup = await renderGameView(app, decodeURIComponent(arg));
    else if (page === "stats") cleanup = await renderStats(app);
    else if (page === "settings") cleanup = await renderSettings(app);
    else cleanup = await renderGameList(app);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card error">Something went wrong: ${e.message}</div>`;
  }
}

window.addEventListener("hashchange", route);
route();
