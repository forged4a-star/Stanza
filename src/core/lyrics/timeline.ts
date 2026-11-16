/**
 * Version time travel: scrub back through a song's history, see what changed
 * at each step, and find lines that existed then but are gone now.
 */
import { sectionDisplayNames, type SongDoc } from '../model';
import { diffSongs, diffStats } from './diff';

export const normLine = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface GoneLine {
  /** the section in the current song it came from, or null if that section no longer exists */
  sectionId: string | null;
  sectionName: string;
  text: string;
}

/** Lines in `past` that appear nowhere in `now` (not as a line, and not as a saved alternate). */
export function goneLines(past: SongDoc, now: SongDoc): GoneLine[] {
  const have = new Set<string>();
  for (const s of now.sections) for (const l of s.lines) [l.text, ...l.alts].forEach((t) => t.trim() && have.add(normLine(t)));
  const names = sectionDisplayNames(past.sections);
  const out: GoneLine[] = [];
  const seen = new Set<string>();
  past.sections.forEach((s, i) => {
    for (const l of s.lines) {
      const n = normLine(l.text);
      if (!n || have.has(n) || seen.has(n)) continue;
      seen.add(n);
      out.push({ sectionId: now.sections.some((x) => x.id === s.id) ? s.id : null, sectionName: names[i], text: l.text.trim() });
    }
  });
  return out;
}

export interface StepSummary {
  added: number;
  removed: number;
  changed: number;
  /** nothing changed in the words */
  same: boolean;
}

/** What changed in the lyrics from one version to the next. */
export function stepSummary(prev: SongDoc | null, cur: SongDoc): StepSummary {
  if (!prev) {
    const n = cur.sections.reduce((a, s) => a + s.lines.filter((l) => l.text.trim()).length, 0);
    return { added: n, removed: 0, changed: 0, same: n === 0 };
  }
  const st = diffStats(diffSongs(prev, cur));
  return { added: st.added, removed: st.removed, changed: st.changed, same: !st.added && !st.removed && !st.changed };
}

export function describeStep(s: StepSummary): string {
  if (s.same) return 'No change to the words';
  return [s.added && `${s.added} added`, s.changed && `${s.changed} changed`, s.removed && `${s.removed} removed`].filter(Boolean).join(', ');
}
