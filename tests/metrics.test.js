import { describe, it, expect } from "vitest";
import { winPercent, moveAccuracy, classify, scoreGame, evalToCp, estimateElo, formatEval } from "../src/metrics.js";

describe("winPercent", () => {
  it("is 50 at equality and symmetric", () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100);
  });
  it("matches known Lichess values", () => {
    expect(winPercent(100)).toBeCloseTo(59.1, 1);
    expect(winPercent(1000)).toBeCloseTo(97.5, 1);
  });
  it("caps at ±1000cp", () => expect(winPercent(5000)).toBeCloseTo(winPercent(1000)));
});

describe("evalToCp", () => {
  it("maps mates to the cap", () => {
    expect(evalToCp({ mate: 3 })).toBe(1000);
    expect(evalToCp({ mate: -2 })).toBe(-1000);
    expect(evalToCp({ mate: 0, winner: "b" })).toBe(-1000);
    expect(evalToCp({ mate: 0, winner: "w" })).toBe(1000);
  });
});

describe("moveAccuracy", () => {
  it("is 100 when nothing is lost", () => expect(moveAccuracy(60, 65)).toBe(100));
  it("decreases with the win% drop", () => {
    expect(moveAccuracy(50, 45)).toBeGreaterThan(moveAccuracy(50, 30));
    expect(moveAccuracy(95, 5)).toBe(0);
  });
});

describe("classify", () => {
  it("uses 5/10/15 win% thresholds", () => {
    expect(classify(4.9)).toBeNull();
    expect(classify(5)).toBe("inaccuracy");
    expect(classify(10)).toBe("mistake");
    expect(classify(15)).toBe("blunder");
  });
});

describe("scoreGame", () => {
  it("attributes a blunder to the right color and side", () => {
    // white plays fine, black hangs a piece on move 2 (eval swings to +3 for white)
    const evals = [{ cp: 20 }, { cp: 25 }, { cp: 30 }, { cp: 30 }, { cp: 330 }, { cp: 320 }];
    const { moves, summary } = scoreGame(evals, "w");
    expect(moves.map((m) => m.color)).toEqual(["w", "b", "w", "b", "w"]);
    expect(moves[3].judgement).toBe("blunder");
    expect(moves[3].cpLoss).toBe(300);
    expect(summary.b.blunders).toBe(1);
    expect(summary.w.blunders).toBe(0);
    expect(summary.w.accuracy).toBeGreaterThan(summary.b.accuracy);
  });
  it("flags a missed win when a winning position is thrown away", () => {
    const evals = [{ cp: 0 }, { cp: 0 }, { cp: 600 }, { cp: 0 }];
    const { moves } = scoreGame(evals, "w");
    // move 3 (white): from +6 to 0 after black's blunder on move 2
    expect(moves[2].missed).toBe(true);
    expect(moves[2].judgement).toBe("blunder");
  });
  it("handles games starting with black to move", () => {
    const { moves } = scoreGame([{ cp: 0 }, { cp: 0 }], "b");
    expect(moves[0].color).toBe("b");
  });
});

describe("helpers", () => {
  it("estimates Elo monotonically", () => {
    expect(estimateElo(20)).toBeGreaterThan(estimateElo(80));
    expect(estimateElo(null)).toBeNull();
  });
  it("formats evals", () => {
    expect(formatEval({ cp: 125 })).toBe("+1.25");
    expect(formatEval({ cp: -40 })).toBe("-0.40");
    expect(formatEval({ mate: -2 })).toBe("-M2");
  });
});
