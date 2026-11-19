import { describe, expect, it } from 'vitest';
import { activeRms, matchLevels, rmsOf, toDb } from './level';

const tone = (amp: number, n: number, sr = 8000) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / sr));

describe('rmsOf', () => {
  it('is amplitude / sqrt(2) for a sine', () => {
    expect(rmsOf(tone(0.5, 8000))).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(rmsOf(new Float32Array(0))).toBe(0);
  });
});

describe('activeRms', () => {
  it('ignores a long silent tail', () => {
    const x = new Float32Array(16000);
    x.set(tone(0.5, 4000), 0);
    expect(rmsOf(x)).toBeLessThan(0.2);
    expect(activeRms(x, 8000)).toBeCloseTo(0.5 / Math.SQRT2, 1);
  });
  it('is zero for silence', () => {
    expect(activeRms(new Float32Array(8000), 8000)).toBe(0);
  });
});

describe('matchLevels', () => {
  it('turns the louder one down to the quieter, never above 1', () => {
    expect(matchLevels(0.2, 0.1)).toEqual([0.5, 1]);
    expect(matchLevels(0.05, 0.2)).toEqual([1, 0.25]);
    expect(matchLevels(0.1, 0.1)).toEqual([1, 1]);
  });
  it('leaves both alone when a level is unknown', () => {
    expect(matchLevels(0, 0.2)).toEqual([1, 1]);
    expect(matchLevels(0.2, NaN)).toEqual([1, 1]);
  });
  it('the matched takes come out equally loud', () => {
    const a = tone(0.8, 8000);
    const b = tone(0.2, 8000);
    const [ga, gb] = matchLevels(activeRms(a, 8000), activeRms(b, 8000));
    expect(toDb((rmsOf(a) * ga) / (rmsOf(b) * gb))).toBeCloseTo(0, 1);
  });
});
