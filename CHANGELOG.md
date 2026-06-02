# Changelog

All notable changes to `@populationgenomics/trace-dag` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `TraceDag` React component: layered DAG rendered as inline SVG, themeable
  via CSS variables, with a built-in "copy DOT" button.
- Sugiyama-style layout (`layoutDag`): longest-path layering, barycentric
  crossing minimisation that retains the best ordering seen, and optimal
  per-row positioning via isotonic regression. Fully-isolated nodes are
  peeled off and grid-packed into a compact block.
- Click-to-highlight selection: selecting a node emphasises it, its incident
  edges, and (dimly) its neighbours; selecting an edge emphasises it and its
  two endpoint nodes. Exposed via `selectable`, `onSelectionChange`, and
  `onEdgeClick`.
- Graphviz/DOT export (`toDot`) mirroring the rendered graph.

[unreleased]: https://github.com/populationgenomics/trace-dag/commits/main
