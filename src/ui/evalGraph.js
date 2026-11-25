// Win-chance graph (white area from the bottom, like Lichess) with markers on
// your mistakes. Click / tap to jump to a move.
const H = 120;

const DOT = new Set(["brilliant", "great", "mistake", "miss", "blunder"]);

export function renderEvalGraph(container, report, currentPly, myColor, onPick) {
  const { scored, labels } = report;
  const wins = scored.winPercents;
  // draw in real pixels so markers stay round (no stretched viewBox)
  const W = Math.max(200, Math.round(container.clientWidth - 20));
  const n = wins.length - 1;
  const x = (i) => (n ? (i / n) * W : 0);
  const y = (w) => H - (w / 100) * H;
  const line = wins.map((w, i) => `${x(i).toFixed(1)},${y(w).toFixed(1)}`).join(" ");
  const dots = scored.moves
    .filter((m) => m.color === myColor && DOT.has(labels[m.ply - 1]))
    .map((m) => `<circle cx="${x(m.ply)}" cy="${y(wins[m.ply])}" r="5" class="dot dot-${labels[m.ply - 1]}"><title>${m.ply}: ${labels[m.ply - 1]}</title></circle>`)
    .join("");

  container.innerHTML = `
    <svg class="evalgraph" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Win chance over the game">
      <rect width="${W}" height="${H}" class="bg"/>
      <polygon points="0,${H} ${line} ${W},${H}" class="white-area"/>
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mid"/>
      <polyline points="${line}" class="eval-line"/>
      <line x1="${x(currentPly)}" x2="${x(currentPly)}" y1="0" y2="${H}" class="cursor"/>
      <g vector-effect="non-scaling-stroke">${dots}</g>
    </svg>
    <div class="graph-legend muted tiny"><span><i class="lg dot-brilliant"></i>brilliant</span><span><i class="lg dot-great"></i>great</span><span><i class="lg dot-mistake"></i>mistake</span><span><i class="lg dot-miss"></i>miss</span><span><i class="lg dot-blunder"></i>blunder</span><span>your moves · tap to jump</span></div>`;

  const svg = container.querySelector("svg");
  svg.addEventListener("click", (e) => {
    const r = svg.getBoundingClientRect();
    onPick(Math.round(((e.clientX - r.left) / r.width) * n));
  });
}
