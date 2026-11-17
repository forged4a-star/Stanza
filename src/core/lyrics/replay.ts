/**
 * Writing replay: the lyrics of a song as a series of changes over time, and
 * the machinery to play them back. Long pauses are squeezed so hours of
 * writing replay in under a minute, and text that was added is revealed
 * letter by letter.
 */
import { sectionDisplayNames, type SectionKind } from '../model';

export interface LyricSection {
  id: string;
  kind: SectionKind;
  label: string;
  lines: string[];
}
export interface LyricState {
  title: string;
  sections: LyricSection[];
}

export interface StructSection {
  id: string;
  kind: SectionKind;
  label: string;
}

export type EditEvent = { at: number } & (
  | { kind: 'base'; state: LyricState }
  | { kind: 'sec'; id: string; text: string }
  | { kind: 'struct'; sections: StructSection[] }
  | { kind: 'title'; title: string }
);

export const emptyState = (): LyricState => ({ title: '', sections: [] });

export function applyEvent(state: LyricState, e: EditEvent): LyricState {
  switch (e.kind) {
    case 'base':
      return e.state;
    case 'title':
      return { ...state, title: e.title };
    case 'sec': {
      const lines = e.text.split('\n');
      const known = state.sections.some((s) => s.id === e.id);
      // text for a section we have not been told about yet gets a place at the end
      if (!known) return { ...state, sections: [...state.sections, { id: e.id, kind: 'verse', label: '', lines }] };
      return { ...state, sections: state.sections.map((s) => (s.id === e.id ? { ...s, lines } : s)) };
    }
    case 'struct': {
      const byId = new Map(state.sections.map((s) => [s.id, s]));
      return { ...state, sections: e.sections.map((s) => ({ id: s.id, kind: s.kind, label: s.label, lines: byId.get(s.id)?.lines ?? [''] })) };
    }
  }
}

/** The state after the first `n` events. */
export function stateAfter(events: EditEvent[], n: number): LyricState {
  let s = emptyState();
  for (let i = 0; i < Math.min(n, events.length); i++) s = applyEvent(s, events[i]);
  return s;
}

/** Lyric text as one string per section, in order, for display and comparison. */
export const textOf = (s: LyricSection) => s.lines.join('\n');

export interface Frame {
  /** when this state appears in the replay, in milliseconds from the start */
  at: number;
  /** when it was really written */
  wall: number;
  state: LyricState;
}

export interface Timeline {
  frames: Frame[];
  /** replay length at normal speed, ms */
  duration: number;
  /** from the first to the last change, ms */
  realSpan: number;
}

/**
 * Lay the events out in replay time. Gaps shorter than `idleCap` play at their
 * real length; longer ones (a coffee break, a night's sleep) take `idleCap`.
 */
export function buildTimeline(events: EditEvent[], opts: { idleCap?: number } = {}): Timeline {
  const cap = opts.idleCap ?? 1500;
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const frames: Frame[] = [];
  let state = emptyState();
  let clock = 0;
  sorted.forEach((e, i) => {
    if (i > 0) clock += Math.min(cap, Math.max(60, e.at - sorted[i - 1].at));
    state = applyEvent(state, e);
    frames.push({ at: clock, wall: e.at, state });
  });
  return { frames, duration: clock, realSpan: sorted.length ? sorted[sorted.length - 1].at - sorted[0].at : 0 };
}

/** Index of the frame showing at replay time `t` (the last one whose time has come). */
export function frameIndexAt(tl: Timeline, t: number): number {
  let lo = 0;
  let hi = tl.frames.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.frames[mid].at <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The state between two frames, with text that was appended revealed in proportion to `p` (0 to 1).
 * Anything else (edits in the middle, deletions, new sections) simply appears when `p` reaches 1.
 */
export function typewriter(from: LyricState, to: LyricState, p: number): LyricState {
  if (p >= 1) return to;
  if (p <= 0) return from;
  const old = new Map(from.sections.map((s) => [s.id, textOf(s)]));
  return {
    ...to,
    sections: to.sections.map((s) => {
      const before = old.get(s.id);
      const now = textOf(s);
      if (before === undefined || before === now) return before === undefined ? { ...s, lines: [''] } : s;
      if (!now.startsWith(before)) return { ...s, lines: before.split('\n') };
      const shown = before + now.slice(before.length, before.length + Math.round((now.length - before.length) * p));
      return { ...s, lines: shown.split('\n') };
    }),
  };
}

/** The state to draw at replay time `t`, typing the newest change in over the 600 ms before it lands. */
export function stateAtTime(tl: Timeline, t: number): LyricState {
  if (!tl.frames.length) return emptyState();
  const i = frameIndexAt(tl, t);
  const next = tl.frames[i + 1];
  const cur = tl.frames[i];
  if (!next) return cur.state;
  const lead = Math.min(600, next.at - cur.at);
  const into = t - (next.at - lead);
  return into > 0 ? typewriter(cur.state, next.state, into / lead) : cur.state;
}

/** Plain facts for the caption: how much was written, and over how long. */
export function describeReplay(tl: Timeline): string {
  if (!tl.frames.length) return '';
  const last = tl.frames[tl.frames.length - 1].state;
  const lines = last.sections.reduce((n, s) => n + s.lines.filter((l) => l.trim()).length, 0);
  const m = Math.round(tl.realSpan / 60000);
  const span = m < 1 ? 'under a minute' : m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 60 / 24)} days`;
  return `${lines} line${lines === 1 ? '' : 's'}, written over ${span}`;
}

/** The displayed name of each section of a state (Verse, Chorus 2 …). */
export const namesOf = (s: LyricState) => sectionDisplayNames(s.sections);

// ------------------------------------------------------------------ compaction

/** Fold the oldest events into one starting point, so a long history stays small. */
export function compact(events: EditEvent[], keep: number): EditEvent[] {
  if (events.length <= keep + 1) return events;
  const cut = events.length - keep;
  const base: EditEvent = { at: events[cut - 1].at, kind: 'base', state: stateAfter(events, cut) };
  return [base, ...events.slice(cut)];
}

// ------------------------------------------------------------------ recording changes

const structKey = (s: LyricState) => s.sections.map((x) => `${x.id}|${x.kind}|${x.label}`).join('\n');

/** What changed between two states of a song's lyrics, as events stamped `at`. */
export function changesBetween(prev: LyricState, next: LyricState, at: number): EditEvent[] {
  const out: EditEvent[] = [];
  if (structKey(prev) !== structKey(next)) out.push({ at, kind: 'struct', sections: next.sections.map((s) => ({ id: s.id, kind: s.kind, label: s.label })) });
  const before = new Map(prev.sections.map((s) => [s.id, textOf(s)]));
  for (const s of next.sections) {
    const now = textOf(s);
    // a brand new, still empty section is covered by the structure event
    if (before.has(s.id) ? before.get(s.id) !== now : now !== '') out.push({ at, kind: 'sec', id: s.id, text: now });
  }
  if (prev.title !== next.title) out.push({ at, kind: 'title', title: next.title });
  return out;
}
