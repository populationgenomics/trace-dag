# trace-dag

Layered DAG visualisation as inline SVG.  Sugiyama-style layout
(longest-path layering + barycentric crossing minimisation + priority
positioning), variable-width packing (boxes vs circles), themeable
via CSS variables, with a Graphviz/DOT export hatch.

Extracted from the [pubmedifier](../pubmedifier) agent-trace lineage
panel.  Designed to be reused for any
producer-id→consumer-id-references shape: agent traces, build
pipelines, ETL stages, anything where each step is a named artifact
referenced by later steps.

## Install

```bash
npm install @populationgenomics/trace-dag
```

## Usage

```tsx
import { TraceDag } from '@populationgenomics/trace-dag';

const nodes = [
  { id: 'a', inputs: [],         label: 'filt', caption: 'PKD1',     color: '#1f77b4' },
  { id: 'b', inputs: [],         label: 'sem',  caption: 'variants', color: '#1f77b4' },
  { id: 'c', inputs: ['a', 'b'], label: '∪',                          color: '#ff7f0e' },
  { id: 'd', inputs: ['c'],      label: 'LR',   caption: 'k=200',     color: '#2ca02c' },
  { id: 'p', inputs: ['c'],      shape: 'circle',                     color: '#9467bd',
                                 edgeStyle: 'dashed', label: '',
                                 tooltip: 'list_inspect(start=0, end=20)' },
];

<TraceDag nodes={nodes} ariaLabel="my lineage" />;
```

### Caller responsibilities

The package is deliberately agnostic about what your nodes *mean*.
The caller maps domain concepts onto the `TraceDagInput` fields:

- **`id`**: a stable unique identifier.  For traces, the artifact id
  produced by the step (list_id / batch_id / etc.).
- **`inputs`**: ids of upstream nodes the step consumes.  Dangling
  references are silently skipped.
- **`label`** / **`caption`** / **`annotation`**: free-text shown
  inside the box.  Annotation is rendered tiny in the top-right
  corner — useful for chronological order tags ("r5") when layers
  don't correspond to time.
- **`color`**: hex / rgb / CSS-named colour for both the node
  border and any outgoing edges.
- **`shape`**: `"box"` (default) or `"circle"`.  Circles use ~1/6
  the horizontal footprint, so layers full of read-only inspection
  nodes pack tightly.
- **`edgeStyle`**: `"solid"` (default) or `"dashed"`.  Applies to
  edges *terminating at* this node.  Dashed signals
  "informational" / "read-only" data flow.
- **`tooltip`**: SVG `<title>` content; surfaced on hover.

### Chrome / theming

The renderer uses CSS variables for chrome colours:

- `--surface` — node fill (default `#1a1a1a`)
- `--text-muted` — caption text
- `--text-dim` — annotation text
- `--border` — copy-DOT button border
- `--font-mono` — body font

Define these on a parent element to theme the component.

### Layout knobs

```tsx
<TraceDag
  nodes={nodes}
  geometry={{
    boxWidth: 140,
    boxHeight: 32,
    circleWidth: 24,
    rowHeight: 56,
    gap: 14,
    padding: { l: 24, r: 24, t: 24, b: 24 },
  }}
/>
```

### DOT export

The "copy DOT" button is shown by default.  Pass `showCopyDot={false}`
to hide, or use `toDot(nodes)` directly to grab the text:

```ts
import { toDot } from '@populationgenomics/trace-dag';
const dotSource = toDot(nodes, { rankdir: 'TB' });
```

## License

MIT
