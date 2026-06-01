import { describe, it, expect } from 'vitest';

import { layoutDag } from './layout.js';
import { DEFAULT_GEOMETRY } from './types.js';
import type { TraceDagInput, TraceDagGeometry } from './types.js';

const GEOM: TraceDagGeometry = DEFAULT_GEOMETRY;

/** Convenience: build a minimal box node. */
function node(
  id: string,
  inputs: string[] = [],
  extra: Partial<TraceDagInput> = {},
): TraceDagInput {
  return { id, inputs, label: id, color: '#000', ...extra };
}

/** Map of id -> layer for the laid-out result. */
function layers(input: TraceDagInput[], geom = GEOM) {
  const { nodes } = layoutDag(input, geom);
  return new Map(nodes.map((n) => [n.id, n.layer]));
}

describe('layoutDag — layer assignment', () => {
  it('places a source node with no inputs on layer 0', () => {
    const l = layers([node('a')]);
    expect(l.get('a')).toBe(0);
  });

  it('places a child one layer below its only parent', () => {
    const l = layers([node('a'), node('b', ['a'])]);
    expect(l.get('a')).toBe(0);
    expect(l.get('b')).toBe(1);
  });

  it('uses longest path when a node has multiple parents at different depths', () => {
    // a -> b -> c, and a -> c directly.  c must sit below b (longest path).
    const l = layers([node('a'), node('b', ['a']), node('c', ['a', 'b'])]);
    expect(l.get('a')).toBe(0);
    expect(l.get('b')).toBe(1);
    expect(l.get('c')).toBe(2);
  });

  it('independent sources share layer 0', () => {
    const l = layers([node('a'), node('b'), node('c', ['a', 'b'])]);
    expect(l.get('a')).toBe(0);
    expect(l.get('b')).toBe(0);
    expect(l.get('c')).toBe(1);
  });

  it('lands nodes with only dangling inputs on layer 0', () => {
    // 'b' references a parent that does not exist in the input set.
    const l = layers([node('b', ['ghost'])]);
    expect(l.get('b')).toBe(0);
  });

  it('treats not-yet-seen (forward) references as dangling for layering', () => {
    // Caller order is assumed topological; 'a' referencing later 'b'
    // is unresolved at layering time, so 'a' lands on layer 0.
    const l = layers([node('a', ['b']), node('b')]);
    expect(l.get('a')).toBe(0);
    expect(l.get('b')).toBe(0);
  });
});

describe('layoutDag — edges', () => {
  it('emits one edge per resolvable input', () => {
    const { edges } = layoutDag([node('a'), node('b', ['a'])], GEOM);
    expect(edges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('silently skips dangling edges', () => {
    const { edges } = layoutDag([node('b', ['ghost'])], GEOM);
    expect(edges).toEqual([]);
  });

  it('emits an edge per parent for fan-in', () => {
    const { edges } = layoutDag(
      [node('a'), node('b'), node('c', ['a', 'b'])],
      GEOM,
    );
    expect(edges).toContainEqual({ from: 'a', to: 'c' });
    expect(edges).toContainEqual({ from: 'b', to: 'c' });
    expect(edges).toHaveLength(2);
  });
});

describe('layoutDag — geometry & positioning', () => {
  it('returns an empty layout for no nodes', () => {
    const r = layoutDag([], GEOM);
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
  });

  it('assigns cy by layer using rowHeight', () => {
    const { nodes } = layoutDag([node('a'), node('b', ['a'])], GEOM);
    const a = nodes.find((n) => n.id === 'a')!;
    const b = nodes.find((n) => n.id === 'b')!;
    const expectedCy = (li: number) =>
      GEOM.padding.t + li * GEOM.rowHeight + GEOM.boxHeight / 2;
    expect(a.cy).toBe(expectedCy(0));
    expect(b.cy).toBe(expectedCy(1));
  });

  it('keeps same-layer nodes from overlapping (respects gap)', () => {
    const input = [node('a'), node('b'), node('c'), node('d')];
    const { nodes } = layoutDag(input, GEOM);
    const row = nodes.filter((n) => n.layer === 0).sort((x, y) => x.cx - y.cx);
    for (let i = 1; i < row.length; i++) {
      const gap = (row[i].cx - GEOM.boxWidth / 2)
        - (row[i - 1].cx + GEOM.boxWidth / 2);
      expect(gap).toBeGreaterThanOrEqual(GEOM.gap - 1e-6);
    }
  });

  it('gives circle nodes a smaller horizontal footprint than boxes', () => {
    // Two circles + one box on the same layer; the inter-node spacing
    // for circles uses circleWidth, so two circles pack tighter than
    // two boxes would.
    const circ = layoutDag(
      [node('a', [], { shape: 'circle' }), node('b', [], { shape: 'circle' })],
      GEOM,
    ).nodes.sort((x, y) => x.cx - y.cx);
    const boxes = layoutDag([node('a'), node('b')], GEOM)
      .nodes.sort((x, y) => x.cx - y.cx);
    const circGap = circ[1].cx - circ[0].cx;
    const boxGap = boxes[1].cx - boxes[0].cx;
    expect(circGap).toBeLessThan(boxGap);
  });

  it('computes width from the right edge of the widest layer', () => {
    const r = layoutDag([node('a'), node('b'), node('c')], GEOM);
    const maxRight = Math.max(...r.nodes.map((n) => n.cx + GEOM.boxWidth / 2));
    expect(r.width).toBe(maxRight + GEOM.padding.r);
  });

  it('computes height from layer count and rowHeight', () => {
    const r = layoutDag([node('a'), node('b', ['a'])], GEOM);
    const layerCount = 2;
    expect(r.height).toBe(
      GEOM.padding.t + layerCount * GEOM.rowHeight + GEOM.padding.b,
    );
  });

  it('positions every node within the reported bounding box', () => {
    const input = [
      node('a'), node('b'), node('c', ['a', 'b']),
      node('d', ['c'], { shape: 'circle' }), node('e', ['c']),
    ];
    const r = layoutDag(input, GEOM);
    for (const n of r.nodes) {
      const w = n.shape === 'circle' ? GEOM.circleWidth : GEOM.boxWidth;
      expect(n.cx - w / 2).toBeGreaterThanOrEqual(GEOM.padding.l - 1e-6);
      expect(n.cx + w / 2).toBeLessThanOrEqual(r.width - GEOM.padding.r + 1e-6);
      expect(n.cy).toBeGreaterThan(0);
      expect(n.cy).toBeLessThan(r.height);
    }
  });
});

describe('layoutDag — isolated nodes', () => {
  it('keeps a lone isolated node on layer 0', () => {
    const l = layers([node('a')]);
    expect(l.get('a')).toBe(0);
  });

  it('grid-packs edge-free nodes into a block below the connected flow', () => {
    // A 2-layer flow (a -> b) plus several isolated nodes.  The isolated
    // block must sit strictly below the flow's deepest layer.
    const iso = ['i0', 'i1', 'i2', 'i3', 'i4'].map((id) =>
      node(id, [], { shape: 'circle' }));
    const { nodes } = layoutDag([node('a'), node('b', ['a']), ...iso], GEOM);
    const flowMaxCy = Math.max(
      nodes.find((n) => n.id === 'a')!.cy,
      nodes.find((n) => n.id === 'b')!.cy,
    );
    for (const id of ['i0', 'i1', 'i2', 'i3', 'i4']) {
      expect(nodes.find((n) => n.id === id)!.cy).toBeGreaterThan(flowMaxCy);
    }
  });

  it('packs isolated nodes into multiple rows rather than one wide row', () => {
    // 9 isolated nodes -> ceil(sqrt(9)) = 3 columns, so >1 distinct cy.
    const iso = Array.from({ length: 9 }, (_, i) =>
      node(`i${i}`, [], { shape: 'circle' }));
    const { nodes } = layoutDag(iso, GEOM);
    const distinctRows = new Set(nodes.map((n) => n.cy));
    expect(distinctRows.size).toBeGreaterThan(1);
  });

  it('does not let isolated nodes dominate width', () => {
    // Many isolated nodes should grid-wrap, not exceed a narrow connected
    // flow by a huge margin.
    const iso = Array.from({ length: 25 }, (_, i) =>
      node(`i${i}`, [], { shape: 'circle' }));
    const wide = layoutDag(iso, GEOM).width;
    // 25 circles wrapped at 5 cols ~ 5 * (circleWidth + gap); nowhere near
    // 25 in a single row.
    expect(wide).toBeLessThan(25 * (GEOM.circleWidth + GEOM.gap) / 2);
  });
});

describe('layoutDag — compaction', () => {
  it('does not waste horizontal space beyond the widest layer', () => {
    // Three independent two-node chains.  Optimal width is one chain's
    // footprint times three plus gaps — the layout must not balloon far
    // past the widest layer's minimum.
    const input = [
      node('a0'), node('a1', ['a0']),
      node('b0'), node('b1', ['b0']),
      node('c0'), node('c1', ['c0']),
    ];
    const r = layoutDag(input, GEOM);
    const widest = 3 * GEOM.boxWidth + 2 * GEOM.gap; // 3 nodes on a layer
    const minWidth = widest + GEOM.padding.l + GEOM.padding.r;
    // Allow slack for centring, but not a 1.5x blow-out.
    expect(r.width).toBeLessThan(minWidth * 1.5);
  });
});

describe('layoutDag — crossing minimisation', () => {
  it('orders children under their parents to reduce crossings', () => {
    // Two parents p0, p1 on layer 0.  Children deliberately fed in an
    // order that crosses (c1 before c0), each wired straight down.
    // Barycentric sweeps should pull each child under its parent.
    const input = [
      node('p0'), node('p1'),
      node('c1', ['p1']), node('c0', ['p0']),
    ];
    const { nodes } = layoutDag(input, GEOM);
    const cx = (id: string) => nodes.find((n) => n.id === id)!.cx;
    // child of the left parent should end up left of child of right parent.
    const p0Left = cx('p0') < cx('p1');
    expect(cx('c0') < cx('c1')).toBe(p0Left);
  });

  it('is deterministic — same input yields identical positions', () => {
    const mk = () => [
      node('a'), node('b'), node('c', ['a', 'b']),
      node('d', ['c']), node('e', ['c']),
    ];
    const r1 = layoutDag(mk(), GEOM);
    const r2 = layoutDag(mk(), GEOM);
    expect(r1.nodes.map((n) => [n.id, n.cx, n.cy]))
      .toEqual(r2.nodes.map((n) => [n.id, n.cx, n.cy]));
  });
});
