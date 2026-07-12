import type { Step, AlgoMeta } from '../types';

// Every sorter takes the raw input array and returns an ordered step list plus
// the pseudocode metadata. Steps carry `array` snapshots only when order
// changes (swap/overwrite) so the renderer can stay in sync cheaply; between
// snapshots the renderer keeps the last known array.

type Sorter = (input: number[]) => Step[];

// ---- Bubble ---------------------------------------------------------------
const bubble: Sorter = (input) => {
  const a = input.slice();
  const steps: Step[] = [];
  const n = a.length;
  const sorted: number[] = [];
  steps.push({ type: 'init', array: a.slice(), sorted: [], line: 1, caption: 'Start bubble sort' });
  for (let i = 0; i < n - 1; i++) {
    let swappedAny = false;
    for (let j = 0; j < n - 1 - i; j++) {
      steps.push({
        type: 'compare', indices: [j, j + 1], sorted: sorted.slice(),
        line: 3, caption: `Compare ${a[j]} and ${a[j + 1]}`, delta: { comparisons: 1, reads: 2 },
      });
      if (a[j] > a[j + 1]) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        swappedAny = true;
        steps.push({
          type: 'swap', indices: [j, j + 1], array: a.slice(), sorted: sorted.slice(),
          line: 4, caption: `Swap — ${a[j + 1]} > ${a[j]}`, delta: { swaps: 1, writes: 2 },
        });
      }
    }
    sorted.unshift(n - 1 - i);
    steps.push({ type: 'markSorted', sorted: sorted.slice(), line: 6, caption: `Position ${n - i} locked`, array: a.slice() });
    if (!swappedAny) break;
  }
  for (let k = 0; k < n; k++) if (!sorted.includes(k)) sorted.push(k);
  steps.push({ type: 'done', sorted: Array.from({ length: n }, (_, i) => i), array: a.slice(), line: 7, caption: 'Sorted' });
  return steps;
};

// ---- Insertion ------------------------------------------------------------
const insertion: Sorter = (input) => {
  const a = input.slice();
  const steps: Step[] = [];
  const n = a.length;
  steps.push({ type: 'init', array: a.slice(), sorted: [0], line: 1, caption: 'Start insertion sort' });
  for (let i = 1; i < n; i++) {
    const key = a[i];
    let j = i - 1;
    steps.push({ type: 'select', indices: [i], sorted: range(i), array: a.slice(), line: 2, caption: `Lift key ${key}`, delta: { reads: 1 } });
    while (j >= 0) {
      steps.push({ type: 'compare', indices: [j, i], sorted: range(i), array: a.slice(), line: 4, caption: `Compare ${a[j]} with key ${key}`, delta: { comparisons: 1, reads: 1 } });
      if (a[j] > key) {
        a[j + 1] = a[j];
        steps.push({ type: 'shift', indices: [j, j + 1], array: a.slice(), sorted: range(i), line: 5, caption: `Shift ${a[j]} right`, delta: { writes: 1 } });
        j--;
      } else break;
    }
    a[j + 1] = key;
    steps.push({ type: 'insert', indices: [j + 1], array: a.slice(), sorted: range(i + 1), line: 7, caption: `Drop key into slot`, delta: { writes: 1 } });
  }
  steps.push({ type: 'done', sorted: range(n), array: a.slice(), line: 8, caption: 'Sorted' });
  return steps;
};

// ---- Selection ------------------------------------------------------------
const selection: Sorter = (input) => {
  const a = input.slice();
  const steps: Step[] = [];
  const n = a.length;
  const sorted: number[] = [];
  steps.push({ type: 'init', array: a.slice(), sorted: [], line: 1, caption: 'Start selection sort' });
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    steps.push({ type: 'select', indices: [min], pivot: min, sorted: sorted.slice(), array: a.slice(), line: 2, caption: `Assume ${a[min]} is smallest`, delta: { reads: 1 } });
    for (let j = i + 1; j < n; j++) {
      steps.push({ type: 'compare', indices: [j, min], pivot: min, sorted: sorted.slice(), array: a.slice(), line: 4, caption: `Compare ${a[j]} with min ${a[min]}`, delta: { comparisons: 1, reads: 2 } });
      if (a[j] < a[min]) {
        min = j;
        steps.push({ type: 'newMin', indices: [min], pivot: min, sorted: sorted.slice(), array: a.slice(), line: 5, caption: `New minimum ${a[min]}` });
      }
    }
    if (min !== i) {
      [a[i], a[min]] = [a[min], a[i]];
      steps.push({ type: 'swap', indices: [i, min], array: a.slice(), sorted: sorted.slice(), line: 7, caption: `Swap min into place`, delta: { swaps: 1, writes: 2 } });
    }
    sorted.push(i);
    steps.push({ type: 'markSorted', sorted: sorted.slice(), array: a.slice(), line: 8, caption: `Position ${i + 1} locked` });
  }
  sorted.push(n - 1);
  steps.push({ type: 'done', sorted: range(n), array: a.slice(), line: 9, caption: 'Sorted' });
  return steps;
};

// ---- Merge ----------------------------------------------------------------
const merge: Sorter = (input) => {
  const a = input.slice();
  const steps: Step[] = [];
  const n = a.length;
  steps.push({ type: 'init', array: a.slice(), sorted: [], line: 1, caption: 'Start merge sort' });

  function sort(lo: number, hi: number) {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    steps.push({ type: 'divide', window: [lo, hi], mid, array: a.slice(), line: 3, caption: `Split [${lo}..${hi}]` });
    sort(lo, mid);
    sort(mid + 1, hi);
    // merge
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    let i = 0, j = 0, k = lo;
    steps.push({ type: 'window', window: [lo, hi], mid, array: a.slice(), line: 6, caption: `Merge [${lo}..${hi}]` });
    while (i < left.length && j < right.length) {
      steps.push({ type: 'compare', indices: [lo + i, mid + 1 + j], window: [lo, hi], array: a.slice(), line: 7, caption: `Compare ${left[i]} and ${right[j]}`, delta: { comparisons: 1, reads: 2 } });
      if (left[i] <= right[j]) {
        a[k] = left[i]; i++;
      } else {
        a[k] = right[j]; j++;
      }
      steps.push({ type: 'overwrite', indices: [k], window: [lo, hi], array: a.slice(), line: 8, caption: `Write ${a[k]} to slot ${k}`, delta: { writes: 1 } });
      k++;
    }
    while (i < left.length) { a[k] = left[i]; steps.push({ type: 'overwrite', indices: [k], window: [lo, hi], array: a.slice(), line: 9, caption: `Drain left ${left[i]}`, delta: { writes: 1 } }); i++; k++; }
    while (j < right.length) { a[k] = right[j]; steps.push({ type: 'overwrite', indices: [k], window: [lo, hi], array: a.slice(), line: 9, caption: `Drain right ${right[j]}`, delta: { writes: 1 } }); j++; k++; }
    steps.push({ type: 'merged', window: [lo, hi], array: a.slice(), line: 10, caption: `Run [${lo}..${hi}] merged` });
  }
  sort(0, n - 1);
  steps.push({ type: 'done', sorted: range(n), array: a.slice(), line: 11, caption: 'Sorted' });
  return steps;
};

// ---- Quick (Lomuto, last element pivot) -----------------------------------
const quick: Sorter = (input) => {
  const a = input.slice();
  const steps: Step[] = [];
  const n = a.length;
  const sorted: number[] = [];
  steps.push({ type: 'init', array: a.slice(), sorted: [], line: 1, caption: 'Start quicksort' });

  function qsort(lo: number, hi: number) {
    if (lo > hi) return;
    if (lo === hi) { sorted.push(lo); return; }
    const pivot = a[hi];
    steps.push({ type: 'pivot', pivot: hi, window: [lo, hi], sorted: sorted.slice(), array: a.slice(), line: 3, caption: `Pivot = ${pivot}` });
    let i = lo;
    for (let j = lo; j < hi; j++) {
      steps.push({ type: 'compare', indices: [j, hi], pivot: hi, window: [lo, hi], sorted: sorted.slice(), array: a.slice(), line: 5, caption: `Compare ${a[j]} with pivot ${pivot}`, delta: { comparisons: 1, reads: 2 } });
      if (a[j] < pivot) {
        if (i !== j) {
          [a[i], a[j]] = [a[j], a[i]];
          steps.push({ type: 'swap', indices: [i, j], pivot: hi, window: [lo, hi], sorted: sorted.slice(), array: a.slice(), line: 6, caption: `Swap ${a[j]} and ${a[i]}`, delta: { swaps: 1, writes: 2 } });
        }
        i++;
      }
    }
    if (i !== hi) {
      [a[i], a[hi]] = [a[hi], a[i]];
      steps.push({ type: 'swap', indices: [i, hi], pivot: i, window: [lo, hi], sorted: sorted.slice(), array: a.slice(), line: 8, caption: `Place pivot at ${i}`, delta: { swaps: 1, writes: 2 } });
    }
    sorted.push(i);
    steps.push({ type: 'markSorted', sorted: sorted.slice(), array: a.slice(), line: 8, caption: `Pivot ${a[i]} in final place` });
    qsort(lo, i - 1);
    qsort(i + 1, hi);
  }
  qsort(0, n - 1);
  steps.push({ type: 'done', sorted: range(n), array: a.slice(), line: 9, caption: 'Sorted' });
  return steps;
};

// ---- Heap -----------------------------------------------------------------
const heap: Sorter = (input) => {
  const a = input.slice();
  const steps: Step[] = [];
  const n = a.length;
  const sorted: number[] = [];
  steps.push({ type: 'init', array: a.slice(), sorted: [], line: 1, caption: 'Start heapsort' });

  function siftDown(start: number, end: number) {
    let root = start;
    while (2 * root + 1 <= end) {
      let child = 2 * root + 1;
      let swap = root;
      steps.push({ type: 'compare', indices: [swap, child], sorted: sorted.slice(), array: a.slice(), line: 4, caption: `Compare parent ${a[swap]} with child ${a[child]}`, delta: { comparisons: 1, reads: 2 } });
      if (a[swap] < a[child]) swap = child;
      if (child + 1 <= end) {
        steps.push({ type: 'compare', indices: [swap, child + 1], sorted: sorted.slice(), array: a.slice(), line: 5, caption: `Compare with right child ${a[child + 1]}`, delta: { comparisons: 1, reads: 2 } });
        if (a[swap] < a[child + 1]) swap = child + 1;
      }
      if (swap === root) return;
      [a[root], a[swap]] = [a[swap], a[root]];
      steps.push({ type: 'swap', indices: [root, swap], sorted: sorted.slice(), array: a.slice(), line: 6, caption: `Sift down`, delta: { swaps: 1, writes: 2 } });
      root = swap;
    }
  }
  // build max heap
  for (let start = (n - 2) >> 1; start >= 0; start--) {
    steps.push({ type: 'heapify', indices: [start], sorted: sorted.slice(), array: a.slice(), line: 2, caption: `Heapify from ${start}` });
    siftDown(start, n - 1);
  }
  // sort
  for (let end = n - 1; end > 0; end--) {
    [a[0], a[end]] = [a[end], a[0]];
    steps.push({ type: 'swap', indices: [0, end], sorted: sorted.slice(), array: a.slice(), line: 9, caption: `Move max ${a[end]} to end`, delta: { swaps: 1, writes: 2 } });
    sorted.unshift(end);
    steps.push({ type: 'markSorted', sorted: sorted.slice(), array: a.slice(), line: 10, caption: `Position ${end + 1} locked` });
    siftDown(0, end - 1);
  }
  steps.push({ type: 'done', sorted: range(n), array: a.slice(), line: 11, caption: 'Sorted' });
  return steps;
};

function range(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }

export const SORTERS: Record<string, Sorter> = {
  bubble, insertion, selection, merge, quick, heap,
};

export const SORT_META: AlgoMeta[] = [
  {
    id: 'bubble', name: 'Bubble Sort', category: 'sorting',
    blurb: 'Repeatedly swap adjacent out-of-order pairs; the largest bubbles to the end each pass.',
    timeBest: 'O(n)', timeAvg: 'O(n²)', timeWorst: 'O(n²)', space: 'O(1)', stable: true,
    notes: 'Adaptive with early exit. Teaching classic; too slow for real data.',
    pseudocode: [
      'for i in 0 .. n-1:', '  swapped = false', '  for j in 0 .. n-2-i:', '    if a[j] > a[j+1]: swap(a[j], a[j+1]); swapped = true',
      '  # largest value now at the end', '  mark a[n-1-i] sorted', '  if not swapped: break',
    ],
  },
  {
    id: 'insertion', name: 'Insertion Sort', category: 'sorting',
    blurb: 'Grow a sorted prefix, inserting each new key into its place by shifting.',
    timeBest: 'O(n)', timeAvg: 'O(n²)', timeWorst: 'O(n²)', space: 'O(1)', stable: true,
    notes: 'Fast on nearly-sorted / small inputs; the workhorse inside hybrid sorts.',
    pseudocode: [
      'for i in 1 .. n-1:', '  key = a[i]; j = i-1', '  while j >= 0 and a[j] > key:', '    # compare',
      '    a[j+1] = a[j]; j = j-1', '  # slot found', '  a[j+1] = key', 'done',
    ],
  },
  {
    id: 'selection', name: 'Selection Sort', category: 'sorting',
    blurb: 'Scan for the minimum of the unsorted region and swap it into position.',
    timeBest: 'O(n²)', timeAvg: 'O(n²)', timeWorst: 'O(n²)', space: 'O(1)', stable: false,
    notes: 'Always n²/2 comparisons but at most n swaps — good when writes are costly.',
    pseudocode: [
      'for i in 0 .. n-2:', '  min = i', '  for j in i+1 .. n-1:', '    if a[j] < a[min]:',
      '      min = j', '  # smallest found', '  swap(a[i], a[min])', '  mark a[i] sorted', 'done',
    ],
  },
  {
    id: 'merge', name: 'Merge Sort', category: 'sorting',
    blurb: 'Divide in half, sort each half, then merge the two sorted runs.',
    timeBest: 'O(n log n)', timeAvg: 'O(n log n)', timeWorst: 'O(n log n)', space: 'O(n)', stable: true,
    notes: 'Guaranteed n log n and stable; needs O(n) scratch space. Great for linked lists.',
    pseudocode: [
      'sort(lo, hi):', '  if lo >= hi: return', '  mid = (lo+hi)/2', '  sort(lo, mid); sort(mid+1, hi)',
      '  # merge two runs', '  merge(lo, mid, hi):', '    while both runs non-empty:', '      write smaller front to a[k]',
      '    drain remaining run', '  # run merged', 'done',
    ],
  },
  {
    id: 'quick', name: 'Quicksort', category: 'sorting',
    blurb: 'Partition around a pivot so smaller items go left, larger right; recurse.',
    timeBest: 'O(n log n)', timeAvg: 'O(n log n)', timeWorst: 'O(n²)', space: 'O(log n)', stable: false,
    notes: 'Fastest in practice from cache-friendliness; worst case on sorted input with naive pivot.',
    pseudocode: [
      'qsort(lo, hi):', '  if lo >= hi: return', '  pivot = a[hi]; i = lo', '  for j in lo .. hi-1:',
      '    if a[j] < pivot:', '      swap(a[i], a[j]); i++', '  # partition done', '  swap(a[i], a[hi]); recurse left & right', 'done',
    ],
  },
  {
    id: 'heap', name: 'Heapsort', category: 'sorting',
    blurb: 'Build a max-heap, then repeatedly extract the max to the end.',
    timeBest: 'O(n log n)', timeAvg: 'O(n log n)', timeWorst: 'O(n log n)', space: 'O(1)', stable: false,
    notes: 'In-place with a guaranteed bound; not stable and less cache-friendly than quicksort.',
    pseudocode: [
      'build max-heap:', '  for each internal node bottom-up:', '    sift-down', '  compare parent & children',
      '  pick larger child', '  swap if heap property broken', '# heap ready', 'for end = n-1 .. 1:',
      '  swap(a[0], a[end])', '  mark a[end] sorted', '  sift-down(0, end-1)',
    ],
  },
];
