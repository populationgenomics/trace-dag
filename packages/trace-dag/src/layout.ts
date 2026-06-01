/**
 * Sugiyama-style layered DAG layout.
 *
 * Phases:
 *
 * 0. **Isolated peeling.**  Nodes that take part in no edge would
 *    otherwise pile onto layer 0 and stretch it arbitrarily wide.
 *    They are set aside and grid-packed in Phase 4 instead.
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
 *    adjacent layer.  Sweeps don't improve monotonically, so we count
 *    crossings after each and keep the best ordering seen.
 *
 * 3. **Positioning.**  Six alternating sweeps move each node toward the
 *    mean ``cx`` of its neighbours, with each layer placed optimally
 *    via isotonic regression (see {@link placeRow}) — closest to those
 *    targets subject to min-gap spacing.  Pulling both ways keeps
 *    independent subtrees compact instead of drifting right.
 *
 * 4. **Grid-pack isolated nodes** into a compact, roughly-square block
 *    below the flow so they read as a clearly-separate group.
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

/**
 * Place one layer's nodes as close as possible to their desired
 * ``targets`` (the mean of each node's neighbours), subject to a
 * left-to-right minimum-separation constraint and a left bound.
 *
 * This is isotonic regression: substituting away the cumulative minimum
 * separations turns the ordered min-gap constraints into a simple
 * monotonicity constraint, which the pool-adjacent-violators algorithm
 * solves optimally in O(n).  Unlike a greedy ``max(target, prevRight)``
 * pass it pulls *both* ways, so independent subtrees compact toward each
 * other instead of drifting rightward — no wasted horizontal slack.
 */
function placeRow(
  targets: number[], widths: number[], gap: number, leftBound: number,
): number[] {
  const n = targets.length;
  if (n === 0) return [];
  // D[i] = minimal feasible centre of node i (everything packed left).
  const D = new Array<number>(n);
  D[0] = leftBound + widths[0] / 2;
  for (let i = 1; i < n; i++) {
    D[i] = D[i - 1] + widths[i - 1] / 2 + gap + widths[i] / 2;
  }
  // Fit z[i] = targets[i] - D[i] under z nondecreasing (PAVA).
  const val: number[] = [];
  const cnt: number[] = [];
  for (let i = 0; i < n; i++) {
    let v = targets[i] - D[i];
    let c = 1;
    while (val.length > 0 && val[val.length - 1] >= v) {
      const pv = val.pop()!;
      const pc = cnt.pop()!;
      v = (v * c + pv * pc) / (c + pc);
      c += pc;
    }
    val.push(v);
    cnt.push(c);
  }
  // Expand pooled values back to per-node, clamped so z >= 0 (left bound).
  const out = new Array<number>(n);
  let idx = 0;
  for (let k = 0; k < val.length; k++) {
    const z = Math.max(val[k], 0);
    for (let j = 0; j < cnt[k]; j++, idx++) out[idx] = z + D[idx];
  }
  return out;
}

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

  // ---- Phase 0: peel off fully-isolated nodes --------------------------
  // Nodes with no resolvable inputs *and* no children participate in no
  // edge.  Left in the flow they would pile onto layer 0 and stretch it
  // arbitrarily wide; instead we grid-pack them into a compact block
  // below the connected graph (see Phase 4).
  const hasResolvableInput = (n: TraceDagInput): boolean =>
    n.inputs.some((id) => byId.has(id));
  const isolated: TraceDagInput[] = [];
  const flow: TraceDagInput[] = [];
  for (const n of input) {
    if (!hasResolvableInput(n) && !childrenOf.has(n.id)) isolated.push(n);
    else flow.push(n);
  }

  // ---- Phase 1: longest-path layering ----------------------------------
  // Single forward pass because the input order is topological by
  // construction (callers feed nodes in dependency order).  Nodes
  // referencing IDs that haven't been seen yet are layered at 0.
  const layerOf = new Map<string, number>();
  let maxLayer = 0;
  for (const n of flow) {
    let depth = 0;
    for (const inputId of n.inputs) {
      const l = layerOf.get(inputId);
      if (l !== undefined) depth = Math.max(depth, l + 1);
    }
    layerOf.set(n.id, depth);
    if (depth > maxLayer) maxLayer = depth;
  }
  const layers: TraceDagInput[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of flow) layers[layerOf.get(n.id)!].push(n);

  // ---- Phase 2: barycentric crossing minimisation ----------------------
  const rank = new Map<string, number>();
  for (const layer of layers) {
    layer.forEach((n, i) => rank.set(n.id, i));
  }
  // Count crossings between every adjacent layer pair for the current
  // ``rank`` — lets us keep the best ordering rather than whatever the
  // final sweep happens to leave (barycentric sweeps don't monotonically
  // improve).
  const countCrossings = (): number => {
    let total = 0;
    for (const child of flow) {
      for (const parentId of child.inputs) {
        if (!byId.has(parentId)) continue;
        for (const child2 of flow) {
          for (const parentId2 of child2.inputs) {
            if (!byId.has(parentId2)) continue;
            if (layerOf.get(child.id) !== layerOf.get(child2.id)) continue;
            if (layerOf.get(parentId) !== layerOf.get(parentId2)) continue;
            if (rank.get(child.id)! >= rank.get(child2.id)!) continue;
            const p = rank.get(parentId)!;
            const p2 = rank.get(parentId2)!;
            if (p > p2) total++;
          }
        }
      }
    }
    return total;
  };
  const snapshot = (): Map<string, number> => new Map(rank);
  let bestOrder = snapshot();
  let bestCrossings = countCrossings();
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
    const c = countCrossings();
    if (c < bestCrossings) { bestCrossings = c; bestOrder = snapshot(); }
  }
  // Restore the best ordering and re-sort each layer to match.
  rank.clear();
  for (const [id, r] of bestOrder) rank.set(id, r);
  for (const layer of layers) layer.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);

  // ---- Phase 3: x/y assignment + priority pull -------------------------
  const widthOf = (n: TraceDagInput): number =>
    n.shape === 'circle' ? geom.circleWidth : geom.boxWidth;

  // Materialise output nodes so we can mutate cx/cy in place.  Only the
  // connected flow is laid out here; isolated nodes are packed in Phase 4.
  const out: TraceDagNode[] = flow.map((n) => ({
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
      const xs = placeRow(
        targets, layer.map(widthOf), geom.gap, geom.padding.l,
      );
      layer.forEach((n, i) => { n.cx = xs[i]; });
    }
  }

  // Connected-flow bounding box (before isolated nodes are appended).
  let maxRight = 0;
  for (const n of out) {
    const right = n.cx + widthOf(n) / 2;
    if (right > maxRight) maxRight = right;
  }
  // ``outLayers`` always has at least one (possibly empty) entry; a graph
  // made entirely of isolated nodes has no real flow rows.
  const flowRows = flow.length === 0 ? 0 : outLayers.length;
  const flowBottom = geom.padding.t + flowRows * geom.rowHeight;

  // ---- Phase 4: grid-pack isolated nodes -------------------------------
  // Lay the edge-free nodes out as a compact, roughly-square block below
  // the flow so they read as a clearly-separate group rather than
  // stretching layer 0 arbitrarily wide.  With no flow, the block starts
  // at the top so a lone node sits on layer 0.
  let isoBottom = flowBottom;
  if (isolated.length > 0) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(isolated.length)));
    const startY = flowRows === 0 ? geom.padding.t : flowBottom + geom.rowHeight;
    let x = geom.padding.l;
    for (let i = 0; i < isolated.length; i++) {
      const n = isolated[i];
      const row = Math.floor(i / cols);
      if (i % cols === 0) x = geom.padding.l;
      const w = widthOf(n);
      out.push({
        ...n,
        layer: flowRows + row,
        cx: x + w / 2,
        cy: startY + row * geom.rowHeight + geom.boxHeight / 2,
      });
      x += w + geom.gap;
      const right = x - geom.gap;
      if (right > maxRight) maxRight = right;
    }
    const usedRows = Math.ceil(isolated.length / cols);
    isoBottom = startY + (usedRows - 1) * geom.rowHeight + geom.boxHeight;
  }

  // ---- Bounding box ---------------------------------------------------
  const height = Math.max(flowBottom, isoBottom) + geom.padding.b;

  return {
    nodes: out,
    edges,
    width: maxRight + geom.padding.r,
    height,
  };
}
