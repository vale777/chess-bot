// Pure scoring functions. Formulas follow Lichess' open-source accuracy model
// (chess.com's "CAPS" is proprietary, so numbers will be close but not identical).
//
// An "eval" is always from WHITE's point of view: { cp: number } or { mate: number }
// (mate > 0 = white mates in N, mate < 0 = black mates in N,
//  mate === 0 = checkmate on the board, with `winner: "w"|"b"`).

const CP_CAP = 1000;

/** Centipawns from white's POV, mate scores and extremes capped at ±1000. */
export function evalToCp(ev) {
  if (ev.mate !== undefined && ev.mate !== null) {
    if (ev.mate === 0) return ev.winner === "b" ? -CP_CAP : CP_CAP;
    return ev.mate > 0 ? CP_CAP : -CP_CAP;
  }
  return Math.max(-CP_CAP, Math.min(CP_CAP, ev.cp));
}

/** Winning chance for white in percent (0..100). */
export function winPercent(cp) {
  const c = Math.max(-CP_CAP, Math.min(CP_CAP, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Accuracy of a single move (0..100) given the mover's win% before and after. */
export function moveAccuracy(winBefore, winAfter) {
  if (winAfter >= winBefore) return 100;
  const diff = winBefore - winAfter;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) - 3.166924740191411 + 1;
  return Math.max(0, Math.min(100, raw));
}

// Lichess judges by winning-chance delta of 0.1 / 0.2 / 0.3 on a -1..1 scale,
// which is 5 / 10 / 15 points on the 0..100 win% scale.
export const THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 };

export function classify(drop) {
  if (drop >= THRESHOLDS.blunder) return "blunder";
  if (drop >= THRESHOLDS.mistake) return "mistake";
  if (drop >= THRESHOLDS.inaccuracy) return "inaccuracy";
  return null;
}

export const SYMBOL = { blunder: "??", mistake: "?", inaccuracy: "?!", missed: "💡" };

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stddev = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Score a whole analyzed game.
 * @param {Array<{cp?:number, mate?:number}>} evals  white-POV evals for positions 0..N
 *        (position 0 = before the first move, position N = final position)
 * @param {"w"|"b"} firstMover  side to move in position 0
 * @returns per-move details + per-color summary
 */
export function scoreGame(evals, firstMover = "w") {
  const cps = evals.map(evalToCp);
  const wins = cps.map(winPercent); // white POV
  const nMoves = evals.length - 1;

  // Volatility weights (Lichess): std-dev of win% in a sliding window.
  const windowSize = clamp(Math.floor(nMoves / 10), 2, 8);
  const windows = [];
  const firstWin = wins.slice(0, windowSize);
  for (let i = 0; i < Math.min(windowSize, wins.length) - 2; i++) windows.push(firstWin);
  for (let i = 0; i + windowSize <= wins.length; i++) windows.push(wins.slice(i, i + windowSize));
  const weights = windows.map((w) => clamp(stddev(w), 0.5, 12));

  const moves = [];
  for (let i = 0; i < nMoves; i++) {
    const color = (i % 2 === 0) === (firstMover === "w") ? "w" : "b";
    const sign = color === "w" ? 1 : -1;
    const winBefore = color === "w" ? wins[i] : 100 - wins[i];
    const winAfter = color === "w" ? wins[i + 1] : 100 - wins[i + 1];
    const drop = Math.max(0, winBefore - winAfter);
    const cpLoss = Math.max(0, sign * (cps[i] - cps[i + 1]));
    const accuracy = moveAccuracy(winBefore, winAfter);
    const judgement = classify(drop);

    // Missed opportunity: you had a big advantage (or the opponent just erred)
    // and your move threw a significant part of it away.
    const prevWinForMover = i > 0 ? (color === "w" ? wins[i - 1] : 100 - wins[i - 1]) : winBefore;
    const opponentJustErred = winBefore - prevWinForMover >= THRESHOLDS.mistake;
    const missed =
      drop >= THRESHOLDS.mistake &&
      ((winBefore >= 70 && winAfter < 60) || opponentJustErred);

    moves.push({
      ply: i + 1,
      color,
      winBefore,
      winAfter,
      drop,
      cpLoss: Math.min(cpLoss, CP_CAP),
      accuracy,
      weight: weights[i] ?? 1,
      judgement,
      missed,
    });
  }

  const summary = {};
  for (const color of ["w", "b"]) {
    const mine = moves.filter((m) => m.color === color);
    summary[color] = summarizeMoves(mine);
  }
  return { moves, summary, winPercents: wins };
}

function summarizeMoves(moves) {
  if (!moves.length) {
    return { accuracy: null, acpl: null, blunders: 0, mistakes: 0, inaccuracies: 0, missed: 0, moves: 0 };
  }
  const totalWeight = moves.reduce((a, m) => a + m.weight, 0);
  const weighted = moves.reduce((a, m) => a + m.accuracy * m.weight, 0) / totalWeight;
  const harmonic = moves.length / moves.reduce((a, m) => a + 1 / Math.max(m.accuracy, 1), 0);
  return {
    accuracy: (weighted + harmonic) / 2,
    acpl: mean(moves.map((m) => m.cpLoss)),
    blunders: moves.filter((m) => m.judgement === "blunder").length,
    mistakes: moves.filter((m) => m.judgement === "mistake").length,
    inaccuracies: moves.filter((m) => m.judgement === "inaccuracy").length,
    missed: moves.filter((m) => m.missed).length,
    moves: moves.length,
  };
}

/**
 * Very rough Elo estimate from average centipawn loss. Only meaningful when
 * averaged over many games; shown next to the real rating as a curiosity.
 */
export function estimateElo(acpl) {
  if (acpl === null || acpl === undefined || Number.isNaN(acpl)) return null;
  return Math.round(clamp(3100 * Math.exp(-0.01 * acpl), 100, 3200));
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
