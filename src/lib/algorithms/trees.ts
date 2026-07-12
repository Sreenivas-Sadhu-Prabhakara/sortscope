import type { Step, AlgoMeta } from '../types';

// Trees & generation surface. Three sub-tools share the STEP model:
//   * BST insert then in/pre/post-order traversal (node-link tree layout)
//   * Maze generation via recursive backtracker (grid; hands walls to pathfinding)
//   * Union-find with path compression (disjoint-set forest)
//
// Each returns an ordered Step[]. The renderers read the extra fields the same
// way every other category does.

// ===========================================================================
// BST — insert a deterministic sequence, then traverse.
// ===========================================================================

export interface BSTNode {
  id: number;      // stable id = insertion order
  value: number;
  left: number | null;
  right: number | null;
  x: number;       // 0..100 layout percent (filled after build)
  y: number;
  depth: number;
}

export interface BSTModel {
  nodes: BSTNode[];       // indexed by id
  root: number | null;
}

// A fixed, pleasantly-unbalanced insertion order that shows off BST shape.
export const BST_VALUES = [50, 30, 70, 20, 40, 60, 80, 35, 65, 10, 90];

/** Build the tree structure (no steps) so the renderer can lay it out. */
export function buildBST(values: number[]): BSTModel {
  const nodes: BSTNode[] = [];
  let root: number | null = null;
  const make = (value: number): number => {
    const id = nodes.length;
    nodes.push({ id, value, left: null, right: null, x: 0, y: 0, depth: 0 });
    return id;
  };
  for (const v of values) {
    if (root === null) { root = make(v); continue; }
    let cur = root;
    while (true) {
      if (v < nodes[cur].value) {
        if (nodes[cur].left === null) { nodes[cur].left = make(v); break; }
        cur = nodes[cur].left!;
      } else {
        if (nodes[cur].right === null) { nodes[cur].right = make(v); break; }
        cur = nodes[cur].right!;
      }
    }
  }
  // Layout: x by in-order rank (spreads leaves evenly), y by depth.
  const order: number[] = [];
  const setDepth = (id: number | null, d: number) => {
    if (id === null) return;
    nodes[id].depth = d;
    setDepth(nodes[id].left, d + 1);
    order.push(id); // in-order visit records the x-rank
    setDepth(nodes[id].right, d + 1);
  };
  // in-order to get x ranks
  const inorder = (id: number | null) => {
    if (id === null) return;
    inorder(nodes[id].left);
    order.push(id);
    inorder(nodes[id].right);
  };
  order.length = 0;
  inorder(root);
  const maxDepth = Math.max(1, ...nodes.map((n) => n.depth));
  order.forEach((id, i) => {
    nodes[id].x = order.length > 1 ? 6 + (i / (order.length - 1)) * 88 : 50;
  });
  // depth set separately (setDepth above pushed too; recompute cleanly)
  const depthOnly = (id: number | null, d: number) => {
    if (id === null) return;
    nodes[id].depth = d;
    depthOnly(nodes[id].left, d + 1);
    depthOnly(nodes[id].right, d + 1);
  };
  depthOnly(root, 0);
  const md = Math.max(1, ...nodes.map((n) => n.depth));
  for (const n of nodes) n.y = 12 + (n.depth / md) * 76;
  return { nodes, root };
}

type BSTRunner = (model: BSTModel) => Step[];

// ---- BST insert (animates the sequence of comparisons + placements) --------
const bstInsert: BSTRunner = (model) => {
  const steps: Step[] = [];
  const nodes = model.nodes;
  const present = new Set<number>();
  steps.push({ type: 'init', line: 1, caption: 'Insert values one by one' });
  // Replay insertion order (ids are already in insertion order).
  for (let id = 0; id < nodes.length; id++) {
    const v = nodes[id].value;
    steps.push({ type: 'key', node: String(id), value: v, nodes: [...present].map(String), line: 2, caption: `Insert ${v}`, delta: { reads: 1 } });
    if (id === 0) {
      present.add(0);
      steps.push({ type: 'place', node: '0', value: v, nodes: [...present].map(String), line: 3, caption: `${v} becomes the root`, delta: { writes: 1 } });
      continue;
    }
    // walk down using structural links, only through already-present nodes
    let cur = 0;
    while (true) {
      steps.push({ type: 'compare', node: String(cur), value: v, nodes: [...present].map(String), line: 5, caption: `${v} vs ${nodes[cur].value}`, delta: { comparisons: 1, reads: 1 } });
      if (v < nodes[cur].value) {
        if (nodes[cur].left === id || nodes[cur].left === null) { break; }
        cur = nodes[cur].left!;
      } else {
        if (nodes[cur].right === id || nodes[cur].right === null) { break; }
        cur = nodes[cur].right!;
      }
    }
    present.add(id);
    const side = v < nodes[cur].value ? 'left' : 'right';
    steps.push({ type: 'place', node: String(id), edge: [String(cur), String(id)], value: v, nodes: [...present].map(String), line: 7, caption: `Attach ${v} as ${side} child of ${nodes[cur].value}`, delta: { writes: 1 } });
  }
  steps.push({ type: 'done', nodes: nodes.map((n) => String(n.id)), line: 8, caption: `BST built — ${nodes.length} nodes` });
  return steps;
};

function traversal(order: 'in' | 'pre' | 'post', label: string, line0: number): BSTRunner {
  return (model) => {
    const steps: Step[] = [];
    const nodes = model.nodes;
    const out: number[] = [];
    steps.push({ type: 'init', line: 1, caption: `${label} traversal` });
    const walk = (id: number | null) => {
      if (id === null) return;
      steps.push({ type: 'enter', node: String(id), value: nodes[id].value, line: 2, caption: `Enter ${nodes[id].value}`, delta: { reads: 1 } });
      if (order === 'pre') emit(id);
      walk(nodes[id].left);
      if (order === 'in') emit(id);
      walk(nodes[id].right);
      if (order === 'post') emit(id);
    };
    const emit = (id: number) => {
      out.push(nodes[id].value);
      steps.push({ type: 'visit', node: String(id), value: nodes[id].value, nodes: out.map(String), line: line0, caption: `Output ${nodes[id].value}  →  ${out.join(', ')}`, delta: { visited: 1 } });
    };
    walk(model.root);
    steps.push({ type: 'done', nodes: out.map(String), line: line0 + 2, caption: `${label}: ${out.join(', ')}` });
    return steps;
  };
}

const bstInorder = traversal('in', 'In-order', 4);
const bstPreorder = traversal('pre', 'Pre-order', 3);
const bstPostorder = traversal('post', 'Post-order', 5);

export const BST_RUNNERS: Record<string, BSTRunner> = {
  'bst-insert': bstInsert,
  'bst-inorder': bstInorder,
  'bst-preorder': bstPreorder,
  'bst-postorder': bstPostorder,
};

// ===========================================================================
// Maze generation — recursive backtracker on a cell grid.
// Emits `carve` steps; the renderer accumulates carved passages into walls it
// can hand to the pathfinding surface. Works on an odd-sized grid so every
// other row/col is a potential wall between cells.
// ===========================================================================

import { mulberry32 } from '../rng';

export interface MazeResult {
  steps: Step[];
  rows: number;
  cols: number;
  walls: string[]; // final wall keys "r,c"
}

/**
 * Recursive-backtracker maze. rows/cols are the full grid dimensions (odd
 * numbers work best). Cells sit on even coordinates; walls on odd ones.
 */
export function generateMaze(rows: number, cols: number, seed: number): MazeResult {
  const rand = mulberry32(seed);
  const steps: Step[] = [];
  // Start with everything a wall; carve passages.
  const wall = new Set<string>();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) wall.add(`${r},${c}`);
  const visited = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;
  const carve = (r: number, c: number, type: string, caption: string, line: number) => {
    wall.delete(key(r, c));
    steps.push({ type, cell: [r, c], line, caption, delta: type === 'carve' ? { writes: 1 } : {} });
  };
  steps.push({ type: 'init', line: 1, caption: 'Every cell walled; carve from top-left' });
  // iterative backtracker with explicit stack for determinism
  const stack: [number, number][] = [[0, 0]];
  visited.add(key(0, 0));
  carve(0, 0, 'carve', 'Open start cell', 3);
  const dirs: [number, number][] = [[-2, 0], [2, 0], [0, -2], [0, 2]];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    steps.push({ type: 'head', cell: [r, c], line: 4, caption: `At cell (${r}, ${c})`, delta: { visited: 1 } });
    // shuffle directions deterministically
    const order = dirs.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let advanced = false;
    for (const [dr, dc] of order) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (visited.has(key(nr, nc))) continue;
      // knock down the wall between (r,c) and (nr,nc)
      carve(r + dr / 2, c + dc / 2, 'carve', `Break wall toward (${nr}, ${nc})`, 6);
      carve(nr, nc, 'carve', `Carve cell (${nr}, ${nc})`, 6);
      visited.add(key(nr, nc));
      stack.push([nr, nc]);
      advanced = true;
      break;
    }
    if (!advanced) {
      stack.pop();
      steps.push({ type: 'backtrack', cell: [r, c], line: 8, caption: `Dead end — backtrack from (${r}, ${c})` });
    }
  }
  steps.push({ type: 'done', line: 9, caption: `Maze complete — ${wall.size} walls` });
  return { steps, rows, cols, walls: [...wall] };
}

// ===========================================================================
// Union-Find (disjoint set) with path compression + union by rank.
// A fixed sequence of union/find operations over 8 elements shows the forest
// flatten. Emits `link` and `compress` steps.
// ===========================================================================

export const UF_ELEMENTS = ['0', '1', '2', '3', '4', '5', '6', '7'];
// A scripted operation sequence chosen to trigger a visible path compression.
export const UF_OPS: Array<['union' | 'find', string, string?]> = [
  ['union', '0', '1'],
  ['union', '2', '3'],
  ['union', '1', '2'],   // links the two pairs into a taller tree
  ['union', '4', '5'],
  ['union', '6', '7'],
  ['union', '5', '6'],
  ['union', '3', '4'],   // one big tree
  ['find', '7'],         // triggers path compression up a long chain
  ['find', '0'],
];

export function runUnionFind(): { steps: Step[]; parent: Record<string, string> } {
  const steps: Step[] = [];
  const parent: Record<string, string> = {};
  const rank: Record<string, number> = {};
  for (const e of UF_ELEMENTS) { parent[e] = e; rank[e] = 0; }
  steps.push({ type: 'init', nodes: [...UF_ELEMENTS], line: 1, caption: 'Every element its own set' });

  const snapshot = () => ({ ...parent });
  const find = (x: string): string => {
    // find root, recording the chain, then compress
    const chain: string[] = [];
    let cur = x;
    while (parent[cur] !== cur) {
      steps.push({ type: 'walk', node: cur, parentOf: [cur, parent[cur]], line: 3, caption: `Follow ${cur} → ${parent[cur]}`, delta: { reads: 1 } });
      chain.push(cur);
      cur = parent[cur];
    }
    const root = cur;
    for (const node of chain) {
      if (parent[node] !== root) {
        parent[node] = root;
        steps.push({ type: 'compress', node, parentOf: [node, root], set: [...chain, root], line: 5, caption: `Compress ${node} → ${root}`, delta: { writes: 1 } });
      }
    }
    return root;
  };

  for (const [op, a, b] of UF_OPS) {
    if (op === 'find') {
      steps.push({ type: 'op', node: a, line: 2, caption: `find(${a})` });
      const r = find(a);
      steps.push({ type: 'result', node: a, parentOf: [a, r], line: 6, caption: `find(${a}) = ${r}` });
      continue;
    }
    // union
    steps.push({ type: 'op', edge: [a, b!], line: 8, caption: `union(${a}, ${b})` });
    const ra = find(a), rb = find(b!);
    if (ra === rb) {
      steps.push({ type: 'same', edge: [a, b!], line: 9, caption: `${a} and ${b} already joined` });
      continue;
    }
    let child: string, root: string;
    if (rank[ra] < rank[rb]) { child = ra; root = rb; }
    else if (rank[ra] > rank[rb]) { child = rb; root = ra; }
    else { child = rb; root = ra; rank[ra]++; }
    parent[child] = root;
    steps.push({ type: 'link', edge: [child, root], parentOf: [child, root], set: Object.keys(snapshot()), line: 10, caption: `Link root ${child} under ${root}`, delta: { writes: 1 } });
  }
  steps.push({ type: 'done', line: 11, caption: 'All operations applied' });
  return { steps, parent };
}

export const TREE_META: AlgoMeta[] = [
  {
    id: 'bst-insert', name: 'BST Insert', category: 'trees',
    blurb: 'Insert keys one by one; each falls left or right until it lands in an empty slot.',
    timeBest: 'O(log n)', timeAvg: 'O(log n)', timeWorst: 'O(n)', space: 'O(n)', stable: null,
    notes: 'Shape depends on insertion order — a sorted feed degrades to a linked list.',
    pseudocode: [
      'for each value v:', '  # start at the root', '  if tree empty: v is root; next',
      '  walk down from root:', '    v < node → go left, else go right', '    stop at a missing child',
      '  attach v there', 'done',
    ],
  },
  {
    id: 'bst-inorder', name: 'In-order Traversal', category: 'trees',
    blurb: 'Visit left subtree, node, then right — yields the keys in sorted order.',
    timeBest: 'O(n)', timeAvg: 'O(n)', timeWorst: 'O(n)', space: 'O(h)', stable: null,
    notes: 'The traversal that proves a BST holds a sorted set. h = tree height.',
    pseudocode: [
      'inorder(node):', '  if node is null: return', '  inorder(node.left)',
      '  output node', '  inorder(node.right)',
    ],
  },
  {
    id: 'bst-preorder', name: 'Pre-order Traversal', category: 'trees',
    blurb: 'Visit the node first, then its subtrees — the order to clone or serialize a tree.',
    timeBest: 'O(n)', timeAvg: 'O(n)', timeWorst: 'O(n)', space: 'O(h)', stable: null,
    notes: 'Root-first. Rebuilds the exact tree shape when replayed as inserts.',
    pseudocode: [
      'preorder(node):', '  if node is null: return', '  output node',
      '  preorder(node.left)', '  preorder(node.right)',
    ],
  },
  {
    id: 'bst-postorder', name: 'Post-order Traversal', category: 'trees',
    blurb: 'Visit both subtrees before the node — the safe order to delete or evaluate.',
    timeBest: 'O(n)', timeAvg: 'O(n)', timeWorst: 'O(n)', space: 'O(h)', stable: null,
    notes: 'Children-first. Used to free a tree or evaluate an expression tree.',
    pseudocode: [
      'postorder(node):', '  if node is null: return', '  postorder(node.left)',
      '  postorder(node.right)', '  output node',
    ],
  },
  {
    id: 'maze', name: 'Maze Generation', category: 'trees',
    blurb: 'Recursive backtracker: carve a random passage, back up at dead ends. Hands walls to pathfinding.',
    timeBest: 'O(rc)', timeAvg: 'O(rc)', timeWorst: 'O(rc)', space: 'O(rc)', stable: null,
    notes: 'Produces a perfect maze — exactly one path between any two cells. Seeded, so replayable.',
    pseudocode: [
      'mark all cells walled', '# depth-first carving', 'carve the start cell',
      'while a cell is on the stack:', '  at the top cell,', '  pick a random unvisited neighbor',
      '  knock down the wall & carve it', '  (else) backtrack one step', 'done',
    ],
  },
  {
    id: 'unionfind', name: 'Union-Find', category: 'trees',
    blurb: 'Disjoint-set forest with path compression — near-constant merges and membership tests.',
    timeBest: 'O(α(n))', timeAvg: 'O(α(n))', timeWorst: 'O(α(n))', space: 'O(n)', stable: null,
    notes: 'α is the inverse Ackermann function — effectively constant. Powers Kruskal and connectivity.',
    pseudocode: [
      'each element points to itself', 'find(x):', '  follow parents to the root',
      '  # path compression', '  repoint every node to the root', '  return root',
      'result', 'union(a, b):', '  if same root: nothing to do',
      '  link the shorter tree under the taller', 'done',
    ],
  },
];
