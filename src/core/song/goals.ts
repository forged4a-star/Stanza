/**
 * Song goals: "two verses and a chorus by Friday". A goal is a short list of
 * things to have, and optionally a day to have them by. Progress is counted
 * from the song itself, so there is nothing to tick off by hand.
 */
import { SECTION_KIND_NAMES, type SectionKind, type SongDoc } from '../model';

export type GoalReqType = 'sections' | 'lines' | 'chords' | 'melody' | 'take';

export interface GoalReq {
  type: GoalReqType;
  /** for 'sections': which kind of section */
  kind?: SectionKind;
  count: number;
}

export interface Goal {
  reqs: GoalReq[];
  /** end of the due day (local time), or null for no deadline */
  dueAt: number | null;
  createdAt: number;
}

export interface GoalItem {
  req: GoalReq;
  label: string;
  have: number;
  need: number;
  done: boolean;
}

export type GoalStatus = 'done' | 'overdue' | 'due-soon' | 'on-track' | 'open';

export interface GoalProgress {
  items: GoalItem[];
  done: number;
  total: number;
  /** 0..1, counting partial progress on each item */
  fraction: number;
  /** whole days from today to the due day (negative when past); null without a deadline */
  daysLeft: number | null;
  status: GoalStatus;
}

/** A section counts once it has at least two written lines. */
export const DRAFTED_LINES = 2;

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function describeReq(r: GoalReq): string {
  switch (r.type) {
    case 'sections': {
      const name = SECTION_KIND_NAMES[r.kind ?? 'verse'].toLowerCase();
      return plural(r.count, name === 'pre-chorus' ? 'pre-chorus' : name, name === 'pre-chorus' ? 'pre-choruses' : name === 'bridge' ? 'bridges' : name + 's');
    }
    case 'lines':
      return plural(r.count, 'line of words', 'lines of words');
    case 'chords':
      return `chords in ${plural(r.count, 'section')}`;
    case 'melody':
      return `a melody in ${plural(r.count, 'section')}`;
    case 'take':
      return plural(r.count, 'recorded take');
  }
}

export function goalProgress(goal: Goal, doc: SongDoc, takes: number, now = Date.now()): GoalProgress {
  const written = (s: SongDoc['sections'][number]) => s.lines.filter((l) => l.text.trim()).length;
  const items: GoalItem[] = goal.reqs.map((req) => {
    let have = 0;
    if (req.type === 'sections') have = doc.sections.filter((s) => s.kind === (req.kind ?? 'verse') && written(s) >= DRAFTED_LINES).length;
    else if (req.type === 'lines') have = doc.sections.reduce((n, s) => n + written(s), 0);
    else if (req.type === 'chords') have = doc.sections.filter((s) => s.bars.length > 0 || s.lines.some((l) => l.chords.length > 0)).length;
    else if (req.type === 'melody') have = doc.sections.filter((s) => s.melody.length > 0).length;
    else have = takes;
    return { req, label: describeReq(req), have, need: req.count, done: have >= req.count };
  });
  const done = items.filter((i) => i.done).length;
  const fraction = items.length ? items.reduce((n, i) => n + Math.min(1, i.need ? i.have / i.need : 1), 0) / items.length : 0;
  const daysLeft = goal.dueAt === null ? null : Math.round((startOfDay(goal.dueAt) - startOfDay(now)) / 86400000);
  const all = items.length > 0 && done === items.length;
  const status: GoalStatus = all ? 'done' : daysLeft === null ? 'open' : daysLeft < 0 ? 'overdue' : daysLeft <= 1 ? 'due-soon' : 'on-track';
  return { items, done, total: items.length, fraction, daysLeft, status };
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 0);
  return d.getTime();
}

export function describeDue(daysLeft: number | null): string {
  if (daysLeft === null) return 'No deadline';
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return 'Due tomorrow';
  if (daysLeft > 1) return `Due in ${daysLeft} days`;
  return daysLeft === -1 ? '1 day late' : `${-daysLeft} days late`;
}

export function statusLine(p: GoalProgress): string {
  if (p.status === 'done') return 'Goal reached';
  const left = p.total - p.done;
  const what = `${left} of ${p.total} still to do`;
  return p.daysLeft === null ? what : `${what}. ${describeDue(p.daysLeft)}`;
}

/** Deadlines to pick from, as end-of-day timestamps. */
export function dueChoices(now = Date.now()): { label: string; at: number | null }[] {
  const day = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return endOfDay(d.getTime());
  };
  const toFriday = (new Date(now).getDay() === 5 ? 7 : (5 - new Date(now).getDay() + 7) % 7) || 7;
  return [
    { label: 'Today', at: day(0) },
    { label: 'Tomorrow', at: day(1) },
    { label: 'In 3 days', at: day(3) },
    { label: 'Friday', at: day(toFriday) },
    { label: 'In a week', at: day(7) },
    { label: 'No deadline', at: null },
  ];
}

export interface GoalPreset {
  id: string;
  label: string;
  reqs: GoalReq[];
}

export const GOAL_PRESETS: GoalPreset[] = [
  { id: 'hook', label: 'A verse and a chorus', reqs: [{ type: 'sections', kind: 'verse', count: 1 }, { type: 'sections', kind: 'chorus', count: 1 }] },
  { id: 'draft', label: 'A full draft', reqs: [{ type: 'sections', kind: 'verse', count: 2 }, { type: 'sections', kind: 'chorus', count: 1 }, { type: 'sections', kind: 'bridge', count: 1 }] },
  { id: 'demo', label: 'Ready to demo', reqs: [{ type: 'lines', count: 12 }, { type: 'chords', count: 2 }, { type: 'take', count: 1 }] },
];

/** Add one more of a requirement (or start it), so the goal editor can build up a list. */
export function bumpReq(reqs: GoalReq[], type: GoalReqType, kind: SectionKind | undefined, delta: number): GoalReq[] {
  const same = (r: GoalReq) => r.type === type && (type !== 'sections' || r.kind === kind);
  const step = type === 'lines' ? 4 : 1;
  const found = reqs.find(same);
  if (!found) return delta > 0 ? [...reqs, { type, ...(type === 'sections' ? { kind } : {}), count: step }] : reqs;
  const count = found.count + delta * step;
  return count <= 0 ? reqs.filter((r) => r !== found) : reqs.map((r) => (r === found ? { ...r, count: Math.min(99, count) } : r));
}

export function parseGoal(json: string | null | undefined): Goal | null {
  if (!json) return null;
  try {
    const g = JSON.parse(json) as Partial<Goal>;
    if (!g || !Array.isArray(g.reqs)) return null;
    const types: GoalReqType[] = ['sections', 'lines', 'chords', 'melody', 'take'];
    const reqs = g.reqs.filter((r): r is GoalReq => !!r && types.includes(r.type) && Number.isFinite(r.count) && r.count > 0).map((r) => ({ ...r, count: Math.min(99, Math.round(r.count)) }));
    return reqs.length ? { reqs, dueAt: typeof g.dueAt === 'number' ? g.dueAt : null, createdAt: typeof g.createdAt === 'number' ? g.createdAt : Date.now() } : null;
  } catch {
    return null;
  }
}
