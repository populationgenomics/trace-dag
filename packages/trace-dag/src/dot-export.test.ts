import { describe, it, expect } from 'vitest';

import { toDot } from './dot-export.js';
import type { TraceDagInput } from './types.js';

function node(
  id: string,
  inputs: string[] = [],
  extra: Partial<TraceDagInput> = {},
): TraceDagInput {
  return { id, inputs, label: id, color: '#1f77b4', ...extra };
}

describe('toDot — structure', () => {
  it('wraps output in a digraph with the default rankdir', () => {
    const dot = toDot([node('a')]);
    expect(dot.startsWith('digraph lineage {')).toBe(true);
    expect(dot).toContain('rankdir=TB;');
    expect(dot.trimEnd().endsWith('}')).toBe(true);
  });

  it('honours an explicit rankdir', () => {
    expect(toDot([node('a')], { rankdir: 'LR' })).toContain('rankdir=LR;');
  });

  it('emits one node statement per node', () => {
    const dot = toDot([node('a'), node('b', ['a'])]);
    expect(dot).toContain('"a" [label="a"');
    expect(dot).toContain('"b" [label="b"');
  });

  it('emits an edge per resolvable input', () => {
    const dot = toDot([node('a'), node('b', ['a'])]);
    expect(dot).toContain('"a" -> "b"');
  });

  it('skips dangling edges', () => {
    const dot = toDot([node('b', ['ghost'])]);
    expect(dot).not.toContain('->');
  });
});

describe('toDot — node rendering', () => {
  it('renders circle nodes with circle shape and no label', () => {
    const dot = toDot([node('c', [], { shape: 'circle', color: '#9467bd' })]);
    expect(dot).toContain('"c" [shape=circle, label=""');
    expect(dot).toContain('fillcolor="#9467bd"');
  });

  it('joins label and caption with a newline separator', () => {
    // The join inserts a literal backslash-n, which dotEscape then doubles;
    // this matches how the existing DOT fixtures encode multi-line labels.
    const dot = toDot([node('a', [], { label: 'sem', caption: 'query foo' })]);
    expect(dot).toContain('label="sem\\\\nquery foo"');
  });

  it('uses the node colour for the box border', () => {
    const dot = toDot([node('a', [], { color: '#d62728' })]);
    expect(dot).toContain('color="#d62728", penwidth=1.5');
  });

  it('includes a tooltip when provided', () => {
    const dot = toDot([node('a', [], { tooltip: 'hello' })]);
    expect(dot).toContain('tooltip="hello"');
  });

  it('omits the tooltip attribute when absent', () => {
    const dot = toDot([node('a')]);
    expect(dot).not.toContain('tooltip=');
  });
});

describe('toDot — edge styling', () => {
  it('uses the producer colour for the edge', () => {
    const dot = toDot([
      node('a', [], { color: '#2ca02c' }),
      node('b', ['a']),
    ]);
    expect(dot).toContain('"a" -> "b" [color="#2ca02c", style=solid];');
  });

  it('renders dashed edges for dashed sinks', () => {
    const dot = toDot([
      node('a'),
      node('b', ['a'], { edgeStyle: 'dashed' }),
    ]);
    expect(dot).toContain('style=dashed');
  });

  it('defaults to solid edges', () => {
    const dot = toDot([node('a'), node('b', ['a'])]);
    expect(dot).toContain('style=solid');
  });
});

describe('toDot — escaping', () => {
  it('escapes double quotes in labels', () => {
    const dot = toDot([node('a', [], { label: 'say "hi"' })]);
    expect(dot).toContain('label="say \\"hi\\""');
  });

  it('escapes backslashes in labels', () => {
    const dot = toDot([node('a', [], { label: 'a\\b' })]);
    expect(dot).toContain('label="a\\\\b"');
  });

  it('escapes literal newlines in tooltips', () => {
    const dot = toDot([node('a', [], { tooltip: 'line1\nline2' })]);
    expect(dot).toContain('tooltip="line1\\nline2"');
  });

  it('escapes ids', () => {
    const dot = toDot([node('a"b')]);
    expect(dot).toContain('"a\\"b"');
  });
});
