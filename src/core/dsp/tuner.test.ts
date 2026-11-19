import { describe, expect, it } from 'vitest';
import { midiToFreq } from '../music/theory';
import { pitchTrack } from './pitch';
import { readingFor, TunerSmoother, tuneState } from './tuner';

describe('readingFor', () => {
  it('names the note and how far off it is', () => {
    expect(readingFor(440)).toMatchObject({ label: 'A4', note: 'A', octave: 4, cents: 0 });
    expect(readingFor(110)?.label).toBe('A2');
    const sharp = readingFor(440 * Math.pow(2, 20 / 1200))!;
    expect(sharp.label).toBe('A4');
    expect(sharp.cents).toBe(20);
    const flat = readingFor(midiToFreq(40) * Math.pow(2, -30 / 1200))!;
    expect(flat.label).toBe('E2');
    expect(flat.cents).toBe(-30);
  });
  it('handles a different reference pitch', () => {
    expect(readingFor(432, 432)).toMatchObject({ label: 'A4', cents: 0 });
  });
  it('ignores silence and nonsense', () => {
    expect(readingFor(0)).toBeNull();
    expect(readingFor(NaN)).toBeNull();
    expect(readingFor(100000)).toBeNull();
  });
  it('reads a real tone through the pitch tracker', () => {
    const sr = 22050;
    const x = new Float32Array(sr / 2);
    const f = midiToFreq(45) * Math.pow(2, 10 / 1200); // A2, 10 cents sharp
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / sr) + 0.2 * Math.sin((4 * Math.PI * f * i) / sr);
    const track = pitchTrack(x, sr, { minHz: 60, maxHz: 400 }).filter((p) => p.freq > 0);
    expect(track.length).toBeGreaterThan(5);
    const r = readingFor(track[track.length >> 1].freq)!;
    expect(r.label).toBe('A2');
    expect(Math.abs(r.cents - 10)).toBeLessThanOrEqual(4);
  });
});

describe('tuneState', () => {
  it('is in tune within five cents', () => {
    expect(tuneState(0)).toBe('in-tune');
    expect(tuneState(5)).toBe('in-tune');
    expect(tuneState(-6)).toBe('flat');
    expect(tuneState(12)).toBe('sharp');
  });
});

describe('TunerSmoother', () => {
  it('ignores a single wild frame', () => {
    const s = new TunerSmoother();
    [110, 110.5, 109.8, 110.2].forEach((f) => s.push(f));
    const out = s.push(220)!; // octave blip: treated as a new note, but median of the new group only
    expect(out).toBe(220);
  });
  it('holds the note through a short gap, then lets go', () => {
    const s = new TunerSmoother(5, 3);
    s.push(110);
    expect(s.push(0)).toBe(110);
    expect(s.push(0)).toBe(110);
    expect(s.push(0)).toBe(110);
    expect(s.push(0)).toBeNull();
  });
  it('takes the median of recent frames', () => {
    const s = new TunerSmoother(5);
    [100, 101, 99].forEach((f) => s.push(f));
    s.push(104);
    expect(s.push(100)).toBe(100);
  });
});
