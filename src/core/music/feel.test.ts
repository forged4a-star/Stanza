import { describe, expect, it } from 'vitest';
import { feelSwaps, MOODS, type Mood } from './feel';
import { parseChord } from './theory';

const names = (c: string, m: Mood) => feelSwaps(c, m).map((s) => s.chord);

describe('chord swap by feel', () => {
  it('warmer adds richness: C → Cmaj7 / Cadd9, Am → Am7', () => {
    expect(names('C', 'warmer')).toEqual(expect.arrayContaining(['Cmaj7', 'Cadd9']));
    expect(names('Am', 'warmer')).toContain('Am7');
  });
  it('tenser leans: G → G7 / Gsus4, Am → Am(maj7) or Am7b5', () => {
    expect(names('G', 'tenser')).toEqual(expect.arrayContaining(['G7', 'Gsus4']));
    expect(names('Am', 'tenser').length).toBeGreaterThan(0);
  });
  it('more open drops the third: C → Csus2, E → E5', () => {
    expect(names('C', 'open')).toContain('Csus2');
    expect(names('E', 'open')).toContain('E5');
  });
  it('brighter lifts minor to major on the same root; darker does the opposite', () => {
    expect(names('Am', 'brighter')).toContain('A');
    expect(names('C', 'darker')).toContain('Cm');
  });
  it('keeps the root, the spelling and any slash bass', () => {
    expect(names('Bb', 'warmer').every((c) => c.startsWith('Bb'))).toBe(true);
    expect(names('F#m', 'warmer').every((c) => c.startsWith('F#m') || c.startsWith('F#'))).toBe(true);
    expect(names('D/F#', 'warmer').every((c) => c.endsWith('/F#'))).toBe(true);
  });
  it('every swap is a real chord on the same root and differs from the input', () => {
    for (const chord of ['C', 'Am', 'G7', 'Fmaj7', 'Dm7', 'Esus4', 'Bdim', 'A', 'Em', 'Gsus2']) {
      const root = parseChord(chord)!.root;
      for (const { id } of MOODS) {
        for (const s of feelSwaps(chord, id)) {
          const p = parseChord(s.chord);
          expect(p, `${chord} ${id} ${s.chord}`).not.toBeNull();
          expect(p!.root).toBe(root);
          expect(s.chord).not.toBe(chord);
          expect(s.why.length).toBeGreaterThan(5);
        }
      }
    }
  });
  it('gives nothing for a chord it does not know, and at most four swaps', () => {
    expect(feelSwaps('??', 'warmer')).toEqual([]);
    expect(feelSwaps('C13', 'darker')).toEqual([]);
    for (const { id } of MOODS) expect(feelSwaps('C', id).length).toBeLessThanOrEqual(4);
  });
});
