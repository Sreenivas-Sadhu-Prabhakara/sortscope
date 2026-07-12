import type { Step, Stats, AlgoMeta, CategoryId } from '../lib/types';
import {
  ALL_META, META_BY_ID, metaForCategory, CATEGORIES, DEFAULT_ALGO,
  SORTERS, FINDERS, GRAPH_RUNNERS, SEARCHERS,
  BST_RUNNERS, BST_VALUES, buildBST, generateMaze, runUnionFind,
} from '../lib/registry';
import { seededArray } from '../lib/rng';
import type { Grid } from '../lib/algorithms/pathfinding';
import { Engine } from './engine';
import { readHash, writeHash, defaultState, type AppState } from './state';
import {
  SortRenderer, SearchRenderer, GridRenderer, GraphRenderer, TreeRenderer,
  type Renderer,
} from './renderers';

// ---------------------------------------------------------------------------
// App orchestrator. Builds the input for the current algorithm, generates its
// step list, and hands it to the one shared engine. Wires transport buttons,
// pseudocode sync, stats readout, category/algorithm pickers, and URL hash.
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));

let state: AppState = defaultState();
let renderer: Renderer | null = null;
let currentSteps: Step[] = [];

const surface = $('#surface');
const pseudoList = $('#pseudocode');
const statusLine = $('#statusline');
const complexityBox = $('#complexity');
const algoName = $('#algo-name');
const algoBlurb = $('#algo-blurb');
const algoNotes = $('#algo-notes');

// Stat readouts keyed by Stats field.
const statEls: Partial<Record<keyof Stats, HTMLElement>> = {};
for (const el of $$('.stat[data-stat]')) statEls[el.dataset.stat as keyof Stats] = el.querySelector('.stat-v')!;

const engine = new Engine({
  render: (step, cursor, steps) => renderer?.render(step, cursor, steps),
  onStats: (stats) => paintStats(stats),
  onTransport: (t) => {
    highlightLine(t.line);
    statusLine.textContent = t.caption;
    scrub.value = String(t.cursor + 1);
    scrub.max = String(Math.max(1, t.total));
    stepCount.textContent = `${t.cursor + 1} / ${t.total}`;
    playBtn.setAttribute('aria-pressed', String(t.playing));
    playBtn.querySelector('.pf-label')!.textContent = t.playing ? 'Pause' : 'Play';
    playBtn.classList.toggle('is-playing', t.playing);
    backBtn.disabled = t.atStart;
    resetBtn.disabled = t.atStart && !t.playing;
    fwdBtn.disabled = t.atEnd;
    endBtn.disabled = t.atEnd;
  },
});

// transport elements
const playBtn = $<HTMLButtonElement>('#t-play');
const fwdBtn = $<HTMLButtonElement>('#t-fwd');
const backBtn = $<HTMLButtonElement>('#t-back');
const resetBtn = $<HTMLButtonElement>('#t-reset');
const endBtn = $<HTMLButtonElement>('#t-end');
const scrub = $<HTMLInputElement>('#t-scrub');
const speed = $<HTMLInputElement>('#t-speed');
const speedLabel = $('#speed-label');
const stepCount = $('#t-count');

function paintStats(stats: Stats) {
  for (const k in statEls) {
    const key = k as keyof Stats;
    const el = statEls[key];
    if (el) el.textContent = String(stats[key]);
  }
}

// ---- pseudocode -----------------------------------------------------------
function loadPseudocode(meta: AlgoMeta) {
  pseudoList.innerHTML = '';
  meta.pseudocode.forEach((line, i) => {
    const li = document.createElement('li');
    li.dataset.line = String(i + 1);
    const num = document.createElement('span');
    num.className = 'ln';
    num.textContent = String(i + 1).padStart(2, ' ');
    const code = document.createElement('code');
    code.textContent = line || ' ';
    li.append(num, code);
    if (line.trim().startsWith('#')) li.classList.add('is-comment');
    pseudoList.appendChild(li);
  });
}
function highlightLine(line: number) {
  for (const li of $$('#pseudocode li')) {
    li.classList.toggle('is-active', Number(li.dataset.line) === line);
  }
}

// ---- complexity table -----------------------------------------------------
function loadComplexity(meta: AlgoMeta) {
  algoName.textContent = meta.name;
  algoBlurb.textContent = meta.blurb;
  algoNotes.textContent = meta.notes;
  const stable = meta.stable === true ? 'Stable' : meta.stable === false ? 'Not stable' : '—';
  complexityBox.innerHTML = `
    <div class="cx"><dt>Best</dt><dd>${meta.timeBest}</dd></div>
    <div class="cx"><dt>Average</dt><dd>${meta.timeAvg}</dd></div>
    <div class="cx"><dt>Worst</dt><dd>${meta.timeWorst}</dd></div>
    <div class="cx"><dt>Space</dt><dd>${meta.space}</dd></div>
    <div class="cx"><dt>Stability</dt><dd>${stable}</dd></div>`;
}

// ---- input builders + step generation -------------------------------------
function buildGrid(): Grid {
  return {
    rows: state.gridRows,
    cols: state.gridCols,
    start: state.start,
    end: state.end,
    walls: new Set(state.walls),
    weights: new Map([...state.weights].map((k) => [k, 8])), // weighted cells cost +8
  };
}

function generate(): Step[] {
  const meta = META_BY_ID[state.algo];
  switch (meta.category) {
    case 'sorting': {
      const arr = seededArray(state.n, state.seed);
      return SORTERS[state.algo](arr);
    }
    case 'searching': {
      const arr = seededArray(state.n, state.seed);
      if (state.algo === 'binary') arr.sort((a, b) => a - b);
      // pick a target that is actually a valid, reproducible value (present or near)
      const target = ((state.target - 1) % state.n) + 1; // always in 1..n → found
      return SEARCHERS[state.algo](arr, target);
    }
    case 'pathfinding':
      return FINDERS[state.algo](buildGrid());
    case 'graph':
      return GRAPH_RUNNERS[state.algo]();
    case 'trees': {
      if (state.algo === 'maze') return generateMaze(21, 31, state.seed).steps;
      if (state.algo === 'unionfind') return runUnionFind().steps;
      const model = buildBST(BST_VALUES);
      return BST_RUNNERS[state.algo](model);
    }
  }
}

// ---- mount the right renderer for the category ----------------------------
function mountRenderer() {
  const cat = state.category;
  if (cat === 'sorting') renderer = new SortRenderer();
  else if (cat === 'searching') renderer = new SearchRenderer();
  else if (cat === 'pathfinding') {
    const g = new GridRenderer();
    g.setInteraction({
      onWallToggle: (r, c, on) => {
        const k = `${r},${c}`;
        if (weightMode) {
          // weight-painting mode: toggle a costly cell instead of a wall
          if (on) { state.weights.add(k); state.walls.delete(k); }
          else state.weights.delete(k);
        } else {
          if (on) { state.walls.add(k); state.weights.delete(k); }
          else state.walls.delete(k);
        }
        (renderer as GridRenderer).paintBase();
        regenerate(true);
      },
      onMoveStart: (r, c) => { state.start = [r, c]; regenerate(true); },
      onMoveEnd: (r, c) => { state.end = [r, c]; regenerate(true); },
    });
    renderer = g;
  } else if (cat === 'graph') {
    const g = new GraphRenderer();
    g.setAlgo(state.algo);
    renderer = g;
  } else {
    const t = new TreeRenderer();
    t.setAlgo(state.algo);
    renderer = t;
  }
  surface.dataset.cat = cat;
  renderer.mount(surface, state);
}

// Regenerate steps (e.g. after a wall edit or new seed). `keepFrame` re-mounts
// the surface only when needed and preserves interactive grids in place.
function regenerate(inPlace = false) {
  currentSteps = generate();
  if (!inPlace) mountRenderer();
  engine.load(currentSteps);
  writeHash(state);
}

// ---- full switch to a new algorithm ---------------------------------------
function selectAlgo(id: string, pushHistory = false) {
  const meta = META_BY_ID[id];
  if (!meta) return;
  state.algo = id;
  state.category = meta.category;
  loadPseudocode(meta);
  loadComplexity(meta);
  syncControlsVisibility();
  syncPickers();
  mountRenderer();
  currentSteps = generate();
  engine.load(currentSteps);
  writeHash(state, !pushHistory);
}

// ---- category + algorithm pickers -----------------------------------------
function buildPickers() {
  const catBar = $('#categories');
  catBar.innerHTML = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.type = 'button';
    btn.dataset.cat = cat.id;
    btn.setAttribute('role', 'tab');
    btn.innerHTML = `<span class="cat-label">${cat.label}</span><span class="cat-tag">${cat.tagline}</span>`;
    btn.addEventListener('click', () => {
      const first = DEFAULT_ALGO[cat.id];
      selectAlgo(first);
    });
    catBar.appendChild(btn);
  }
}

function syncPickers() {
  for (const b of $$('.cat-btn')) {
    const on = b.dataset.cat === state.category;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  }
  // algorithm picker for the active category
  const picker = $('#algo-picker');
  picker.innerHTML = '';
  for (const m of metaForCategory(state.category)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'algo-btn' + (m.id === state.algo ? ' is-active' : '');
    btn.dataset.algo = m.id;
    btn.textContent = m.name;
    btn.setAttribute('aria-pressed', String(m.id === state.algo));
    btn.addEventListener('click', () => selectAlgo(m.id));
    picker.appendChild(btn);
  }
}

// ---- show only the controls relevant to the active category ---------------
function syncControlsVisibility() {
  const cat = state.category;
  $('#ctl-array').hidden = !(cat === 'sorting' || cat === 'searching');
  $('#ctl-target').hidden = cat !== 'searching';
  $('#ctl-grid').hidden = cat !== 'pathfinding';
  $('#ctl-maze').hidden = !(cat === 'trees' && (state.algo === 'maze'));
  $('#ctl-seed-note').hidden = !(cat === 'sorting' || cat === 'searching' || (cat === 'trees' && state.algo === 'maze'));
}

// ---- wire the static controls ---------------------------------------------
function wireControls() {
  // transport
  playBtn.addEventListener('click', () => engine.toggle());
  fwdBtn.addEventListener('click', () => { engine.pause(); engine.stepForward(); });
  backBtn.addEventListener('click', () => engine.stepBack());
  resetBtn.addEventListener('click', () => engine.reset());
  endBtn.addEventListener('click', () => engine.end());
  scrub.addEventListener('input', () => engine.seek(Number(scrub.value) - 1));
  speed.addEventListener('input', () => {
    const mult = Number(speed.value);
    engine.setSpeed(mult);
    speedLabel.textContent = `${mult.toFixed(mult < 1 ? 2 : 1)}×`;
  });

  // array size + seed
  const sizeInput = $<HTMLInputElement>('#in-size');
  const seedInput = $<HTMLInputElement>('#in-seed');
  sizeInput.addEventListener('change', () => {
    state.n = Math.max(5, Math.min(120, Number(sizeInput.value) || state.n));
    sizeInput.value = String(state.n);
    regenerate();
  });
  seedInput.addEventListener('change', () => {
    state.seed = Number(seedInput.value) >>> 0;
    regenerate();
  });
  $('#in-shuffle').addEventListener('click', () => {
    state.seed = (Math.floor(Math.random() * 0xffffffff)) >>> 0;
    seedInput.value = String(state.seed);
    regenerate();
  });

  // search target
  const targetInput = $<HTMLInputElement>('#in-target');
  targetInput.addEventListener('change', () => {
    state.target = Math.max(1, Math.min(999, Number(targetInput.value) || 1));
    targetInput.value = String(state.target);
    regenerate();
  });

  // grid
  $('#in-clear').addEventListener('click', () => {
    state.walls.clear(); state.weights.clear();
    regenerate();
  });
  $('#in-maze-fill').addEventListener('click', () => {
    // generate a maze and stamp its walls onto the pathfinding grid
    const m = generateMaze(state.gridRows | 1, state.gridCols | 1, (state.seed = (Math.random() * 1e9) | 0));
    state.walls = new Set(m.walls.filter((k) => {
      const [r, c] = k.split(',').map(Number);
      return r < state.gridRows && c < state.gridCols;
    }));
    state.walls.delete(state.start.join(','));
    state.walls.delete(state.end.join(','));
    regenerate();
  });
  $('#in-weight-mode').addEventListener('change', (e) => {
    weightMode = (e.target as HTMLInputElement).checked;
  });

  // maze seed reshuffle (trees category)
  $('#in-maze-new').addEventListener('click', () => {
    state.seed = (Math.random() * 1e9) | 0;
    regenerate();
  });

  // copy share link
  $('#in-share').addEventListener('click', async () => {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); flash('#in-share', 'Copied!'); }
    catch { flash('#in-share', location.hash); }
  });

  // keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') { e.preventDefault(); engine.toggle(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); engine.pause(); engine.stepForward(); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); engine.stepBack(); }
    else if (e.key === 'r' || e.key === 'R') engine.reset();
  });

  // react to back/forward navigation
  window.addEventListener('hashchange', () => {
    const next = readHash();
    if (next.algo !== state.algo || gridChanged(next)) {
      state = next;
      selectAlgo(state.algo);
      syncInputs();
    }
  });
}

let weightMode = false;

function gridChanged(next: AppState): boolean {
  return next.walls.size !== state.walls.size ||
    next.start.join() !== state.start.join() ||
    next.end.join() !== state.end.join();
}

function syncInputs() {
  ($('#in-size') as HTMLInputElement).value = String(state.n);
  ($('#in-seed') as HTMLInputElement).value = String(state.seed);
  ($('#in-target') as HTMLInputElement).value = String(state.target);
}

function flash(sel: string, msg: string) {
  const el = $(sel);
  const prev = el.textContent;
  el.textContent = msg;
  setTimeout(() => { el.textContent = prev; }, 1200);
}

// ---- boot -----------------------------------------------------------------
function boot() {
  state = readHash();
  buildPickers();
  wireControls();
  syncInputs();
  const initSpeed = Number(speed.value);
  engine.setSpeed(initSpeed);
  speedLabel.textContent = `${initSpeed.toFixed(initSpeed < 1 ? 2 : 1)}×`;
  selectAlgo(state.algo);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
