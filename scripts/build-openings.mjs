// Regenerates src/data/openings.json from the Lichess opening list
// (https://github.com/lichess-org/chess-openings, CC0). Run manually: node scripts/build-openings.mjs
import { writeFileSync } from "node:fs";

const rows = [];
for (const f of ["a", "b", "c", "d", "e"]) {
  const res = await fetch(`https://raw.githubusercontent.com/lichess-org/chess-openings/master/${f}.tsv`);
  if (!res.ok) throw new Error(`${f}.tsv: HTTP ${res.status}`);
  const lines = (await res.text()).trim().split("\n").slice(1);
  for (const l of lines) {
    const [eco, name, pgn] = l.split("\t");
    rows.push([eco, name, pgn.replace(/\d+\.\s*/g, "").trim()]); // keep only SAN moves
  }
}
writeFileSync("src/data/openings.json", JSON.stringify(rows));
console.log(`wrote ${rows.length} openings`);
