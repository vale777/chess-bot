// Copies the Stockfish WASM engine and cm-chessboard sprites into public/
// so Vite serves them as static files (they are gitignored).
import { cpSync, mkdirSync } from "node:fs";

const sf = "node_modules/stockfish/bin";
mkdirSync("public/stockfish", { recursive: true });
for (const f of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  cpSync(`${sf}/${f}`, `public/stockfish/${f}`);
}
cpSync("node_modules/stockfish/Copying.txt", "public/stockfish/Copying.txt");

const cm = "node_modules/cm-chessboard/assets";
cpSync(`${cm}/pieces`, "public/cm/pieces", { recursive: true });
for (const ext of ["arrows", "markers"]) {
  mkdirSync(`public/cm/extensions/${ext}`, { recursive: true });
  cpSync(`${cm}/extensions/${ext}/${ext}.svg`, `public/cm/extensions/${ext}/${ext}.svg`);
}
console.log("assets copied");
