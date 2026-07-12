# SortScope — interactive algorithm visualizer

A lab-instrument visualizer for the most-taught algorithms. Sorting is the
heart; it also covers pathfinding, graphs, search, and trees — **21 algorithms**
in all. Everything is driven off a single uniform *step* model: each algorithm
emits an ordered list of discrete steps (compare / swap / visit / relax / path,
each carrying a pseudocode line and a stats delta), and one playback engine
consumes those steps for every algorithm. Play / Pause / Step / Reset / scrub /
speed therefore behave identically everywhere, and every run is deterministic
and replayable.

Runs **100% client-side** — nothing leaves the device (enforced by a strict CSP
with `connect-src 'none'`). State lives in the URL hash, so any run is shareable
and replayable with zero network.

## Algorithms

| Category | Algorithms |
| --- | --- |
| **Sorting** (bars) | Bubble, Insertion, Selection, Merge, Quick, Heap |
| **Pathfinding** (interactive grid) | Dijkstra, A\* (Manhattan), BFS, DFS, Greedy Best-First, Bidirectional BFS |
| **Graph** (weighted node-link) | Prim MST, Kruskal MST, Kahn topological sort, Bellman-Ford (negative edge) |
| **Search** (value strip) | Linear, Binary |
| **Trees & generation** | BST insert, in/pre/post-order traversal, maze generation (recursive backtracker → hands walls to pathfinding), union-find with path compression |

## Features

- One shared transport bar, synced pseudocode panel (highlights the executing
  line), live complexity table, and honest live counters (tabular numerals).
- Interactive pathfinding grid: draw walls, drag start/end, paint weighted
  cells, or stamp a generated maze.
- Deterministic, seeded inputs (mulberry32) — replays are exact.
- Shareable URL-hash state (algorithm + seed/size + walls + endpoints).
- Keyboard accessible (Space / ← / → / R), visible focus, `prefers-reduced-motion`
  falls back to instant, WCAG-AA contrast, color-blind-safe status colors.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to ./dist (served at /sortscope/)
npm run preview  # preview the production build
```

Built with [Astro](https://astro.build). Deploys as a static site under a
`/sortscope` base path; every asset is referenced through `import.meta.env.BASE_URL`.
