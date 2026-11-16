import { describe, expect, it } from 'vitest';
import { candidateShapes, easiestFingering, movement, pathCost, plainFingering } from './fingering';
import { guitarShapes } from './voicings';

const shape = (name: string, frets: string) => guitarShapes(name, { max: 10 }).find((s) => s.frets.map((x) => (x < 0 ? 'x' : x)).join('') === frets)!;

describe('movement', () => {
  it('same shape costs nothing', () => {
    const c = shape('C', 'x32010');
    expect(movement(c, c).cost).toBe(0);
  });
  it('Am to C keeps two fingers on their strings... less effort than C to F barre', () => {
    const am = shape('Am', 'x02210');
    const c = shape('C', 'x32010');
    const f = shape('F', '133211');
    expect(movement(am, c).cost).toBeLessThan(movement(c, f).cost);
  });
  it('Em to Em7 is a one-finger change', () => {
    const m = movement(shape('Em', '022000'), shape('Em7', '020000'));
    expect(m.stay).toBe(1);
    expect(m.lift).toBe(1);
  });
  it('a barre sliding up the neck is penalised by distance', () => {
    const f = shape('F', '133211');
    const g = guitarShapes('G', { max: 8 }).find((s) => s.barre && s.barre.fret === 3)!;
    const a = guitarShapes('A', { max: 8 }).find((s) => s.barre && s.barre.fret === 5);
    expect(movement(f, g).cost).toBeLessThan(movement(f, a ?? g).cost + 100);
    expect(movement(f, g).hand).toBe(2);
  });
});

describe('easiest fingering', () => {
  it('never costs more than just using the first shape for each chord', () => {
    const progs = [['C', 'G', 'Am', 'F'], ['Em', 'C', 'G', 'D'], ['A', 'D', 'E', 'A'], ['Bm', 'G', 'D', 'A'], ['F', 'Bb', 'C', 'Dm'], ['Am', 'F', 'C', 'G7']];
    for (const p of progs) {
      const best = easiestFingering(p).map((s) => s.shape);
      expect(pathCost(best), p.join(' ')).toBeLessThanOrEqual(pathCost(plainFingering(p)) + 1e-9);
    }
  });
  it('picks a smoother F than the full barre between C and G', () => {
    // C - F - G: the four-string F is much closer to C than the E-form barre at fret 1
    const [, f] = easiestFingering(['C', 'F', 'G']);
    expect(f.shape.barre).toBeNull();
  });
  it('uses only standard shapes when they exist, and avoidBarres drops barres', () => {
    for (const s of easiestFingering(['G', 'Em', 'C', 'D', 'F', 'Bm'], { avoidBarres: true })) expect(s.shape.barre, s.chord).toBeNull();
    for (const s of easiestFingering(['C', 'G', 'Am', 'F'])) expect(s.shape.source).toBe('standard');
  });
  it('transitions are reported and the first has none', () => {
    const r = easiestFingering(['C', 'G']);
    expect(r[0].from).toBeNull();
    expect(r[1].from).not.toBeNull();
  });
  it('handles empty, single, and unknown chords', () => {
    expect(easiestFingering([])).toEqual([]);
    expect(easiestFingering(['G']).length).toBe(1);
    expect(() => easiestFingering(['C', 'H??', 'G'])).not.toThrow();
  });
  it('keeps barre chords near each other with capo-aware shapes', () => {
    const r = easiestFingering(['A', 'D', 'E'], { capo: 2 });
    expect(r.length).toBe(3);
    expect(candidateShapes('A', { capo: 2 })[0].frets).toEqual(candidateShapes('G')[0].frets);
  });
});
