import type { Step, AlgoMeta } from '../types';

// Searching runs on a value strip. Linear scans left-to-right; binary needs a
// sorted array and highlights the shrinking [lo, hi] window plus the mid probe.

type Searcher = (arr: number[], target: number) => Step[];

const linear: Searcher = (arr, target) => {
  const steps: Step[] = [];
  steps.push({ type: 'init', array: arr.slice(), target, line: 1, caption: `Search for ${target}` });
  for (let i = 0; i < arr.length; i++) {
    steps.push({ type: 'probe', indices: [i], array: arr.slice(), target, line: 3, caption: `Check a[${i}] = ${arr[i]}`, delta: { comparisons: 1, reads: 1 } });
    if (arr[i] === target) {
      steps.push({ type: 'found', found: i, indices: [i], array: arr.slice(), target, line: 4, caption: `Found ${target} at index ${i}` });
      return steps;
    }
  }
  steps.push({ type: 'notfound', array: arr.slice(), target, line: 6, caption: `${target} not present` });
  return steps;
};

const binary: Searcher = (arr, target) => {
  const steps: Step[] = [];
  const a = arr.slice(); // assumed sorted by caller
  steps.push({ type: 'init', array: a.slice(), target, window: [0, a.length - 1], line: 1, caption: `Search sorted array for ${target}` });
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    steps.push({ type: 'window', window: [lo, hi], mid, array: a.slice(), target, line: 3, caption: `Window [${lo}, ${hi}], probe mid ${mid}`, delta: { comparisons: 1, reads: 1 } });
    if (a[mid] === target) {
      steps.push({ type: 'found', found: mid, window: [lo, hi], mid, array: a.slice(), target, line: 4, caption: `Found ${target} at index ${mid}` });
      return steps;
    } else if (a[mid] < target) {
      steps.push({ type: 'goRight', window: [mid + 1, hi], mid, array: a.slice(), target, line: 6, caption: `${a[mid]} < ${target} — discard left half` });
      lo = mid + 1;
    } else {
      steps.push({ type: 'goLeft', window: [lo, mid - 1], mid, array: a.slice(), target, line: 8, caption: `${a[mid]} > ${target} — discard right half` });
      hi = mid - 1;
    }
  }
  steps.push({ type: 'notfound', array: a.slice(), target, line: 10, caption: `${target} not present` });
  return steps;
};

export const SEARCHERS: Record<string, Searcher> = { linear, binary };

export const SEARCH_META: AlgoMeta[] = [
  {
    id: 'linear', name: 'Linear Search', category: 'searching',
    blurb: 'Walk the array from the front, comparing each element to the target.',
    timeBest: 'O(1)', timeAvg: 'O(n)', timeWorst: 'O(n)', space: 'O(1)', stable: null,
    notes: 'Works on any array, sorted or not. The baseline every other search beats.',
    pseudocode: [
      'given array and target', '# scan left to right', 'for i in 0 .. n-1:', '  if a[i] == target: return i',
      '# fell off the end', 'return not found',
    ],
  },
  {
    id: 'binary', name: 'Binary Search', category: 'searching',
    blurb: 'On a sorted array, probe the middle and throw away half the search space each step.',
    timeBest: 'O(1)', timeAvg: 'O(log n)', timeWorst: 'O(log n)', space: 'O(1)', stable: null,
    notes: 'Requires the array to be sorted first. Doubling the array adds just one comparison.',
    pseudocode: [
      'lo = 0, hi = n-1  (sorted array)', '# halve the window each step', 'while lo <= hi:',
      '  mid = (lo+hi)/2; if a[mid]==target: return mid', '  # decide which half', '  if a[mid] < target: lo = mid+1',
      '  # target is larger, go right', '  else: hi = mid-1', '# window empty', 'return not found',
    ],
  },
];
