import type { AlgoMeta, CategoryId, Step } from './types';
import { CATEGORIES } from './types';
import { SORT_META, SORTERS } from './algorithms/sorting';
import { PATH_META, FINDERS, type Grid } from './algorithms/pathfinding';
import { GRAPH_META, GRAPH_RUNNERS, GRAPH_MODELS } from './algorithms/graph';
import { SEARCH_META, SEARCHERS } from './algorithms/searching';
import {
  TREE_META, BST_RUNNERS, BST_VALUES, buildBST,
  generateMaze, runUnionFind, type BSTModel,
} from './algorithms/trees';

export { CATEGORIES };
export type { AlgoMeta, CategoryId, Step, Grid, BSTModel };

// One list, in the order they appear in each picker.
export const ALL_META: AlgoMeta[] = [
  ...SORT_META, ...PATH_META, ...GRAPH_META, ...SEARCH_META, ...TREE_META,
];

export const META_BY_ID: Record<string, AlgoMeta> = Object.fromEntries(
  ALL_META.map((m) => [m.id, m]),
);

export function metaForCategory(cat: CategoryId): AlgoMeta[] {
  return ALL_META.filter((m) => m.category === cat);
}

export const DEFAULT_ALGO: Record<CategoryId, string> = {
  sorting: 'bubble',
  pathfinding: 'dijkstra',
  graph: 'prim',
  searching: 'binary',
  trees: 'bst-insert',
};

// Re-export the runners + models the client engine dispatches on.
export {
  SORTERS, FINDERS, GRAPH_RUNNERS, GRAPH_MODELS, SEARCHERS,
  BST_RUNNERS, BST_VALUES, buildBST, generateMaze, runUnionFind,
};
