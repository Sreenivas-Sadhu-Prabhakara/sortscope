import type { Step, AlgoMeta } from '../types';

// The grid is row-major. A cell is [r, c]. `walls` is a Set of "r,c" keys;
// `weights` maps "r,c" -> extra cost (weighted mode). Start and end are cells.
// Every pathfinder emits `visit` steps as its frontier expands (in true
// discovery order) and a final `path` step tracing the shortest route it found.

export interface Grid {
  rows: number;
  cols: number;
  start: [number, number];
  end: [number, number];
  walls: Set<string>;
  weights: Map<string, number>; // extra cost on entering that cell
}

const key = (r: number, c: number) => `${r},${c}`;
const parseKey = (k: string): [number, number] => {
  const [r, c] = k.split(',').map(Number);
  return [r, c];
};

function neighbors(g: Grid, r: number, c: number): [number, number][] {
  // 4-connected, in a fixed order (up, right, down, left) for determinism.
  const out: [number, number][] = [];
  const cand: [number, number][] = [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]];
  for (const [nr, nc] of cand) {
    if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols) continue;
    if (g.walls.has(key(nr, nc))) continue;
    out.push([nr, nc]);
  }
  return out;
}

function cost(g: Grid, r: number, c: number): number {
  return 1 + (g.weights.get(key(r, c)) ?? 0);
}

function tracePath(cameFrom: Map<string, string>, endK: string): [number, number][] {
  const path: [number, number][] = [];
  let cur: string | undefined = endK;
  while (cur) {
    path.unshift(parseKey(cur));
    cur = cameFrom.get(cur);
  }
  return path;
}

function reachedEnd(steps: Step[], cameFrom: Map<string, string>, g: Grid, foundKey: string) {
  const path = tracePath(cameFrom, foundKey);
  steps.push({ type: 'path', path, line: 12, caption: `Path found — ${path.length - 1} steps`, delta: { pathLength: path.length - 1 } });
}

// A tiny binary-heap priority queue keyed by number priority.
class PQ<T> {
  private a: { p: number; v: T }[] = [];
  get size() { return this.a.length; }
  push(p: number, v: T) {
    this.a.push({ p, v });
    let i = this.a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.a[par].p <= this.a[i].p) break;
      [this.a[par], this.a[i]] = [this.a[i], this.a[par]];
      i = par;
    }
  }
  pop(): T | undefined {
    if (!this.a.length) return undefined;
    const top = this.a[0].v;
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      const n = this.a.length;
      while (true) {
        let s = i; const l = 2 * i + 1, r = 2 * i + 2;
        if (l < n && this.a[l].p < this.a[s].p) s = l;
        if (r < n && this.a[r].p < this.a[s].p) s = r;
        if (s === i) break;
        [this.a[s], this.a[i]] = [this.a[i], this.a[s]];
        i = s;
      }
    }
    return top;
  }
}

const manhattan = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

type Finder = (g: Grid) => Step[];

// ---- BFS ------------------------------------------------------------------
const bfs: Finder = (g) => {
  const steps: Step[] = [];
  const startK = key(...g.start), endK = key(...g.end);
  const q: string[] = [startK];
  const seen = new Set([startK]);
  const cameFrom = new Map<string, string>();
  steps.push({ type: 'start', cell: g.start, line: 2, caption: 'Enqueue start' });
  while (q.length) {
    const cur = q.shift()!;
    const [r, c] = parseKey(cur);
    steps.push({ type: 'visit', cell: [r, c], line: 4, caption: `Visit (${r}, ${c})`, delta: { visited: 1 } });
    if (cur === endK) { reachedEnd(steps, cameFrom, g, endK); return steps; }
    for (const [nr, nc] of neighbors(g, r, c)) {
      const nk = key(nr, nc);
      if (seen.has(nk)) continue;
      seen.add(nk);
      cameFrom.set(nk, cur);
      q.push(nk);
      steps.push({ type: 'frontier', cell: [nr, nc], line: 7, caption: `Discover (${nr}, ${nc})` });
    }
  }
  steps.push({ type: 'nopath', line: 9, caption: 'No path exists' });
  return steps;
};

// ---- DFS ------------------------------------------------------------------
const dfs: Finder = (g) => {
  const steps: Step[] = [];
  const startK = key(...g.start), endK = key(...g.end);
  const stack: string[] = [startK];
  const seen = new Set<string>();
  const cameFrom = new Map<string, string>();
  steps.push({ type: 'start', cell: g.start, line: 2, caption: 'Push start' });
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const [r, c] = parseKey(cur);
    steps.push({ type: 'visit', cell: [r, c], line: 4, caption: `Visit (${r}, ${c})`, delta: { visited: 1 } });
    if (cur === endK) { reachedEnd(steps, cameFrom, g, endK); return steps; }
    // reverse so the fixed neighbor order is explored consistently
    const nbrs = neighbors(g, r, c);
    for (let i = nbrs.length - 1; i >= 0; i--) {
      const [nr, nc] = nbrs[i];
      const nk = key(nr, nc);
      if (seen.has(nk)) continue;
      if (!cameFrom.has(nk)) cameFrom.set(nk, cur);
      stack.push(nk);
      steps.push({ type: 'frontier', cell: [nr, nc], line: 7, caption: `Push (${nr}, ${nc})` });
    }
  }
  steps.push({ type: 'nopath', line: 9, caption: 'No path exists' });
  return steps;
};

// ---- Dijkstra -------------------------------------------------------------
const dijkstra: Finder = (g) => {
  const steps: Step[] = [];
  const startK = key(...g.start), endK = key(...g.end);
  const dist = new Map<string, number>([[startK, 0]]);
  const cameFrom = new Map<string, string>();
  const done = new Set<string>();
  const pq = new PQ<string>();
  pq.push(0, startK);
  steps.push({ type: 'start', cell: g.start, line: 2, caption: 'dist[start] = 0' });
  while (pq.size) {
    const cur = pq.pop()!;
    if (done.has(cur)) continue;
    done.add(cur);
    const [r, c] = parseKey(cur);
    steps.push({ type: 'visit', cell: [r, c], line: 5, caption: `Settle (${r}, ${c}) at cost ${dist.get(cur)}`, delta: { visited: 1 } });
    if (cur === endK) { reachedEnd(steps, cameFrom, g, endK); return steps; }
    for (const [nr, nc] of neighbors(g, r, c)) {
      const nk = key(nr, nc);
      if (done.has(nk)) continue;
      const nd = dist.get(cur)! + cost(g, nr, nc);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        cameFrom.set(nk, cur);
        pq.push(nd, nk);
        steps.push({ type: 'relax', cell: [nr, nc], line: 8, caption: `Relax (${nr}, ${nc}) -> ${nd}`, delta: { relaxations: 1 } });
      }
    }
  }
  steps.push({ type: 'nopath', line: 10, caption: 'No path exists' });
  return steps;
};

// ---- A* (Manhattan heuristic) ---------------------------------------------
const astar: Finder = (g) => {
  const steps: Step[] = [];
  const startK = key(...g.start), endK = key(...g.end);
  const gScore = new Map<string, number>([[startK, 0]]);
  const cameFrom = new Map<string, string>();
  const done = new Set<string>();
  const pq = new PQ<string>();
  pq.push(manhattan(g.start, g.end), startK);
  steps.push({ type: 'start', cell: g.start, line: 2, caption: 'g[start]=0, f=h(start)' });
  while (pq.size) {
    const cur = pq.pop()!;
    if (done.has(cur)) continue;
    done.add(cur);
    const [r, c] = parseKey(cur);
    steps.push({ type: 'visit', cell: [r, c], line: 5, caption: `Expand (${r}, ${c})`, delta: { visited: 1 } });
    if (cur === endK) { reachedEnd(steps, cameFrom, g, endK); return steps; }
    for (const [nr, nc] of neighbors(g, r, c)) {
      const nk = key(nr, nc);
      if (done.has(nk)) continue;
      const tentative = gScore.get(cur)! + cost(g, nr, nc);
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, cur);
        const f = tentative + manhattan([nr, nc], g.end);
        pq.push(f, nk);
        steps.push({ type: 'relax', cell: [nr, nc], line: 8, caption: `f(${nr}, ${nc}) = ${f}`, delta: { relaxations: 1 } });
      }
    }
  }
  steps.push({ type: 'nopath', line: 10, caption: 'No path exists' });
  return steps;
};

// ---- Greedy Best-First ----------------------------------------------------
const greedy: Finder = (g) => {
  const steps: Step[] = [];
  const startK = key(...g.start), endK = key(...g.end);
  const cameFrom = new Map<string, string>();
  const seen = new Set([startK]);
  const pq = new PQ<string>();
  pq.push(manhattan(g.start, g.end), startK);
  steps.push({ type: 'start', cell: g.start, line: 2, caption: 'Order the frontier by h only' });
  while (pq.size) {
    const cur = pq.pop()!;
    const [r, c] = parseKey(cur);
    steps.push({ type: 'visit', cell: [r, c], line: 4, caption: `Expand nearest-looking (${r}, ${c})`, delta: { visited: 1 } });
    if (cur === endK) { reachedEnd(steps, cameFrom, g, endK); return steps; }
    for (const [nr, nc] of neighbors(g, r, c)) {
      const nk = key(nr, nc);
      if (seen.has(nk)) continue;
      seen.add(nk);
      cameFrom.set(nk, cur);
      pq.push(manhattan([nr, nc], g.end), nk);
      steps.push({ type: 'frontier', cell: [nr, nc], line: 6, caption: `Add (${nr}, ${nc}), h=${manhattan([nr, nc], g.end)}` });
    }
  }
  steps.push({ type: 'nopath', line: 8, caption: 'No path exists' });
  return steps;
};

// ---- Bidirectional BFS ----------------------------------------------------
const biBfs: Finder = (g) => {
  const steps: Step[] = [];
  const startK = key(...g.start), endK = key(...g.end);
  if (startK === endK) { steps.push({ type: 'path', path: [g.start], line: 12, caption: 'Start is end' }); return steps; }
  let qs: string[] = [startK], qe: string[] = [endK];
  const seenS = new Set([startK]), seenE = new Set([endK]);
  const fromS = new Map<string, string>(), fromE = new Map<string, string>();
  steps.push({ type: 'start', cell: g.start, line: 2, caption: 'Grow two frontiers' });

  function stitch(meet: string): [number, number][] {
    const left = tracePath(fromS, meet);
    // path from meet to end via fromE (meet excluded to avoid dup)
    const right: [number, number][] = [];
    let cur: string | undefined = fromE.get(meet);
    while (cur) { right.push(parseKey(cur)); cur = fromE.get(cur); }
    return [...left, ...right];
  }

  while (qs.length && qe.length) {
    // expand the smaller frontier
    const [q, seen, from, other, otherSeen, side] =
      qs.length <= qe.length
        ? [qs, seenS, fromS, seenE, seenE, 'S'] as const
        : [qe, seenE, fromE, seenS, seenS, 'E'] as const;
    const nextQ: string[] = [];
    for (const cur of q) {
      const [r, c] = parseKey(cur);
      steps.push({ type: 'visit', cell: [r, c], node: side, line: 5, caption: `Expand ${side === 'S' ? 'forward' : 'backward'} (${r}, ${c})`, delta: { visited: 1 } });
      for (const [nr, nc] of neighbors(g, r, c)) {
        const nk = key(nr, nc);
        if (seen.has(nk)) continue;
        seen.add(nk);
        from.set(nk, cur);
        if (otherSeen.has(nk)) {
          // frontiers met at nk
          const path = side === 'S' ? stitch(nk) : (() => {
            // symmetric stitch when expanding from end side
            const left = tracePath(fromS, nk);
            const right: [number, number][] = [];
            let c2: string | undefined = fromE.get(nk);
            while (c2) { right.push(parseKey(c2)); c2 = fromE.get(c2); }
            return [...left, ...right];
          })();
          steps.push({ type: 'meet', cell: [nr, nc], line: 9, caption: 'Frontiers meet' });
          steps.push({ type: 'path', path, line: 12, caption: `Path found — ${path.length - 1} steps`, delta: { pathLength: path.length - 1 } });
          return steps;
        }
        nextQ.push(nk);
        steps.push({ type: 'frontier', cell: [nr, nc], node: side, line: 7, caption: `Discover (${nr}, ${nc})` });
      }
    }
    if (side === 'S') qs = nextQ; else qe = nextQ;
  }
  steps.push({ type: 'nopath', line: 11, caption: 'No path exists' });
  return steps;
};

export const FINDERS: Record<string, Finder> = {
  dijkstra, astar, bfs, dfs, greedy, bibfs: biBfs,
};

export const PATH_META: AlgoMeta[] = [
  {
    id: 'dijkstra', name: "Dijkstra's", category: 'pathfinding',
    blurb: 'Expand the closest-so-far node; guarantees the true shortest path with weights.',
    timeBest: 'O(E log V)', timeAvg: 'O(E log V)', timeWorst: 'O(E log V)', space: 'O(V)', stable: null,
    notes: 'Uninformed — explores in all directions. Handles non-negative edge weights.',
    pseudocode: [
      'dist[start] = 0; push start', '# priority queue by dist', 'while queue not empty:', '  u = pop min-dist',
      '  # settle u', 'settle u', '  for each neighbor v:', '    if dist[u]+w < dist[v]:', '      relax v; push v',
      '# no more nodes', 'return no path', '', 'reconstruct path',
    ],
  },
  {
    id: 'astar', name: 'A* Search', category: 'pathfinding',
    blurb: 'Dijkstra plus a Manhattan heuristic — steers toward the goal, exploring far less.',
    timeBest: 'O(E)', timeAvg: 'O(E log V)', timeWorst: 'O(E log V)', space: 'O(V)', stable: null,
    notes: 'Optimal when the heuristic never overestimates (Manhattan is admissible on a grid).',
    pseudocode: [
      'g[start]=0; f=h(start); push', '# f = g + h, h = Manhattan', 'while queue not empty:', '  u = pop min-f',
      '  # expand u', 'expand u', '  for each neighbor v:', '    t = g[u] + w', '    if t < g[v]: relax; f=t+h(v); push',
      '# exhausted', 'return no path', '', 'reconstruct path',
    ],
  },
  {
    id: 'bfs', name: 'Breadth-First Search', category: 'pathfinding',
    blurb: 'Explore in rings from the start; first time you reach the goal is a shortest path.',
    timeBest: 'O(V+E)', timeAvg: 'O(V+E)', timeWorst: 'O(V+E)', space: 'O(V)', stable: null,
    notes: 'Shortest path only on unweighted grids. Uses a FIFO queue.',
    pseudocode: [
      'enqueue start; mark seen', '# FIFO queue', 'while queue not empty:', '  u = dequeue', '  # visit u',
      'visit u', '  for each neighbor v:', '    if unseen: mark, enqueue, set parent', '# queue drained',
      'return no path', '', 'reconstruct path',
    ],
  },
  {
    id: 'dfs', name: 'Depth-First Search', category: 'pathfinding',
    blurb: 'Dive as deep as possible before backtracking. Finds *a* path, rarely the shortest.',
    timeBest: 'O(V+E)', timeAvg: 'O(V+E)', timeWorst: 'O(V+E)', space: 'O(V)', stable: null,
    notes: 'Not shortest-path. Great for maze carving, cycle checks, connectivity.',
    pseudocode: [
      'push start', '# LIFO stack', 'while stack not empty:', '  u = pop; skip if seen', '  # visit u',
      'visit u', '  for each neighbor v:', '    if unseen: push, set parent', '# stack drained',
      'return no path', '', 'reconstruct path',
    ],
  },
  {
    id: 'greedy', name: 'Greedy Best-First', category: 'pathfinding',
    blurb: 'Always step toward whatever looks closest to the goal — fast but not optimal.',
    timeBest: 'O(E)', timeAvg: 'O(E log V)', timeWorst: 'O(E log V)', space: 'O(V)', stable: null,
    notes: 'Orders the frontier by heuristic alone. Can be fooled by walls into a detour.',
    pseudocode: [
      'push start with h(start)', '# order frontier by h only', 'while queue not empty:', '  u = pop min-h',
      '  # expand u', 'expand u', '  for each neighbor v:', '    if unseen: push with h(v)', '# exhausted',
      'return no path', '', 'reconstruct path',
    ],
  },
  {
    id: 'bibfs', name: 'Bidirectional BFS', category: 'pathfinding',
    blurb: 'Run BFS from both ends at once; stop when the two frontiers touch.',
    timeBest: 'O(V+E)', timeAvg: 'O(b^(d/2))', timeWorst: 'O(V+E)', space: 'O(V)', stable: null,
    notes: 'Roughly halves the search depth vs one-way BFS on unweighted grids.',
    pseudocode: [
      'seed frontier at start and end', '# two BFS waves', 'while both frontiers alive:', '  expand smaller frontier',
      '  # visit each node', 'visit u', '  for each neighbor v:', '    if seen by other side: STITCH',
      '  frontiers meet', 'set parent, add to frontier', 'return no path', '', 'stitch two half-paths',
    ],
  },
];
