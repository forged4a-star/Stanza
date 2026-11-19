import { describe, expect, it } from 'vitest';
import type { SectionKind, SectionWithLines, SongDoc } from '../model';
import { columnsFor, paginate, spreadsOf, standBlocks } from './standLayout';

let n = 0;
function sec(kind: SectionKind, lines: string[], bars: string[][] = []): SectionWithLines {
  const id = `s${n++}`;
  return { id, songId: 'x', kind, label: '', sort: n, collapsed: false, feeling: '', intensity: null, bars: bars.map((chords) => ({ chords })), melody: [], lines: lines.map((t, i) => ({ id: `${id}l${i}`, sectionId: id, sort: i, text: t, locked: false, alts: [], chords: [] })) };
}
const doc = (sections: SectionWithLines[]): SongDoc => ({
  song: { id: 'x', title: 'T', folderId: null, status: 'draft', pinned: false, tags: [], key: null, bpm: 90, timeSig: [4, 4], capo: 0, createdAt: 0, updatedAt: 0, openedAt: 0, deletedAt: null },
  sections,
});
const O = { size: 28, colWidth: 400, showChords: true };

describe('standBlocks', () => {
  it('emits a header, optional chord row, each line and a gap per section', () => {
    const b = standBlocks(doc([sec('verse', ['one', '', 'two'], [['C'], ['G']]), sec('chorus', ['three'])]), O);
    expect(b.map((x) => x.kind)).toEqual(['header', 'bars', 'line', 'blank', 'line', 'gap', 'header', 'line', 'gap']);
  });
  it('leaves out the chord row when chords are off', () => {
    const b = standBlocks(doc([sec('verse', ['one'], [['C']])]), { ...O, showChords: false });
    expect(b.map((x) => x.kind)).toEqual(['header', 'line', 'gap']);
  });
  it('makes a long line taller than a short one, and bigger type taller still', () => {
    const long = 'word '.repeat(30).trim();
    const d = doc([sec('verse', ['short', long])]);
    const [, short, tall] = standBlocks(d, O);
    expect(tall.h).toBeGreaterThan(short.h * 2);
    const [, , big] = standBlocks(d, { ...O, size: 44 });
    expect(big.h).toBeGreaterThan(tall.h);
  });
});

describe('paginate', () => {
  const lines = (k: number) => Array.from({ length: k }, (_, i) => `line number ${i}`);
  it('never overfills a page and keeps every block in order', () => {
    const blocks = standBlocks(doc([sec('verse', lines(10)), sec('chorus', lines(6)), sec('verse', lines(10))]), O);
    const pages = paginate(blocks, 500);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.reduce((s, b) => s + b.h, 0)).toBeLessThanOrEqual(500);
    const flat = pages.flat().filter((b) => b.kind !== 'gap' && b.kind !== 'blank');
    expect(flat).toEqual(blocks.filter((b) => b.kind !== 'gap' && b.kind !== 'blank'));
  });
  it('does not leave a heading alone at the bottom of a page', () => {
    const blocks = standBlocks(doc([sec('verse', lines(7)), sec('chorus', lines(3))]), O);
    for (const height of [300, 380, 420, 480, 520, 600]) {
      for (const p of paginate(blocks, height)) {
        const last = p[p.length - 1];
        expect(last.kind).not.toBe('header');
        expect(last.kind).not.toBe('gap');
      }
    }
  });
  it('drops spacing at the top of a page', () => {
    const pages = paginate(standBlocks(doc([sec('verse', lines(10)), sec('chorus', lines(10))]), O), 420);
    for (const p of pages) expect(['gap', 'blank']).not.toContain(p[0].kind);
  });
  it('puts one oversized block on a page of its own rather than looping', () => {
    const blocks = standBlocks(doc([sec('verse', ['word '.repeat(200)])]), O);
    expect(paginate(blocks, 100).flat().length).toBe(blocks.filter((b) => b.kind !== 'gap').length);
  });
  it('an empty song has no pages', () => {
    expect(paginate([], 500)).toEqual([]);
  });
});

describe('spreads', () => {
  it('groups pages for wide screens', () => {
    expect(spreadsOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(spreadsOf([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
  it('uses two columns only on wide screens', () => {
    expect([columnsFor(400), columnsFor(820), columnsFor(1100)]).toEqual([1, 1, 2]);
  });
});
