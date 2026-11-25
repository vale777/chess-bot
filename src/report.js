// Everything the UI shows for one analyzed game, derived from the stored engine output.
// Recomputed on every view, so improvements to the formulas apply to old analyses too.
import { scoreGame } from "./metrics.js";
import { classifyGame, countLabels } from "./classify.js";
import { loadBook, bookDepth } from "./openings.js";

export function ratingsOf(game) {
  return game.myColor === "w" ? { w: game.me.rating, b: game.opp.rating } : { w: game.opp.rating, b: game.me.rating };
}

export async function buildReport(game, analysis) {
  const ratings = ratingsOf(game);
  const scored = scoreGame(analysis.evals, analysis.firstMover, ratings);
  const book = await loadBook();
  const { depth: bookPlies, opening } = bookDepth(book, analysis.moves.map((m) => m.after), analysis.startFen);
  const labels = classifyGame(analysis, scored, ratings, bookPlies);
  const counts = countLabels(labels, scored);
  return { scored, labels, counts, opening, ratings, hasGreat: (analysis.version ?? 1) >= 2 };
}
