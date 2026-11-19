/**
 * Practice loop: play a few bars over and over, starting slow and stepping
 * the tempo up until it reaches the song's own tempo.
 */
import type { ChordBar } from '../model';

export interface RampPlan {
  /** first tempo, bpm */
  start: number;
  /** the tempo to reach, bpm */
  target: number;
  /** bpm added after each group of passes */
  step: number;
  /** how many times to play at each tempo before stepping up */
  passesPerStep: number;
  /** extra passes at the target tempo (0 = stop on arrival) */
  hold: number;
}

export const MIN_BPM = 30;
export const MAX_BPM = 300;

export function defaultPlan(target: number): RampPlan {
  const t = clamp(Math.round(target), MIN_BPM, MAX_BPM);
  return { start: Math.max(MIN_BPM, Math.round(t * 0.6)), target: t, step: Math.max(2, Math.round(t * 0.05)), passesPerStep: 2, hold: 2 };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Keep a plan sane: ordered tempos, whole numbers, at least one pass. */
export function cleanPlan(p: RampPlan): RampPlan {
  const target = clamp(Math.round(p.target), MIN_BPM, MAX_BPM);
  return {
    target,
    start: clamp(Math.round(p.start), MIN_BPM, target),
    step: Math.max(1, Math.round(p.step) || 1),
    passesPerStep: clamp(Math.round(p.passesPerStep) || 1, 1, 16),
    hold: clamp(Math.round(p.hold) || 0, 0, 32),
  };
}

/** The tempo of every pass, in order. */
export function rampTempos(plan: RampPlan): number[] {
  const p = cleanPlan(plan);
  const out: number[] = [];
  for (let t = p.start; ; t += p.step) {
    const tempo = Math.min(t, p.target);
    for (let k = 0; k < p.passesPerStep; k++) out.push(tempo);
    if (tempo >= p.target) break;
  }
  // the loop above already played the target passesPerStep times; add the hold passes on top
  for (let k = 0; k < p.hold; k++) out.push(p.target);
  return out;
}

export function describePlan(plan: RampPlan): string {
  const p = cleanPlan(plan);
  const passes = rampTempos(p).length;
  return p.start >= p.target ? `${p.target} bpm, ${passes} passes` : `${p.start} to ${p.target} bpm, ${passes} passes`;
}

/** Bars from..to (1-based, inclusive), clamped to what exists. Empty if the range misses the section. */
export function sliceBars(bars: ChordBar[], from: number, to: number): ChordBar[] {
  const a = Math.max(1, Math.floor(from));
  const b = Math.min(bars.length, Math.floor(to));
  return b < a ? [] : bars.slice(a - 1, b);
}
