/**
 * Turn a rhythm you hummed, clapped or tapped into a custom strum pattern.
 * Finds the hits, snaps them to the beat grid of one bar, reads loud/soft from
 * how strong each hit is, and guesses the stroke direction from where it falls
 * (on the beat = down, between beats = up), the way strumming hands do.
 */
import { onsetEnvelope } from '../dsp/analyze';
import { newId } from '../util/id';
import type { CustomStrum, StrumStep } from './strums';

export interface Onset {
  /** seconds */
  time: number;
  /** 0..1, relative to the strongest hit */
  strength: number;
}

export interface StrumGuess {
  strum: CustomStrum;
  /** 0..1: how well the hits sat on the grid */
  confidence: number;
  /** bars of material that were folded into the one-bar pattern */
  bars: number;
  hits: number;
}

/** Peaks of an onset envelope: loud enough, and not too close together. */
export function pickOnsets(env: Float32Array, rate: number, opts: { minGap?: number; floor?: number } = {}): Onset[] {
  const gap = Math.max(1, Math.round((opts.minGap ?? 0.08) * rate));
  let max = 0;
  for (const v of env) if (v > max) max = v;
  if (max <= 0) return [];
  const floor = (opts.floor ?? 0.18) * max;
  const peaks: { i: number; v: number }[] = [];
  for (let i = 1; i < env.length - 1; i++) {
    const v = env[i];
    if (v < floor || v < env[i - 1] || v < env[i + 1]) continue;
    let top = true;
    for (let j = Math.max(0, i - gap); j <= Math.min(env.length - 1, i + gap); j++) if (env[j] > v) top = false;
    if (top) peaks.push({ i, v });
  }
  // plateaus produce neighbours of equal height: keep the first of each cluster
  const out: Onset[] = [];
  let last = -1e9;
  for (const p of peaks) {
    if (p.i - last < gap) continue;
    out.push({ time: p.i / rate, strength: p.v / max });
    last = p.i;
  }
  return out;
}

export interface FromOnsetsOptions {
  bpm: number;
  /** beats per bar; strums are written for 4 */
  beats?: number;
  resolution?: 'eighth' | 'sixteenth';
  /** time of beat 1; defaults to the first hit */
  origin?: number;
  name?: string;
}

const softCut = 0.6;

export function strumFromOnsets(onsets: Onset[], o: FromOnsetsOptions): StrumGuess | null {
  const hits = onsets.filter((x) => x.strength > 0.12).sort((a, b) => a.time - b.time);
  if (hits.length < 2 || !(o.bpm > 20)) return null;
  const beat = 60 / o.bpm;
  const beats = o.beats ?? 4;
  const origin = o.origin ?? hits[0].time;

  const fit = (perBeat: number) => {
    const stepDur = beat / perBeat;
    let err = 0;
    for (const h of hits) {
      const pos = (h.time - origin) / stepDur;
      err += Math.abs(pos - Math.round(pos)) * stepDur;
    }
    return err / hits.length;
  };
  // eighths unless hits keep landing between them
  const res = o.resolution ?? (fit(2) > 0.12 * (beat / 2) ? 'sixteenth' : 'eighth');
  const perBeat = res === 'eighth' ? 2 : 4;
  const stepDur = beat / perBeat;
  const perBar = beats * perBeat;

  const votes = new Array<number>(perBar).fill(0);
  const strengthSum = new Array<number>(perBar).fill(0);
  const barsSeen = new Set<number>();
  let near = 0;
  for (const h of hits) {
    const pos = (h.time - origin) / stepDur;
    const idx = Math.round(pos);
    if (idx < 0) continue;
    if (Math.abs(pos - idx) < 0.3) near++;
    const bar = Math.floor(idx / perBar);
    const step = idx % perBar;
    // two hits on the same step of the same bar count once
    const key = bar * 1000 + step;
    if (barsSeen.has(key)) continue;
    barsSeen.add(key);
    votes[step]++;
    strengthSum[step] += h.strength;
  }
  const lastIdx = Math.max(...hits.map((h) => Math.round((h.time - origin) / stepDur)));
  const bars = Math.max(1, Math.ceil((lastIdx + 1) / perBar));
  const need = Math.ceil(bars / 2);
  const steps: StrumStep[] = new Array(perBar).fill('-');
  let kept = 0;
  for (let s = 0; s < perBar; s++) {
    if (votes[s] < need) continue;
    kept++;
    const soft = strengthSum[s] / votes[s] < softCut;
    const onBeat = s % perBeat === 0;
    const down = onBeat; // on the beat: down; everything else: up
    steps[s] = down ? (soft ? 'd' : 'D') : soft ? 'u' : 'U';
  }
  if (kept < 1) return null;
  const strum: CustomStrum = { id: newId(), name: o.name ?? 'Hummed strum', resolution: res, steps, spread: 'normal' };
  return { strum, confidence: near / hits.length, bars, hits: hits.length };
}

/** From a recording of a hummed, clapped or tapped rhythm. */
export function strumFromAudio(samples: Float32Array, sampleRate: number, o: FromOnsetsOptions): StrumGuess | null {
  const { env, rate } = onsetEnvelope(samples, sampleRate);
  const onsets = pickOnsets(env, rate);
  // the envelope is log-compressed, so read loud/soft from the waveform itself
  const peaks = onsets.map((on) => {
    const from = Math.max(0, Math.floor((on.time - 0.04) * sampleRate));
    const to = Math.min(samples.length, Math.ceil((on.time + 0.12) * sampleRate));
    let m = 0;
    for (let i = from; i < to; i++) m = Math.max(m, Math.abs(samples[i]));
    return m;
  });
  const top = Math.max(1e-9, ...peaks);
  return strumFromOnsets(
    onsets.map((on, i) => ({ time: on.time, strength: peaks[i] / top })),
    o
  );
}

/** From taps on the screen (milliseconds), with an optional count-in so beat 1 is known. */
export function strumFromTaps(tapsMs: number[], o: FromOnsetsOptions & { countInBeats?: number; startMs?: number }): StrumGuess | null {
  const origin = o.startMs !== undefined ? (o.startMs + (o.countInBeats ?? 0) * (60000 / o.bpm)) / 1000 : undefined;
  return strumFromOnsets(
    tapsMs.map((t) => ({ time: t / 1000, strength: 1 })),
    { ...o, origin }
  );
}
