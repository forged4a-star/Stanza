import { describe, expect, it } from 'vitest';
import type { SongDoc } from '../model';
import { LYRIC_TARGET, progressFromDoc, songProgress } from './progress';

const base = { title: '', lines: 0, chordSections: 0, melodySections: 0, takes: 0 };

describe('song progress', () => {
  it('an empty song has nothing done and starts with the words', () => {
    const p = songProgress(base);
    expect(p.done).toBe(0);
    expect(p.fraction).toBe(0);
    expect(p.next?.id).toBe('lyrics');
  });
  it('counts each part once it exists', () => {
    const p = songProgress({ title: 'Rivers', lines: LYRIC_TARGET, chordSections: 2, melodySections: 1, takes: 3 });
    expect(p.done).toBe(5);
    expect(p.fraction).toBe(1);
    expect(p.next).toBeNull();
  });
  it('words count only once there are enough lines, and the hint says how many are left', () => {
    expect(songProgress({ ...base, lines: LYRIC_TARGET - 1 }).items[0].done).toBe(false);
    expect(songProgress({ ...base, lines: 5 }).items[0].hint).toBe('Write 3 more lines');
    expect(songProgress({ ...base, lines: LYRIC_TARGET - 1 }).items[0].hint).toBe('Write 1 more line');
  });
  it('whitespace is not a title', () => {
    expect(songProgress({ ...base, title: '   ' }).items.find((i) => i.id === 'title')!.done).toBe(false);
  });
  it('next is the first missing thing in the order a song comes together', () => {
    expect(songProgress({ ...base, lines: 9 }).next?.id).toBe('chords');
    expect(songProgress({ ...base, lines: 9, chordSections: 1 }).next?.id).toBe('melody');
  });
  it('reads a song document: chords over lyrics count, empty lines do not', () => {
    const doc = {
      song: { title: 'T' },
      sections: [
        { bars: [], melody: [], lines: [{ text: 'one', chords: [{ syl: 0, chord: 'C' }] }, { text: '  ', chords: [] }] },
        { bars: [], melody: [{ id: 'n' }], lines: [{ text: 'two', chords: [] }] },
      ],
    } as never as SongDoc;
    const p = progressFromDoc(doc, 1);
    expect(p.items.map((i) => [i.id, i.done])).toEqual([['lyrics', false], ['chords', true], ['melody', true], ['take', true], ['title', true]]);
  });
});
