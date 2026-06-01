/**
 * Graphviz/DOT rendering of the same logical graph the SVG renders.
 *
 * Useful for sharing, paste-into-mermaid/dreampuf, or feeding the
 * graph to a richer layout engine.  Mirrors the visual choices:
 * same node colours, circles for circle-shaped nodes, dashed
 * edges for ``edgeStyle: "dashed"`` consumers.
 */

import type { TraceDagInput } from './types.js';

function dotEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export interface DotExportOptions {
  /** ``rankdir`` value; defaults to ``TB`` (top-bottom). */
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
}

export function toDot(
  nodes: TraceDagInput[],
  opts: DotExportOptions = {},
): string {
  const rankdir = opts.rankdir ?? 'TB';
  const byId = new Map<string, TraceDagInput>();
  for (const n of nodes) byId.set(n.id, n);

  const lines: string[] = [
    'digraph lineage {',
    `  rankdir=${rankdir};`,
    '  node [shape=box, style="rounded,filled", fontname="monospace", '
      + 'fontsize=10, fillcolor="white"];',
    '  edge [color="#888888"];',
    '',
  ];
  for (const n of nodes) {
    const colour = n.color;
    const tooltip = n.tooltip ? `, tooltip="${dotEscape(n.tooltip)}"` : '';
    if (n.shape === 'circle') {
      lines.push(
        `  "${dotEscape(n.id)}" [shape=circle, label="", width=0.18, `
        + `height=0.18, fillcolor="${colour}", color="${colour}"${tooltip}];`,
      );
    } else {
      const label = [n.label, n.caption].filter(Boolean).join('\\n');
      lines.push(
        `  "${dotEscape(n.id)}" [label="${dotEscape(label)}", `
        + `color="${colour}", penwidth=1.5${tooltip}];`,
      );
    }
  }
  lines.push('');
  for (const to of nodes) {
    for (const inputId of to.inputs) {
      const from = byId.get(inputId);
      if (!from) continue;
      const style = to.edgeStyle === 'dashed' ? 'dashed' : 'solid';
      lines.push(
        `  "${dotEscape(from.id)}" -> "${dotEscape(to.id)}" `
        + `[color="${from.color}", style=${style}];`,
      );
    }
  }
  lines.push('}');
  return lines.join('\n');
}
