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

export function renderSvg(nodes, geomOverride = {}) {
  const geom = {
    ...DEFAULT_GEOMETRY, ...geomOverride,
    padding: { ...DEFAULT_GEOMETRY.padding, ...geomOverride.padding },
  };
  const { width, height, nodes: laid, edges } = layoutDag(nodes, geom);
  const byId = new Map(laid.map((n) => [n.id, n]));

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
    parts.push(
      `<path d="M ${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}" `
      + `stroke="${from.color}" opacity="0.85"${dash}/>`,
    );
  }
  parts.push('</g>');

  for (const n of laid) {
    if (n.shape === 'circle') {
      const r = Math.max(4, geom.circleWidth / 4);
      parts.push(
        `<circle cx="${n.cx}" cy="${n.cy}" r="${r}" fill="${SURFACE}" `
        + `stroke="${n.color}" stroke-width="1.5"/>`,
      );
      continue;
    }
    const left = n.cx - geom.boxWidth / 2;
    const top = n.cy - geom.boxHeight / 2;
    parts.push(`<g transform="translate(${left}, ${top})">`);
    parts.push(
      `<rect width="${geom.boxWidth}" height="${geom.boxHeight}" rx="4" `
      + `fill="${SURFACE}" stroke="${n.color}" stroke-width="1.5"/>`,
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
  const nodes = parseDot(dotPath);
  const { svg, width, height } = renderSvg(nodes);
  writeFileSync(out, svg);
  console.log(`wrote ${out} (${Math.round(width)}x${Math.round(height)})`);
}
