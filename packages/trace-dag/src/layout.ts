/**
 * Sugiyama-style layered DAG layout.
 *
 * Three phases:
 *
 * 1. **Layer assignment** by longest path from a source.  Nodes with
 *    no resolvable inputs land on layer 0; every other node lands one
 *    layer below its deepest input.  Independent nodes from
 *    different timestamps / rounds / sources naturally share a
 *    layer — gives dot-like vertical compaction.
 *
 * 2. **Crossing minimisation** via alternating down/up barycentric
 *    sweeps.  Each sweep sorts a layer's nodes by the average
 *    position of their neighbours in the previously-laid-out
 *    adjacent layer; eight passes converge well for the graph sizes
 *    we render (~30 nodes).
 *
 * 3. **Priority positioning** so narrow layers don't all
 *    left-justify under wider ones.  After an initial left-pack,
 *    six alternating sweeps move each node toward the mean ``cx``
 *    of its neighbours, then re-enforce min-gap left-to-right.
 *    Spacing always wins over pull, so ordering survives.
 */

import type {
  TraceDagInput, TraceDagNode, TraceDagEdge, TraceDagGeometry,
} from './types.js';

export interface LayoutResult {
  nodes: TraceDagNode[];
  edges: TraceDagEdge[];
  width: number;
  height: number;
}

const REFINE_ITERS = 6;
const CROSSING_PASSES = 8;

export function layoutDag(
  input: TraceDagInput[],
  geom: TraceDagGeometry,
): LayoutResult {
  // ---- Resolve edges + child map ---------------------------------------
  const byId = new Map<string, TraceDagInput>();
  for (const n of input) byId.set(n.id, n);
  const childrenOf = new Map<string, TraceDagInput[]>();
  const edges: TraceDagEdge[] = [];
  for (const child of input) {
    for (const parentId of child.inputs) {
      const parent = byId.get(parentId);
      if (!parent) continue;  // dangling — silently skip
      const arr = childrenOf.get(parentId);
      if (arr) arr.push(child); else childrenOf.set(parentId, [child]);
      edges.push({ from: parentId, to: child.id });
    }
  }

  // ---- Phase 1: longest-path layering ----------------------------------
  // Single forward pass because the input order is topological by
  // construction (callers feed nodes in dependency order).  Nodes
  // referencing IDs that haven't been seen yet are layered at 0.
  const layerOf = new Map<string, number>();
  let maxLayer = 0;
  for (const n of input) {
    let depth = 0;
    for (const inputId of n.inputs) {
      const l = layerOf.get(inputId);
      if (l !== undefined) depth = Math.max(depth, l + 1);
    }
    layerOf.set(n.id, depth);
    if (depth > maxLayer) maxLayer = depth;
  }
  const layers: TraceDagInput[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of input) layers[layerOf.get(n.id)!].push(n);

  // ---- Phase 2: barycentric crossing minimisation ----------------------
  const rank = new Map<string, number>();
  for (const layer of layers) {
    layer.forEach((n, i) => rank.set(n.id, i));
  }
  for (let pass = 0; pass < CROSSING_PASSES; pass++) {
    const down = (pass % 2) === 0;
    const order = down
      ? layers.map((_l, i) => i)
      : layers.map((_l, i) => layers.length - 1 - i);
    for (const li of order) {
      const layer = layers[li];
      const bary = (n: TraceDagInput): number => {
        const neighbours = down
          ? n.inputs.map((id) => byId.get(id)).filter(
              (x): x is TraceDagInput => !!x,
            )
          : (childrenOf.get(n.id) ?? []);
        if (neighbours.length === 0) return rank.get(n.id) ?? 0;
        const sum = neighbours.reduce(
          (a, b) => a + (rank.get(b.id) ?? 0), 0,
        );
        return sum / neighbours.length;
      };
      layer.sort((a, b) => bary(a) - bary(b));
      layer.forEach((n, i) => rank.set(n.id, i));
    }
  }

  // ---- Phase 3: x/y assignment + priority pull -------------------------
  const widthOf = (n: TraceDagInput): number =>
    n.shape === 'circle' ? geom.circleWidth : geom.boxWidth;

  // Materialise output nodes so we can mutate cx/cy in place.
  const out: TraceDagNode[] = input.map((n) => ({
    ...n,
    layer: layerOf.get(n.id)!,
    cx: 0,
    cy: 0,
  }));
  const outById = new Map<string, TraceDagNode>();
  for (const n of out) outById.set(n.id, n);
  // Re-derive layers over the output nodes (in the order Phase 2 settled).
  const outLayers: TraceDagNode[][] = layers.map(
    (layer) => layer.map((n) => outById.get(n.id)!),
  );

  // Initial left-packed pass to give every node a valid starting cx.
  for (let li = 0; li < outLayers.length; li++) {
    let x = geom.padding.l;
    const cy = geom.padding.t + li * geom.rowHeight + geom.boxHeight / 2;
    for (const n of outLayers[li]) {
      const w = widthOf(n);
      n.cx = x + w / 2;
      n.cy = cy;
      x += w + geom.gap;
    }
  }

  // Iterative pull-toward-neighbours, with spacing enforced per sweep.
  const outChildrenOf = new Map<string, TraceDagNode[]>();
  for (const child of out) {
    for (const parentId of child.inputs) {
      const parent = outById.get(parentId);
      if (!parent) continue;
      const arr = outChildrenOf.get(parentId);
      if (arr) arr.push(child); else outChildrenOf.set(parentId, [child]);
    }
  }
  for (let iter = 0; iter < REFINE_ITERS; iter++) {
    const down = iter % 2 === 0;
    const order = down
      ? outLayers.map((_l, i) => i)
      : outLayers.map((_l, i) => outLayers.length - 1 - i);
    for (const li of order) {
      const layer = outLayers[li];
      const targets = layer.map((n) => {
        const neigh: TraceDagNode[] = [
          ...n.inputs.map((id) => outById.get(id)).filter(
            (x): x is TraceDagNode => !!x,
          ),
          ...(outChildrenOf.get(n.id) ?? []),
        ];
        if (neigh.length === 0) return n.cx;
        return neigh.reduce((a, b) => a + b.cx, 0) / neigh.length;
      });
      let prevRight = geom.padding.l;
      for (let i = 0; i < layer.length; i++) {
        const n = layer[i];
        const w = widthOf(n);
        const minCx = prevRight + w / 2;
        n.cx = Math.max(targets[i], minCx);
        prevRight = n.cx + w / 2 + geom.gap;
      }
    }
  }

  // ---- Bounding box ---------------------------------------------------
  let maxRight = 0;
  for (const n of out) {
    const right = n.cx + widthOf(n) / 2;
    if (right > maxRight) maxRight = right;
  }
  const height = geom.padding.t + outLayers.length * geom.rowHeight + geom.padding.b;

  return {
    nodes: out,
    edges,
    width: maxRight + geom.padding.r,
    height,
  };
}
