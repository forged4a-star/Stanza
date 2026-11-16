import { describe, expect, it } from 'vitest';
import type { SongDoc } from '../../core/model';
import { barSeconds, clampSpeed, scrollVelocity, songSeconds } from './stage';

const doc = (bpm: number, timeSig: [number, number], sections: { bars: number; lines: number }[]): SongDoc =>
  ({
    song: { bpm, timeSig },
    sections: sections.map((s, i) => ({
      id: 's' + i,
      bars: Array.from({ length: s.bars }, () => ({ chords: ['C'] })),
      lines: Array.from({ length: s.lines }, (_, k) => ({ id: `l${i}${k}`, text: 'words here' })),
    })),
  }) as never;

describe('stage timing', () => {
  it('bar length follows tempo and meter', () => {
    expect(barSeconds(doc(120, [4, 4], []))).toBe(2);
    expect(barSeconds(doc(90, [3, 4], []))).toBeCloseTo(2, 5);
    expect(barSeconds(doc(60, [6, 8], []))).toBe(3);
  });
  it('a section lasts for its bars, or two bars per line when longer', () => {
    expect(songSeconds(doc(120, [4, 4], [{ bars: 8, lines: 4 }]))).toBe(16);
    expect(songSeconds(doc(120, [4, 4], [{ bars: 4, lines: 8 }]))).toBe(32);
    expect(songSeconds(doc(120, [4, 4], [{ bars: 4, lines: 4 }, { bars: 4, lines: 4 }]))).toBe(32);
  });
  it('never returns a zero length for an empty song', () => {
    expect(songSeconds(doc(120, [4, 4], []))).toBeGreaterThan(0);
  });
  it('velocity covers the page in the song time and scales with speed', () => {
    expect(scrollVelocity(600, 60, 1)).toBe(10);
    expect(scrollVelocity(600, 60, 2)).toBe(20);
    expect(scrollVelocity(0, 60, 1)).toBe(0);
  });
  it('speed is clamped', () => {
    expect(clampSpeed(10)).toBe(3);
    expect(clampSpeed(0)).toBe(0.25);
    expect(clampSpeed(1.04)).toBe(1.05);
  });
});
