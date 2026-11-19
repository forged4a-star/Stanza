import { describe, expect, it } from 'vitest';
import { cleanPlan, defaultPlan, describePlan, rampTempos, sliceBars } from './practice';

describe('rampTempos', () => {
  it('steps up in groups and finishes on the target', () => {
    expect(rampTempos({ start: 60, target: 80, step: 10, passesPerStep: 2, hold: 0 })).toEqual([60, 60, 70, 70, 80, 80]);
  });
  it('never overshoots the target', () => {
    const t = rampTempos({ start: 60, target: 75, step: 10, passesPerStep: 1, hold: 0 });
    expect(t).toEqual([60, 70, 75]);
  });
  it('adds hold passes at the target', () => {
    expect(rampTempos({ start: 90, target: 90, step: 5, passesPerStep: 1, hold: 3 })).toEqual([90, 90, 90, 90]);
  });
  it('fixes a bad plan instead of looping forever', () => {
    const p = cleanPlan({ start: 500, target: 100, step: 0, passesPerStep: 0, hold: -4 });
    expect(p).toEqual({ start: 100, target: 100, step: 1, passesPerStep: 1, hold: 0 });
    expect(rampTempos({ start: 20, target: 40, step: 0, passesPerStep: 1, hold: 0 }).length).toBeLessThan(500);
  });
});

describe('defaultPlan', () => {
  it('starts at about 60% and arrives at the song tempo', () => {
    const p = defaultPlan(100);
    expect(p.start).toBe(60);
    expect(p.target).toBe(100);
    const t = rampTempos(p);
    expect(t[0]).toBe(60);
    expect(t[t.length - 1]).toBe(100);
    expect(t.every((x, i) => i === 0 || x >= t[i - 1])).toBe(true);
  });
  it('is sane for very slow and very fast songs', () => {
    expect(defaultPlan(35).start).toBe(30);
    expect(defaultPlan(400).target).toBe(300);
  });
  it('describes itself', () => {
    expect(describePlan({ start: 60, target: 80, step: 10, passesPerStep: 2, hold: 0 })).toBe('60 to 80 bpm, 6 passes');
  });
});

describe('sliceBars', () => {
  const bars = [['C'], ['G'], ['Am'], ['F']].map((chords) => ({ chords }));
  it('takes 1-based inclusive ranges', () => {
    expect(sliceBars(bars, 2, 3).map((b) => b.chords[0])).toEqual(['G', 'Am']);
  });
  it('clamps to the section and returns nothing for a missed range', () => {
    expect(sliceBars(bars, 0, 99)).toHaveLength(4);
    expect(sliceBars(bars, 5, 6)).toEqual([]);
    expect(sliceBars(bars, 3, 2)).toEqual([]);
  });
});
