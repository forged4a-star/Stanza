import { describe, expect, it } from 'vitest';
import { libraryShapes } from './shapeLibrary';
import { chordPcs, mod12, noteName, parseChord, SHARP_NAMES } from './theory';
import { GUITAR_TUNING, guitarShapes } from './voicings';

const SUFFIXES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', '6', 'm6', 'm7b5', 'dim7', '5'];

describe('standard shape library', () => {
  it('every shape for every root contains only chord tones, with the root or slash bass lowest', () => {
    let count = 0;
    for (let root = 0; root < 12; root++) {
      for (const suf of SUFFIXES) {
        const name = noteName(root) + suf;
        const chord = parseChord(name)!;
        const pcs = chordPcs(chord);
        const shapes = libraryShapes(root, chord.quality.suffix, root);
        for (const s of shapes) {
          count++;
          const notes = s.frets.map((fr, i) => (fr < 0 ? null : GUITAR_TUNING[i] + fr)).filter((n): n is number => n !== null);
          const bad = notes.filter((n) => !pcs.includes(mod12(n)));
          expect(bad, `${name} ${s.frets.join(',')}`).toEqual([]);
          expect(mod12(notes[0]), `${name} bass ${s.frets.join(',')}`).toBe(root);
          expect(s.frets.every((x) => x <= 12)).toBe(true);
        }
      }
    }
    expect(count).toBeGreaterThan(150);
  });

  it('every open shape sounds its own chord (bass and tones)', () => {
    const open = ['C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm', 'F', 'Bm', 'C7', 'G7', 'D7', 'A7', 'E7', 'B7', 'Am7', 'Em7', 'Dm7', 'Cmaj7', 'Gmaj7', 'Dmaj7', 'Amaj7', 'Fmaj7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4', 'Cadd9', 'G/B', 'D/F#', 'C/G', 'Am/G', 'Bdim', 'Caug'];
    for (const name of open) {
      const chord = parseChord(name)!;
      const shape = guitarShapes(name, { max: 8 }).find((s) => s.source === 'standard');
      expect(shape, name).toBeTruthy();
      const notes = shape!.frets.map((fr, i) => (fr < 0 ? null : GUITAR_TUNING[i] + fr)).filter((n): n is number => n !== null);
      expect(notes.every((n) => chordPcs(chord).includes(mod12(n))), name).toBe(true);
      expect(mod12(notes[0]), name).toBe(chord.bass ?? chord.root);
    }
  });

  it('the textbook shapes come first', () => {
    const best = (n: string, o = {}) => guitarShapes(n, o)[0].frets.map((x) => (x < 0 ? 'x' : x)).join('');
    expect(best('C')).toBe('x32010');
    expect(best('G')).toBe('320003');
    expect(best('F')).toBe('133211');
    expect(best('B')).toBe('x24442');
    expect(best('F#m')).toBe('244222');
    expect(best('Bb')).toBe('x13331');
    expect(best('Bm')).toBe('x24432');
  });

  it('capo moves the chord down: A with capo 2 is the G shape', () => {
    expect(guitarShapes('A', { capo: 2 })[0].frets).toEqual(guitarShapes('G')[0].frets);
    expect(SHARP_NAMES.length).toBe(12);
  });
});
