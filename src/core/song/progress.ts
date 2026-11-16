/**
 * How finished a song is: five things most songs need. It is a gentle map of
 * what is still missing, not a grade.
 */
import type { SongDoc } from '../model';

export interface ProgressInput {
  title: string;
  /** lines that have words */
  lines: number;
  /** sections with chords (bars or chords over lyrics) */
  chordSections: number;
  /** sections with a melody sketch */
  melodySections: number;
  /** recorded takes */
  takes: number;
}

export interface ProgressItem {
  id: 'title' | 'lyrics' | 'chords' | 'melody' | 'take';
  label: string;
  done: boolean;
  /** what to do next, shown when it is missing */
  hint: string;
}

export interface Progress {
  items: ProgressItem[];
  done: number;
  total: number;
  fraction: number;
  /** the first thing still missing, in the order a song usually comes together */
  next: ProgressItem | null;
}

/** Lines of lyric before the words count as drafted. */
export const LYRIC_TARGET = 8;

export function songProgress(i: ProgressInput): Progress {
  const items: ProgressItem[] = [
    { id: 'lyrics', label: 'Words', done: i.lines >= LYRIC_TARGET, hint: `Write ${Math.max(1, LYRIC_TARGET - i.lines)} more line${LYRIC_TARGET - i.lines === 1 ? '' : 's'}` },
    { id: 'chords', label: 'Chords', done: i.chordSections > 0, hint: 'Add chords to a section' },
    { id: 'melody', label: 'Melody', done: i.melodySections > 0, hint: 'Sketch a melody on the piano roll' },
    { id: 'take', label: 'A take', done: i.takes > 0, hint: 'Record a take' },
    { id: 'title', label: 'Title', done: !!i.title.trim(), hint: 'Give it a title' },
  ];
  const done = items.filter((x) => x.done).length;
  return { items, done, total: items.length, fraction: done / items.length, next: items.find((x) => !x.done) ?? null };
}

export function progressFromDoc(doc: SongDoc, takes: number): Progress {
  return songProgress({
    title: doc.song.title,
    lines: doc.sections.reduce((n, s) => n + s.lines.filter((l) => l.text.trim()).length, 0),
    chordSections: doc.sections.filter((s) => s.bars.length > 0 || s.lines.some((l) => l.chords.length > 0)).length,
    melodySections: doc.sections.filter((s) => s.melody.length > 0).length,
    takes,
  });
}
