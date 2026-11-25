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
Opening names come from the Lichess opening list (CC0), stored in
`src/data/openings.json`. Regenerate it with `node scripts/build-openings.mjs`.

Stockfish is GPLv3. The engine files are copied from the `stockfish` npm
package at build time, and its license ships alongside (`stockfish/Copying.txt`).
