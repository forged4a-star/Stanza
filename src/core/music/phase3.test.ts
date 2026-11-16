import { describe, expect, it } from 'vitest';
import { buildSchedule, chordNotes } from '../audio/patterns';
import { renderClick, renderNote, tapTempo } from '../audio/synth';
import { yin } from '../dsp/pitch';
import { chordFromChroma, detectChord } from './detect';
import { pivotChords, PROGRESSIONS, realiseProgression, romanToChord, suggestNext } from './suggest';
import { midiToFreq, parseKey } from './theory';
import { guitarShapes, pianoVoicing } from './voicings';

const SR = 22050;
const C = parseKey('C')!;

describe('guitar voicings', () => {
  const best = (n: string) => guitarShapes(n)[0]?.frets.map((f) => (f < 0 ? 'x' : f)).join('');
  it('finds the familiar open shapes', () => {
    expect(best('C')).toBe('x32010');
    expect(best('Am')).toBe('x02210');
    expect(best('E')).toBe('022100');
    expect(best('Em')).toBe('022000');
    expect(best('D')).toBe('xx0232');
    expect(['320003', '320033', '320013']).toContain(best('G'));
  });
  it('finds barre chords, slash chords, sevenths and capo shapes', () => {
    const f = guitarShapes('F')[0];
    expect(f.frets.filter((x) => x >= 0).length).toBeGreaterThanOrEqual(4);
    expect(guitarShapes('Bm').map((x) => x.frets.join(''))).toContain('-124432'.replace('-1', '-1'));
    expect(guitarShapes('F', { max: 6 }).some((x) => x.barre)).toBe(true);
    expect(best('D/F#')![0]).toBe('2');
    expect(guitarShapes('G7').length).toBeGreaterThan(0);
    expect(guitarShapes('Cmaj7').length).toBeGreaterThan(0);
    expect(guitarShapes('F#m7b5').length).toBeGreaterThan(0);
    // with capo 2, "A" sounds as written A: shape is G-shape relative to the capo
    expect(guitarShapes('A', { capo: 2 })[0].frets.join(',')).toBe(guitarShapes('G')[0].frets.join(','));
  });
  it('piano voicing holds the chord tones', () => {
    const v = pianoVoicing('Cmaj7')!;
    expect(v.notes.map((n) => n % 12)).toEqual([0, 4, 7, 11]);
  });
});

describe('suggestions', () => {
  it('ranks common moves and labels their function', () => {
    const s = suggestNext('C', C);
    expect(s.slice(0, 3).map((x) => x.chord).sort()).toEqual(['Am', 'F', 'G']);
    const by = Object.fromEntries(s.map((x) => [x.chord, x.fn]));
    expect(by.G).toBe('tension');
    expect(by.F).toBe('lift');
    expect(by.Am).toBe('darken');
    const fromG = suggestNext('G', C);
    expect(fromG[0].chord).toBe('C');
    expect(fromG[0].fn).toBe('release');
  });
  it('adds borrowed chords, secondary dominants and pivots when asked', () => {
    const s = suggestNext('C', C, { borrowed: true, secondary: true, pivots: true });
    const names = s.map((x) => x.chord);
    expect(names).toEqual(expect.arrayContaining(['Fm', 'Bb', 'Ab', 'D7', 'E7', 'A7']));
    expect(s.find((x) => x.chord === 'D7')!.roman).toBe('V7/V');
    const piv = pivotChords(C);
    expect(piv.map((p) => p.toKey)).toEqual(expect.arrayContaining(['G', 'F', 'Am']));
  });
  it('realises Roman numerals and classic progressions in any key', () => {
    expect(romanToChord('bVII', C)).toBe('Bb');
    expect(romanToChord('ii', parseKey('D')!)).toBe('Em');
    expect(romanToChord('V7', parseKey('A')!)).toBe('E7');
    expect(realiseProgression(PROGRESSIONS[0], parseKey('G')!)).toEqual(['G', 'D', 'Em', 'C']);
    const andalusian = PROGRESSIONS.find((p) => p.name === 'Andalusian')!;
    expect(realiseProgression(andalusian, parseKey('Am')!)).toEqual(['Am', 'G', 'F', 'E']);
  });
});

describe('chord detection', () => {
  const chordAudio = (midis: number[], dur = 1) => {
    const n = Math.floor(SR * dur);
    const x = new Float32Array(n);
    for (const m of midis) for (let h = 1; h <= 5; h++) for (let i = 0; i < n; i++) x[i] += (0.2 / h) * Math.sin((2 * Math.PI * midiToFreq(m) * h * i) / SR);
    return x;
  };
  it('names chords played into the mic', () => {
    expect(detectChord(chordAudio([48, 52, 55, 60]), SR)!.name).toBe('C');
    expect(detectChord(chordAudio([45, 52, 57, 60, 64]), SR)!.name).toBe('Am');
    expect(detectChord(chordAudio([43, 47, 50, 53]), SR)!.name).toBe('G7');
    expect(detectChord(chordAudio([50, 57, 62, 67]), SR)!.name).toBe('Dsus4');
    expect(detectChord(chordAudio([42, 50, 57, 62, 66]), SR)!.name).toBe('D/F#');
  });
  it('is quiet on silence', () => {
    expect(detectChord(new Float32Array(SR), SR)).toBeNull();
    expect(chordFromChroma(new Array(12).fill(0), null)).toBeNull();
  });
});

describe('synth and patterns', () => {
  it('renders pitched notes for every instrument', () => {
    for (const inst of ['piano', 'acoustic', 'electric', 'pad'] as const) {
      const x = renderNote(inst, 57, 0.6, SR);
      const off = inst === 'pad' ? Math.floor(SR * 0.3) : 2000;
      const [f] = yin(x.subarray(off, off + 2048), SR);
      expect(Math.abs(f - 220) / 220, inst).toBeLessThan(0.03);
      expect(Math.max(...x.map(Math.abs))).toBeLessThan(1);
    }
    expect(renderClick(SR, true).length).toBeGreaterThan(100);
  });
  it('schedules patterns in time with the bars', () => {
    const bars = [{ chords: ['C'] }, { chords: ['Am', 'F'] }];
    const s = buildSchedule(bars, { bpm: 120, timeSig: [4, 4], pattern: 'block', instrument: 'piano', metronome: true });
    expect(s.length).toBeCloseTo(4);
    expect(s.clicks.length).toBe(8);
    expect(s.clicks.filter((c) => c.accent).map((c) => c.time)).toEqual([0, 2]);
    const starts = [...new Set(s.notes.map((n) => Math.round(n.time * 10) / 10))];
    expect(starts).toEqual([0, 2, 3]);
    const strum = buildSchedule([{ chords: ['G'] }], { bpm: 100, timeSig: [4, 4], pattern: 'strum-folk', instrument: 'acoustic', metronome: false });
    const hits = new Set(strum.notes.map((n) => Math.round(n.time / 0.3)));
    expect(hits.size).toBe(6);
    expect(chordNotes('G', 'acoustic').length).toBe(6);
    const waltz = buildSchedule([{ chords: ['C'] }], { bpm: 90, timeSig: [3, 4], pattern: 'pulse', instrument: 'piano', metronome: true });
    expect(waltz.clicks.length).toBe(3);
  });
  it('tap tempo averages recent taps', () => {
    expect(tapTempo([0, 500, 1000, 1500, 2000])).toBe(120);
    expect(tapTempo([0, 500])).toBeNull();
    expect(tapTempo([0, 600, 5000, 5500, 6000])).toBe(120);
  });
});
