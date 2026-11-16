import { describe, expect, it } from 'vitest';
import { cardById } from '../lyrics/constraints';
import { dayKey, ideaFor, IDEAS } from './daily';

describe('idea of the day', () => {
  it('is the same all day and changes the next day', () => {
    const morning = new Date(2026, 5, 10, 7, 0);
    const night = new Date(2026, 5, 10, 23, 59);
    expect(ideaFor(morning).id).toBe(ideaFor(night).id);
    expect(ideaFor(new Date(2026, 5, 11)).id).not.toBe(ideaFor(morning).id);
  });
  it('shows every idea once before any repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < IDEAS.length; i++) seen.add(ideaFor(new Date(2026, 0, 1 + i)).id);
    expect(seen.size).toBe(IDEAS.length);
  });
  it('every card an idea refers to exists, and ids are unique', () => {
    for (const i of IDEAS) if (i.card) expect(cardById(i.card), i.id).not.toBeNull();
    expect(new Set(IDEAS.map((i) => i.id)).size).toBe(IDEAS.length);
  });
  it('prompts are prompts: none is written as a lyric line, and all are a sentence', () => {
    for (const i of IDEAS) {
      expect(i.prompt.length).toBeGreaterThan(20);
      expect(/[.?]$/.test(i.prompt), i.id).toBe(true);
    }
  });
  it('day key is local and zero padded', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
