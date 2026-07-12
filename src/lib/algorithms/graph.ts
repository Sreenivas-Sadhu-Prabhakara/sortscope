import type { Step, AlgoMeta } from '../types';

// Small weighted graphs laid out for the node-link surface. Node ids are
// letters; positions are on a 0..100 canvas (percent). MST/shortest-path
// algorithms run on the undirected weighted graph; toposort & bellman-ford use
// the directed one (bellman-ford includes a negative edge).

export interface GNode { id: string; x: number; y: number; }
export interface GEdge { u: string; v: string; w: number; }
export interface GraphModel {
  nodes: GNode[];
  edges: GEdge[];
  directed: boolean;
}

// Undirected weighted graph for Prim & Kruskal (a small planar-ish network).
export const UNDIRECTED: GraphModel = {
  directed: false,
  nodes: [
    { id: 'A', x: 12, y: 20 }, { id: 'B', x: 40, y: 10 }, { id: 'C', x: 72, y: 16 },
    { id: 'D', x: 20, y: 55 }, { id: 'E', x: 50, y: 46 }, { id: 'F', x: 82, y: 50 },
    { id: 'G', x: 34, y: 84 }, { id: 'H', x: 68, y: 82 },
  ],
  edges: [
    { u: 'A', v: 'B', w: 4 }, { u: 'A', v: 'D', w: 3 }, { u: 'B', v: 'C', w: 5 },
    { u: 'B', v: 'E', w: 2 }, { u: 'C', v: 'F', w: 6 }, { u: 'D', v: 'E', w: 7 },
    { u: 'D', v: 'G', w: 4 }, { u: 'E', v: 'F', w: 3 }, { u: 'E', v: 'G', w: 5 },
    { u: 'E', v: 'H', w: 6 }, { u: 'F', v: 'H', w: 2 }, { u: 'G', v: 'H', w: 4 },
  ],
};

// Directed acyclic graph for topological sort (Kahn's).
export const DAG: GraphModel = {
  directed: true,
  nodes: [
    { id: 'A', x: 10, y: 20 }, { id: 'B', x: 10, y: 70 }, { id: 'C', x: 38, y: 15 },
    { id: 'D', x: 38, y: 55 }, { id: 'E', x: 66, y: 30 }, { id: 'F', x: 66, y: 78 },
    { id: 'G', x: 90, y: 52 },
  ],
  edges: [
    { u: 'A', v: 'C', w: 1 }, { u: 'A', v: 'D', w: 1 }, { u: 'B', v: 'D', w: 1 },
    { u: 'C', v: 'E', w: 1 }, { u: 'D', v: 'E', w: 1 }, { u: 'D', v: 'F', w: 1 },
    { u: 'E', v: 'G', w: 1 }, { u: 'F', v: 'G', w: 1 },
  ],
};

// Directed graph WITH a negative edge for Bellman-Ford (no negative cycle).
export const NEGRAPH: GraphModel = {
  directed: true,
  nodes: [
    { id: 'S', x: 10, y: 45 }, { id: 'A', x: 38, y: 18 }, { id: 'B', x: 38, y: 72 },
    { id: 'C', x: 68, y: 20 }, { id: 'D', x: 68, y: 70 }, { id: 'E', x: 92, y: 45 },
  ],
  edges: [
    { u: 'S', v: 'A', w: 6 }, { u: 'S', v: 'B', w: 7 }, { u: 'A', v: 'C', w: 5 },
    { u: 'A', v: 'D', w: -4 }, { u: 'B', v: 'C', w: -3 }, { u: 'B', v: 'D', w: 9 },
    { u: 'C', v: 'E', w: 2 }, { u: 'D', v: 'E', w: 7 },
  ],
};

type GraphRunner = () => Step[];

const eKey = (u: string, v: string) => (u < v ? `${u}|${v}` : `${v}|${u}`);

// ---- Prim's MST -----------------------------------------------------------
const prim: GraphRunner = () => {
  const g = UNDIRECTED;
  const steps: Step[] = [];
  const adj = new Map<string, GEdge[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) { adj.get(e.u)!.push(e); adj.get(e.v)!.push(e); }
  const inTree = new Set<string>();
  const start = g.nodes[0].id;
  inTree.add(start);
  let total = 0;
  steps.push({ type: 'seed', node: start, line: 1, caption: `Seed tree at ${start}` });
  while (inTree.size < g.nodes.length) {
    // cheapest edge crossing the cut
    let best: GEdge | null = null;
    for (const e of g.edges) {
      const uIn = inTree.has(e.u), vIn = inTree.has(e.v);
      if (uIn !== vIn) {
        steps.push({ type: 'consider', edge: [e.u, e.v], weight: e.w, line: 4, caption: `Consider ${e.u}–${e.v} (w=${e.w})`, delta: { comparisons: 1 } });
        if (!best || e.w < best.w) best = e;
      }
    }
    if (!best) break;
    const add = inTree.has(best.u) ? best.v : best.u;
    inTree.add(add);
    total += best.w;
    steps.push({ type: 'addEdge', edge: [best.u, best.v], node: add, weight: best.w, line: 6, caption: `Add ${best.u}–${best.v}, total=${total}`, delta: { writes: 1 } });
  }
  steps.push({ type: 'done', line: 8, caption: `MST weight = ${total}` });
  return steps;
};

// ---- Kruskal's MST (with union-find merges shown) -------------------------
const kruskal: GraphRunner = () => {
  const g = UNDIRECTED;
  const steps: Step[] = [];
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  for (const n of g.nodes) { parent.set(n.id, n.id); rank.set(n.id, 0); }
  function find(x: string): string {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  }
  const sorted = [...g.edges].sort((a, b) => a.w - b.w || eKey(a.u, a.v).localeCompare(eKey(b.u, b.v)));
  steps.push({ type: 'sortEdges', line: 1, caption: 'Sort edges by weight' });
  let total = 0, added = 0;
  for (const e of sorted) {
    steps.push({ type: 'consider', edge: [e.u, e.v], weight: e.w, line: 3, caption: `Take ${e.u}–${e.v} (w=${e.w})`, delta: { comparisons: 1 } });
    const ru = find(e.u), rv = find(e.v);
    if (ru === rv) {
      steps.push({ type: 'reject', edge: [e.u, e.v], line: 4, caption: `Skip — ${e.u},${e.v} already connected (cycle)` });
      continue;
    }
    // union by rank
    let child: string, root: string;
    if (rank.get(ru)! < rank.get(rv)!) { child = ru; root = rv; }
    else if (rank.get(ru)! > rank.get(rv)!) { child = rv; root = ru; }
    else { child = rv; root = ru; rank.set(ru, rank.get(ru)! + 1); }
    parent.set(child, root);
    total += e.w; added++;
    steps.push({ type: 'addEdge', edge: [e.u, e.v], parentOf: [child, root], weight: e.w, line: 6, caption: `Union ${child}→${root}; total=${total}`, delta: { writes: 1 } });
    if (added === g.nodes.length - 1) break;
  }
  steps.push({ type: 'done', line: 8, caption: `MST weight = ${total}` });
  return steps;
};

// ---- Topological Sort (Kahn's) --------------------------------------------
const toposort: GraphRunner = () => {
  const g = DAG;
  const steps: Step[] = [];
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) { indeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of g.edges) { adj.get(e.u)!.push(e.v); indeg.set(e.v, indeg.get(e.v)! + 1); }
  steps.push({ type: 'indegrees', line: 1, caption: 'Compute in-degrees' });
  // queue of zero-indegree nodes, in id order for determinism
  const q = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id).sort();
  for (const id of q) steps.push({ type: 'ready', node: id, line: 2, caption: `${id} has no prerequisites` });
  const order: string[] = [];
  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    steps.push({ type: 'emit', node: u, nodes: order.slice(), line: 5, caption: `Output ${u} (${order.join(' → ')})`, delta: { writes: 1 } });
    const newlyReady: string[] = [];
    for (const v of adj.get(u)!) {
      indeg.set(v, indeg.get(v)! - 1);
      steps.push({ type: 'decrement', edge: [u, v], node: v, line: 7, caption: `${v} in-degree → ${indeg.get(v)}`, delta: { relaxations: 1 } });
      if (indeg.get(v) === 0) newlyReady.push(v);
    }
    for (const v of newlyReady.sort()) { q.push(v); steps.push({ type: 'ready', node: v, line: 8, caption: `${v} now ready` }); }
  }
  steps.push({ type: 'done', nodes: order.slice(), line: 10, caption: `Order: ${order.join(' → ')}` });
  return steps;
};

// ---- Bellman-Ford (with negative edge) ------------------------------------
const bellmanFord: GraphRunner = () => {
  const g = NEGRAPH;
  const steps: Step[] = [];
  const src = 'S';
  const dist = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  for (const n of g.nodes) dist.set(n.id, Infinity);
  dist.set(src, 0);
  steps.push({ type: 'seed', node: src, line: 1, caption: `dist[${src}] = 0, all others ∞` });
  const V = g.nodes.length;
  const edgeOrder = [...g.edges].sort((a, b) => a.u.localeCompare(b.u) || a.v.localeCompare(b.v));
  for (let i = 1; i < V; i++) {
    steps.push({ type: 'round', round: i, line: 3, caption: `Relaxation round ${i} of ${V - 1}` });
    let changed = false;
    for (const e of edgeOrder) {
      const du = dist.get(e.u)!;
      steps.push({ type: 'consider', edge: [e.u, e.v], weight: e.w, round: i, line: 5, caption: `Try ${e.u}→${e.v} (w=${e.w})`, delta: { comparisons: 1 } });
      if (du !== Infinity && du + e.w < dist.get(e.v)!) {
        dist.set(e.v, du + e.w);
        cameFrom.set(e.v, e.u);
        changed = true;
        steps.push({ type: 'relax', edge: [e.u, e.v], node: e.v, weight: du + e.w, round: i, line: 6, caption: `Relax ${e.v} → ${du + e.w}`, delta: { relaxations: 1, writes: 1 } });
      }
    }
    if (!changed) { steps.push({ type: 'settled', round: i, line: 8, caption: 'No change — distances settled early' }); break; }
  }
  // final distances
  const finals = g.nodes.map((n) => `${n.id}:${dist.get(n.id) === Infinity ? '∞' : dist.get(n.id)}`).join('  ');
  steps.push({ type: 'done', line: 10, caption: finals });
  return steps;
};

export const GRAPH_RUNNERS: Record<string, GraphRunner> = {
  prim, kruskal, toposort, bellmanford: bellmanFord,
};

export const GRAPH_MODELS: Record<string, GraphModel> = {
  prim: UNDIRECTED, kruskal: UNDIRECTED, toposort: DAG, bellmanford: NEGRAPH,
};

export const GRAPH_META: AlgoMeta[] = [
  {
    id: 'prim', name: "Prim's MST", category: 'graph',
    blurb: 'Grow a minimum spanning tree from one node, always adding the cheapest edge leaving it.',
    timeBest: 'O(E log V)', timeAvg: 'O(E log V)', timeWorst: 'O(E log V)', space: 'O(V)', stable: null,
    notes: 'Best for dense graphs. Always maintains one connected tree.',
    pseudocode: [
      'add any start node to tree', '# repeat until all in tree', 'while tree misses nodes:', '  scan edges crossing the cut',
      '  pick the cheapest', '  add that edge and its node', '# tree complete', 'return MST weight',
    ],
  },
  {
    id: 'kruskal', name: "Kruskal's MST", category: 'graph',
    blurb: 'Sort every edge and add it unless it would form a cycle — tracked by union-find.',
    timeBest: 'O(E log E)', timeAvg: 'O(E log E)', timeWorst: 'O(E log E)', space: 'O(V)', stable: null,
    notes: 'Best for sparse graphs. Union-find (with path compression) makes cycle checks near-O(1).',
    pseudocode: [
      'sort all edges by weight', '# process cheapest first', 'for each edge (u, v):', '  if find(u) == find(v): skip (cycle)',
      '  else:', '    union(u, v); add edge', '# n-1 edges added', 'return MST weight',
    ],
  },
  {
    id: 'toposort', name: 'Topological Sort', category: 'graph',
    blurb: "Kahn's algorithm: repeatedly emit a node with no remaining prerequisites.",
    timeBest: 'O(V+E)', timeAvg: 'O(V+E)', timeWorst: 'O(V+E)', space: 'O(V)', stable: null,
    notes: 'Orders a DAG so every edge points forward. A non-empty queue-empty-early signals a cycle.',
    pseudocode: [
      'compute in-degree of each node', 'queue all zero-indegree nodes', 'while queue not empty:', '  u = dequeue',
      '  # output u', 'output u', '  for each edge u→v:', '    decrement in-degree of v', '    if now zero: enqueue v',
      '# all emitted', 'return order',
    ],
  },
  {
    id: 'bellmanford', name: 'Bellman-Ford', category: 'graph',
    blurb: 'Relax every edge V−1 times — the only classic that survives negative edge weights.',
    timeBest: 'O(V·E)', timeAvg: 'O(V·E)', timeWorst: 'O(V·E)', space: 'O(V)', stable: null,
    notes: 'Slower than Dijkstra but handles negative edges and can detect negative cycles.',
    pseudocode: [
      'dist[src]=0, rest=∞', '# V-1 relaxation rounds', 'for round in 1 .. V-1:', '  for each edge (u→v, w):',
      '    # try to relax', '    if dist[u]+w < dist[v]: dist[v]=dist[u]+w', '  # a round with no change means done',
      '  if no change: stop', '# (extra round would flag a negative cycle)', 'return distances',
    ],
  },
];
