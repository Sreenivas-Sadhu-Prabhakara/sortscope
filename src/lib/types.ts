// ---------------------------------------------------------------------------
// The uniform STEP model. Every algorithm — sort, pathfind, graph, search,
// tree, generation — is authored as a pure function that returns an ordered
// array of Step objects. A single playback engine consumes them, so Play /
// Pause / Step / Reset / speed behave identically everywhere, and every run is
// deterministic and replayable.
// ---------------------------------------------------------------------------

/** A running tally shown in the stat readout. Deltas accumulate as steps play. */
export interface Stats {
  comparisons: number;
  swaps: number;
  reads: number;
  writes: number;
  visited: number;
  relaxations: number;
  pathLength: number;
}

export type StatKey = keyof Stats;

/** Per-step change to the running stats. */
export type StatDelta = Partial<Record<StatKey, number>>;

/**
 * One discrete moment in an algorithm's execution. `type` names what happened;
 * the remaining fields are a loose union the renderer reads selectively. Every
 * step carries the 1-based pseudocode line it corresponds to and an optional
 * human caption for the status line.
 */
export interface Step {
  type: string;
  // sorting / searching
  indices?: number[];
  sorted?: number[];
  pivot?: number;
  window?: [number, number];
  target?: number;
  mid?: number;
  found?: number;
  value?: number;
  array?: number[];
  // graph / grid — node & edge references are string keys or [r,c] tuples
  node?: string;
  nodes?: string[];
  cell?: [number, number];
  cells?: [number, number][];
  frontier?: [number, number][] | string[];
  path?: [number, number][] | string[];
  edge?: [string, string];
  edges?: [string, string][];
  weight?: number;
  round?: number;
  // union-find
  parentOf?: [string, string]; // [child, newParent]
  set?: string[];
  // shared
  line: number;
  caption: string;
  delta?: StatDelta;
}

/** Static description of an algorithm for the complexity table + picker. */
export interface AlgoMeta {
  id: string;
  name: string;
  category: CategoryId;
  blurb: string;
  timeBest: string;
  timeAvg: string;
  timeWorst: string;
  space: string;
  stable?: boolean | null;
  notes: string;
  /** Pseudocode lines, 1-based when referenced by Step.line (index 0 = line 1). */
  pseudocode: string[];
}

export type CategoryId =
  | 'sorting'
  | 'pathfinding'
  | 'graph'
  | 'searching'
  | 'trees';

export interface Category {
  id: CategoryId;
  label: string;
  tagline: string;
}

export const CATEGORIES: Category[] = [
  { id: 'sorting', label: 'Sorting', tagline: 'bars, height = value' },
  { id: 'pathfinding', label: 'Pathfinding', tagline: 'grid, walls & weights' },
  { id: 'graph', label: 'Graph', tagline: 'weighted node–link' },
  { id: 'searching', label: 'Searching', tagline: 'value strip' },
  { id: 'trees', label: 'Trees & Gen', tagline: 'BST, maze, union–find' },
];

export const EMPTY_STATS: Stats = {
  comparisons: 0,
  swaps: 0,
  reads: 0,
  writes: 0,
  visited: 0,
  relaxations: 0,
  pathLength: 0,
};
