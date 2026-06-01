// Render a TraceDagInput[] through layoutDag to a standalone SVG
// (concrete dark-theme colours so it rasterises without a DOM).
import { writeFileSync } from 'node:fs';
import { layoutDag, DEFAULT_GEOMETRY } from '../dist/index.js';
import { parseDot } from './parse-dot.mjs';

const SURFACE = '#1a1a1a';
const BG = '#0d0d0d';
const TEXT_MUTED = '#888';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Emphasis tiers mirror TraceDag.tsx so this static render previews the
// real selection behaviour.  ``selection`` is a node id, or {from,to}.
const NODE_OPACITY = { normal: 1, primary: 1, secondary: 0.6, dim: 0.15 };
const EDGE_OPACITY = { normal: 0.85, primary: 1, secondary: 0.6, dim: 0.12 };
const NODE_STROKE = { normal: 1.5, primary: 2.5, secondary: 1.5, dim: 1.5 };
const EDGE_STROKE = { normal: 1.4, primary: 2.6, secondary: 1.4, dim: 1.4 };

export function renderSvg(nodes, geomOverride = {}, selection = null) {
  const geom = {
    ...DEFAULT_GEOMETRY, ...geomOverride,
    padding: { ...DEFAULT_GEOMETRY.padding, ...geomOverride.padding },
  };
  const { width, height, nodes: laid, edges } = layoutDag(nodes, geom);
  const byId = new Map(laid.map((n) => [n.id, n]));

  const neigh = new Map();
  for (const e of edges) {
    (neigh.get(e.from) ?? neigh.set(e.from, new Set()).get(e.from)).add(e.to);
    (neigh.get(e.to) ?? neigh.set(e.to, new Set()).get(e.to)).add(e.from);
  }
  const selNode = typeof selection === 'string' ? selection : null;
  const selEdge = selection && typeof selection === 'object' ? selection : null;
  const nodeEmph = (id) => {
    if (selNode) return id === selNode ? 'primary'
      : (neigh.get(selNode)?.has(id) ? 'secondary' : 'dim');
    if (selEdge) return id === selEdge.from || id === selEdge.to ? 'primary' : 'dim';
    return 'normal';
  };
  const edgeEmph = (e) => {
    if (selNode) return e.from === selNode || e.to === selNode ? 'primary' : 'dim';
    if (selEdge) return e.from === selEdge.from && e.to === selEdge.to
      ? 'primary' : 'dim';
    return 'normal';
  };

  const inAnchor = (n) => n.shape === 'circle'
    ? { x: n.cx, y: n.cy - geom.circleWidth / 4 }
    : { x: n.cx, y: n.cy - geom.boxHeight / 2 };
  const outAnchor = (n) => n.shape === 'circle'
    ? { x: n.cx, y: n.cy + geom.circleWidth / 4 }
    : { x: n.cx, y: n.cy + geom.boxHeight / 2 };

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" `
    + `width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="${BG}"/>`,
    '<g fill="none" stroke-width="1.4">',
  ];
  for (const e of edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    const a = outAnchor(from);
    const b = inAnchor(to);
    const mid = (a.y + b.y) / 2;
    const dash = to.edgeStyle === 'dashed' ? ' stroke-dasharray="4 3"' : '';
    const em = edgeEmph(e);
    parts.push(
      `<path d="M ${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}" `
      + `stroke="${from.color}" stroke-width="${EDGE_STROKE[em]}" `
      + `opacity="${EDGE_OPACITY[em]}"${dash}/>`,
    );
  }
  parts.push('</g>');

  for (const n of laid) {
    const em = nodeEmph(n.id);
    if (n.shape === 'circle') {
      const r = Math.max(4, geom.circleWidth / 4);
      parts.push(
        `<circle cx="${n.cx}" cy="${n.cy}" r="${r}" fill="${SURFACE}" `
        + `stroke="${n.color}" stroke-width="${NODE_STROKE[em]}" `
        + `opacity="${NODE_OPACITY[em]}"/>`,
      );
      continue;
    }
    const left = n.cx - geom.boxWidth / 2;
    const top = n.cy - geom.boxHeight / 2;
    parts.push(`<g transform="translate(${left}, ${top})" opacity="${NODE_OPACITY[em]}">`);
    parts.push(
      `<rect width="${geom.boxWidth}" height="${geom.boxHeight}" rx="4" `
      + `fill="${SURFACE}" stroke="${n.color}" stroke-width="${NODE_STROKE[em]}"/>`,
    );
    parts.push(
      `<text x="6" y="13" fill="${n.color}" font-size="10" `
      + `font-family="monospace" font-weight="600">${esc(n.label)}</text>`,
    );
    if (n.caption) {
      const c = n.caption.length > 18 ? n.caption.slice(0, 17) + '…' : n.caption;
      parts.push(
        `<text x="6" y="25" fill="${TEXT_MUTED}" font-size="9" `
        + `font-family="monospace">${esc(c)}</text>`,
      );
    }
    parts.push('</g>');
  }
  parts.push('</svg>');
  return { svg: parts.join('\n'), width, height };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dotPath = process.argv[2] ?? 'test.dot';
  const out = process.argv[3] ?? 'packages/trace-dag/eval/out.svg';
  // Optional 4th arg: a node id to render as selected, or "from>to".
  const selArg = process.argv[4];
  const selection = selArg
    ? (selArg.includes('>')
        ? { from: selArg.split('>')[0], to: selArg.split('>')[1] }
        : selArg)
    : null;
  const nodes = parseDot(dotPath);
  const { svg, width, height } = renderSvg(nodes, {}, selection);
  writeFileSync(out, svg);
  console.log(`wrote ${out} (${Math.round(width)}x${Math.round(height)})`);
}
