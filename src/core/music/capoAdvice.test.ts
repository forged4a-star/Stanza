import { describe, expect, it } from 'vitest';
import { capoAdvice, describeCapo } from './capoAdvice';

describe('capo helper', () => {
  it('Bm G D A: capo 7 gives Em C G D, all open', () => {
    const best = capoAdvice(['Bm', 'G', 'D', 'A'])[0];
    expect(best.capo).toBe(7);
    expect(best.shapes).toEqual(['Em', 'C', 'G', 'D']);
    expect(best.allOpen).toBe(true);
  });
  it('F#m D A E: capo 2 gives Em C G D', () => {
    const best = capoAdvice(['F#m', 'D', 'A', 'E'])[0];
    expect(best.capo).toBe(2);
    expect(best.shapes).toEqual(['Em', 'C', 'G', 'D']);
  });
  it('Bb F Gm Eb: capo 3 gives G D Em C', () => {
    const best = capoAdvice(['Bb', 'F', 'Gm', 'Eb'])[0];
    expect(best.capo).toBe(3);
    expect(best.shapes).toEqual(['G', 'D', 'Em', 'C']);
  });
  it('a song that is already easy keeps no capo', () => {
    const best = capoAdvice(['G', 'D', 'Em', 'C'])[0];
    expect(best.capo).toBe(0);
    expect(best.allOpen).toBe(true);
  });
  it('C G Am F: a capo can swap the F for open shapes, and the song is still in the same key', () => {
    const best = capoAdvice(['C', 'G', 'Am', 'F'])[0];
    expect(best.capo).toBe(5);
    expect(best.shapes).toEqual(['G', 'D', 'Em', 'C']);
  });
  it('capo 0 is always one of the options, so you can compare', () => {
    expect(capoAdvice(['Bm', 'G', 'D', 'A']).some((o) => o.capo === 0)).toBe(true);
  });
  it('describes an option in plain words', () => {
    expect(describeCapo(capoAdvice(['Bm', 'G', 'D', 'A'])[0])).toBe('Capo 7: play Em C G D (all easy open shapes)');
  });
  it('ignores non-chords and handles an empty song', () => {
    expect(capoAdvice([])).toEqual([]);
    expect(capoAdvice(['??', 'G', 'D'])[0].shapes.every((s) => s !== '??')).toBe(true);
  });
});
