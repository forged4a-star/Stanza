import { describe, expect, it } from 'vitest';
import { applyEvent, buildTimeline, compact, describeReplay, emptyState, frameIndexAt, stateAfter, stateAtTime, textOf, typewriter, type EditEvent } from './replay';

const base = (at: number): EditEvent => ({ at, kind: 'base', state: { title: 'T', sections: [{ id: 'a', kind: 'verse', label: '', lines: [''] }] } });
const sec = (at: number, id: string, text: string): EditEvent => ({ at, kind: 'sec', id, text });

describe('applying events', () => {
  it('title, section text, and structure', () => {
    let s = applyEvent(emptyState(), base(0));
    s = applyEvent(s, sec(1, 'a', 'down by the river\nI lost my stone'));
    expect(s.sections[0].lines).toEqual(['down by the river', 'I lost my stone']);
    s = applyEvent(s, { at: 2, kind: 'title', title: 'Rivers' });
    expect(s.title).toBe('Rivers');
    s = applyEvent(s, { at: 3, kind: 'struct', sections: [{ id: 'b', kind: 'chorus', label: '' }, { id: 'a', kind: 'verse', label: '' }] });
    expect(s.sections.map((x) => x.id)).toEqual(['b', 'a']);
    expect(s.sections[1].lines[0]).toBe('down by the river'); // text survives a reorder
    expect(s.sections[0].lines).toEqual(['']); // a new section starts empty
  });
  it('a deleted section is gone', () => {
    let s = applyEvent(emptyState(), base(0));
    s = applyEvent(s, { at: 1, kind: 'struct', sections: [] });
    expect(s.sections).toEqual([]);
  });
  it('text for a section not yet announced still shows up', () => {
    expect(applyEvent(emptyState(), sec(1, 'z', 'hello')).sections[0].lines).toEqual(['hello']);
  });
  it('stateAfter folds the first n events', () => {
    const ev = [base(0), sec(1, 'a', 'one'), sec(2, 'a', 'one two')];
    expect(textOf(stateAfter(ev, 2).sections[0])).toBe('one');
    expect(textOf(stateAfter(ev, 99).sections[0])).toBe('one two');
    expect(stateAfter(ev, 0)).toEqual(emptyState());
  });
});

describe('timeline', () => {
  const ev = [base(1000), sec(2000, 'a', 'one'), sec(2800, 'a', 'one two'), sec(3_600_000, 'a', 'one two three')];
  it('short gaps keep their length and long ones are squeezed to the cap', () => {
    const tl = buildTimeline(ev, { idleCap: 1500 });
    expect(tl.frames.map((f) => f.at)).toEqual([0, 1000, 1800, 3300]);
    expect(tl.duration).toBe(3300);
    expect(tl.realSpan).toBe(3_599_000);
  });
  it('events are sorted by time, and no frame lands on top of another', () => {
    const tl = buildTimeline([sec(5, 'a', 'x'), base(0), sec(5, 'a', 'xy')]);
    expect(tl.frames.map((f) => f.wall)).toEqual([0, 5, 5]);
    expect(tl.frames[2].at).toBeGreaterThan(tl.frames[1].at);
  });
  it('finds the frame showing at a time', () => {
    const tl = buildTimeline(ev);
    expect(frameIndexAt(tl, 0)).toBe(0);
    expect(frameIndexAt(tl, 1500)).toBe(1);
    expect(frameIndexAt(tl, 99999)).toBe(3);
    expect(frameIndexAt(buildTimeline([]), 5)).toBe(-1);
  });
  it('an empty history is empty', () => {
    expect(buildTimeline([]).frames).toEqual([]);
    expect(stateAtTime(buildTimeline([]), 100)).toEqual(emptyState());
    expect(describeReplay(buildTimeline([]))).toBe('');
  });
  it('captions the amount and the span in plain words', () => {
    const lines = ['a', 'b', 'c', 'd'].join('\n');
    const tl = buildTimeline([base(0), sec(90 * 60000, 'a', lines)]);
    expect(describeReplay(tl)).toBe('4 lines, written over 1 h 30 min');
    expect(describeReplay(buildTimeline([base(0), sec(20000, 'a', 'one')]))).toBe('1 line, written over under a minute');
  });
});

describe('typing animation', () => {
  const from = { title: '', sections: [{ id: 'a', kind: 'verse' as const, label: '', lines: ['down by'] }] };
  const to = { title: '', sections: [{ id: 'a', kind: 'verse' as const, label: '', lines: ['down by the river'] }] };
  it('reveals appended text in proportion', () => {
    expect(textOf(typewriter(from, to, 0).sections[0])).toBe('down by');
    expect(textOf(typewriter(from, to, 1).sections[0])).toBe('down by the river');
    const mid = textOf(typewriter(from, to, 0.5).sections[0]);
    expect(mid.startsWith('down by')).toBe(true);
    expect(mid.length).toBeGreaterThan('down by'.length);
    expect(mid.length).toBeLessThan('down by the river'.length);
  });
  it('a change that is not an append appears all at once, at the end', () => {
    const edited = { ...to, sections: [{ ...to.sections[0], lines: ['up by the river'] }] };
    expect(textOf(typewriter(from, edited, 0.5).sections[0])).toBe('down by');
    expect(textOf(typewriter(from, edited, 1).sections[0])).toBe('up by the river');
  });
  it('a new section starts empty and fills in', () => {
    const more = { ...to, sections: [...to.sections, { id: 'b', kind: 'chorus' as const, label: '', lines: ['la la'] }] };
    expect(typewriter(to, more, 0.4).sections[1].lines).toEqual(['']);
  });
  it('stateAtTime types the next change in just before it lands', () => {
    const tl = buildTimeline([base(0), sec(1000, 'a', 'down by'), sec(2000, 'a', 'down by the river')]);
    expect(textOf(stateAtTime(tl, 1000).sections[0])).toBe('down by');
    expect(textOf(stateAtTime(tl, 1100).sections[0])).toBe('down by'); // not yet typing
    const typing = textOf(stateAtTime(tl, 1800).sections[0]);
    expect(typing.length).toBeGreaterThan('down by'.length);
    expect(typing.length).toBeLessThan('down by the river'.length);
    expect(textOf(stateAtTime(tl, 2000).sections[0])).toBe('down by the river');
    expect(textOf(stateAtTime(tl, 99999).sections[0])).toBe('down by the river');
  });
});

describe('compaction', () => {
  const many: EditEvent[] = [base(0), ...Array.from({ length: 20 }, (_, i) => sec(i + 1, 'a', 'x'.repeat(i + 1)))];
  it('folds old events into one starting point and keeps the recent ones', () => {
    const c = compact(many, 5);
    expect(c).toHaveLength(6);
    expect(c[0].kind).toBe('base');
    expect(textOf(stateAfter(c, 99).sections[0])).toBe(textOf(stateAfter(many, 99).sections[0]));
  });
  it('leaves a short history alone', () => {
    expect(compact(many.slice(0, 4), 5)).toEqual(many.slice(0, 4));
  });
});

describe('noticing changes', () => {
  const s = (title: string, ...secs: [string, string][]) => ({ title, sections: secs.map(([id, text]) => ({ id, kind: 'verse' as const, label: '', lines: text.split('\n') })) });
  it('nothing changed means no events', async () => {
    const { changesBetween } = await import('./replay');
    expect(changesBetween(s('T', ['a', 'x']), s('T', ['a', 'x']), 5)).toEqual([]);
  });
  it('typing in a section gives one event with the whole section text', async () => {
    const { changesBetween } = await import('./replay');
    expect(changesBetween(s('T', ['a', 'down']), s('T', ['a', 'down by']), 5)).toEqual([{ at: 5, kind: 'sec', id: 'a', text: 'down by' }]);
  });
  it('title, a new section and a reorder', async () => {
    const { changesBetween } = await import('./replay');
    expect(changesBetween(s('T', ['a', 'x']), s('New', ['a', 'x']), 1)).toEqual([{ at: 1, kind: 'title', title: 'New' }]);
    const added = changesBetween(s('T', ['a', 'x']), s('T', ['a', 'x'], ['b', '']), 2);
    expect(added.map((e) => e.kind)).toEqual(['struct']); // an empty new section needs no text event
    const reordered = changesBetween(s('T', ['a', 'x'], ['b', 'y']), s('T', ['b', 'y'], ['a', 'x']), 3);
    expect(reordered.map((e) => e.kind)).toEqual(['struct']);
  });
  it('replaying what was recorded rebuilds the final song', async () => {
    const { changesBetween } = await import('./replay');
    const states = [s('', ['a', '']), s('', ['a', 'down']), s('Rivers', ['a', 'down by\nthe river']), s('Rivers', ['a', 'down by\nthe river'], ['b', 'la']), s('Rivers', ['b', 'la'], ['a', 'down by\nthe river'])];
    const events: EditEvent[] = [{ at: 0, kind: 'base', state: states[0] }];
    states.slice(1).forEach((st, i) => events.push(...changesBetween(states[i], st, i + 1)));
    expect(stateAfter(events, 999)).toEqual(states.at(-1));
  });
});
