import type { Step } from '../lib/types';
import type { AppState } from './state';
import { UNDIRECTED, DAG, NEGRAPH, type GraphModel } from '../lib/algorithms/graph';
import { buildBST, BST_VALUES, UF_ELEMENTS, type BSTModel } from '../lib/algorithms/trees';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
};

// A renderer owns one category surface. `mount` builds the static scaffold from
// the current AppState; `render` paints the frame for the applied step. Grid &
// graph renderers also expose interactivity via callbacks set by the app.
export interface Renderer {
  mount(container: HTMLElement, state: AppState): void;
  render(step: Step | null, cursor: number, steps: Step[]): void;
  /** Reduced-motion instant-final flag lets renderers skip transitions. */
  destroy?(): void;
}

// ===========================================================================
// SORTING — bars, height = value. Color encodes role (compare / swap / sorted).
// ===========================================================================
export class SortRenderer implements Renderer {
  private host!: HTMLElement;
  private bars: HTMLElement[] = [];
  private values: number[] = [];

  mount(container: HTMLElement, state: AppState) {
    this.host = container;
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'bars';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `${state.n} bars to sort`);
    this.bars = [];
    this.values = [];
    for (let i = 0; i < state.n; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      wrap.appendChild(bar);
      this.bars.push(bar);
    }
    container.appendChild(wrap);
  }

  private layout(arr: number[]) {
    const n = arr.length;
    const max = Math.max(1, ...arr);
    for (let i = 0; i < n; i++) {
      this.bars[i].style.height = `${(arr[i] / max) * 100}%`;
      this.bars[i].dataset.v = String(arr[i]);
    }
    this.values = arr.slice();
  }

  render(step: Step | null, _cursor: number, steps: Step[]) {
    // Establish the array: nearest array snapshot at/behind the cursor.
    if (!step) {
      const first = steps.find((s) => s.array);
      if (first?.array) this.layout(first.array);
      this.paint(null);
      return;
    }
    if (step.array) this.layout(step.array);
    else {
      // no snapshot on this step — keep current bars (already correct)
    }
    this.paint(step);
  }

  private paint(step: Step | null) {
    const sorted = new Set(step?.sorted ?? []);
    const active = new Set(step?.indices ?? []);
    const pivot = step?.pivot;
    const win = step?.window;
    for (let i = 0; i < this.bars.length; i++) {
      const b = this.bars[i];
      let cls = 'bar';
      if (sorted.has(i)) cls += ' is-sorted';
      if (win && (i < win[0] || i > win[1])) cls += ' is-dim';
      if (pivot === i) cls += ' is-pivot';
      if (active.has(i)) {
        cls += step?.type === 'swap' || step?.type === 'shift' || step?.type === 'overwrite'
          ? ' is-swap' : ' is-compare';
      }
      b.className = cls;
    }
  }
}

// ===========================================================================
// SEARCHING — a value strip; window shrinks for binary, probe highlights.
// ===========================================================================
export class SearchRenderer implements Renderer {
  private host!: HTMLElement;
  private cells: HTMLElement[] = [];

  mount(container: HTMLElement, _state: AppState) {
    this.host = container;
    container.innerHTML = '';
    const strip = document.createElement('div');
    strip.className = 'strip';
    strip.setAttribute('role', 'img');
    strip.setAttribute('aria-label', 'value strip to search');
    this.cells = [];
    container.appendChild(strip);
    this._strip = strip;
  }
  private _strip!: HTMLElement;

  private build(arr: number[]) {
    this._strip.innerHTML = '';
    this.cells = [];
    for (let i = 0; i < arr.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const v = document.createElement('span');
      v.className = 'cell-v';
      v.textContent = String(arr[i]);
      const idx = document.createElement('span');
      idx.className = 'cell-i';
      idx.textContent = String(i);
      cell.append(v, idx);
      this._strip.appendChild(cell);
      this.cells.push(cell);
    }
  }

  render(step: Step | null, _cursor: number, steps: Step[]) {
    const arrStep = step?.array ? step : steps.find((s) => s.array);
    if (arrStep?.array && this.cells.length !== arrStep.array.length) this.build(arrStep.array);
    else if (arrStep?.array && this.cells.length === 0) this.build(arrStep.array);

    const win = step?.window;
    const mid = step?.mid;
    const active = new Set(step?.indices ?? []);
    const found = step?.found;
    for (let i = 0; i < this.cells.length; i++) {
      let cls = 'cell';
      if (win && (i < win[0] || i > win[1])) cls += ' is-out';
      if (active.has(i)) cls += ' is-probe';
      if (mid === i) cls += ' is-mid';
      if (found === i) cls += ' is-found';
      this.cells[i].className = cls;
    }
  }
}

// ===========================================================================
// PATHFINDING — interactive grid. Draw walls, drag start/end. Frontier then
// path animate through step types visit/frontier/relax/path.
// ===========================================================================
export interface GridInteraction {
  onWallToggle(r: number, c: number, on: boolean): void;
  onMoveStart(r: number, c: number): void;
  onMoveEnd(r: number, c: number): void;
}

export class GridRenderer implements Renderer {
  private host!: HTMLElement;
  private grid!: HTMLElement;
  private cells: HTMLElement[][] = [];
  private state!: AppState;
  private interaction: GridInteraction | null = null;
  private dragging: null | 'wall-on' | 'wall-off' | 'start' | 'end' = null;

  setInteraction(i: GridInteraction) { this.interaction = i; }

  mount(container: HTMLElement, state: AppState) {
    this.host = container;
    this.state = state;
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.setProperty('--cols', String(state.gridCols));
    grid.style.setProperty('--rows', String(state.gridRows));
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'pathfinding grid — click and drag to draw walls');
    grid.tabIndex = 0;
    this.cells = [];
    for (let r = 0; r < state.gridRows; r++) {
      const row: HTMLElement[] = [];
      for (let c = 0; c < state.gridCols; c++) {
        const cell = document.createElement('div');
        cell.className = 'gc';
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        grid.appendChild(cell);
        row.push(cell);
      }
      this.cells.push(row);
    }
    container.appendChild(grid);
    this.grid = grid;
    this.attachInteraction();
    this.paintBase();
  }

  private cellAt(target: EventTarget | null): [number, number] | null {
    if (!(target instanceof HTMLElement)) return null;
    const el = target.closest('.gc') as HTMLElement | null;
    if (!el) return null;
    return [Number(el.dataset.r), Number(el.dataset.c)];
  }

  private attachInteraction() {
    const isStart = (r: number, c: number) => this.state.start[0] === r && this.state.start[1] === c;
    const isEnd = (r: number, c: number) => this.state.end[0] === r && this.state.end[1] === c;

    const down = (e: PointerEvent) => {
      const rc = this.cellAt(e.target);
      if (!rc || !this.interaction) return;
      const [r, c] = rc;
      e.preventDefault();
      this.grid.setPointerCapture?.(e.pointerId);
      if (isStart(r, c)) this.dragging = 'start';
      else if (isEnd(r, c)) this.dragging = 'end';
      else {
        const on = !this.state.walls.has(`${r},${c}`);
        this.dragging = on ? 'wall-on' : 'wall-off';
        this.interaction.onWallToggle(r, c, on);
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging || !this.interaction) return;
      const rc = this.cellAt(document.elementFromPoint(e.clientX, e.clientY));
      if (!rc) return;
      const [r, c] = rc;
      if (this.dragging === 'start') { if (!isEnd(r, c) && !this.state.walls.has(`${r},${c}`)) this.interaction.onMoveStart(r, c); }
      else if (this.dragging === 'end') { if (!isStart(r, c) && !this.state.walls.has(`${r},${c}`)) this.interaction.onMoveEnd(r, c); }
      else if (this.dragging === 'wall-on') { if (!isStart(r, c) && !isEnd(r, c)) this.interaction.onWallToggle(r, c, true); }
      else if (this.dragging === 'wall-off') { if (!isStart(r, c) && !isEnd(r, c)) this.interaction.onWallToggle(r, c, false); }
    };
    const up = () => { this.dragging = null; };
    this.grid.addEventListener('pointerdown', down);
    this.grid.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // keyboard: toggle wall under a roving marker via click on focus? Keep simple:
    this.grid.addEventListener('click', (e) => {
      // click handled by pointer already for mouse; keyboard Enter fires click on focused cell
    });
  }

  /** Repaint walls/weights/start/end without touching the search overlay. */
  paintBase() {
    for (let r = 0; r < this.state.gridRows; r++) {
      for (let c = 0; c < this.state.gridCols; c++) {
        const cell = this.cells[r][c];
        cell.className = 'gc';
        if (this.state.walls.has(`${r},${c}`)) cell.classList.add('is-wall');
        if (this.state.weights.has(`${r},${c}`)) cell.classList.add('is-weight');
        if (this.state.start[0] === r && this.state.start[1] === c) cell.classList.add('is-start');
        if (this.state.end[0] === r && this.state.end[1] === c) cell.classList.add('is-end');
      }
    }
  }

  private clearOverlay() {
    for (const row of this.cells) for (const cell of row)
      cell.classList.remove('is-visit', 'is-frontier', 'is-relax', 'is-path', 'is-head', 'is-meet');
  }

  render(step: Step | null, cursor: number, steps: Step[]) {
    this.paintBase();
    this.clearOverlay();
    if (cursor < 0) return;
    // Replay all overlay-affecting steps up to the cursor so scrubbing is exact.
    for (let i = 0; i <= cursor; i++) {
      const s = steps[i];
      if (s.cell) {
        const [r, c] = s.cell;
        const cell = this.cells[r]?.[c];
        if (!cell) continue;
        if (s.type === 'visit') cell.classList.add('is-visit');
        else if (s.type === 'frontier') { if (!cell.classList.contains('is-visit')) cell.classList.add('is-frontier'); }
        else if (s.type === 'relax') { if (!cell.classList.contains('is-visit')) cell.classList.add('is-relax'); }
        else if (s.type === 'meet') cell.classList.add('is-meet');
      }
      if (s.type === 'path' && Array.isArray(s.path)) {
        for (const p of s.path as [number, number][]) {
          const cell = this.cells[p[0]]?.[p[1]];
          if (cell) { cell.classList.remove('is-visit', 'is-frontier', 'is-relax'); cell.classList.add('is-path'); }
        }
      }
    }
    // mark the just-applied cell as the head for a clear "cursor"
    const cur = steps[cursor];
    if (cur?.cell) {
      const cell = this.cells[cur.cell[0]]?.[cur.cell[1]];
      if (cell && !cell.classList.contains('is-path')) cell.classList.add('is-head');
    }
    // keep start/end on top
    this.reassertEndpoints();
  }

  private reassertEndpoints() {
    const s = this.cells[this.state.start[0]]?.[this.state.start[1]];
    const e = this.cells[this.state.end[0]]?.[this.state.end[1]];
    s?.classList.add('is-start');
    e?.classList.add('is-end');
  }
}

// ===========================================================================
// GRAPH — node-link on a fixed weighted layout. Highlights edges & nodes as
// they're considered / added / relaxed.
// ===========================================================================
export class GraphRenderer implements Renderer {
  private host!: HTMLElement;
  private svg!: SVGSVGElement;
  private model!: GraphModel;
  private edgeEls = new Map<string, SVGElement>();
  private nodeEls = new Map<string, SVGElement>();
  private labelEls = new Map<string, SVGElement>();
  private algo = 'prim';

  setAlgo(algo: string) { this.algo = algo; }

  private modelFor(algo: string): GraphModel {
    if (algo === 'toposort') return DAG;
    if (algo === 'bellmanford') return NEGRAPH;
    return UNDIRECTED;
  }

  mount(container: HTMLElement, _state: AppState) {
    this.host = container;
    this.model = this.modelFor(this.algo);
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', class: 'graph' });
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'weighted graph');
    if (this.model.directed) {
      const defs = svgEl('defs');
      const marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' });
      marker.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' }));
      defs.appendChild(marker);
      svg.appendChild(defs);
    }
    this.edgeEls.clear(); this.nodeEls.clear(); this.labelEls.clear();
    const pos = new Map(this.model.nodes.map((n) => [n.id, n]));

    // edges
    const gEdges = svgEl('g', { class: 'edges' });
    for (const e of this.model.edges) {
      const a = pos.get(e.u)!, b = pos.get(e.v)!;
      const line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'edge' });
      if (this.model.directed) {
        // pull the endpoint back so the arrow head sits outside the node circle
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        line.setAttribute('x1', String(a.x + ux * 5));
        line.setAttribute('y1', String(a.y + uy * 5));
        line.setAttribute('x2', String(b.x - ux * 5));
        line.setAttribute('y2', String(b.y - uy * 5));
        line.setAttribute('marker-end', 'url(#arrow)');
      }
      gEdges.appendChild(line);
      this.edgeEls.set(this.edgeKey(e.u, e.v), line);
      // weight label at midpoint, nudged perpendicular
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const wl = svgEl('text', { x: mx + nx * 3.5, y: my + ny * 3.5 + 1, class: 'wlabel', 'text-anchor': 'middle' });
      wl.textContent = String(e.w);
      gEdges.appendChild(wl);
    }
    svg.appendChild(gEdges);

    // nodes
    const gNodes = svgEl('g', { class: 'nodes' });
    for (const n of this.model.nodes) {
      const circ = svgEl('circle', { cx: n.x, cy: n.y, r: 4.6, class: 'node' });
      gNodes.appendChild(circ);
      this.nodeEls.set(n.id, circ);
      const t = svgEl('text', { x: n.x, y: n.y + 1.4, class: 'nlabel', 'text-anchor': 'middle' });
      t.textContent = n.id;
      gNodes.appendChild(t);
      this.labelEls.set(n.id, t);
    }
    svg.appendChild(gNodes);
    container.appendChild(svg);
    this.svg = svg;
  }

  private edgeKey(u: string, v: string) {
    return this.model.directed ? `${u}>${v}` : (u < v ? `${u}|${v}` : `${v}|${u}`);
  }

  render(step: Step | null, cursor: number, steps: Step[]) {
    // reset
    for (const el of this.edgeEls.values()) el.setAttribute('class', this.model.directed ? 'edge' : 'edge');
    for (const el of this.nodeEls.values()) el.setAttribute('class', 'node');
    if (cursor < 0) return;
    // Replay accumulation: tree/order/relaxed edges persist; current highlighted.
    for (let i = 0; i <= cursor; i++) {
      const s = steps[i];
      if ((s.type === 'addEdge' || s.type === 'relax') && s.edge) {
        const el = this.edgeEls.get(this.edgeKey(s.edge[0], s.edge[1]));
        el?.setAttribute('class', 'edge is-tree');
      }
      if ((s.type === 'emit' || s.type === 'ready') && s.node) {
        this.nodeEls.get(s.node)?.setAttribute('class', 'node is-done');
      }
      if ((s.type === 'seed' || s.type === 'addEdge') && s.node) {
        this.nodeEls.get(s.node)?.setAttribute('class', 'node is-in');
      }
    }
    const cur = steps[cursor];
    if (cur?.edge) {
      const el = this.edgeEls.get(this.edgeKey(cur.edge[0], cur.edge[1]));
      const active = cur.type === 'consider' ? 'edge is-consider'
        : cur.type === 'reject' ? 'edge is-reject'
        : cur.type === 'decrement' ? 'edge is-consider'
        : 'edge is-active';
      if (cur.type === 'addEdge' || cur.type === 'relax') el?.setAttribute('class', 'edge is-tree is-active');
      else el?.setAttribute('class', active);
    }
    if (cur?.node) {
      const cls = this.nodeEls.get(cur.node)?.getAttribute('class') ?? 'node';
      this.nodeEls.get(cur.node)?.setAttribute('class', cls + ' is-current');
    }
  }
}

// ===========================================================================
// TREES & GEN — dispatches to BST view, maze view, or union-find view.
// ===========================================================================
export class TreeRenderer implements Renderer {
  private host!: HTMLElement;
  private algo = 'bst-insert';
  private impl: Renderer | null = null;

  setAlgo(algo: string) { this.algo = algo; }

  mount(container: HTMLElement, state: AppState) {
    this.host = container;
    if (this.algo === 'maze') this.impl = new MazeRenderer();
    else if (this.algo === 'unionfind') this.impl = new UnionFindRenderer();
    else this.impl = new BSTRenderer();
    this.impl.mount(container, state);
  }
  render(step: Step | null, cursor: number, steps: Step[]) {
    this.impl?.render(step, cursor, steps);
  }
}

class BSTRenderer implements Renderer {
  private svg!: SVGSVGElement;
  private model!: BSTModel;
  private nodeEls = new Map<number, SVGElement>();
  private edgeEls = new Map<string, SVGElement>();

  mount(container: HTMLElement, _state: AppState) {
    this.model = buildBST(BST_VALUES);
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', class: 'graph tree' });
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'binary search tree');
    const gE = svgEl('g', { class: 'edges' });
    for (const n of this.model.nodes) {
      for (const childId of [n.left, n.right]) {
        if (childId === null) continue;
        const c = this.model.nodes[childId];
        const line = svgEl('line', { x1: n.x, y1: n.y, x2: c.x, y2: c.y, class: 'edge' });
        gE.appendChild(line);
        this.edgeEls.set(`${n.id}>${childId}`, line);
      }
    }
    svg.appendChild(gE);
    const gN = svgEl('g', { class: 'nodes' });
    for (const n of this.model.nodes) {
      const circ = svgEl('circle', { cx: n.x, cy: n.y, r: 4.2, class: 'node' });
      gN.appendChild(circ);
      this.nodeEls.set(n.id, circ);
      const t = svgEl('text', { x: n.x, y: n.y + 1.4, class: 'nlabel', 'text-anchor': 'middle' });
      t.textContent = String(n.value);
      gN.appendChild(t);
    }
    svg.appendChild(gN);
    container.appendChild(svg);
    this.svg = svg;
  }

  render(step: Step | null, cursor: number, steps: Step[]) {
    for (const el of this.nodeEls.values()) el.setAttribute('class', 'node is-hidden');
    for (const el of this.edgeEls.values()) el.setAttribute('class', 'edge is-hidden');
    if (cursor < 0) {
      // For traversals the tree is already built — show all; for insert, hide.
      if (!steps.some((s) => s.type === 'place')) {
        for (const el of this.nodeEls.values()) el.setAttribute('class', 'node');
        for (const el of this.edgeEls.values()) el.setAttribute('class', 'edge');
      }
      return;
    }
    const isInsert = steps.some((s) => s.type === 'place');
    if (!isInsert) { for (const el of this.nodeEls.values()) el.setAttribute('class', 'node'); for (const el of this.edgeEls.values()) el.setAttribute('class', 'edge'); }

    const present = new Set<number>();
    const visited = new Set<number>();
    for (let i = 0; i <= cursor; i++) {
      const s = steps[i];
      if (s.type === 'place' && s.node !== undefined) {
        present.add(Number(s.node));
        if (s.edge) this.edgeEls.get(`${s.edge[0]}>${s.edge[1]}`)?.setAttribute('class', 'edge');
      }
      if (s.type === 'visit' && s.node !== undefined) visited.add(Number(s.node));
    }
    if (isInsert) for (const id of present) this.nodeEls.get(id)?.setAttribute('class', 'node');
    for (const id of visited) {
      const el = this.nodeEls.get(id);
      if (el) el.setAttribute('class', 'node is-done');
    }
    const cur = steps[cursor];
    if (cur?.node !== undefined && cur.node !== null) {
      const id = Number(cur.node);
      const el = this.nodeEls.get(id);
      if (el) {
        const active = cur.type === 'compare' || cur.type === 'enter' ? 'node is-current'
          : cur.type === 'key' ? 'node is-key'
          : el.getAttribute('class') + ' is-current';
        el.setAttribute('class', active);
      }
    }
  }
}

class MazeRenderer implements Renderer {
  private grid!: HTMLElement;
  private cells: HTMLElement[][] = [];
  private rows = 0; private cols = 0;

  mount(container: HTMLElement, _state: AppState) {
    // dimensions come from the maze step list on first render; default guess.
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid maze';
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', 'maze being carved');
    container.appendChild(grid);
    this.grid = grid;
  }

  private build(rows: number, cols: number) {
    this.rows = rows; this.cols = cols;
    this.grid.style.setProperty('--cols', String(cols));
    this.grid.style.setProperty('--rows', String(rows));
    this.grid.innerHTML = '';
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      const row: HTMLElement[] = [];
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'gc is-wall';
        this.grid.appendChild(cell);
        row.push(cell);
      }
      this.cells.push(row);
    }
  }

  render(_step: Step | null, cursor: number, steps: Step[]) {
    // infer dims: max r/c across all cell steps
    if (this.rows === 0) {
      let mr = 0, mc = 0;
      for (const s of steps) if (s.cell) { mr = Math.max(mr, s.cell[0]); mc = Math.max(mc, s.cell[1]); }
      this.build(mr + 1, mc + 1);
    }
    for (const row of this.cells) for (const cell of row) cell.className = 'gc is-wall';
    if (cursor < 0) return;
    for (let i = 0; i <= cursor; i++) {
      const s = steps[i];
      if (s.type === 'carve' && s.cell) {
        const cell = this.cells[s.cell[0]]?.[s.cell[1]];
        if (cell) cell.className = 'gc is-open';
      }
    }
    const cur = steps[cursor];
    if (cur?.cell) {
      const cell = this.cells[cur.cell[0]]?.[cur.cell[1]];
      if (cell) cell.classList.add(cur.type === 'backtrack' ? 'is-back' : 'is-head');
    }
  }
}

class UnionFindRenderer implements Renderer {
  private svg!: SVGSVGElement;
  private nodeEls = new Map<string, SVGElement>();
  private edgeLayer!: SVGElement;
  private pos = new Map<string, { x: number; y: number }>();

  mount(container: HTMLElement, _state: AppState) {
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: '0 0 100 60', preserveAspectRatio: 'xMidYMid meet', class: 'graph uf' });
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'union-find forest');
    // lay 8 elements across the bottom as roots initially
    const n = UF_ELEMENTS.length;
    UF_ELEMENTS.forEach((id, i) => {
      const x = 8 + (i / (n - 1)) * 84;
      this.pos.set(id, { x, y: 48 });
    });
    this.edgeLayer = svgEl('g', { class: 'edges' });
    svg.appendChild(this.edgeLayer);
    const gN = svgEl('g', { class: 'nodes' });
    for (const id of UF_ELEMENTS) {
      const p = this.pos.get(id)!;
      const circ = svgEl('circle', { cx: p.x, cy: p.y, r: 4.4, class: 'node' });
      gN.appendChild(circ);
      this.nodeEls.set(id, circ);
      const t = svgEl('text', { x: p.x, y: p.y + 1.4, class: 'nlabel', 'text-anchor': 'middle' });
      t.textContent = id;
      gN.appendChild(t);
    }
    svg.appendChild(gN);
    container.appendChild(svg);
    this.svg = svg;
  }

  render(_step: Step | null, cursor: number, steps: Step[]) {
    // Rebuild parent forest from parentOf events up to cursor.
    const parent = new Map<string, string>();
    for (const id of UF_ELEMENTS) parent.set(id, id);
    const highlight = new Set<string>();
    let activeChild: string | null = null;
    for (let i = 0; i <= cursor && i < steps.length; i++) {
      const s = steps[i];
      if ((s.type === 'link' || s.type === 'compress') && s.parentOf) {
        parent.set(s.parentOf[0], s.parentOf[1]);
      }
    }
    const cur = cursor >= 0 ? steps[cursor] : null;
    if (cur?.parentOf) { activeChild = cur.parentOf[0]; highlight.add(cur.parentOf[0]); highlight.add(cur.parentOf[1]); }
    if (cur?.node) highlight.add(cur.node);

    // depth of each node = chain length to root
    const depth = (id: string): number => {
      let d = 0, x = id, guard = 0;
      while (parent.get(x) !== x && guard++ < 64) { x = parent.get(x)!; d++; }
      return d;
    };
    // reposition by (root group, depth). Group roots along x; children stack up.
    const roots = UF_ELEMENTS.filter((id) => parent.get(id) === id);
    const groupX = new Map<string, number>();
    roots.forEach((r, i) => groupX.set(r, roots.length > 1 ? 10 + (i / (roots.length - 1)) * 80 : 50));
    const rootOf = (id: string): string => { let x = id, g = 0; while (parent.get(x) !== x && g++ < 64) x = parent.get(x)!; return x; };

    for (const id of UF_ELEMENTS) {
      const p = this.pos.get(id)!;
      p.x = groupX.get(rootOf(id))!;
      p.y = 50 - depth(id) * 11;
    }
    // draw edges child->parent
    this.edgeLayer.innerHTML = '';
    for (const id of UF_ELEMENTS) {
      const par = parent.get(id)!;
      if (par === id) continue;
      const a = this.pos.get(id)!, b = this.pos.get(par)!;
      const line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'edge' + (activeChild === id ? ' is-active' : ' is-tree') });
      this.edgeLayer.appendChild(line);
    }
    for (const [id, el] of this.nodeEls) {
      const p = this.pos.get(id)!;
      el.setAttribute('cx', String(p.x));
      el.setAttribute('cy', String(p.y));
      el.setAttribute('class', 'node' + (highlight.has(id) ? ' is-current' : (parent.get(id) === id ? ' is-in' : '')));
      const label = el.nextSibling as SVGElement | null;
      if (label && label.tagName === 'text') { label.setAttribute('x', String(p.x)); label.setAttribute('y', String(p.y + 1.4)); }
    }
  }
}
