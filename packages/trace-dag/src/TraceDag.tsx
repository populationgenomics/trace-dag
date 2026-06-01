/**
 * React component that renders a layered DAG as inline SVG.
 *
 * Caller supplies an array of ``TraceDagInput`` (nodes with their
 * upstream ids).  This component computes layout via ``layoutDag``
 * and renders boxes / circles with cubic-bezier edges between them.
 * Visual choices intentionally minimal — node colours come from
 * the caller; the renderer uses CSS variables for chrome colours
 * (border, text-dim, surface) so dark/light themes work without
 * the caller doing anything.
 */

import { useMemo, useState } from 'react';

import { layoutDag } from './layout.js';
import { toDot, type DotExportOptions } from './dot-export.js';
import { DEFAULT_GEOMETRY } from './types.js';
import type {
  TraceDagInput, TraceDagNode, TraceDagGeometry,
} from './types.js';

export interface TraceDagProps {
  /** Nodes + their edges (via ``inputs``). */
  nodes: TraceDagInput[];

  /** Override the layout geometry (defaults to {@link DEFAULT_GEOMETRY}). */
  geometry?: Partial<TraceDagGeometry>;

  /** Show a "Copy DOT" button above the SVG.  Defaults to true. */
  showCopyDot?: boolean;
  /** DOT export options when ``showCopyDot`` is enabled. */
  dotOptions?: DotExportOptions;

  /** Optional CSS class on the outer wrapper. */
  className?: string;
  /** Optional accessibility label for the SVG. */
  ariaLabel?: string;

  /** Callback when the user clicks a node.  Receives the laid-out node. */
  onNodeClick?: (node: TraceDagNode) => void;

  /** Empty-state placeholder when ``nodes`` is empty. */
  emptyMessage?: React.ReactNode;
}

const COPY_FEEDBACK_MS = 1500;

export function TraceDag({
  nodes,
  geometry,
  showCopyDot = true,
  dotOptions,
  className,
  ariaLabel,
  onNodeClick,
  emptyMessage,
}: TraceDagProps) {
  const geom: TraceDagGeometry = {
    ...DEFAULT_GEOMETRY,
    ...geometry,
    padding: { ...DEFAULT_GEOMETRY.padding, ...geometry?.padding },
  };

  const layout = useMemo(() => layoutDag(nodes, geom), [nodes, geom]);

  const [copied, setCopied] = useState(false);
  const copyDot = async () => {
    const dot = toDot(nodes, dotOptions);
    try {
      await navigator.clipboard.writeText(dot);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard blocked (insecure context, permission denied).  Surface
      // the DOT via window.prompt so the user can copy manually.
      window.prompt('Copy DOT (clipboard blocked):', dot);
    }
  };

  if (nodes.length === 0) {
    return (
      <div className={className}>
        {emptyMessage ?? (
          <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: '0.85rem' }}>
            No nodes to render.
          </p>
        )}
      </div>
    );
  }

  const { width, height, nodes: laidOut, edges } = layout;
  const byId = new Map<string, TraceDagNode>();
  for (const n of laidOut) byId.set(n.id, n);

  // Edge endpoints — boxes anchor at top/bottom centre, circles on
  // their perimeter at the same vertical line.
  const inAnchor = (n: TraceDagNode) => {
    if (n.shape === 'circle') {
      return { x: n.cx, y: n.cy - geom.circleWidth / 4 };
    }
    return { x: n.cx, y: n.cy - geom.boxHeight / 2 };
  };
  const outAnchor = (n: TraceDagNode) => {
    if (n.shape === 'circle') {
      return { x: n.cx, y: n.cy + geom.circleWidth / 4 };
    }
    return { x: n.cx, y: n.cy + geom.boxHeight / 2 };
  };

  return (
    <div className={className} style={{ overflowX: 'auto' }}>
      {showCopyDot && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end',
          marginBottom: '0.4rem',
        }}>
          <button
            type="button"
            onClick={copyDot}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--border, #d4d4d8)',
              color: 'var(--text, inherit)',
              borderRadius: 3,
            }}
            title="Copy a Graphviz/DOT representation of this graph"
          >
            {copied ? 'copied ✓' : 'copy DOT'}
          </button>
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        style={{
          display: 'block', overflow: 'visible', maxWidth: '100%',
        }}
      >
        {/* Edges first so nodes sit on top.  Stroke colour comes from
            the producer's group; dashed when the sink is read-only. */}
        <g style={{ fill: 'none', strokeWidth: 1.4 }}>
          {edges.map((e, i) => {
            const from = byId.get(e.from)!;
            const to = byId.get(e.to)!;
            const a = outAnchor(from);
            const b = inAnchor(to);
            const mid = (a.y + b.y) / 2;
            return (
              <path
                key={i}
                d={`M ${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}`}
                stroke={from.color}
                opacity={0.85}
                strokeDasharray={to.edgeStyle === 'dashed' ? '4 3' : undefined}
              />
            );
          })}
        </g>

        {/* Nodes */}
        {laidOut.map((n) => {
          const onClick = onNodeClick ? () => onNodeClick(n) : undefined;
          const interactive = onClick !== undefined;
          if (n.shape === 'circle') {
            // Radius derived from circleWidth so the visual centre
            // matches the layout footprint.
            const r = Math.max(4, geom.circleWidth / 4);
            return (
              <g key={n.id}
                onClick={onClick}
                style={{ cursor: interactive ? 'pointer' : undefined }}>
                {n.tooltip && <title>{n.tooltip}</title>}
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r={r}
                  fill="var(--surface, #1a1a1a)"
                  stroke={n.color}
                  strokeWidth={1.5}
                />
              </g>
            );
          }
          const left = n.cx - geom.boxWidth / 2;
          const top = n.cy - geom.boxHeight / 2;
          return (
            <g key={n.id}
              transform={`translate(${left}, ${top})`}
              onClick={onClick}
              style={{ cursor: interactive ? 'pointer' : undefined }}>
              {n.tooltip && <title>{n.tooltip}</title>}
              <rect
                width={geom.boxWidth}
                height={geom.boxHeight}
                rx={4}
                fill="var(--surface, #1a1a1a)"
                stroke={n.color}
                strokeWidth={1.5}
              />
              <text x={6} y={13}
                style={{
                  fill: n.color, fontSize: 10,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontWeight: 600,
                }}>
                {n.label}
              </text>
              {n.caption && (
                <text x={6} y={25}
                  style={{
                    fill: 'var(--text-muted, #888)', fontSize: 9,
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}>
                  {n.caption.length > 18 ? n.caption.slice(0, 17) + '…' : n.caption}
                </text>
              )}
              {n.annotation && (
                <text
                  x={geom.boxWidth - 4}
                  y={9}
                  textAnchor="end"
                  style={{
                    fill: 'var(--text-dim, #666)', fontSize: 8,
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}>
                  {n.annotation}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
