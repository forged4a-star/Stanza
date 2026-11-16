import { describe, expect, it } from 'vitest';
import type { SongDoc } from '../model';
import { describeStep, goneLines, normLine, stepSummary } from './timeline';

const doc = (sections: { id: string; lines: string[]; alts?: string[][] }[]): SongDoc =>
  ({
    song: { id: 's', title: '' },
    sections: sections.map((s) => ({
      id: s.id,
      kind: 'verse',
      label: '',
      bars: [],
      melody: [],
      lines: s.lines.map((text, i) => ({ id: s.id + i, text, alts: s.alts?.[i] ?? [], chords: [], locked: false })),
    })),
  }) as never;

describe('time travel', () => {
  it('normalises case, punctuation and spacing', () => {
    expect(normLine('  Hello,   WORLD! ')).toBe('hello world');
    expect(normLine("Don't stop")).toBe("don't stop");
  });
  it('finds lines that are gone now, with the section they came from', () => {
    const past = doc([{ id: 'a', lines: ['the river is wide', 'I lost my stone', ''] }]);
    const now = doc([{ id: 'a', lines: ['The river is wide.', 'something new'] }]);
    expect(goneLines(past, now)).toEqual([{ sectionId: 'a', sectionName: 'Verse', text: 'I lost my stone' }]);
  });
  it('a line saved as an alternate is not gone', () => {
    const past = doc([{ id: 'a', lines: ['old words'] }]);
    const now = doc([{ id: 'a', lines: ['new words'], alts: [['old words']] }]);
    expect(goneLines(past, now)).toEqual([]);
  });
  it('a line that moved to another section is not gone', () => {
    const past = doc([{ id: 'a', lines: ['same line'] }, { id: 'b', lines: [] }]);
    const now = doc([{ id: 'a', lines: [] }, { id: 'b', lines: ['same line'] }]);
    expect(goneLines(past, now)).toEqual([]);
  });
  it('a deleted section gives sectionId null', () => {
    const past = doc([{ id: 'a', lines: ['x one'] }, { id: 'gone', lines: ['y two'] }]);
    const now = doc([{ id: 'a', lines: ['x one'] }]);
    expect(goneLines(past, now)).toEqual([{ sectionId: null, sectionName: 'Verse 2', text: 'y two' }]);
  });
  it('lists a repeated gone line once', () => {
    const past = doc([{ id: 'a', lines: ['la la', 'la la'] }]);
    expect(goneLines(past, doc([{ id: 'a', lines: [] }])).length).toBe(1);
  });
  it('summarises a step in plain words', () => {
    const v1 = doc([{ id: 'a', lines: ['one', 'two'] }]);
    const v2 = doc([{ id: 'a', lines: ['one', 'two', 'three'] }]);
    expect(stepSummary(v1, v2)).toMatchObject({ added: 1, removed: 0, same: false });
    expect(describeStep(stepSummary(v1, v2))).toBe('1 added');
    expect(describeStep(stepSummary(v1, v1))).toBe('No change to the words');
    expect(stepSummary(null, v1)).toMatchObject({ added: 2, same: false });
  });
});
