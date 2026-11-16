import { describe, expect, it } from 'vitest';
import type { SectionWithLines } from '../model';
import { compareSections, defaultContrastPair, findFlags, questionsFor, sectionStats } from './shape';

let n = 0;
const sec = (kind: SectionWithLines['kind'], lines: string[], extra: Partial<SectionWithLines> = {}): SectionWithLines => {
  const id = 's' + n++;
  return { id, songId: 'x', kind, label: '', sort: 0, collapsed: false, feeling: '', intensity: null, bars: [], melody: [], lines: lines.map((t, i) => ({ id: id + 'l' + i, sectionId: id, sort: i, text: t, locked: false, alts: [], chords: [] })), ...extra };
};
const notes = (pitches: number[], len = 4) => pitches.map((p, i) => ({ id: 'n' + i + p, pitch: p, start: i * len, length: len }));

describe('contrast meter', () => {
  it('measures range, register, line length, chord rate and density', () => {
    const verse = sec('verse', ['I walked along the river in the rain tonight', 'and every window on the street was closed'], {
      bars: [{ chords: ['C'] }, { chords: ['C'] }, { chords: ['F'] }, { chords: ['F'] }],
      melody: notes([60, 62, 60, 59, 60, 62, 64, 62]),
    });
    const chorus = sec('chorus', ['run', 'run to me'], {
      bars: [{ chords: ['F', 'G'] }, { chords: ['Am', 'G'] }],
      melody: notes([67, 69, 72, 71], 8),
    });
    const st = sectionStats(verse, [4, 4]);
    expect(st.range).toBe(5);
    expect(st.chordRate).toBe(1);
    const c = compareSections(verse, chorus, [4, 4]);
    const by = Object.fromEntries(c.rows.map((r) => [r.metric, r]));
    expect(by.register.diff).toBeGreaterThan(5);
    expect(by.lineLength.note).toMatch(/shorter/);
    expect(by.chordRate.note).toMatch(/faster/);
    expect(by.density.note).toMatch(/spacious/);
    expect(c.verdict).toMatch(/Clear contrast/);
    const same = compareSections(verse, sec('chorus', ['I walked along the river in the rain tonight', 'and every window on the street was closed'], { bars: verse.bars, melody: verse.melody }), [4, 4]);
    expect(same.verdict).toMatch(/very alike/);
    expect(defaultContrastPair([{ kind: 'intro' }, { kind: 'verse' }, { kind: 'chorus' }])).toEqual([1, 2]);
  });
});

describe('cliché and repetition flags', () => {
  it('finds clichés, tired rhyme pairs and over-used words', () => {
    const s = sec('verse', ['you set me free with your heart of gold', 'a burning fire', 'my deep desire', 'the river river runs to the river']);
    const f = findFlags([s]);
    expect(f.filter((x) => x.kind === 'cliche').map((x) => s.lines.find((l) => l.id === x.lineId)!.text.slice(x.start, x.end))).toEqual(['set me free', 'heart of gold']);
    expect(f.some((x) => x.kind === 'cliche-rhyme' && /fire \/ desire/.test(x.message))).toBe(true);
    expect(f.filter((x) => x.kind === 'repeat').length).toBe(2);
    // choruses are allowed to repeat
    expect(findFlags([sec('chorus', ['river river river river'])]).filter((x) => x.kind === 'repeat')).toHaveLength(0);
  });
});

describe('questions, never lyrics', () => {
  it('asks about the writer’s own words', () => {
    const q = questionsFor(sec('verse', ['I feel the love inside my heart', 'and you were gone'], { feeling: 'regret' }), { name: 'Verse' });
    expect(q.join(' ')).toMatch(/“feel”|“love”|“heart”/);
    expect(q.join(' ')).toMatch(/Who is “you”/);
    expect(q.join(' ')).toMatch(/regret/);
    for (const x of q) expect(x.trim().endsWith('?')).toBe(true);
    expect(questionsFor(sec('bridge', ['']), { name: 'Bridge' })[0]).toMatch(/know now/);
  });
});
