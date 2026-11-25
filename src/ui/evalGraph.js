// Win-chance graph (white area from the bottom, like Lichess) with markers on
// your mistakes. Click / tap to jump to a move.
const W = 1000;
const H = 160;

export function renderEvalGraph(container, scored, currentPly, myColor, onPick) {
  const wins = scored.winPercents;
  const n = wins.length - 1;
  const x = (i) => (n ? (i / n) * W : 0);
  const y = (w) => H - (w / 100) * H;
  const line = wins.map((w, i) => `${x(i).toFixed(1)},${y(w).toFixed(1)}`).join(" ");
  const dots = scored.moves
    .filter((m) => m.color === myColor && (m.judgement === "blunder" || m.judgement === "mistake" || m.missed))
    .map((m) => `<circle cx="${x(m.ply)}" cy="${y(wins[m.ply])}" r="5" class="dot ${m.missed ? "missed" : m.judgement}"/>`)
    .join("");

  container.innerHTML = `
    <svg class="evalgraph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Win chance over the game">
      <rect width="${W}" height="${H}" class="bg"/>
      <polygon points="0,${H} ${line} ${W},${H}" class="white-area"/>
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mid"/>
      <polyline points="${line}" class="eval-line"/>
      <line x1="${x(currentPly)}" x2="${x(currentPly)}" y1="0" y2="${H}" class="cursor"/>
      <g vector-effect="non-scaling-stroke">${dots}</g>
    </svg>
    <div class="graph-legend muted tiny"><span><i class="lg blunder"></i>your blunder</span><span><i class="lg mistake"></i>mistake</span><span><i class="lg missed"></i>missed chance</span><span>tap to jump</span></div>`;

  const svg = container.querySelector("svg");
  svg.addEventListener("click", (e) => {
    const r = svg.getBoundingClientRect();
    onPick(Math.round(((e.clientX - r.left) / r.width) * n));
  });
}
