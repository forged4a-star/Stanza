import { describe, expect, it } from 'vitest';
import type { Note } from '../model';
import { fitWords, phrasesOf } from './skeleton';

let id = 0;
const notes = (...n: [number, number, number?][]): Note[] => n.map(([start, pitch, length = 2]) => ({ id: 'n' + id++, pitch, start, length }));
const T: [number, number] = [4, 4];

describe('phrases and note strength', () => {
  it('eight eighth notes in 4/4 are strong, weak, medium, weak, strong, weak, medium, weak', () => {
    const p = phrasesOf(notes([0, 60], [2, 62], [4, 64], [6, 62], [8, 65], [10, 64], [12, 62], [14, 60]), T);
    expect(p).toHaveLength(1);
    expect(p[0].slots.map((s) => s.cls)).toEqual(['strong', 'weak', 'medium', 'weak', 'strong', 'weak', 'medium', 'weak']);
  });
  it('four quarter notes: strong, medium, strong, medium', () => {
    const p = phrasesOf(notes([0, 60, 4], [4, 64, 4], [8, 67, 4], [12, 64, 4]), T);
    expect(p[0].slots.map((s) => s.cls)).toEqual(['strong', 'medium', 'strong', 'medium']);
  });
  it('a long note carries weight even off the beat', () => {
    const p = phrasesOf(notes([2, 60, 8]), T);
    expect(p[0].slots[0].cls).toBe('medium'); // an off-beat note, held long, steps up from weak
  });
  it('a rest of a beat or more starts a new phrase', () => {
    const p = phrasesOf(notes([0, 60], [2, 62], [4, 64], [16, 60], [18, 62]), T);
    expect(p.map((x) => x.slots.length)).toEqual([3, 2]);
    expect(p[1].startStep).toBe(16);
  });
  it('is empty for no melody and sorts notes by time', () => {
    expect(phrasesOf([], T)).toEqual([]);
    const p = phrasesOf(notes([4, 64], [0, 60]), T);
    expect(p[0].slots.map((s) => s.pitch)).toEqual([60, 64]);
  });
});

describe('fitting words to a phrase', () => {
  const eighths = phrasesOf(notes([0, 60], [2, 62], [4, 64], [6, 62], [8, 65], [10, 64], [12, 62], [14, 60]), T)[0];
  it('counts syllables against notes, and a stressed word on a strong note is good', () => {
    const f = fitWords(eighths, 'down by the river in the rain'); // 8 syllables for 8 notes
    expect(f.slots).toBe(8);
    expect(f.delta).toBe(0);
    expect(f.summary).toMatch(/8 syllables for 8 notes/);
    expect(f.syllables[0].status).toBe('good'); // "down" lands on the first, strong note
  });
  it('words that line up with the beat fit', () => {
    const p = phrasesOf(notes([0, 60, 4], [4, 62, 4]), T)[0]; // strong, medium
    const f = fitWords(p, 'moon rose');
    expect(f.fits).toBe(true);
    expect(f.summary).toMatch(/2 syllables for 2 notes/);
  });
  it('too many syllables are counted and marked', () => {
    const f = fitWords(eighths, 'I walked along the river in the rain tonight again');
    expect(f.delta).toBeGreaterThan(0);
    expect(f.fits).toBe(false);
    expect(f.summary).toMatch(/too many/);
    expect(f.syllables.filter((s) => s.slot === null).length).toBe(f.delta);
  });
  it('too few leaves notes empty', () => {
    const f = fitWords(eighths, 'down by the river');
    expect(f.delta).toBeLessThan(0);
    expect(f.summary).toMatch(/left empty/);
  });
  it('a stressed word on a weak note is flagged', () => {
    const p = phrasesOf(notes([0, 60, 4], [4, 62, 2], [6, 64, 2]), T)[0]; // strong, medium, weak
    const f = fitWords(p, 'the the moon');
    expect(f.syllables[2].level).toBe(2);
    expect(f.syllables[2].status).toBe('bad');
    expect(f.bad).toBeGreaterThan(0);
  });
  it('a weak word on a strong beat is flagged, and a stressed word there is good', () => {
    const p = phrasesOf(notes([0, 60, 4], [4, 62, 4]), T)[0];
    const weak = fitWords(p, 'the and');
    expect(weak.syllables[0].status).toBe('bad');
    const strong = fitWords(p, 'moon rises');
    expect(strong.syllables[0].status).toBe('good');
  });
  it('empty text and punctuation are handled', () => {
    expect(fitWords(eighths, '').fits).toBe(false);
    expect(fitWords(eighths, '').summary).toMatch(/8 notes waiting/);
    expect(() => fitWords(eighths, '... !!! ???')).not.toThrow();
  });
});
