import { describe, expect, it } from 'vitest';
import { formatDuration, keyJumps, moveItem, playedKey, setlistText, setTotals, transposeLabel, type SetlistEntry } from './setlist';

const e = (title: string, key: string | null, extra: Partial<SetlistEntry> = {}): SetlistEntry => ({ id: title, songId: title, title, key, bpm: 100, capo: 0, transpose: 0, note: '', seconds: 180, ...extra });

describe('playedKey', () => {
  it('applies the set transpose and keeps major/minor', () => {
    expect(playedKey(e('a', 'G'))).toBe('G');
    expect(playedKey(e('a', 'G', { transpose: 2 }))).toBe('A');
    expect(playedKey(e('a', 'Em', { transpose: -2 }))).toBe('Dm');
    expect(playedKey(e('a', 'C', { transpose: -3 }))).toBe('A');
    expect(playedKey(e('a', null, { transpose: 2 }))).toBeNull();
  });
});

describe('totals', () => {
  it('adds up time and counts songs', () => {
    expect(setTotals([e('a', 'C'), e('b', 'G', { seconds: 245 })])).toMatchObject({ songs: 2, seconds: 425, label: '2 songs · about 7 min' });
    expect(setTotals([e('a', 'C', { seconds: null })]).label).toBe('1 song');
    expect(setTotals([]).label).toBe('0 songs');
  });
  it('formats long sets in hours', () => {
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(100)).toBe('2 min');
    expect(formatDuration(20)).toBe('under a minute');
    expect(formatDuration(50)).toBe('1 min');
  });
});

describe('keyJumps', () => {
  it('warns only on big moves, measured the short way round the circle', () => {
    // C to G is 7 semitones up = 5 down; G to F# is 1; F# to B is 5
    const j = keyJumps([e('One', 'C'), e('Two', 'G'), e('Three', 'F#'), e('Four', 'B')]);
    expect(j.map((x) => [x.from, x.to, x.semitones])).toEqual([[0, 1, 5], [2, 3, 5]]);
    expect(j[0].text).toBe('C to G is a big key change between "One" and "Two".');
  });
  it('counts the set transpose, and skips songs with no key', () => {
    expect(keyJumps([e('One', 'C'), e('Two', 'G', { transpose: 5 })])).toEqual([]); // G+5 = C
    expect(keyJumps([e('One', null), e('Two', 'F#')])).toEqual([]);
    expect(keyJumps([e('One', 'C')])).toEqual([]);
  });
});

describe('moveItem', () => {
  it('moves an item and clamps the target', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem([1, 2, 3], 1, 99)).toEqual([1, 3, 2]);
  });
  it('returns the same array when nothing moves', () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 1, 1)).toBe(a);
    expect(moveItem(a, 9, 0)).toBe(a);
  });
});

describe('setlistText', () => {
  it('prints a run sheet', () => {
    const t = setlistText('Friday set', [e('Night Drive', 'Em', { capo: 2, bpm: 96.4, note: 'start quiet' }), e('Garden', 'G', { transpose: 2 })]);
    expect(t.split('\n')).toEqual(['Friday set', '2 songs · about 6 min', '', '1. Night Drive  (key Em, capo 2, 96 bpm)', '   start quiet', '2. Garden  (key A, 100 bpm, +2 from the written key)', '']);
  });
  it('labels transposes', () => {
    expect([transposeLabel(0), transposeLabel(3), transposeLabel(-2)]).toEqual(['as written', 'up 3', 'down 2']);
  });
});
