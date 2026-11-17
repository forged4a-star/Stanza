import { describe, expect, it } from 'vitest';
import { noteEnds, planChunks, renderChunk, RELEASE, peak, type MixNote } from './mixdown';
import { buildSchedule } from './patterns';
import { renderNote, type Instrument } from './synth';

const SR = 48000;
const cache = new Map<string, Float32Array>();
const sample = (inst: Instrument, midi: number) => {
  const k = `${inst}:${midi}`;
  let b = cache.get(k);
  if (!b) {
    b = renderNote(inst, midi, 2, SR);
    const p = peak(b) || 1;
    for (let i = 0; i < b.length; i++) b[i] /= p;
    cache.set(k, b);
  }
  return b;
};
const constant = () => new Float32Array(2 * SR).fill(1); // a "sound" that never fades by itself
const opts = { sampleRate: SR, sample };

/** add chunk buffers on one timeline, as the player does */
function overlay(parts: { at: number; data: Float32Array }[], len: number) {
  const out = new Float32Array(len);
  for (const p of parts) {
    const off = Math.round(p.at * SR);
    for (let i = 0; i < p.data.length && off + i < len; i++) out[off + i] += p.data[i];
  }
  return out;
}

function song(chords: string[], pattern = 'strum-folk', inst: Instrument = 'acoustic') {
  const s = buildSchedule(chords.map((c) => ({ chords: [c] })), { bpm: 100, timeSig: [4, 4], pattern, instrument: inst, metronome: true });
  const notes: MixNote[] = s.notes.map((e) => ({ time: e.time, midi: e.midi, gain: e.vel, dur: e.dur, inst })).sort((a, b) => a.time - b.time);
  return { s, notes };
}

describe('planning chunks', () => {
  it('chunks start on bar lines and are at least the minimum length', () => {
    const bars = [0, 2, 4, 6, 8, 10, 12, 14];
    const c = planChunks(bars, 16, 4);
    expect(c.map((x) => [x.start, x.end])).toEqual([[0, 4], [4, 8], [8, 12], [12, 16]]);
  });
  it('a short tail joins the chunk before it, and odd inputs still give one chunk', () => {
    expect(planChunks([0, 3, 6, 9], 10, 4).map((x) => [x.start, x.end])).toEqual([[0, 6], [6, 10]]);
    expect(planChunks([], 2, 4)).toEqual([{ start: 0, end: 2 }]);
    expect(planChunks([0], 0, 4).length).toBe(1);
  });
  it('covers the whole loop with no gaps or overlaps', () => {
    const bars = Array.from({ length: 23 }, (_, i) => i * 2.4);
    const c = planChunks(bars, 23 * 2.4, 4);
    expect(c[0].start).toBe(0);
    expect(c[c.length - 1].end).toBeCloseTo(23 * 2.4, 6);
    for (let i = 1; i < c.length; i++) expect(c[i].start).toBe(c[i - 1].end);
  });
});

describe('note endings', () => {
  const n = (time: number, midi: number, dur = 1): MixNote => ({ time, midi, gain: 1, dur, inst: 'piano' });
  it('a note stops at its length, or where the same pitch is struck again', () => {
    expect(noteEnds([n(0, 60), n(0.5, 60), n(0.5, 64)])).toEqual([0.5, 1.5, 1.5]);
  });
  it('in a loop, a strike at the top of the next loop cuts the last ringing note', () => {
    // the first note ends at its own length (1 s); the last one, still ringing at 4 s, is cut by the next loop's strike
    expect(noteEnds([n(0, 60), n(3.8, 60, 2)], 4)).toEqual([1, 4]);
  });
  it('different instruments do not cut each other', () => {
    expect(noteEnds([{ ...n(0, 60), inst: 'piano' }, { ...n(0.5, 60), inst: 'pad' }])).toEqual([1, 1.5]);
  });
});

describe('rendering', () => {
  it('playing the chunks back to back gives exactly the same sound as one long mix', () => {
    const { s, notes } = song(['G', 'C', 'D', 'Em', 'C', 'G']);
    const ends = noteEnds(notes);
    const whole = renderChunk(notes, [], { start: 0, end: s.length }, { ...opts, ends });
    const parts = planChunks(s.barTimes, s.length, 4).map((c) => ({ at: c.start, data: renderChunk(notes, [], c, { ...opts, ends }) }));
    expect(parts.length).toBeGreaterThan(1);
    const joined = overlay(parts, whole.length);
    let worst = 0;
    for (let i = 0; i < whole.length; i++) worst = Math.max(worst, Math.abs(whole[i] - joined[i]));
    expect(worst).toBeLessThan(1e-5);
  });
  it('a note fades out at its end instead of stopping dead (no click)', () => {
    const out = renderChunk([{ time: 0, midi: 60, gain: 1, dur: 0.3, inst: 'piano' }], [], { start: 0, end: 1 }, { sampleRate: SR, sample: constant });
    const end = Math.round(0.3 * SR);
    const rel = Math.round(RELEASE * SR);
    expect(out[end - 1]).toBeCloseTo(1, 3);
    // the release falls smoothly: no step bigger than one release slice
    for (let i = end; i < end + rel; i++) expect(Math.abs(out[i] - out[i - 1])).toBeLessThanOrEqual(1 / rel + 1e-6);
    expect(out[end + rel] ?? 0).toBe(0);
  });
  it('a note fades in over a couple of milliseconds', () => {
    const out = renderChunk([{ time: 0.1, midi: 60, gain: 1, dur: 1, inst: 'piano' }], [], { start: 0, end: 1 }, { sampleRate: SR, sample: constant });
    const at = Math.round(0.1 * SR);
    expect(out[at]).toBe(0);
    expect(out[at + 40]).toBeGreaterThan(0.3);
    expect(out[at + 200]).toBeCloseTo(1, 3);
  });
  it('a note longer than its sound fades out before the sound runs out', () => {
    const out = renderChunk([{ time: 0, midi: 60, gain: 1, dur: 10, inst: 'piano' }], [], { start: 0, end: 1 }, { sampleRate: SR, sample: constant });
    expect(out.length).toBe(2 * SR);
    expect(out[out.length - 1]).toBeLessThan(0.001);
  });
  it('a re-struck string is cut (with a fade) where it is struck again', () => {
    const notes: MixNote[] = [{ time: 0, midi: 60, gain: 1, dur: 2, inst: 'piano' }, { time: 0.5, midi: 60, gain: 1, dur: 0.1, inst: 'piano' }];
    const out = renderChunk(notes, [], { start: 0, end: 1 }, { sampleRate: SR, sample: constant });
    // after the second strike and both releases, nothing is left
    expect(out[Math.round((0.6 + RELEASE + 0.01) * SR)] ?? 0).toBe(0);
    // during the crossover the level never jumps
    for (let i = 1; i < out.length; i++) expect(Math.abs(out[i] - out[i - 1])).toBeLessThan(0.05);
  });
  it('the metronome is mixed in with the notes', () => {
    const click = () => new Float32Array(100).fill(0.5);
    const out = renderChunk([], [{ time: 0.25, accent: true }], { start: 0, end: 1 }, { sampleRate: SR, sample: constant, click });
    expect(out[Math.round(0.25 * SR) + 10]).toBeCloseTo(0.5, 5);
  });
  it('only notes that start in the chunk are in it', () => {
    const notes: MixNote[] = [{ time: 0, midi: 60, gain: 1, dur: 0.1, inst: 'piano' }, { time: 5, midi: 62, gain: 1, dur: 0.1, inst: 'piano' }];
    const out = renderChunk(notes, [], { start: 4, end: 8 }, { sampleRate: SR, sample: constant });
    expect(out[0]).toBe(0);
    expect(out[Math.round(1 * SR) + 500]).toBeCloseTo(1, 3);
  });
  it('a full strummed progression stays in range at the gains the patterns use', () => {
    for (const inst of ['piano', 'acoustic', 'electric', 'pad'] as Instrument[]) {
      const { s, notes } = song(['G', 'Em', 'C', 'D'], 'strum-folk', inst);
      const out = renderChunk(notes, [], { start: 0, end: s.length }, { sampleRate: SR, sample });
      expect(peak(out), inst).toBeLessThan(1.6);
      expect(peak(out), inst).toBeGreaterThan(0.2);
    }
  });
});
