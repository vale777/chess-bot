export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmtPct = (x) => (x === null || x === undefined ? "–" : x.toFixed(1));

export function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const RESULT_LABEL = { win: "Won", loss: "Lost", draw: "Draw" };
export const TIME_ICON = { bullet: "⚡", blitz: "🔥", rapid: "⏱", daily: "☀️" };
