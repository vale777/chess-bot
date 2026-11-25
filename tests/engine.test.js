// Runs the real Stockfish WASM engine (same build as the website) under Node.
import { it, expect } from "vitest";
import { createRequire } from "node:module";
import { Engine, analyzeGame, parseInfo } from "../src/engine.js";
import { scoreGame } from "../src/metrics.js";

const require = createRequire(import.meta.url);

function nodeTransport() {
  let cb = () => {};
  const sf = require("stockfish")("lite-single", (line) => cb(String(line)));
  return { send: (c) => sf.processCommand(c), onLine: (f) => (cb = f), terminate: () => sf.terminate() };
}

it("parses UCI info lines", () => {
  expect(parseInfo("info depth 12 seldepth 18 multipv 1 score cp -35 nodes 1 pv e7e5 g1f3")).toEqual({
    depth: 12, kind: "cp", value: -35, pv: ["e7e5", "g1f3"],
  });
  expect(parseInfo("info depth 12 multipv 2 score cp 5 pv a2a3")).toBeNull();
  expect(parseInfo("info depth 9 score cp 20 lowerbound pv e2e4")).toBeNull();
});

it("analyzes a short game ending in Scholar's mate", async () => {
  const engine = new Engine(nodeTransport());
  await engine.init();
  const pgn = '[Event "t"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
  const r = await analyzeGame(engine, pgn, { depth: 10 });
  engine.terminate();

  expect(r.moves).toHaveLength(7);
  expect(r.evals).toHaveLength(8);
  expect(r.evals[7]).toEqual({ mate: 0, winner: "w" });
  // before 3...Nf6?? black is fine; after it white mates in 1
  expect(r.evals[6]).toEqual({ mate: 1 });
  expect(r.best[6].san).toBe("Qxf7#");

  const { moves, summary } = scoreGame(r.evals, r.firstMover);
  expect(moves[5].judgement).toBe("blunder"); // 3...Nf6??
  expect(summary.b.blunders).toBeGreaterThanOrEqual(1);
});
