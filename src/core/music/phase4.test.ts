import { describe, expect, it } from 'vitest';
import { allIssues, metricWeight, prosodyIssues, rangeIssues, singabilityIssues } from '../lyrics/checks';
import type { Line, Note } from '../model';
import { midiToFreq, parseKey } from './theory';
import { autoLink, chordAtStep, chordTonesAtStep, humToNotes, linkedSyllable, snapToScale, stepInScale, sungRange } from './melody';

const C = parseKey('C')!;
const line = (id: string, text: string): Line => ({ id, sectionId: 's', sort: 0, text, locked: false, alts: [], chords: [] });
const note = (id: string, pitch: number, start: number, length: number, lineId: string | null = null, syl: number | null = null): Note => ({ id, pitch, start, length, lineId, syl });

describe('scale lock and chord tones', () => {
  it('snaps and steps in the scale', () => {
    expect(snapToScale(61, C)).toBe(62);
    expect(snapToScale(60, C)).toBe(60);
    expect(stepInScale(60, 1, C)).toBe(62);
    expect(stepInScale(64, 1, C)).toBe(65);
    expect(stepInScale(60, -1, C)).toBe(59);
    expect(stepInScale(60, 1, null)).toBe(61);
  });
  it('knows the chord under each step', () => {
    const bars = [{ chords: ['C'] }, { chords: ['Am', 'F'] }];
    expect(chordAtStep(bars, 0, [4, 4])).toBe('C');
    expect(chordAtStep(bars, 17, [4, 4])).toBe('Am');
    expect(chordAtStep(bars, 24, [4, 4])).toBe('F');
    expect(chordAtStep(bars, 40, [4, 4])).toBeNull();
    expect(chordTonesAtStep(bars, 24, [4, 4]).sort()).toEqual([0, 5, 9]);
  });
});

describe('linking notes to syllables', () => {
  it('links in order and follows the lyrics as they change', () => {
    const lines = [line('a', 'hello there'), line('b', 'friend')];
    const melody = [note('1', 60, 0, 2), note('2', 62, 2, 2), note('3', 64, 4, 4), note('4', 65, 8, 4), note('5', 67, 12, 4)];
    const linked = autoLink(melody, lines);
    expect(linked.map((n) => [n.lineId, n.syl])).toEqual([['a', 0], ['a', 1], ['a', 2], ['b', 0], [null, null]]);
    expect(linkedSyllable(linked[2], lines)!.text).toBe('there');
    // lyric edited: "there" becomes "everywhere" → syllable 2 is now "ev"
    const edited = [line('a', 'hello everywhere'), line('b', 'friend')];
    expect(linkedSyllable(linked[2], edited)!.text).toMatch(/^ev/);
    expect(linkedSyllable(linked[3], [line('a', 'hi')])).toBeNull();
  });
});

describe('checks', () => {
  it('metric weights', () => {
    expect([0, 4, 8, 12, 2, 1].map((s) => metricWeight(s, [4, 4]))).toEqual([1, 0.5, 0.75, 0.5, 0.25, 0.1]);
    expect([0, 6, 2, 1].map((s) => metricWeight(s, [6, 8]))).toEqual([1, 0.5, 0.25, 0.1]);
    expect(metricWeight(16, [4, 4])).toBe(1);
  });
  it('prosody: a stressed syllable on a weak beat is flagged; well-set words are not', () => {
    const lines = [line('a', 'beautiful')];
    // BEAU-ti-ful: good = BEAU on the downbeat
    const good = [note('1', 60, 0, 4, 'a', 0), note('2', 60, 4, 2, 'a', 1), note('3', 60, 6, 2, 'a', 2)];
    expect(prosodyIssues(good, lines, [4, 4])).toHaveLength(0);
    // bad = "beau" on an off-beat, "ti" on the beat
    const bad = [note('1', 60, 2, 2, 'a', 0), note('2', 60, 4, 2, 'a', 1), note('3', 60, 6, 2, 'a', 2)];
    const issues = prosodyIssues(bad, lines, [4, 4]);
    expect(issues[0].noteId).toBe('1');
    expect(issues[0].message).toMatch(/beau/i);
  });
  it('flags a weak syllable hogging the downbeat before a stressed one', () => {
    const lines = [line('a', 'the river')];
    const m = [note('1', 60, 0, 2, 'a', 0), note('2', 60, 2, 2, 'a', 1), note('3', 60, 4, 2, 'a', 2)];
    expect(prosodyIssues(m, lines, [4, 4]).map((i) => i.noteId)).toContain('1');
  });
  it('singability: long high closed vowels and consonant pile-ups', () => {
    const lines = [line('a', 'free'), line('b', 'strengths spread')];
    const held = [note('1', 70, 0, 12, 'a', 0)];
    const iss = singabilityIssues(held, lines, { bpm: 90, timeSig: [4, 4], vocalHigh: 72 });
    expect(iss[0].kind).toBe('closed-vowel');
    expect(iss[0].severity).toBe(2);
    const open = singabilityIssues([note('1', 60, 0, 12, 'x', 0)], [line('x', 'far')], { bpm: 90, timeSig: [4, 4], vocalHigh: 72 });
    expect(open).toHaveLength(0);
    const fast = [note('1', 60, 0, 1, 'b', 0), note('2', 62, 1, 1, 'b', 1)];
    expect(singabilityIssues(fast, lines, { bpm: 140, timeSig: [4, 4], vocalHigh: 72 }).some((i) => i.kind === 'consonants')).toBe(true);
  });
  it('range guard', () => {
    const r = rangeIssues([note('1', 50, 0, 2), note('2', 60, 2, 2), note('3', 80, 4, 2)], [], 52, 72);
    expect(r.map((i) => i.noteId)).toEqual(['1', '3']);
    expect(r[0].message).toMatch(/below/);
    expect(allIssues([], [], { bpm: 100, timeSig: [4, 4], vocalLow: 50, vocalHigh: 70 })).toEqual([]);
  });
});

describe('hum to MIDI', () => {
  const SR = 22050;
  const hum = (pitches: [number, number][]) => {
    const parts: Float32Array[] = [];
    for (const [m, dur] of pitches) {
      const n = Math.floor(SR * dur);
      const x = new Float32Array(n);
      const f = midiToFreq(m) * (1 + 0.004); // slightly sharp, like a real voice
      for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * f * i) / SR) + 0.1 * Math.sin((4 * Math.PI * f * i) / SR);
      for (let i = 0; i < 300; i++) {
        x[i] *= i / 300;
        x[n - 1 - i] *= i / 300;
      }
      parts.push(x, new Float32Array(Math.floor(SR * 0.04)));
    }
    const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  it('turns a hummed phrase into quantised, scale-locked notes', () => {
    // at 120 bpm a sixteenth is 0.125 s; hum quarter, quarter, half
    const notes = humToNotes(hum([[60, 0.46], [64, 0.46], [67, 0.96]]), SR, { bpm: 120, key: C });
    expect(notes.map((n) => n.pitch)).toEqual([60, 64, 67]);
    expect(notes.map((n) => n.start)).toEqual([0, 4, 8]);
    expect(notes[2].length).toBeGreaterThanOrEqual(7);
  });
  it('finds the singer’s range', () => {
    expect(sungRange(hum([[48, 0.6], [55, 0.4], [69, 0.6]]), SR)).toEqual({ low: 48, high: 69 });
  });
});
