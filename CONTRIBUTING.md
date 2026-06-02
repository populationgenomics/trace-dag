# Contributing

## Setup

```sh
npm install
npm run build
npm run test
```

Node 20+ required; the workspace uses npm workspaces.

## Cross-repo iteration (using trace-dag from a consumer)

When iterating on trace-dag alongside a consumer, use **yalc** rather than `npm link` — it behaves like a published package and avoids symlink-induced peer-dep issues.

In `trace-dag`:

```sh
cd packages/trace-dag
npm run build
npx yalc publish
```

In the consumer:

```sh
npx yalc add @populationgenomics/trace-dag
```

After each trace-dag change, repeat `npm run build && npx yalc push` in the package directory and the consumer's local copy refreshes automatically.

When done, in the consumer:

```sh
npx yalc remove @populationgenomics/trace-dag
npm install
```

## Releases

We use [Changesets](https://github.com/changesets/changesets).

1. For any user-facing change, run `npm run changeset` and describe the change.
2. Commit the generated `.changeset/*.md` file alongside the code change.
3. On merge to `main`, the release workflow opens a "Version Packages" PR.
4. Merging that PR publishes to npm.

Strict semver: additive features go in minor releases; breaking API changes
require a major. See [`CHANGELOG.md`](./CHANGELOG.md).

## Testing

`npm run test` runs the Vitest suite across all workspaces — unit and
component (JSDOM) tests covering layer assignment, crossing minimisation,
row positioning, isolated-node packing, DOT export, and the React
component's rendering and selection behaviour.

The `packages/trace-dag/eval/` harness is a developer aid (not shipped): it
round-trips a Graphviz `.dot` file back into trace-dag primitives, runs the
layout, and emits an SVG plus objective metrics (edge crossings, slant,
aspect ratio) for iterating on the layout engine.

```sh
node packages/trace-dag/eval/render.mjs test.dot out.svg            # render
node packages/trace-dag/eval/render.mjs test.dot out.svg <nodeId>   # with a node selected
node packages/trace-dag/eval/metrics.mjs test.dot                   # layout metrics
```

CI runs lint, typecheck, build, and test on every push and PR
(`.github/workflows/ci.yml`).

## Code style

- Prettier handles formatting (`npx prettier --write .`).
- ESLint handles correctness (`npm run lint`).
- TypeScript strict mode; no `any` without a written justification in a comment.
