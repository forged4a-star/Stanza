import { describe, expect, it } from 'vitest';
import type { SectionKind, SectionWithLines, SongDoc } from '../model';
import { scale01, songOverview } from './overview';

let n = 0;
function sec(kind: SectionKind, lines: string[], opts: { bars?: string[][]; melody?: { pitch: number; start: number; length: number }[] } = {}): SectionWithLines {
  const id = `s${n++}`;
  return {
    id,
    songId: 'x',
    kind,
    label: '',
    sort: n,
    collapsed: false,
    feeling: '',
    intensity: null,
    bars: (opts.bars ?? []).map((c) => ({ chords: c })),
    melody: (opts.melody ?? []).map((m, i) => ({ id: `${id}n${i}`, ...m })),
    lines: lines.map((t, i) => ({ id: `${id}l${i}`, sectionId: id, sort: i, text: t, locked: false, alts: [], chords: [] })),
  };
}
const doc = (sections: SectionWithLines[]): SongDoc => ({
  song: { id: 'x', title: 'T', folderId: null, status: 'draft', pinned: false, tags: [], key: 'C', bpm: 90, timeSig: [4, 4], capo: 0, createdAt: 0, updatedAt: 0, openedAt: 0, deletedAt: null },
  sections,
});

describe('scale01', () => {
  it('keeps the quietest visible and the busiest at 1', () => {
    expect(scale01([2, 4, null, 6])).toEqual([0.15, 0.15 + 0.85 * 0.5, null, 1]);
  });
  it('a lone or flat value reads as a middle bar', () => {
    expect(scale01([null, 3])).toEqual([null, 0.6]);
    expect(scale01([3, 3])).toEqual([0.5, 0.5]);
    expect(scale01([null, null])).toEqual([null, null]);
  });
});

describe('songOverview', () => {
  it('sizes sections by chord bars, or two bars a line when that is longer', () => {
    const o = songOverview(doc([sec('verse', ['a b', 'c d', 'e f', 'g h'], { bars: [['C'], ['G']] }), sec('chorus', ['x y'], { bars: [['F'], ['C'], ['G'], ['C']] })]));
    expect(o.spans.map((s) => s.bars)).toEqual([8, 4]);
    expect(o.totalBars).toBe(12);
    expect(o.spans[0].share).toBeCloseTo(8 / 12);
    expect(o.spans[0].estimated).toBe(false);
  });
  it('marks a length guessed from lines only', () => {
    const o = songOverview(doc([sec('verse', ['one two', 'three four'])]));
    expect(o.spans[0].bars).toBe(4);
    expect(o.spans[0].estimated).toBe(true);
  });
  it('measures melody length in bars', () => {
    const o = songOverview(doc([sec('verse', [], { melody: [{ pitch: 60, start: 0, length: 4 }, { pitch: 64, start: 20, length: 4 }] })]));
    expect(o.spans[0].bars).toBe(2); // ends at step 24, 16 steps a bar
  });
  it('leaves empty sections at zero and flags them', () => {
    const o = songOverview(doc([sec('verse', ['one two three']), sec('chorus', [])]));
    expect(o.spans[1].bars).toBe(0);
    expect(o.notes.join(' ')).toMatch(/Chorus is still empty/);
  });
  it('builds heat rows with a value only where the section has that thing', () => {
    const o = songOverview(
      doc([
        sec('verse', ['one two three four', 'five six seven eight'], { bars: [['C'], ['G'], ['Am'], ['F']] }),
        sec('chorus', ['la la'], { bars: [['C', 'G'], ['F', 'C']], melody: [{ pitch: 60, start: 0, length: 2 }, { pitch: 67, start: 4, length: 2 }] }),
      ])
    );
    const by = Object.fromEntries(o.rows.map((r) => [r.id, r]));
    expect(by.melody.cells[0]).toBeNull();
    expect(by.melody.raw[1]).toBe(7);
    expect(by.chords.raw).toEqual([1, 2]);
    expect(by.chords.cells[1]).toBe(1);
    expect(by.words.cells.every((c) => c !== null)).toBe(true);
  });
  it('counts chords per bar of the chord grid, not per bar of lyrics', () => {
    const lines = Array.from({ length: 4 }, (_, i) => `line number ${i}`); // eight bars of words
    const o = songOverview(doc([sec('verse', lines, { bars: [['D'], ['G'], ['A'], ['Bm']] })]));
    expect(o.spans[0].bars).toBe(8);
    expect(o.rows.find((r) => r.id === 'chords')!.raw).toEqual([1]);
  });
  it('notes a long section, a lone chorus and sections without chords', () => {
    const long = Array.from({ length: 12 }, (_, i) => `line number ${i}`);
    const o = songOverview(doc([sec('verse', ['a b', 'c d'], { bars: [['C'], ['G']] }), sec('chorus', ['x y'], { bars: [['F'], ['C']] }), sec('bridge', long, { bars: [['Am'], ['F']] }), sec('verse', ['more words here'])]));
    const text = o.notes.join(' | ');
    expect(text).toMatch(/Bridge is the longest part/);
    expect(text).toMatch(/chorus only comes round once/);
    expect(text).toMatch(/No chords yet in Verse 2/);
  });
  it('handles an empty song', () => {
    const o = songOverview(doc([]));
    expect(o.spans).toEqual([]);
    expect(o.totalBars).toBe(0);
  });
});
