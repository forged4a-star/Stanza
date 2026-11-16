import { describe, expect, it } from 'vitest';
import type { SongDoc } from '../model';
import { importLyrics } from '../lyrics/importText';
import { chordLineFor, chordSheetText } from './chordSheet';

const doc = (): SongDoc => ({
  song: { id: 's', title: 'River', folderId: null, status: 'draft', pinned: false, tags: [], key: 'G', bpm: 96, timeSig: [4, 4], capo: 2, createdAt: 0, updatedAt: 0, openedAt: 0, deletedAt: null },
  sections: [
    {
      id: 'v', songId: 's', kind: 'verse', label: '', sort: 0, collapsed: false, feeling: '', intensity: null, melody: [], bars: [{ chords: ['G'] }, { chords: ['Em', 'C'] }],
      lines: [
        { id: 'a', sectionId: 'v', sort: 0, text: 'down by the river', locked: false, alts: [], chords: [{ syl: 0, chord: 'G' }, { syl: 3, chord: 'Em' }] },
        { id: 'b', sectionId: 'v', sort: 1, text: 'I lost my stone', locked: false, alts: [], chords: [] },
      ],
    },
  ],
});

describe('chord sheet text', () => {
  it('puts each chord over its syllable', () => {
    const t = chordSheetText(doc());
    expect(t).toContain('G           Em\ndown by the river\nI lost my stone');
    expect(t).toMatch(/^River\nKey: G {3}Capo 2 {3}96 bpm\n\n\[Verse\]\n\| G \| Em C \|/);
  });
  it('transposes and can show Roman numerals', () => {
    expect(chordSheetText(doc(), { transpose: 2 })).toContain('A           F#m\ndown by the river');
    expect(chordSheetText(doc(), { roman: true })).toContain('I           vi\ndown by the river');
  });
  it('never lets chords run together', () => {
    expect(chordLineFor('hi there', [{ syl: 0, chord: 'Cmaj7' }, { syl: 1, chord: 'G/B' }], (c) => c)).toBe('Cmaj7 G/B');
  });
  it('reads back through the lyrics importer', () => {
    const back = importLyrics(chordSheetText(doc()).split('\n').slice(4).join('\n'));
    expect(back.sections[0].lines[0]).toEqual({ text: 'down by the river', chords: [{ syl: 0, chord: 'G' }, { syl: 3, chord: 'Em' }] });
  });
});
