import { describe, expect, it } from 'vitest';
import type { SectionKind, SectionWithLines, SongDoc } from '../model';
import { bumpReq, describeDue, describeReq, dueChoices, endOfDay, goalProgress, GOAL_PRESETS, parseGoal, startOfDay, statusLine, type Goal } from './goals';

let n = 0;
function sec(kind: SectionKind, lines: string[], extra: Partial<SectionWithLines> = {}): SectionWithLines {
  const id = `s${n++}`;
  return { id, songId: 'x', kind, label: '', sort: n, collapsed: false, feeling: '', intensity: null, bars: [], melody: [], lines: lines.map((t, i) => ({ id: `${id}l${i}`, sectionId: id, sort: i, text: t, locked: false, alts: [], chords: [] })), ...extra };
}
const doc = (sections: SectionWithLines[]): SongDoc => ({
  song: { id: 'x', title: 'T', folderId: null, status: 'draft', pinned: false, tags: [], key: null, bpm: 90, timeSig: [4, 4], capo: 0, createdAt: 0, updatedAt: 0, openedAt: 0, deletedAt: null },
  sections,
});
const NOON = new Date(2026, 10, 17, 12, 0, 0).getTime(); // a Tuesday

describe('goalProgress', () => {
  const goal: Goal = { reqs: [{ type: 'sections', kind: 'verse', count: 2 }, { type: 'sections', kind: 'chorus', count: 1 }, { type: 'take', count: 1 }], dueAt: endOfDay(NOON + 3 * 86400000), createdAt: NOON };

  it('counts drafted sections of each kind, not empty ones', () => {
    const d = doc([sec('verse', ['a', 'b']), sec('verse', ['only one']), sec('chorus', ['x', 'y', 'z'])]);
    const p = goalProgress(goal, d, 0, NOON);
    expect(p.items.map((i) => [i.have, i.need, i.done])).toEqual([[1, 2, false], [1, 1, true], [0, 1, false]]);
    expect(p.done).toBe(1);
    expect(p.fraction).toBeCloseTo((0.5 + 1 + 0) / 3);
    expect(p.daysLeft).toBe(3);
    expect(p.status).toBe('on-track');
  });
  it('is done when every item is met', () => {
    const d = doc([sec('verse', ['a', 'b']), sec('verse', ['c', 'd']), sec('chorus', ['x', 'y'])]);
    const p = goalProgress(goal, d, 1, NOON);
    expect(p.status).toBe('done');
    expect(p.fraction).toBe(1);
  });
  it('counts lines, chords, melody and takes', () => {
    const g: Goal = { reqs: [{ type: 'lines', count: 3 }, { type: 'chords', count: 1 }, { type: 'melody', count: 1 }], dueAt: null, createdAt: 0 };
    const d = doc([sec('verse', ['a', 'b', ''], { bars: [{ chords: ['C'] }] }), sec('chorus', ['c'], { melody: [{ id: 'n', pitch: 60, start: 0, length: 2 }] })]);
    const p = goalProgress(g, d, 0, NOON);
    expect(p.items.map((i) => i.have)).toEqual([3, 1, 1]);
    expect(p.status).toBe('done');
  });
  it('flags due soon, overdue and open goals', () => {
    const d = doc([sec('verse', ['a'])]);
    const mk = (days: number | null): Goal => ({ reqs: [{ type: 'take', count: 1 }], dueAt: days === null ? null : endOfDay(NOON + days * 86400000), createdAt: 0 });
    expect(goalProgress(mk(1), d, 0, NOON).status).toBe('due-soon');
    expect(goalProgress(mk(0), d, 0, NOON).status).toBe('due-soon');
    expect(goalProgress(mk(-2), d, 0, NOON)).toMatchObject({ status: 'overdue', daysLeft: -2 });
    expect(goalProgress(mk(null), d, 0, NOON)).toMatchObject({ status: 'open', daysLeft: null });
  });
  it('an empty goal is never done', () => {
    expect(goalProgress({ reqs: [], dueAt: null, createdAt: 0 }, doc([]), 0, NOON).status).toBe('open');
  });
});

describe('wording', () => {
  it('describes requirements', () => {
    expect(describeReq({ type: 'sections', kind: 'verse', count: 2 })).toBe('2 verses');
    expect(describeReq({ type: 'sections', kind: 'chorus', count: 1 })).toBe('1 chorus');
    expect(describeReq({ type: 'sections', kind: 'bridge', count: 2 })).toBe('2 bridges');
    expect(describeReq({ type: 'lines', count: 8 })).toBe('8 lines of words');
    expect(describeReq({ type: 'take', count: 1 })).toBe('1 recorded take');
  });
  it('describes deadlines', () => {
    expect(describeDue(null)).toBe('No deadline');
    expect(describeDue(0)).toBe('Due today');
    expect(describeDue(1)).toBe('Due tomorrow');
    expect(describeDue(4)).toBe('Due in 4 days');
    expect(describeDue(-1)).toBe('1 day late');
    expect(describeDue(-3)).toBe('3 days late');
  });
  it('summarises status', () => {
    const p = goalProgress({ reqs: [{ type: 'take', count: 1 }, { type: 'lines', count: 4 }], dueAt: endOfDay(NOON + 86400000), createdAt: 0 }, doc([]), 0, NOON);
    expect(statusLine(p)).toBe('2 of 2 still to do. Due tomorrow');
  });
});

describe('dueChoices', () => {
  it('offers end-of-day times in order, with Friday always ahead', () => {
    const c = dueChoices(NOON);
    expect(c.map((x) => x.label)).toEqual(['Today', 'Tomorrow', 'In 3 days', 'Friday', 'In a week', 'No deadline']);
    expect(c[0].at).toBe(endOfDay(NOON));
    expect(new Date(c[3].at!).getDay()).toBe(5);
    expect(c[3].at!).toBeGreaterThan(c[1].at!);
    expect(c[5].at).toBeNull();
    // on a Friday, "Friday" means next week's
    const friday = new Date(2026, 10, 20, 9, 0).getTime();
    expect(startOfDay(dueChoices(friday)[3].at!) - startOfDay(friday)).toBe(7 * 86400000);
  });
});

describe('bumpReq', () => {
  it('adds, raises and removes', () => {
    let r = bumpReq([], 'sections', 'verse', 1);
    expect(r).toEqual([{ type: 'sections', kind: 'verse', count: 1 }]);
    r = bumpReq(r, 'sections', 'verse', 1);
    r = bumpReq(r, 'sections', 'chorus', 1);
    expect(r.map((x) => [x.kind, x.count])).toEqual([['verse', 2], ['chorus', 1]]);
    r = bumpReq(r, 'lines', undefined, 1);
    expect(r[2]).toEqual({ type: 'lines', count: 4 });
    r = bumpReq(r, 'sections', 'verse', -1);
    r = bumpReq(r, 'sections', 'verse', -1);
    expect(r.map((x) => x.kind ?? x.type)).toEqual(['chorus', 'lines']);
    expect(bumpReq([], 'take', undefined, -1)).toEqual([]);
  });
});

describe('parseGoal / presets', () => {
  it('round-trips and rejects junk', () => {
    const g = GOAL_PRESETS[1];
    const json = JSON.stringify({ reqs: g.reqs, dueAt: 5, createdAt: 1 });
    expect(parseGoal(json)).toEqual({ reqs: g.reqs, dueAt: 5, createdAt: 1 });
    expect(parseGoal('nope')).toBeNull();
    expect(parseGoal(null)).toBeNull();
    expect(parseGoal(JSON.stringify({ reqs: [{ type: 'bogus', count: 1 }, { type: 'take', count: 0 }] }))).toBeNull();
  });
});
