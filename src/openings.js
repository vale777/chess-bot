// Opening book from the Lichess opening list (CC0). Positions are matched by
// board + side to move + castling rights, so transpositions count as book too.
import { Chess } from "chess.js";

const key = (fen) => fen.split(" ").slice(0, 3).join(" ");
let bookPromise = null;

/** Map position-key -> { eco, name } for every position on any named opening line. */
export function loadBook(rows) {
  if (rows) return Promise.resolve(buildBook(rows));
  bookPromise ??= import("./data/openings.json").then((m) => buildBook(m.default));
  return bookPromise;
}

function buildBook(rows) {
  const book = new Map();
  // shorter lines first so each position keeps the most specific name that ends there
  const sorted = [...rows].sort((a, b) => a[2].length - b[2].length);
  for (const [eco, name, moves] of sorted) {
    const c = new Chess();
    for (const san of moves.split(" ")) {
      try {
        c.move(san);
      } catch {
        break;
      }
      const k = key(c.fen());
      if (!book.has(k)) book.set(k, { eco, name, exact: false });
    }
    book.set(key(c.fen()), { eco, name, exact: true });
  }
  return book;
}

/**
 * For a list of positions after each move, how many leading moves are book,
 * and the most specific opening name reached.
 */
export function bookDepth(book, fensAfter, startFen) {
  const standardStart = key(startFen) === key(new Chess().fen());
  let depth = 0;
  let opening = null;
  if (!standardStart) return { depth, opening };
  for (const fen of fensAfter) {
    const hit = book.get(key(fen));
    if (!hit) break;
    depth++;
    if (hit.exact || !opening) opening = { eco: hit.eco, name: hit.name };
  }
  return { depth, opening };
}
