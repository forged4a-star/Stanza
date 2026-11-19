import { describe, expect, it } from 'vitest';
import { droneFreqs, droneLoop, droneMidis, loopErrorCents, loopShape } from './drone';

describe('droneLoop', () => {
  it('loops without a jump: the sample after the end equals the first', () => {
    for (const f of [65.41, 98, 110, 130.81]) {
      const sr = 48000;
      const x = droneLoop(f, sr);
      const { cycles, length } = loopShape(f, sr);
      expect(x.length).toBe(length);
      // continuing the waveform one sample past the end must land on x[0]
      const next = (i: number) => {
        let v = 0;
        [1, 0.5, 0.28, 0.12].forEach((w, h) => (v += w * Math.sin((2 * Math.PI * (h + 1) * cycles * i) / length)));
        return v;
      };
      expect(Math.abs(next(length)) - Math.abs(next(0))).toBeCloseTo(0, 6);
      // and the step across the seam is no bigger than a normal step inside the loop
      let maxStep = 0;
      for (let i = 1; i < length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
      expect(Math.abs(x[0] - x[length - 1])).toBeLessThanOrEqual(maxStep + 1e-6);
    }
  });
  it('peaks at 0.8 and has no NaN', () => {
    const x = droneLoop(110, 44100);
    expect(Math.max(...x.map(Math.abs))).toBeCloseTo(0.8, 5);
    expect(x.every((v) => Number.isFinite(v))).toBe(true);
  });
  it('stays within a hundredth of a cent of the true pitch', () => {
    for (let m = 36; m <= 60; m++) for (const sr of [22050, 44100, 48000]) expect(Math.abs(loopErrorCents(m, sr))).toBeLessThan(0.1);
  });
  it('is about a second long', () => {
    const { length } = loopShape(110, 48000);
    expect(length / 48000).toBeGreaterThan(0.9);
    expect(length / 48000).toBeLessThan(1.1);
  });
});

describe('droneMidis', () => {
  it('uses the key tonic in the low octave', () => {
    expect(droneMidis('G', 'root')).toEqual([43]);
    expect(droneMidis('G', 'fifth')).toEqual([43, 50]);
    expect(droneMidis('Em', 'open')).toEqual([40, 47, 52]);
  });
  it('falls back to C when there is no key', () => {
    expect(droneMidis(null)).toEqual([36, 43]);
    expect(droneMidis('nonsense')).toEqual([36, 43]);
  });
  it('gives the frequencies', () => {
    expect(droneFreqs([45])[0]).toBeCloseTo(110, 5);
  });
});
