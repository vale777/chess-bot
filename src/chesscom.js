// chess.com PubAPI (public, read-only, CORS-enabled). Docs: https://www.chess.com/news/view/published-data-api
const BASE = "https://api.chess.com/pub";

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) throw new Error("Player not found on chess.com");
  if (res.status === 429) throw new Error("chess.com rate limit hit, wait a minute and retry");
  if (!res.ok) throw new Error(`chess.com API error ${res.status}`);
  return res.json();
}

/** Monthly archive URLs, newest first. */
export async function fetchArchives(username) {
  const data = await getJson(`${BASE}/player/${encodeURIComponent(username.trim().toLowerCase())}/games/archives`);
  return [...(data.archives ?? [])].reverse();
}

/** "https://.../games/2026/11" -> "2026-11" */
export function monthLabel(archiveUrl) {
  const m = archiveUrl.match(/(\d{4})\/(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : archiveUrl;
}

/** "https://www.chess.com/game/live/123" -> "live-123" */
export function gameId(url) {
  const m = url.match(/game\/(\w+)\/(\d+)/);
  return m ? `${m[1]}-${m[2]}` : url.replace(/\W+/g, "-");
}

/** Normalize one API game into what the app needs, from `username`'s perspective. */
export function normalizeGame(g, username) {
  const me = username.trim().toLowerCase();
  const myColor = g.white.username.toLowerCase() === me ? "w" : "b";
  const mine = myColor === "w" ? g.white : g.black;
  const opp = myColor === "w" ? g.black : g.white;
  return {
    id: gameId(g.url),
    url: g.url,
    pgn: g.pgn,
    rules: g.rules,
    timeClass: g.time_class,
    timeControl: g.time_control,
    rated: g.rated,
    endTime: g.end_time,
    myColor,
    me: { name: mine.username, rating: mine.rating, result: mine.result },
    opp: { name: opp.username, rating: opp.rating, result: opp.result },
    outcome: outcomeOf(mine.result),
    chesscomAccuracy: g.accuracies
      ? { me: g.accuracies[myColor === "w" ? "white" : "black"], opp: g.accuracies[myColor === "w" ? "black" : "white"] }
      : null,
  };
}

const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
function outcomeOf(result) {
  if (result === "win") return "win";
  if (DRAWS.has(result)) return "draw";
  return "loss";
}

/** All standard-chess games of one month, newest first. */
export async function fetchMonth(archiveUrl, username) {
  const data = await getJson(archiveUrl);
  return (data.games ?? [])
    .filter((g) => g.rules === "chess" && g.pgn)
    .map((g) => normalizeGame(g, username))
    .reverse();
}
