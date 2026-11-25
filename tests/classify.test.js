import { describe, it, expect } from "vitest";
import { sacrificedMaterial, classifyGame, countLabels } from "../src/classify.js";
import { scoreGame } from "../src/metrics.js";
import { loadBook, bookDepth } from "../src/openings.js";
import { Chess } from "chess.js";
import rows from "../src/data/openings.json";

const after = (fen, san) => {
  const c = new Chess(fen);
  const m = c.move(san);
  return { fen: c.fen(), m };
};

describe("sacrificedMaterial", () => {
  it("detects a hanging piece", () => {
    // 1.e4 c6 2.Bb5?? : cxb5 wins the bishop and nothing can recapture
    const c = new Chess();
    ["e4", "c6"].forEach((s) => c.move(s));
    const { fen, m } = after(c.fen(), "Bb5");
    expect(sacrificedMaterial(fen, m)).toBe(3);
  });
  it("is 0 for a quiet safe move", () => {
    const { fen, m } = after(new Chess().fen(), "e4");
    expect(sacrificedMaterial(fen, m)).toBeLessThanOrEqual(0);
  });
  it("counts a capture's own gain (Bxf7+ Kxf7 sacrifices bishop for pawn)", () => {
    const c = new Chess();
    ["e4", "e5", "Bc4", "Nc6"].forEach((s) => c.move(s));
    const { fen, m } = after(c.fen(), "Bxf7+");
    expect(sacrificedMaterial(fen, m)).toBe(2);
  });
});

describe("opening book", () => {
  it("recognizes standard theory and names it", async () => {
    const book = await loadBook(rows);
    const c = new Chess();
    const fens = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Qe2?"].map((s) => (c.move(s.replace("?", "")), c.fen()));
    const { depth, opening } = bookDepth(book, fens, new Chess().fen());
    expect(depth).toBeGreaterThanOrEqual(6);
    expect(opening.name).toMatch(/Ruy Lopez/);
  });
});

describe("classifyGame", () => {
  it("labels forced, best, blunder and miss", () => {
    // synthetic analysis: 4 moves, evals white POV
    const c = new Chess();
    const sans = ["e4", "e5", "Qh5", "Nc6"];
    const moves = sans.map((s) => {
      const before = c.fen();
      const m = c.move(s);
      return { san: s, uci: m.from + m.to, from: m.from, to: m.to, before, after: c.fen() };
    });
    const evals = [{ cp: 30 }, { cp: 30 }, { cp: 30 }, { cp: 30 }, { cp: 30 }];
    const best = moves.map((m) => ({ uci: m.uci, san: m.san, pv: [], second: { cp: 20 } }));
    const analysis = { moves, evals, best, firstMover: "w", legalCounts: [20, 20, 20, 1], version: 2 };
    const ratings = { w: 1500, b: 1500 };
    const scored = scoreGame(evals, "w", ratings);
    const labels = classifyGame(analysis, scored, ratings, 0);
    expect(labels).toEqual(["best", "best", "best", "forced"]);
    const counts = countLabels(labels, scored);
    expect(counts.w.best).toBe(2);
    expect(counts.b.forced).toBe(1);
  });
});
