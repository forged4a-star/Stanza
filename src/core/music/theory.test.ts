import { describe, expect, it } from 'vitest';
import { chordPcs, diatonicChords, parseChord, parseKey, romanNumeral, transposeChord, keyName } from './theory';

describe('theory', () => {
  it('parses chords including slash, sevenths, sus, add', () => {
    for (const s of ['C', 'Am', 'F#m7b5', 'Bbmaj7', 'Gsus4', 'D/F#', 'Cadd9', 'E7', 'Abm9', 'Cdim7', 'G5', 'A13', 'Fmaj9/A']) expect(parseChord(s), s).not.toBeNull();
    for (const s of ['H', 'Cx', 'hello', '', 'Amm']) expect(parseChord(s), s).toBeNull();
    expect(chordPcs(parseChord('D/F#')!)).toEqual([6, 2, 9]);
  });
  it('transposes and keeps flats/sharps sensible', () => {
    expect(transposeChord('G', 2)).toBe('A');
    expect(transposeChord('Bbmaj7', 2)).toBe('Cmaj7');
    expect(transposeChord('D/F#', -2)).toBe('C/E');
    expect(transposeChord('Eb', 1)).toBe('E');
  });
  it('builds diatonic chords and Roman numerals', () => {
    expect(diatonicChords(parseKey('C')!)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(diatonicChords(parseKey('F')!)).toEqual(['F', 'Gm', 'Am', 'Bb', 'C', 'Dm', 'Edim']);
    expect(diatonicChords(parseKey('Am')!)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    const C = parseKey('C')!;
    expect(['C', 'Am', 'F', 'G7', 'Bb', 'D7', 'Fm', 'Bdim', 'C/E'].map((c) => romanNumeral(c, C))).toEqual(['I', 'vi', 'IV', 'V7', 'bVII', 'II7', 'iv', 'vii°', 'I⁶']);
    expect(['Am', 'C', 'E7', 'G'].map((c) => romanNumeral(c, parseKey('Am')!))).toEqual(['i', 'III', 'V7', 'VII']);
    expect(keyName(parseKey('Bb minor')!)).toBe('Bbm');
    expect(['G7/B', 'Em7/B', 'Dm7/C', 'G/D'].map((c) => romanNumeral(c, C))).toEqual(['V⁶₅', 'iii⁴₃', 'ii⁴₂', 'V⁶₄']);
  });
});
