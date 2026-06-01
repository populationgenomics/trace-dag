// Objective layout metrics for iterating on layout.ts.
import { layoutDag, DEFAULT_GEOMETRY } from '../dist/index.js';
import { parseDot } from './parse-dot.mjs';

// Count edge crossings between adjacent layers using the laid-out cx
// of endpoints (geometric, so it also reflects x-positioning, not just
// ordering).
function crossings(laid, edges) {
  const by = new Map(laid.map((n) => [n.id, n]));
  // Group edges by the (from.layer) they span; only compare edges that
  // occupy the same layer gap.
  const byGap = new Map();
  for (const e of edges) {
    const a = by.get(e.from);
    const b = by.get(e.to);
    if (!a || !b) continue;
    const gap = Math.min(a.layer, b.layer);
    (byGap.get(gap) ?? byGap.set(gap, []).get(gap)).push([a, b]);
  }
  let total = 0;
  for (const segs of byGap.values()) {
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const [a1, b1] = segs[i];
        const [a2, b2] = segs[j];
        // crossing if order of tops and bottoms disagree
        if ((a1.cx - a2.cx) * (b1.cx - b2.cx) < 0) total++;
      }
    }
  }
  return total;
}

// Total vertical edge "ink" — sum of |dx| over edges, a proxy for how
// slanted/long edges are (lower is tidier).
function edgeSlant(laid, edges) {
  const by = new Map(laid.map((n) => [n.id, n]));
  let s = 0;
  for (const e of edges) {
    const a = by.get(e.from);
    const b = by.get(e.to);
    if (a && b) s += Math.abs(a.cx - b.cx);
  }
  return Math.round(s);
}

export function report(label, nodes, geom = DEFAULT_GEOMETRY) {
  const r = layoutDag(nodes, geom);
  const x = crossings(r.nodes, r.edges);
  const slant = edgeSlant(r.nodes, r.edges);
  const aspect = (r.width / r.height).toFixed(1);
  console.log(
    `${label.padEnd(16)} ${Math.round(r.width)}x${Math.round(r.height)}`
    + `  aspect ${aspect}  crossings ${x}  slant ${slant}`,
  );
  return { ...r, crossings: x, slant };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nodes = parseDot(process.argv[2] ?? 'test.dot');
  report('current', nodes);
}
