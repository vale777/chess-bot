// Copies the Stockfish WASM engine and cm-chessboard sprites into public/
// so Vite serves them as static files (they are gitignored), and writes
// public/THIRD_PARTY_LICENSES.txt with the license texts of everything we ship.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const sf = "node_modules/stockfish/bin";
mkdirSync("public/stockfish", { recursive: true });
for (const f of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  cpSync(`${sf}/${f}`, `public/stockfish/${f}`);
}
cpSync("node_modules/stockfish/Copying.txt", "public/stockfish/Copying.txt");

// Only the "standard" pieces (CC BY-SA 3.0). The other set bundled with
// cm-chessboard (staunty) is CC BY-NC-SA, so we don't publish it.
const cm = "node_modules/cm-chessboard/assets";
rmSync("public/cm/pieces", { recursive: true, force: true });
mkdirSync("public/cm/pieces", { recursive: true });
cpSync(`${cm}/pieces/standard.svg`, "public/cm/pieces/standard.svg");
for (const ext of ["arrows", "markers"]) {
  mkdirSync(`public/cm/extensions/${ext}`, { recursive: true });
  cpSync(`${cm}/extensions/${ext}/${ext}.svg`, `public/cm/extensions/${ext}/${ext}.svg`);
}

const pkg = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"));
const section = (title, body) => `${"=".repeat(78)}\n${title}\n${"=".repeat(78)}\n\n${body.trim()}\n\n`;
const libs = [
  ["chess.js", "LICENSE", "https://github.com/jhlywa/chess.js"],
  ["cm-chessboard", "LICENSE", "https://github.com/shaack/cm-chessboard"],
  ["idb-keyval", "LICENCE", "https://github.com/jakearchibald/idb-keyval"],
];

let out = `Third-party software and assets used by Chess Analyzer\n\n`;
for (const [name, file, url] of libs) {
  const { version, license } = pkg(name);
  out += section(`${name} ${version} (${license}) - ${url}`, readFileSync(`node_modules/${name}/${file}`, "utf8"));
}
out += section(
  "Chess piece graphics (cm/pieces/standard.svg) - CC BY-SA 3.0",
  `Chess pieces from Wikimedia Commons
https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces/Standard
Authors: Cburnett (https://en.wikipedia.org/wiki/User:Cburnett),
         Rfc1394 (https://en.wikipedia.org/wiki/User:Rfc1394)
Modified by Stefan Haack for cm-chessboard (https://github.com/shaack/cm-chessboard).
License: Creative Commons Attribution-ShareAlike 3.0 Unported
https://creativecommons.org/licenses/by-sa/3.0/`,
);
out += section(
  `Stockfish ${pkg("stockfish").version} (GPL-3.0)`,
  `Stockfish chess engine by the Stockfish developers, compiled to WebAssembly
by Nathan Rugg (stockfish.js). Distributed under the GNU General Public License v3.
Full license text: stockfish/Copying.txt
Source code:  https://github.com/official-stockfish/Stockfish
              https://github.com/nmrugg/stockfish.js
              https://www.npmjs.com/package/stockfish/v/${pkg("stockfish").version}`,
);
out += section(
  "Opening names - CC0 1.0",
  `Lichess opening list, https://github.com/lichess-org/chess-openings
Public domain dedication: https://creativecommons.org/publicdomain/zero/1.0/`,
);
writeFileSync("public/THIRD_PARTY_LICENSES.txt", out);
console.log("assets copied");
