import { describe, expect, it } from 'vitest';
import { addEdit, addWritten, fmtDuration, IDLE_GAP_MS, keyOf, prune, summarize, type Tracker, type WritingLog } from './writing';

const at = (d: number, h = 12, m = 0, s = 0) => new Date(2026, 5, d, h, m, s).getTime();

describe('writing stats', () => {
  it('counts the time between edits, up to two minutes', () => {
    let log: WritingLog = {};
    let tr: Tracker = { lastEditAt: null };
    ({ log, tr } = (({ log: l, tracker }) => ({ log: l, tr: tracker }))(addEdit(log, tr, at(10, 12, 0, 0))));
    ({ log, tr } = (({ log: l, tracker }) => ({ log: l, tr: tracker }))(addEdit(log, tr, at(10, 12, 0, 20))));
    ({ log, tr } = (({ log: l, tracker }) => ({ log: l, tr: tracker }))(addEdit(log, tr, at(10, 12, 1, 0))));
    expect(log[keyOf(at(10))].ms).toBe(5000 + 20000 + 40000);
  });
  it('a long break adds only a small first-edit amount, not the whole gap', () => {
    let log: WritingLog = {};
    let tr: Tracker = { lastEditAt: null };
    for (const t of [at(10, 12, 0), at(10, 15, 0)]) ({ log, tracker: tr } = addEdit(log, tr, t) as never);
    expect(log[keyOf(at(10))].ms).toBe(10000);
    expect(IDLE_GAP_MS).toBe(120000);
  });
  it('lines written add up per day', () => {
    let log = addWritten({}, at(10), 1);
    log = addWritten(log, at(10, 20), 2);
    expect(log[keyOf(at(10))].written).toBe(3);
  });
  it('summary covers seven days with scrapped lines from their timestamps', () => {
    const log: WritingLog = { [keyOf(at(10))]: { ms: 600000, written: 8 }, [keyOf(at(9))]: { ms: 120000, written: 3 } };
    const s = summarize(log, [at(10, 9), at(10, 10), at(3)], new Date(2026, 5, 10, 18));
    expect(s.days).toHaveLength(7);
    expect(s.days.at(-1)).toMatchObject({ key: keyOf(at(10)), ms: 600000, written: 8, scrapped: 2 });
    expect(s.written).toBe(11);
    expect(s.scrapped).toBe(2); // the one on the 3rd is outside the week
    expect(s.totalMs).toBe(720000);
    expect(s.bestMs).toBe(600000);
  });
  it('streak counts consecutive days, and forgives a day you have not written yet', () => {
    const day = (d: number) => [keyOf(at(d)), { ms: 90000, written: 1 }] as const;
    const log: WritingLog = Object.fromEntries([day(8), day(9), day(10)]);
    expect(summarize(log, [], new Date(2026, 5, 10, 18)).streak).toBe(3);
    expect(summarize(log, [], new Date(2026, 5, 11, 8)).streak).toBe(3); // today still empty
    expect(summarize(log, [], new Date(2026, 5, 12, 8)).streak).toBe(0); // a day was missed
    const gap: WritingLog = Object.fromEntries([day(8), day(10)]);
    expect(summarize(gap, [], new Date(2026, 5, 10, 18)).streak).toBe(1);
    // under a minute does not count
    expect(summarize({ [keyOf(at(10))]: { ms: 30000, written: 0 } }, [], new Date(2026, 5, 10, 18)).streak).toBe(0);
  });
  it('formats durations', () => {
    expect(fmtDuration(0)).toBe('0 min');
    expect(fmtDuration(20000)).toBe('under a minute');
    expect(fmtDuration(25 * 60000)).toBe('25 min');
    expect(fmtDuration(95 * 60000)).toBe('1 h 35 min');
  });
  it('prunes old days', () => {
    const log: WritingLog = { '2020-01-01': { ms: 1, written: 1 }, [keyOf(at(10))]: { ms: 1, written: 1 } };
    expect(Object.keys(prune(log, new Date(2026, 5, 10)))).toEqual([keyOf(at(10))]);
  });
});
