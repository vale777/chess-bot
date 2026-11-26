# ♞ Chess Analyzer

Personal analyzer for your chess.com games. It runs entirely in the browser:
games come from the chess.com Published-Data API, and Stockfish 19 (lite,
WebAssembly) analyzes them on the device you're using. There is no server and no
account; analyses are cached in the browser (IndexedDB) per device.

## What it shows
- Accuracy per game, using a formula calibrated against chess.com's own accuracy
  numbers (typically within about ±5 points; see `scripts/README-calibration.md`)
- chess.com-style move labels: Brilliant, Great, Best, Excellent, Good, Book,
  Forced, Inaccuracy, Mistake, Miss, Blunder, plus the opening name
- Best move and engine line for every move, an eval graph, and "Next mistake" navigation
- Stats across all analyzed games: average accuracy, ACPL, blunders per game, a rough Elo estimate

## Run locally
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # metric + real-engine tests
```

## Deploy (free, GitHub Pages)
1. Create an empty GitHub repo, e.g. `chess-bot`.
2. Push this folder to the `main` branch.
3. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
4. The workflow builds and publishes to `https://<you>.github.io/chess-bot/`.

Open that URL on your phone, set your username in Settings, and optionally use
"Add to Home Screen".

## Credits / license
This project's own code is under the ISC license (see `LICENSE`).

- **Stockfish 19** (GPLv3) by the Stockfish developers, WebAssembly build by
  Nathan Rugg. The engine files are copied from the `stockfish` npm package at
  build time, and its license ships alongside (`stockfish/Copying.txt`).
  Source: <https://github.com/official-stockfish/Stockfish>,
  <https://github.com/nmrugg/stockfish.js>. The engine runs as a separate
  program in a Web Worker and talks to the app only through the UCI protocol.
- **Chess pieces** by [Cburnett](https://en.wikipedia.org/wiki/User:Cburnett)
  ([Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces/Standard)),
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), as adapted by
  cm-chessboard. Only this piece set is published; cm-chessboard's other set
  ("staunty", CC BY-NC-SA) is deliberately left out.
- **Libraries:** cm-chessboard (MIT), chess.js (BSD-2-Clause), idb-keyval (Apache-2.0).
- **Opening names:** Lichess opening list (CC0), stored in
  `src/data/openings.json`. Regenerate it with `node scripts/build-openings.mjs`.
- Move-label badges are plain text/Unicode symbols styled in CSS; the app uses no
  third-party icons or sounds.

`npm run copy-assets` (run automatically before `dev` and `build`) writes
`THIRD_PARTY_LICENSES.txt` with the full license texts, and the build publishes it
next to the app. The Settings page shows the credits and links to it.

This is an independent hobby project and is not affiliated with, endorsed by, or
sponsored by Chess.com. Game data comes from the public chess.com Published-Data API.
