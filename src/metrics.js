// Pure scoring functions.
//
// Accuracy model: chess.com's "CAPS" formula is proprietary, so this model was
// FITTED to chess.com's own published accuracies: 477 public games (946 player
// results, ratings from <300 to 2900) analyzed with the same Stockfish build
// this site uses. On held-out games the mean error dropped from 7.5 points
// (Lichess formula) to 4.5 points. See scripts/README-calibration.md.
//
// An "eval" is always from WHITE's point of view: { cp } or { mate }
// (mate > 0 = white mates in N, mate < 0 = black mates in N,
//  mate === 0 = checkmate on the board, with `winner: "w"|"b"`).

export const MODEL = {
  // win-probability steepness, depends (slightly) on the mover's rating:
  // k = exp(a0 + a1 * (rating - 1500) / 1000)
  a0: -5.9383,
  a1: -0.11756,
  // per-move accuracy = c0 * exp(-b * winLoss) + (100 - c0)
  b: 0.1145,
  c0: 80.048,
  // eval cap in centipawns (mates count as the cap)
  cap: 4172,
};

const MATE_CP = 100000;

/** Centipawns from white's POV; mates become huge values that the win curve saturates. */
export function evalToCp(ev) {
  if (ev.mate !== undefined && ev.mate !== null) {
    if (ev.mate === 0) return ev.winner === "b" ? -MATE_CP : MATE_CP;
    return ev.mate > 0 ? MATE_CP : -MATE_CP;
  }
  return ev.cp;
}

const steepness = (rating = 1500) => Math.exp(MODEL.a0 + (MODEL.a1 * (rating - 1500)) / 1000);

/** Expected score for white in percent (0..100), from the perspective of a player of `rating`. */
export function winPercent(cp, rating = 1500) {
  const c = Math.max(-MODEL.cap, Math.min(MODEL.cap, cp));
  return 100 / (1 + Math.exp(-steepness(rating) * c));
}

/** Accuracy of a single move (0..100) given the mover's win% before and after. */
export function moveAccuracy(winBefore, winAfter) {
  const loss = Math.max(0, winBefore - winAfter);
  return Math.max(0, Math.min(100, MODEL.c0 * Math.exp(-MODEL.b * loss) + (100 - MODEL.c0)));
}

// chess.com's published "expected points lost" bands, on a 0..100 scale.
export const THRESHOLDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 };

/** Label by expected-points loss only (no board context). */
export function classifyLoss(drop) {
  if (drop < 0.5) return "best";
  if (drop < THRESHOLDS.excellent) return "excellent";
  if (drop < THRESHOLDS.good) return "good";
  if (drop < THRESHOLDS.inaccuracy) return "inaccuracy";
  if (drop < THRESHOLDS.mistake) return "mistake";
  return "blunder";
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Score a whole analyzed game.
 * @param {Array} evals       white-POV evals for positions 0..N
 * @param {"w"|"b"} firstMover side to move in position 0
 * @param {{w:number,b:number}} ratings  player ratings (shape the win curve)
 */
export function scoreGame(evals, firstMover = "w", ratings = { w: 1500, b: 1500 }) {
  const cps = evals.map(evalToCp);
  const avgRating = (ratings.w + ratings.b) / 2;
  const winPercents = cps.map((cp) => winPercent(cp, avgRating)); // for the graph

  const moves = [];
  for (let i = 0; i < cps.length - 1; i++) {
    const color = (i % 2 === 0) === (firstMover === "w") ? "w" : "b";
    const r = ratings[color];
    const sign = color === "w" ? 1 : -1;
    const winBefore = winPercent(sign * cps[i], r);
    const winAfter = winPercent(sign * cps[i + 1], r);
    const drop = Math.max(0, winBefore - winAfter);
    const cpLoss = Math.min(1000, Math.max(0, sign * (clampCp(cps[i]) - clampCp(cps[i + 1]))));
    moves.push({ ply: i + 1, color, winBefore, winAfter, drop, cpLoss, accuracy: moveAccuracy(winBefore, winAfter) });
  }

  const summary = {};
  for (const color of ["w", "b"]) {
    const mine = moves.filter((m) => m.color === color);
    summary[color] = mine.length
      ? {
          // harmonic mean: one bad blunder weighs heavily, like on chess.com
          accuracy: mine.length / mine.reduce((a, m) => a + 1 / Math.max(m.accuracy, 1), 0),
          acpl: mean(mine.map((m) => m.cpLoss)),
          moves: mine.length,
        }
      : { accuracy: null, acpl: null, moves: 0 };
  }
  return { moves, summary, winPercents };
}

const clampCp = (cp) => Math.max(-1000, Math.min(1000, cp));

/**
 * Very rough Elo estimate from average centipawn loss. Only meaningful when
 * averaged over many games; shown next to the real rating as a curiosity.
 */
export function estimateElo(acpl) {
  if (acpl === null || acpl === undefined || Number.isNaN(acpl)) return null;
  return Math.round(Math.max(100, Math.min(3200, 3100 * Math.exp(-0.01 * acpl))));
}

/** Format a white-POV eval for display, e.g. "+1.25", "-0.40", "M3", "-M2". */
export function formatEval(ev) {
  if (!ev) return "";
  if (ev.mate !== undefined && ev.mate !== null) {
    if (ev.mate === 0) return ev.winner === "b" ? "0-1" : "1-0";
    return ev.mate > 0 ? `M${ev.mate}` : `-M${-ev.mate}`;
  }
  const v = ev.cp / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}
