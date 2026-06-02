# @populationgenomics/trace-dag

Layered DAG visualisation for React, rendered as inline SVG. Sugiyama-style
layout (longest-path layering, barycentric crossing minimisation, optimal
row positioning), variable-width packing (boxes vs circles), click-to-highlight
selection, themeable via CSS variables, with a Graphviz/DOT export hatch.

- **Repository**: [github.com/populationgenomics/trace-dag](https://github.com/populationgenomics/trace-dag)
- **Changelog**: [`CHANGELOG.md`](https://github.com/populationgenomics/trace-dag/blob/main/CHANGELOG.md)

## Install

```sh
npm install @populationgenomics/trace-dag
```

Peer deps: `react`, `react-dom` (>=18, <20).

## Usage

```tsx
import { TraceDag } from '@populationgenomics/trace-dag';

const nodes = [
  { id: 'a', inputs: [], label: 'filt', caption: 'PKD1', color: '#1f77b4' },
  { id: 'b', inputs: [], label: 'sem', caption: 'variants', color: '#1f77b4' },
  { id: 'c', inputs: ['a', 'b'], label: '∪', color: '#ff7f0e' },
  { id: 'd', inputs: ['c'], label: 'LR', caption: 'k=200', color: '#2ca02c' },
];

<TraceDag nodes={nodes} ariaLabel="my lineage" />;
```

The package is deliberately agnostic about what your nodes *mean*: the caller
maps domain concepts onto `id` (stable unique id), `inputs` (ids of upstream
nodes; dangling refs are skipped), `label` / `caption` / `annotation`,
`color`, `shape` (`"box"` | `"circle"`), `edgeStyle` (`"solid"` | `"dashed"`),
and `tooltip`.

### Selection

Selection is on by default (`selectable`). Clicking a node highlights it, its
incident edges, and (dimly) its neighbours; clicking an edge highlights it and
its two endpoint nodes. Clicking the same target again, or empty canvas,
clears it. Use `onSelectionChange` and `onEdgeClick` to observe.

### DOT export

A "copy DOT" button is shown by default (`showCopyDot={false}` to hide), or
call `toDot(nodes, { rankdir: 'TB' })` directly.

See the [repository README](https://github.com/populationgenomics/trace-dag#readme)
for the full API: theming variables, layout geometry knobs, and the layout
algorithm.

## License

MIT
