/**
 * Caller-supplied node descriptor.  The layout engine looks at
 * ``id`` (must be unique) and ``inputs`` (ids of upstream nodes —
 * dangling refs are silently skipped) to determine the DAG.
 *
 * Everything else is purely visual:
 * - ``label`` / ``caption`` / ``annotation`` populate the box.
 * - ``color`` is used for both the node border/label and any
 *   outgoing edges originating from this node.
 * - ``shape`` controls horizontal footprint (boxes are wide,
 *   circles are small).
 * - ``edgeStyle`` applies to edges *terminating at* this node;
 *   "dashed" reads visually as a read-only / inspection edge.
 * - ``tooltip`` is exposed as an SVG ``<title>`` element.
 */
export interface TraceDagInput {
  id: string;
  inputs: string[];
  label: string;
  caption?: string;
  annotation?: string;
  color: string;
  shape?: 'box' | 'circle';
  edgeStyle?: 'solid' | 'dashed';
  tooltip?: string;
}

/**
 * Post-layout node — public surface of the laid-out graph.
 * Useful when callers want to inspect or override positions
 * (e.g. for the DOT export which renders the same logical graph
 * through a different engine).
 */
export interface TraceDagNode extends TraceDagInput {
  /** Layer index (longest path from a source). */
  layer: number;
  /** Centre-x in SVG coordinates. */
  cx: number;
  /** Centre-y in SVG coordinates. */
  cy: number;
}

export interface TraceDagEdge {
  from: string;
  to: string;
}

export interface TraceDagGeometry {
  /** Width of "box"-shaped nodes (px). */
  boxWidth: number;
  /** Height of "box"-shaped nodes (px). */
  boxHeight: number;
  /** Horizontal footprint of a "circle"-shaped node, in px.
   *  Distinct from the rendered circle radius; the renderer keeps
   *  its inset small even on wider footprints. */
  circleWidth: number;
  /** Vertical spacing between layers. */
  rowHeight: number;
  /** Horizontal gap between adjacent nodes in the same layer. */
  gap: number;
  /** Left / right / top / bottom padding around the entire graph. */
  padding: { l: number; r: number; t: number; b: number };
}

export const DEFAULT_GEOMETRY: TraceDagGeometry = {
  boxWidth: 130,
  boxHeight: 30,
  circleWidth: 22,
  rowHeight: 50,
  gap: 12,
  padding: { l: 16, r: 16, t: 16, b: 16 },
};
