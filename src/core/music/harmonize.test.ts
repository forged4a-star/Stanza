import { describe, expect, it } from 'vitest';
import type { Note } from '../model';
import { harmonize } from './harmonize';
import { chordPcs, parseChord, parseKey } from './theory';

const C = parseKey('C')!;
const Am = parseKey('Am')!;
let id = 0;
/** notes written as [midi, start step, length steps] */
const mel = (...n: [number, number, number][]): Note[] => n.map(([pitch, start, length]) => ({ id: 'n' + id++, pitch, start, length }));
const names = (m: Note[], key = C, extra = {}) => harmonize(m, { key, timeSig: [4, 4], ...extra });

describe('harmonize', () => {
  // C E G | D F A | G B D | C E G   (each bar: three held notes)
  const tune = mel([60, 0, 4], [64, 4, 4], [67, 8, 8], [62, 16, 4], [65, 20, 4], [69, 24, 8], [67, 32, 4], [71, 36, 4], [74, 40, 8], [64, 48, 4], [67, 52, 4], [72, 56, 8]);
  it('puts the obvious chord under each bar of a simple tune', () => {
    const simple = names(tune).find((o) => o.style === 'simple')!;
    expect(simple.bars.map((b) => b.chords[0])).toEqual(['C', 'Dm', 'G', 'C']);
    expect(simple.fit).toBeGreaterThan(0.95);
  });
  it('gives different answers in different styles, all valid chords', () => {
    const opts = names(tune, C);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(opts.map((o) => o.bars.map((b) => b.chords.join('/')).join('|'))).size).toBe(opts.length);
    for (const o of opts) for (const b of o.bars) for (const c of b.chords) expect(parseChord(c), c).not.toBeNull();
  });
  it('colourful style takes a seventh when the melody holds one', () => {
    const m = mel([60, 0, 4], [64, 4, 4], [67, 8, 4], [71, 12, 4]); // C E G B over one bar
    const colour = names(m).find((o) => o.style === 'colour')!;
    expect(colour.bars[0].chords[0]).toMatch(/^Cmaj7|Em7$/);
    const simple = names(m).find((o) => o.style === 'simple')!;
    expect(chordPcs(parseChord(simple.bars[0].chords[0])!)).toContain(0);
  });
  it('every chosen chord covers most of the melody weight', () => {
    for (const o of names(tune)) expect(o.fit).toBeGreaterThan(0.8);
  });
  it('works in a minor key and ends on a resting chord', () => {
    const m = mel([69, 0, 8], [72, 8, 8], [71, 16, 8], [68, 24, 8], [69, 32, 16], [64, 48, 16]); // A C B G# A E
    const o = names(m, Am).find((x) => x.style === 'simple')!;
    expect(o.bars[0].chords[0]).toBe('Am');
    expect(['Am', 'E', 'C']).toContain(o.bars.at(-1)!.chords[0]);
  });
  it('can change chord every half bar', () => {
    const o = names(tune, C, { chordsPerBar: 2 });
    expect(o[0].bars.length).toBe(4);
    expect(o[0].bars.some((b) => b.chords.length === 2)).toBe(true);
  });
  it('finds the key itself when none is given', () => {
    const o = harmonize(tune, { key: null, timeSig: [4, 4] });
    expect(o[0].bars[0].chords[0]).toBe('C');
  });
  it('handles an empty melody, rests, and a one-note tune', () => {
    expect(harmonize([], { key: C, timeSig: [4, 4] })).toEqual([]);
    expect(names(mel([60, 0, 16])).length).toBeGreaterThan(0);
    const rest = names(mel([60, 0, 4], [67, 32, 4])); // an empty bar in the middle
    expect(rest[0].bars.length).toBe(3);
    expect(rest[0].bars.every((b) => b.chords.length > 0)).toBe(true);
  });
  it('respects the number of bars asked for and other time signatures', () => {
    expect(names(tune, C, { bars: 6 })[0].bars.length).toBe(6);
    const waltz = harmonize(mel([60, 0, 4], [64, 4, 4], [67, 8, 4], [62, 12, 4], [65, 16, 4], [69, 20, 4]), { key: C, timeSig: [3, 4] });
    expect(waltz[0].bars.length).toBe(2);
  });
});
