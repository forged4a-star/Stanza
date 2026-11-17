/**
 * Remembers how a song's lyrics change over time, for the writing replay.
 * It only watches the song store and saves in batches a moment after you
 * stop typing, so writing is never slowed. Stored on this device only.
 */
import { changesBetween, type EditEvent, type LyricState } from '../core/lyrics/replay';
import type { SongDoc } from '../core/model';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { useSong } from './song';

const FLUSH_AFTER_MS = 700;
const FLUSH_AT_MOST_MS = 4000;

export const lyricStateOf = (doc: SongDoc): LyricState => ({
  title: doc.song.title,
  sections: doc.sections.map((s) => ({ id: s.id, kind: s.kind, label: s.label, lines: s.lines.map((l) => l.text) })),
});

let started = false;
let pendingSong: string | null = null;
let pending: EditEvent[] = [];
let baseFor: LyricState | null = null; // the song as it was before its first change this session
let hasBase = new Set<string>();
let quiet: ReturnType<typeof setTimeout> | null = null;
let ceiling: ReturnType<typeof setTimeout> | null = null;
let flushes = 0;

async function flush() {
  if (quiet) clearTimeout(quiet);
  if (ceiling) clearTimeout(ceiling);
  quiet = ceiling = null;
  const songId = pendingSong;
  const batch = pending;
  const before = baseFor;
  pending = [];
  pendingSong = null;
  baseFor = null;
  if (!songId || !batch.length) return;
  try {
    const db = await getDb();
    if (!hasBase.has(songId)) {
      // the first thing recorded for a song is how it looked just before
      if (before && (await repo.countEditEvents(db, songId)) === 0) await repo.addEditEvents(db, songId, [{ at: batch[0].at - 1, kind: 'base', state: before }]);
      hasBase.add(songId);
    }
    await repo.addEditEvents(db, songId, batch);
    if (++flushes % 25 === 0) await repo.compactEditEvents(db, songId);
  } catch {
    /* history is a nicety; never get in the way of writing */
  }
}

/** Start watching. Safe to call more than once. */
export function startEditLog() {
  if (started) return;
  started = true;
  useSong.subscribe((state, prev) => {
    const doc = state.doc;
    const was = prev.doc;
    if (!doc || !was || doc.song.id !== was.song.id) {
      // a different song (or none) is now open: save what is waiting for the old one
      void flush();
      return;
    }
    if (doc === was) return;
    const before = lyricStateOf(was);
    const changes = changesBetween(before, lyricStateOf(doc), Date.now());
    if (!changes.length) return;
    if (pendingSong && pendingSong !== doc.song.id) void flush();
    if (!pendingSong) baseFor = before;
    pendingSong = doc.song.id;
    // typing in one section replaces its waiting event rather than piling up
    for (const c of changes) {
      if (c.kind === 'sec' || c.kind === 'title' || c.kind === 'struct') {
        pending = pending.filter((p) => !(p.kind === c.kind && (c.kind !== 'sec' || (p.kind === 'sec' && p.id === c.id))));
      }
      pending.push(c);
    }
    if (quiet) clearTimeout(quiet);
    quiet = setTimeout(() => void flush(), FLUSH_AFTER_MS);
    ceiling ??= setTimeout(() => void flush(), FLUSH_AT_MOST_MS);
  });
}

/** Save anything waiting right now (before reading the history, or leaving the app). */
export const flushEditLog = () => flush();

/** Forget which songs already have a starting point (after their history is cleared). */
export const forgetEditBase = (songId: string) => hasBase.delete(songId);
