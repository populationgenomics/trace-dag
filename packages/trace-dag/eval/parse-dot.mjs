// Parse the constrained DOT our exporter produces back into
// TraceDagInput[] — a faithful "represent this graph with trace-dag
// primitives" round-trip.  Only handles the attribute subset toDot emits.
import { readFileSync } from 'node:fs';

function unescape(s) {
  // Inverse of dot-export.dotEscape (backslash, then quote).
  return s.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
}

function attrs(body) {
  // Pull key="value" and key=token pairs out of a `[...]` attr list.
  const out = {};
  const re = /(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\]]+)/g;
  let m;
  while ((m = re.exec(body))) {
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export function parseDot(path) {
  const text = readFileSync(path, 'utf8');
  const nodeRe = /^\s*"((?:[^"\\]|\\.)*)"\s*\[([^\]]*)\]\s*;?\s*$/;
  const edgeRe = /^\s*"((?:[^"\\]|\\.)*)"\s*->\s*"((?:[^"\\]|\\.)*)"\s*\[([^\]]*)\]/;

  const nodes = new Map();
  const incoming = new Map(); // id -> {dashed}
  const order = [];

  for (const line of text.split('\n')) {
    const em = edgeRe.exec(line);
    if (em) {
      const [, from, to, body] = em;
      const a = attrs(body);
      const cur = incoming.get(unescape(to)) ?? { parents: [], dashed: false };
      cur.parents.push(unescape(from));
      if (a.style === 'dashed') cur.dashed = true;
      incoming.set(unescape(to), cur);
      continue;
    }
    const nm = nodeRe.exec(line);
    if (nm) {
      const id = unescape(nm[1]);
      const a = attrs(nm[2]);
      const shape = a.shape === 'circle' ? 'circle' : 'box';
      let label = '';
      let caption;
      if (shape === 'box') {
        const parts = unescape(a.label ?? '').split(/\\n/);
        label = parts[0];
        caption = parts.slice(1).join(' ') || undefined;
      }
      nodes.set(id, {
        id,
        inputs: [],
        label,
        caption,
        color: a.color ?? '#888888',
        shape,
        tooltip: a.tooltip ? unescape(a.tooltip) : undefined,
      });
      order.push(id);
    }
  }

  // Wire inputs + per-sink edge style; preserve file (topological) order.
  for (const id of order) {
    const inc = incoming.get(id);
    if (!inc) continue;
    const n = nodes.get(id);
    n.inputs = inc.parents;
    if (inc.dashed) n.edgeStyle = 'dashed';
  }

  return order.map((id) => nodes.get(id));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nodes = parseDot(process.argv[2] ?? 'test.dot');
  console.log(JSON.stringify(nodes, null, 2));
}
