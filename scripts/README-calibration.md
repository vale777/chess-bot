# How the accuracy formula was calibrated

Chess.com doesn't publish how it computes "accuracy" (CAPS). Lichess publishes its
formula, but in low-rated games it disagrees with chess.com by a lot: the
Lichess formula judges every lost advantage as if both players were masters.

To get closer to chess.com, the model in `src/metrics.js` (`MODEL`) was fitted to
chess.com's own numbers:

1. **Data**: 477 public rated games whose chess.com API record includes
   `accuracies` (games someone reviewed on chess.com). That's 946 player results,
   with ratings spread from below 300 to above 2400 (40–70 games per 300-point band).
2. **Engine**: every position was analyzed with the same engine the site uses,
   Stockfish 19 lite (single-threaded WASM), at depth 12.
3. **Model**: win% = logistic(k · cp), where k depends slightly on the mover's
   rating. Per-move accuracy = c0 · e^(−b · win%-loss) + (100 − c0). Game
   accuracy = harmonic mean of the move accuracies. The parameters were fitted
   with Nelder–Mead to minimize the mean absolute error on 70 % of the games.
4. **Result on the held-out 30 %** (mean absolute error, in accuracy points):

   | Ratings     | Lichess formula | Fitted model |
   |-------------|-----------------|--------------|
   | under 800   | 9.2             | 5.6          |
   | 800–1400    | 7.1             | 4.9          |
   | 1400–2000   | 6.7             | 3.9          |
   | 2000+       | 6.7             | 3.6          |
   | **all**     | **7.5**         | **4.5**      |

Some gap remains because chess.com uses a stronger engine at a higher depth,
and its formula probably looks at more than these features. Expect a typical
difference of about ±5 points per game, and more in very chaotic games.

Move-label thresholds (Best/Excellent/Good/Inaccuracy/Mistake/Blunder at
0/2/5/10/20 % expected-points loss) are chess.com's published bands. They are
applied to the same fitted win% curve.
