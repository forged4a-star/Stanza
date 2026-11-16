/**
 * Writing session stats: minutes spent writing, lines written, and lines that
 * went to the scrapyard, by day. Time counts only while you are editing: the
 * gap between two edits counts up to two minutes, so leaving the phone on the
 * table does not add time.
 */
export interface DayStat {
  ms: number;
  written: number;
}
export type WritingLog = Record<string, DayStat>;
export interface Tracker {
  lastEditAt: number | null;
}

export const IDLE_GAP_MS = 120_000;
export const FIRST_EDIT_MS = 5_000;
/** a day counts toward the streak with at least this much writing */
export const STREAK_MS = 60_000;

const p2 = (n: number) => String(n).padStart(2, '0');
export const keyOf = (t: number | Date) => {
  const d = typeof t === 'number' ? new Date(t) : t;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

export function addEdit(log: WritingLog, tracker: Tracker, now: number): { log: WritingLog; tracker: Tracker } {
  const gap = tracker.lastEditAt === null ? FIRST_EDIT_MS : now - tracker.lastEditAt;
  const add = gap < 0 ? 0 : gap < IDLE_GAP_MS ? Math.max(gap, 0) : FIRST_EDIT_MS;
  const k = keyOf(now);
  const day = log[k] ?? { ms: 0, written: 0 };
  return { log: { ...log, [k]: { ...day, ms: day.ms + add } }, tracker: { lastEditAt: now } };
}

export function addWritten(log: WritingLog, now: number, n = 1): WritingLog {
  const k = keyOf(now);
  const day = log[k] ?? { ms: 0, written: 0 };
  return { ...log, [k]: { ...day, written: day.written + n } };
}

export interface DaySummary {
  key: string;
  /** Mon, Tue… */
  label: string;
  ms: number;
  written: number;
  scrapped: number;
}

export interface WritingSummary {
  days: DaySummary[];
  totalMs: number;
  written: number;
  scrapped: number;
  /** consecutive days of writing, counting back from today (or yesterday if you have not written yet today) */
  streak: number;
  bestMs: number;
}

export function summarize(log: WritingLog, scrapTimes: number[], today: Date = new Date(), span = 7): WritingSummary {
  const scrapByDay = new Map<string, number>();
  for (const t of scrapTimes) scrapByDay.set(keyOf(t), (scrapByDay.get(keyOf(t)) ?? 0) + 1);
  const days: DaySummary[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const k = keyOf(d);
    days.push({ key: k, label: d.toLocaleDateString('en-US', { weekday: 'short' }), ms: log[k]?.ms ?? 0, written: log[k]?.written ?? 0, scrapped: scrapByDay.get(k) ?? 0 });
  }
  let streak = 0;
  let i = 0;
  const wrote = (k: string) => (log[k]?.ms ?? 0) >= STREAK_MS;
  const dayAt = (back: number) => keyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back));
  if (!wrote(dayAt(0))) i = 1;
  while (wrote(dayAt(i))) {
    streak++;
    i++;
  }
  return {
    days,
    totalMs: days.reduce((n, d) => n + d.ms, 0),
    written: days.reduce((n, d) => n + d.written, 0),
    scrapped: days.reduce((n, d) => n + d.scrapped, 0),
    streak,
    bestMs: Math.max(0, ...days.map((d) => d.ms)),
  };
}

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return ms >= 1000 ? 'under a minute' : '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** Drop days older than this many days so the log stays small. */
export function prune(log: WritingLog, today: Date = new Date(), keepDays = 120): WritingLog {
  const cutoff = keyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - keepDays));
  return Object.fromEntries(Object.entries(log).filter(([k]) => k >= cutoff));
}
