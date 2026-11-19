import { describe, expect, it } from 'vitest';
import type { SectionKind, SectionWithLines, SongDoc } from '../model';
import { handoffSummary } from './handoff';

let n = 0;
function sec(kind: SectionKind, lines: (string | { t: string; locked: true })[], extra: Partial<SectionWithLines> = {}): SectionWithLines {
  const id = `s${n++}`;
  return {
    id, songId: 'x', kind, label: '', sort: n, collapsed: false, feeling: '', intensity: null, bars: [], melody: [],
    lines: lines.map((l, i) => ({ id: `${id}l${i}`, sectionId: id, sort: i, text: typeof l === 'string' ? l : l.t, locked: typeof l !== 'string', alts: [], chords: [] })),
    ...extra,
  };
}
const doc = (sections: SectionWithLines[], song: Partial<SongDoc['song']> = {}): SongDoc => ({
  song: { id: 'x', title: 'Night Drive', folderId: null, status: 'draft', pinned: false, tags: [], key: 'Em', bpm: 96, timeSig: [4, 4], capo: 2, createdAt: 0, updatedAt: 0, openedAt: 0, deletedAt: null, ...song },
  sections,
});

describe('handoffSummary', () => {
  const d = doc([
    sec('verse', ['a b c', 'd e f'], { bars: [{ chords: ['Em'] }], feeling: 'restless' }),
    sec('chorus', []),
    sec('verse', [{ t: 'keep this one', locked: true }, 'x y']),
  ]);
  const text = handoffSummary({ doc: d, takes: 0, comments: ['  Is the second line too long?  '] });

  it('opens with the title and the song facts', () => {
    const [title, facts] = text.split('\n');
    expect(title).toBe('Night Drive');
    expect(facts).toBe('E minor · 96 bpm · 4/4 · capo 2 · draft');
  });
  it('shows which parts are done and which are missing', () => {
    expect(text).toMatch(/WHERE IT STANDS \(\d of 5 parts\)/);
    expect(text).toMatch(/\[ \] A take/);
    expect(text).toMatch(/\[x\] Title/);
  });
  it('lists each section with what it has and the writer\'s own feeling word', () => {
    expect(text).toMatch(/- Verse 1: 2 lines, chords — feels restless/);
    expect(text).toMatch(/- Chorus: empty/);
    expect(text).toMatch(/- Verse 2: 2 lines$/m);
  });
  it('lists what is still open, including comments', () => {
    const open = text.split('STILL OPEN')[1];
    expect(open).toMatch(/Chorus has no words yet/);
    expect(open).toMatch(/Verse 2 has words but no chords/);
    expect(open).toMatch(/- Comment: Is the second line too long\?/);
    expect(open).toMatch(/Record a take/);
  });
  it('says to leave locked lines alone, and only quotes them when asked', () => {
    expect(text).toMatch(/PLEASE LEAVE ALONE \(1 line locked\)/);
    expect(text).not.toMatch(/keep this one/);
    expect(handoffSummary({ doc: d, takes: 0, includeLyrics: true })).toMatch(/- Verse 2: "keep this one"/);
  });
  it('never contains an unlocked lyric', () => {
    expect(text).not.toMatch(/a b c|d e f|x y/);
  });
  it('copes with an empty untitled song', () => {
    const t = handoffSummary({ doc: doc([], { title: '', key: null, capo: 0 }), takes: 0 });
    expect(t.split('\n')[0]).toBe('Untitled');
    expect(t).toMatch(/SECTIONS\n\(none yet\)/);
  });
  it('says nothing is missing for a finished song', () => {
    const full = doc([sec('verse', ['a', 'b', 'c', 'd'], { bars: [{ chords: ['C'] }], melody: [{ id: 'n', pitch: 60, start: 0, length: 2 }] }), sec('chorus', ['e', 'f', 'g', 'h'], { bars: [{ chords: ['F'] }] })]);
    expect(handoffSummary({ doc: full, takes: 2 })).toMatch(/STILL OPEN\nNothing missing\./);
  });
});
