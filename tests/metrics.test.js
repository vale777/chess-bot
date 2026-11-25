import { describe, it, expect } from "vitest";
import { winPercent, moveAccuracy, classifyLoss, scoreGame, evalToCp, estimateElo, formatEval } from "../src/metrics.js";

describe("winPercent", () => {
  it("is 50 at equality and symmetric", () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100);
  });
  it("is flatter for lower-rated players (a +2 edge is less decisive at 600 than at 2200)", () => {
    expect(winPercent(200, 600)).toBeLessThan(winPercent(200, 2200) + 1e-9 + 5); // sanity
    expect(winPercent(200, 600)).toBeGreaterThan(50);
  });
  it("saturates for mates", () => {
    expect(winPercent(evalToCp({ mate: 3 }))).toBeGreaterThan(99.99);
    expect(winPercent(evalToCp({ mate: 0, winner: "b" }))).toBeLessThan(0.01);
  });
});

describe("moveAccuracy", () => {
  it("is 100 when nothing is lost", () => expect(moveAccuracy(60, 65)).toBe(100));
  it("decreases with the loss and has a floor of ~20", () => {
    expect(moveAccuracy(50, 45)).toBeGreaterThan(moveAccuracy(50, 30));
    expect(moveAccuracy(100, 0)).toBeCloseTo(20, 0);
  });
});

describe("classifyLoss (chess.com expected-points bands)", () => {
  it("uses 2/5/10/20 % bands", () => {
    expect(classifyLoss(0.2)).toBe("best");
    expect(classifyLoss(1.9)).toBe("excellent");
    expect(classifyLoss(4.9)).toBe("good");
    expect(classifyLoss(9.9)).toBe("inaccuracy");
    expect(classifyLoss(19.9)).toBe("mistake");
    expect(classifyLoss(20)).toBe("blunder");
  });
});

describe("scoreGame", () => {
  it("attributes losses to the right side", () => {
    const evals = [{ cp: 20 }, { cp: 25 }, { cp: 30 }, { cp: 30 }, { cp: 600 }, { cp: 590 }];
    const { moves, summary } = scoreGame(evals, "w", { w: 1500, b: 1500 });
    expect(moves.map((m) => m.color)).toEqual(["w", "b", "w", "b", "w"]);
    expect(classifyLoss(moves[3].drop)).toBe("blunder");
    expect(moves[3].cpLoss).toBe(570);
    expect(summary.w.accuracy).toBeGreaterThan(summary.b.accuracy);
  });
  it("handles games starting with black to move", () => {
    expect(scoreGame([{ cp: 0 }, { cp: 0 }], "b").moves[0].color).toBe("b");
  });
});

describe("helpers", () => {
  it("estimates Elo monotonically", () => {
    expect(estimateElo(20)).toBeGreaterThan(estimateElo(80));
    expect(estimateElo(null)).toBeNull();
  });
  it("formats evals", () => {
    expect(formatEval({ cp: 125 })).toBe("+1.25");
    expect(formatEval({ mate: -2 })).toBe("-M2");
  });
});
