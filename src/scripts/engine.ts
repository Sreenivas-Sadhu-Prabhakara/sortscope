import type { Step } from '../lib/types';
import { EMPTY_STATS, type Stats } from '../lib/types';

// The single playback engine. It owns the step cursor and drives whatever
// renderer + stat sink the host wires in. Every category uses this exact
// engine, so Play / Pause / Step / Reset / speed behave identically and every
// run is deterministic and replayable.

export interface EngineHost {
  /** Draw the state produced by applying steps 0..cursor (inclusive). */
  render: (step: Step | null, cursor: number, steps: Step[]) => void;
  /** Push the accumulated stats to the readout. */
  onStats: (stats: Stats) => void;
  /** Fired whenever cursor / play-state changes so the transport can refresh. */
  onTransport: (state: TransportState) => void;
}

export interface TransportState {
  cursor: number;
  total: number;
  playing: boolean;
  atStart: boolean;
  atEnd: boolean;
  line: number;
  caption: string;
}

// Steps-per-second at speed multiplier 1. The slider scales this.
const BASE_SPS = 14;

export class Engine {
  private steps: Step[] = [];
  private cursor = -1;           // index of the last-applied step (-1 = nothing)
  private playing = false;
  private speed = 1;
  private timer: number | null = null;
  private stats: Stats = { ...EMPTY_STATS };
  private reduced = false;

  constructor(private host: EngineHost) {
    this.reduced =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Load a fresh step list and render the initial frame. */
  load(steps: Step[]) {
    this.pause();
    this.steps = steps;
    this.cursor = -1;
    this.recomputeStats();
    this.host.render(this.currentStep(), this.cursor, this.steps);
    this.emitTransport();
    this.host.onStats(this.stats);
  }

  setSpeed(mult: number) {
    this.speed = mult;
    if (this.playing) { this.pause(); this.play(); }
  }

  get isReduced() { return this.reduced; }

  play() {
    if (this.playing || this.cursor >= this.steps.length - 1) return;
    // Reduced motion: jump to the end instead of animating.
    if (this.reduced) { this.end(); return; }
    this.playing = true;
    const interval = 1000 / (BASE_SPS * this.speed);
    this.timer = setInterval(() => {
      if (!this.stepForward()) this.pause();
    }, interval) as unknown as number;
    this.emitTransport();
  }

  pause() {
    this.playing = false;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.emitTransport();
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  /** Advance one step; returns false at the end. */
  stepForward(): boolean {
    if (this.cursor >= this.steps.length - 1) return false;
    this.cursor++;
    this.applyDelta(this.steps[this.cursor], +1);
    this.host.render(this.currentStep(), this.cursor, this.steps);
    this.host.onStats(this.stats);
    this.emitTransport();
    return true;
  }

  /** Go back one step. */
  stepBack(): boolean {
    if (this.cursor < 0) return false;
    this.applyDelta(this.steps[this.cursor], -1);
    this.cursor--;
    this.host.render(this.currentStep(), this.cursor, this.steps);
    this.host.onStats(this.stats);
    this.emitTransport();
    return true;
  }

  /** Reset to the pre-first-step frame. */
  reset() {
    this.pause();
    this.cursor = -1;
    this.stats = { ...EMPTY_STATS };
    this.host.render(this.currentStep(), this.cursor, this.steps);
    this.host.onStats(this.stats);
    this.emitTransport();
  }

  /** Jump to the last step (final result). */
  end() {
    this.pause();
    while (this.cursor < this.steps.length - 1) {
      this.cursor++;
      this.applyDelta(this.steps[this.cursor], +1);
    }
    this.host.render(this.currentStep(), this.cursor, this.steps);
    this.host.onStats(this.stats);
    this.emitTransport();
  }

  /** Seek to an absolute cursor (used by the scrubber). */
  seek(target: number) {
    this.pause();
    target = Math.max(-1, Math.min(this.steps.length - 1, target));
    while (this.cursor < target) { this.cursor++; this.applyDelta(this.steps[this.cursor], +1); }
    while (this.cursor > target) { this.applyDelta(this.steps[this.cursor], -1); this.cursor--; }
    this.host.render(this.currentStep(), this.cursor, this.steps);
    this.host.onStats(this.stats);
    this.emitTransport();
  }

  private currentStep(): Step | null {
    return this.cursor >= 0 ? this.steps[this.cursor] : null;
  }

  private applyDelta(step: Step, sign: 1 | -1) {
    if (!step.delta) return;
    for (const k in step.delta) {
      const key = k as keyof Stats;
      this.stats[key] += sign * (step.delta[key] ?? 0);
    }
  }

  private recomputeStats() {
    this.stats = { ...EMPTY_STATS };
  }

  private emitTransport() {
    const step = this.currentStep();
    this.host.onTransport({
      cursor: this.cursor,
      total: this.steps.length,
      playing: this.playing,
      atStart: this.cursor < 0,
      atEnd: this.cursor >= this.steps.length - 1,
      line: step ? step.line : 0,
      caption: step ? step.caption : 'Ready — press Play or Step',
    });
  }
}
