// chess.com-style move labels. Chess.com doesn't publish its exact rules, so
// these follow its public descriptions:
//   Book       opening theory
//   Forced     the only legal move
//   Brilliant  a best (or near-best) move that sacrifices material, while not already totally winning
//   Great      the only good move: the engine's 2nd choice is much worse
//   Best       the engine's top move
//   Excellent / Good / Inaccuracy / Mistake / Blunder   expected-points loss bands (2/5/10/20 %)
//   Miss       you failed to punish your opponent's mistake
import { Chess } from "chess.js";
import { classifyLoss, winPercent, evalToCp, THRESHOLDS } from "./metrics.js";

export const LABELS = {
  brilliant: { name: "Brilliant", sym: "!!", order: 0 },
  great: { name: "Great", sym: "!", order: 1 },
  best: { name: "Best", sym: "★", order: 2 },
  excellent: { name: "Excellent", sym: "✓", order: 3 },
  good: { name: "Good", sym: "✓", order: 4 },
  book: { name: "Book", sym: "📖", order: 5 },
  forced: { name: "Forced", sym: "□", order: 6 },
  inaccuracy: { name: "Inaccuracy", sym: "?!", order: 7 },
  mistake: { name: "Mistake", sym: "?", order: 8 },
  miss: { name: "Miss", sym: "✗", order: 9 },
  blunder: { name: "Blunder", sym: "??", order: 10 },
};
export const LABEL_KEYS = Object.keys(LABELS);
/** Labels worth a marker in the move list / graph. */
export const NOTABLE = new Set(["brilliant", "great", "inaccuracy", "mistake", "miss", "blunder"]);

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Best net material the side to move in `fen` can win with one capture. */
function bestCaptureGain(fen) {
  const c = new Chess(fen);
  const victim = c.turn() === "w" ? "b" : "w";
  let best = 0;
  for (const cap of c.moves({ verbose: true }).filter((m) => m.captured)) {
    const gain = VALUE[cap.captured];
    c.move(cap);
    const defended = c.isAttacked(cap.to, victim);
    c.undo();
    best = Math.max(best, defended ? gain - VALUE[cap.piece] : gain);
  }
  return best;
}

/** Same position with the other side to move (a "null move"), or null if that is illegal. */
function flipTurn(fen) {
  const f = fen.split(" ");
  f[1] = f[1] === "w" ? "b" : "w";
  f[3] = "-";
  try {
    return new Chess(f.join(" ")).fen();
  } catch {
    return null;
  }
}

/**
 * Material the move NEWLY leaves en prise: what the opponent can grab after
 * the move, minus what they could already grab before it (pieces that were
 * already lost don't count), minus whatever the move itself captured.
 */
export function sacrificedMaterial(fenAfter, move) {
  const after = bestCaptureGain(fenAfter);
  const flipped = flipTurn(move.before);
  const before = flipped ? bestCaptureGain(flipped) : 0;
  return after - before - (move.captured ? VALUE[move.captured] : 0);
}

/**
 * @param analysis  result of analyzeGame()
 * @param scored    result of scoreGame()
 * @param ratings   {w, b}
 * @param bookPlies number of leading moves that are opening theory
 * @returns array of label keys, one per move
 */
export function classifyGame(analysis, scored, ratings, bookPlies = 0) {
  const { moves, best, evals, legalCounts = [] } = analysis;
  const labels = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const s = scored.moves[i];
    const b = best[i];
    const color = s.color;
    const sign = color === "w" ? 1 : -1;
    const rating = ratings[color];
    const verbose = new Chess(m.before).move(m.san);

    if (i < bookPlies) {
      labels.push("book");
      continue;
    }
    if (legalCounts[i] === 1) {
      labels.push("forced");
      continue;
    }

    const isTop = b && b.uci === m.uci;
    let label = isTop ? "best" : classifyLoss(s.drop);

    // Miss: the opponent just made a mistake (their move lost >= 10%) and your reply
    // gave that gift back, without leaving you worse off than before their mistake.
    // (If you end up worse than before, it stays a mistake/blunder.)
    const prev = scored.moves[i - 1];
    if (prev && prev.drop >= THRESHOLDS.inaccuracy && s.drop >= THRESHOLDS.inaccuracy && labels[i - 1] !== "book") {
      const myWinBeforeTheirError = 100 - prev.winBefore; // their POV -> mine (same-ish curve)
      if (s.winAfter >= myWinBeforeTheirError - 5) label = "miss";
    }

    if (label === "best" || label === "excellent") {
      const notTotallyWinning = s.winBefore < 90;
      const sound = s.winAfter >= 45;
      // Brilliant: leaves at least a minor piece's worth (net 2+) hanging
      if (notTotallyWinning && sound && sacrificedMaterial(m.after, verbose) >= 2) {
        label = "brilliant";
      } else if (isTop && b.second) {
        // Great: the second-best move is much worse, and it actually matters
        const winBest = winPercent(sign * evalToCp(evals[i]), rating);
        const winSecond = winPercent(sign * evalToCp(b.second), rating);
        const prevMove = moves[i - 1];
        const simpleRecapture = verbose.captured && prevMove && prevMove.to === m.to && new Chess(prevMove.before).move(prevMove.san).captured;
        if (winBest - winSecond >= THRESHOLDS.inaccuracy && winSecond < 65 && !simpleRecapture) label = "great";
      }
    }
    labels.push(label);
  }
  return labels;
}

/** Count labels per color. */
export function countLabels(labels, scored) {
  const counts = { w: {}, b: {} };
  for (const k of LABEL_KEYS) counts.w[k] = counts.b[k] = 0;
  labels.forEach((l, i) => counts[scored.moves[i].color][l]++);
  return counts;
}
