import { describe, expect, it } from 'vitest';
import { buildSchedule, chordNotes } from './patterns';
import { changeResolution, customPatternId, emptyStrum, nextStep, STRUM_TEMPLATES, strokesFor, strumFromTemplate, stepsFromText, stepsToText, type CustomStrum } from './strums';

const mk = (text: string, over: Partial<CustomStrum> = {}): CustomStrum => ({ ...emptyStrum('t'), steps: stepsFromText(text), ...over });
const sched = (strum: CustomStrum, opts: { bpm?: number; timeSig?: [number, number]; inst?: 'acoustic' | 'piano'; bars?: number; chord?: string } = {}) =>
  buildSchedule(Array.from({ length: opts.bars ?? 1 }, () => ({ chords: [opts.chord ?? 'G'] })), {
    bpm: opts.bpm ?? 120,
    timeSig: opts.timeSig ?? [4, 4],
    pattern: customPatternId(strum),
    instrument: opts.inst ?? 'acoustic',
    metronome: false,
    customStrums: [strum],
  });
// strokes land on multiples of 0.125 s here; the strum spread adds < 0.1 s per string, so bucket by the stroke
const hitTimes = (s: ReturnType<typeof sched>) => [...new Set(s.notes.map((n) => Math.floor(n.time * 8 + 1e-6) / 8))];

describe('custom strum patterns', () => {
  it('reproduces the built-in folk strum exactly when written out', () => {
    const custom = sched(mk('D-DU-UDU'));
    const builtin = buildSchedule([{ chords: ['G'] }], { bpm: 120, timeSig: [4, 4], pattern: 'strum-folk', instrument: 'acoustic', metronome: false });
    // same strike times (eighths at 120 bpm are 0.25 s apart)
    expect(hitTimes(custom)).toEqual(hitTimes(builtin));
    expect(hitTimes(custom)).toEqual([0, 0.5, 0.75, 1.25, 1.5, 1.75]);
  });

  it('plays down strokes low-to-high and up strokes high-to-low on the top strings', () => {
    const s = sched(mk('DU------'));
    const notes = chordNotes('G', 'acoustic');
    const down = s.notes.filter((n) => n.time < 0.1).map((n) => n.midi);
    expect(down).toEqual(notes);
    const up = s.notes.filter((n) => n.time >= 0.2 && n.time < 0.4).map((n) => n.midi);
    expect(up).toEqual([...notes].reverse().slice(0, Math.max(3, notes.length - 2)));
    expect(up.length).toBeLessThan(down.length);
  });

  it('soft strokes are quieter, muted chucks are short and quiet, accents land on the bar line', () => {
    const s = strokesFor(mk('DdUuX---'), 0.5, 2);
    const by = Object.fromEntries(s.map((x, i) => [i, x]));
    expect(by[1].vel).toBeLessThan(by[0].vel);
    expect(by[3].vel).toBeLessThan(by[2].vel);
    expect(by[4].kind).toBe('mute');
    expect(by[4].dur).toBeLessThan(0.1);
    expect(by[0].vel).toBeGreaterThan(by[2].vel);
  });

  it('rings until the next stroke and repeats across bars in any time signature', () => {
    const s = strokesFor(mk('D---D---'), 0.5, 2);
    expect(s.map((x) => x.at)).toEqual([0, 1]);
    expect(s[0].dur).toBeCloseTo(1.05, 2);
    // 3/4 at 120 bpm: a bar is 1.5 s (6 eighths); the pattern restarts each bar
    const waltz = sched(mk('D-D-D-D-'), { timeSig: [3, 4], bars: 2 });
    expect(hitTimes(waltz)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(waltz.length).toBeCloseTo(3);
  });

  it('a second chord in a bar carries the pattern on, with a stroke on the change', () => {
    const folk = mk('D-DU-UDU');
    const two = buildSchedule([{ chords: ['G', 'C'] }], { bpm: 120, timeSig: [4, 4], pattern: customPatternId(folk), instrument: 'acoustic', metronome: false, customStrums: [folk] });
    // G: steps 0,2,3 → 0, 0.5, 0.75   C: step 4 is a rest, so a soft stroke on the change at 1.0, then steps 5,6,7
    expect(hitTimes(two)).toEqual([0, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    const forced = two.notes.filter((n) => Math.abs(n.time - 1) < 0.1);
    const normal = two.notes.filter((n) => Math.abs(n.time - 0.5) < 0.1);
    expect(forced[0].vel).toBeLessThan(normal[0].vel);
    // a pattern that lands on the change keeps its own stroke
    const keeps = strokesFor(mk('D-D-D-D-'), 0.5, 1, 1);
    expect(keeps.map((x) => [x.at, x.vel > 0.6])).toEqual([[0, true], [0.5, true]]);
  });

  it('sixteenth patterns are twice as fine, and resolution changes keep the hits in place', () => {
    // sixteenths at 120 bpm are 0.125 s apart: "D-D-" repeating hits every other step
    expect(strokesFor(mk('D-D-', { resolution: 'sixteenth' }), 0.5, 1).map((x) => x.at)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(strokesFor(mk('D-D-'), 0.5, 1).map((x) => x.at)).toEqual([0, 0.5]);
    const eighths = mk('D-DU-UDU');
    const sixteenths = changeResolution(eighths, 'sixteenth');
    expect(sixteenths.steps.length).toBe(16);
    expect(strokesFor(sixteenths, 0.5, 2).map((x) => x.at)).toEqual(strokesFor(eighths, 0.5, 2).map((x) => x.at));
    expect(stepsToText(changeResolution(sixteenths, 'eighth').steps)).toBe('D-DU-UDU');
  });

  it('every starter template is a full bar and makes sound', () => {
    for (const t of STRUM_TEMPLATES) {
      const strum = strumFromTemplate(t);
      expect(strum.steps.length, t.name).toBe(strum.resolution === 'sixteenth' ? 16 : 8);
      expect(sched(strum).notes.length, t.name).toBeGreaterThan(3);
    }
  });

  it('step tapping cycles through every state, a deleted strum falls back to folk', () => {
    let s = nextStep('-');
    const seen = [s];
    for (let i = 0; i < 5; i++) seen.push((s = nextStep(s)));
    expect(seen).toEqual(['D', 'd', 'U', 'u', 'X', '-']);
    const missing = buildSchedule([{ chords: ['C'] }], { bpm: 120, timeSig: [4, 4], pattern: 'custom:gone', instrument: 'acoustic', metronome: false, customStrums: [] });
    expect(hitTimes(missing)).toEqual([0, 0.5, 0.75, 1.25, 1.5, 1.75]);
  });

  it('piano strums are tighter than guitar strums', () => {
    const g = sched(mk('D-------', { spread: 'slow' }), { inst: 'acoustic' }).notes;
    const p = sched(mk('D-------', { spread: 'slow' }), { inst: 'piano' }).notes;
    const spread = (n: typeof g) => n[n.length - 1].time - n[0].time;
    expect(spread(p)).toBeLessThan(spread(g));
  });
});
