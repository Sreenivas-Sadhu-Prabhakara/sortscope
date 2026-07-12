import type { CategoryId } from '../lib/types';
import { DEFAULT_ALGO, META_BY_ID } from '../lib/registry';

// URL-hash state — the whole app is shareable/replayable with zero network.
// Hash grammar (all optional, '&'-joined key=value):
//   a=<algoId>          selected algorithm
//   n=<int>             sorting/search array size
//   s=<int>             seed for the shuffled input
//   t=<int>             search target value
//   g=<rows>x<cols>     grid dimensions
//   w=<base64 bitmask>  wall cells (row-major bit per cell)
//   sp=<r,c>  ep=<r,c>  start / end cell
//   wt=<base64 bitmask> weighted cells (Dijkstra/A* costs)

export interface AppState {
  algo: string;
  category: CategoryId;
  // sorting / searching
  n: number;
  seed: number;
  target: number;
  // pathfinding grid
  gridRows: number;
  gridCols: number;
  walls: Set<string>;
  weights: Set<string>;
  start: [number, number];
  end: [number, number];
}

export const GRID_ROWS = 25;
export const GRID_COLS = 40;

export function defaultState(): AppState {
  return {
    algo: 'bubble',
    category: 'sorting',
    n: 40,
    seed: 7,
    target: 42,
    gridRows: GRID_ROWS,
    gridCols: GRID_COLS,
    walls: new Set(),
    weights: new Set(),
    start: [Math.floor(GRID_ROWS / 2), 4],
    end: [Math.floor(GRID_ROWS / 2), GRID_COLS - 5],
  };
}

// --- compact bitmask (base64url) for grid cell sets --------------------------
function cellsToMask(cells: Set<string>, rows: number, cols: number): string {
  const bytes = new Uint8Array(Math.ceil((rows * cols) / 8));
  for (const k of cells) {
    const [r, c] = k.split(',').map(Number);
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const bit = r * cols + c;
    bytes[bit >> 3] |= 1 << (bit & 7);
  }
  return b64urlEncode(bytes);
}

function maskToCells(mask: string, rows: number, cols: number): Set<string> {
  const out = new Set<string>();
  try {
    const bytes = b64urlDecode(mask);
    for (let bit = 0; bit < rows * cols; bit++) {
      if (bytes[bit >> 3] & (1 << (bit & 7))) {
        out.add(`${Math.floor(bit / cols)},${bit % cols}`);
      }
    }
  } catch { /* malformed hash — ignore */ }
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const clampInt = (v: number, lo: number, hi: number, dflt: number) =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt;

export function readHash(): AppState {
  const st = defaultState();
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return st;
  const params = new URLSearchParams(raw);

  const a = params.get('a');
  if (a && META_BY_ID[a]) { st.algo = a; st.category = META_BY_ID[a].category; }

  // A missing param must keep the default — not coerce to Number(null)===0.
  const numParam = (k: string, lo: number, hi: number, dflt: number) => {
    const raw = params.get(k);
    return raw === null || raw === '' ? dflt : clampInt(Number(raw), lo, hi, dflt);
  };
  st.n = numParam('n', 5, 120, st.n);
  st.seed = numParam('s', 0, 0xffffffff, st.seed);
  st.target = numParam('t', 1, 999, st.target);

  const g = params.get('g');
  if (g && /^\d+x\d+$/.test(g)) {
    const [r, c] = g.split('x').map(Number);
    st.gridRows = clampInt(r, 5, 40, GRID_ROWS);
    st.gridCols = clampInt(c, 5, 60, GRID_COLS);
  }
  const parseCell = (v: string | null, dflt: [number, number]): [number, number] => {
    if (!v || !/^\d+,\d+$/.test(v)) return dflt;
    const [r, c] = v.split(',').map(Number);
    if (r < 0 || c < 0 || r >= st.gridRows || c >= st.gridCols) return dflt;
    return [r, c];
  };
  st.start = parseCell(params.get('sp'), st.start);
  st.end = parseCell(params.get('ep'), st.end);
  const w = params.get('w');
  if (w) st.walls = maskToCells(w, st.gridRows, st.gridCols);
  const wt = params.get('wt');
  if (wt) st.weights = maskToCells(wt, st.gridRows, st.gridCols);
  // start/end can't be walls
  st.walls.delete(st.start.join(','));
  st.walls.delete(st.end.join(','));
  return st;
}

export function writeHash(st: AppState, replace = true) {
  const p = new URLSearchParams();
  p.set('a', st.algo);
  if (st.category === 'sorting' || st.category === 'searching') {
    p.set('n', String(st.n));
    p.set('s', String(st.seed));
    if (st.category === 'searching') p.set('t', String(st.target));
  }
  if (st.category === 'pathfinding') {
    p.set('g', `${st.gridRows}x${st.gridCols}`);
    p.set('sp', st.start.join(','));
    p.set('ep', st.end.join(','));
    if (st.walls.size) p.set('w', cellsToMask(st.walls, st.gridRows, st.gridCols));
    if (st.weights.size) p.set('wt', cellsToMask(st.weights, st.gridRows, st.gridCols));
  }
  const hash = '#' + p.toString();
  if (hash === location.hash) return;
  const url = location.pathname + location.search + hash;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

export { DEFAULT_ALGO };
