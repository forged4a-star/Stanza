import { describe, expect, it } from 'vitest';
import { pickOnsets, strumFromAudio, strumFromOnsets, strumFromTaps } from './strumFromRhythm';

const SR = 22050;
/** a recording with a short decaying noise burst at each [time, loudness] */
function recording(hits: [number, number][], seconds: number, seed = 7): Float32Array {
  const x = new Float32Array(Math.ceil(seconds * SR));
  let r = seed;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (const [t, a] of hits) {
    const start = Math.round(t * SR);
    for (let i = 0; i < 0.09 * SR && start + i < x.length; i++) x[start + i] += a * rnd() * Math.exp(-i / (0.02 * SR));
  }
  return x;
}
const str = (s: { steps: string[] }) => s.steps.join('');

describe('hum a strum', () => {
  const bpm = 96; // beat 0.625 s, eighth 0.3125 s
  const eighth = 60 / bpm / 2;
  // D - D U - U D U  → steps 0,2,3,5,6,7
  const pattern = [0, 2, 3, 5, 6, 7];
  it('reads the rhythm of a recording of one bar', () => {
    const x = recording(pattern.map((s) => [0.4 + s * eighth, s === 3 ? 0.35 : 0.9]), 4);
    const g = strumFromAudio(x, SR, { bpm })!;
    expect(g).not.toBeNull();
    expect(g.strum.resolution).toBe('eighth');
    expect(str(g.strum)).toHaveLength(8);
    // hits land on exactly these steps, whatever the letters are
    const hitSteps = g.strum.steps.map((s, i) => (s === '-' ? -1 : i)).filter((i) => i >= 0);
    expect(hitSteps).toEqual(pattern);
  });
  it('downs on the beat, ups between, and the quiet hit is soft', () => {
    const x = recording(pattern.map((s) => [0.4 + s * eighth, s === 3 ? 0.3 : 0.9]), 4);
    const g = strumFromAudio(x, SR, { bpm })!;
    const s = g.strum.steps;
    expect(s[0]).toBe('D');
    expect(s[2]).toBe('D');
    expect(s[3]).toBe('u'); // off the beat and quiet
    expect(s[5]).toBe('U');
    expect(s[6]).toBe('D');
    expect(s[7]).toBe('U');
  });
  it('folds several bars into one, ignoring a stray hit', () => {
    const hits: [number, number][] = [];
    for (let bar = 0; bar < 3; bar++) for (const s of [0, 2, 3, 5, 7]) hits.push([0.3 + bar * 8 * eighth + s * eighth, 0.9]);
    hits.push([0.3 + 8 * eighth + 4 * eighth, 0.9]); // one stray in bar 2
    const g = strumFromAudio(recording(hits, 9), SR, { bpm })!;
    expect(g.bars).toBe(3);
    expect(g.strum.steps.map((s, i) => (s === '-' ? -1 : i)).filter((i) => i >= 0)).toEqual([0, 2, 3, 5, 7]);
  });
  it('switches to sixteenths when hits fall between eighths', () => {
    const sixteenth = eighth / 2;
    const g = strumFromAudio(recording([0, 1, 2, 3, 6, 8, 10].map((s) => [0.3 + s * sixteenth, 0.9]), 4), SR, { bpm })!;
    expect(g.strum.resolution).toBe('sixteenth');
    expect(g.strum.steps.length).toBe(16);
    expect(g.strum.steps.map((s, i) => (s === '-' ? -1 : i)).filter((i) => i >= 0)).toEqual([0, 1, 2, 3, 6, 8, 10]);
  });
  it('is not fooled by a little timing wobble', () => {
    const x = recording(pattern.map((s, i) => [0.4 + s * eighth + (i % 2 ? 0.03 : -0.025), 0.9]), 4);
    const g = strumFromAudio(x, SR, { bpm })!;
    expect(g.strum.steps.map((s, i) => (s === '-' ? -1 : i)).filter((i) => i >= 0)).toEqual(pattern);
    expect(g.confidence).toBeGreaterThan(0.8);
  });
  it('gives up on silence or a single hit', () => {
    expect(strumFromAudio(new Float32Array(SR * 2), SR, { bpm })).toBeNull();
    expect(strumFromOnsets([{ time: 1, strength: 1 }], { bpm })).toBeNull();
  });
  it('reads taps against a count-in so beat 1 is known', () => {
    // count-in of 4 beats, then the pattern starting on beat 1 of the next bar
    const start = 1000;
    const beatMs = 60000 / bpm;
    const taps = [2, 3, 5, 6, 7].map((s) => start + 4 * beatMs + s * (beatMs / 2));
    const g = strumFromTaps(taps, { bpm, startMs: start, countInBeats: 4 })!;
    expect(g.strum.steps.map((s, i) => (s === '-' ? -1 : i)).filter((i) => i >= 0)).toEqual([2, 3, 5, 6, 7]);
  });
  it('picks onsets from an envelope', () => {
    const env = new Float32Array(100);
    env[10] = 1;
    env[40] = 0.5;
    env[41] = 0.5;
    env[70] = 0.05;
    const o = pickOnsets(env, 100);
    expect(o.map((x) => x.time)).toEqual([0.1, 0.4]);
  });
});
