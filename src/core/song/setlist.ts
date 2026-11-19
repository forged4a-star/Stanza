/** Setlists: an ordered run of songs for a gig, with a key shift and a note on each. */
import { keyName, mod12, parseKey, transposeChord } from '../music/theory';

export interface SetlistEntry {
  /** the setlist item id */
  id: string;
  songId: string;
  title: string;
  key: string | null;
  bpm: number;
  capo: number;
  /** semitones to move the chords for this set (so the song suits the singer) */
  transpose: number;
  note: string;
  /** about how long the song plays, in seconds (null if unknown) */
  seconds: number | null;
}

/** The key the song is played in once the set's transpose is applied. */
export function playedKey(e: Pick<SetlistEntry, 'key' | 'transpose'>): string | null {
  const k = parseKey(e.key);
  if (!k) return null;
  if (!e.transpose) return keyName(k);
  const t = { tonic: mod12(k.tonic + e.transpose), mode: k.mode };
  return keyName(t);
}

export function formatDuration(seconds: number): string {
  if (seconds < 45) return 'under a minute';
  const total = Math.max(0, Math.round(seconds / 60));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function setTotals(entries: SetlistEntry[]): { songs: number; seconds: number; label: string } {
  const seconds = entries.reduce((n, e) => n + (e.seconds ?? 0), 0);
  const songs = entries.length;
  return { songs, seconds, label: `${songs} song${songs === 1 ? '' : 's'}${seconds ? ` · about ${formatDuration(seconds)}` : ''}` };
}

/** Hints where two neighbouring songs are a long way apart in key (5 or more semitones round the circle). */
export function keyJumps(entries: SetlistEntry[]): { from: number; to: number; semitones: number; text: string }[] {
  const out: { from: number; to: number; semitones: number; text: string }[] = [];
  for (let i = 0; i + 1 < entries.length; i++) {
    const a = parseKey(playedKey(entries[i]));
    const b = parseKey(playedKey(entries[i + 1]));
    if (!a || !b) continue;
    const d = mod12(b.tonic - a.tonic);
    const dist = Math.min(d, 12 - d);
    if (dist >= 5) out.push({ from: i, to: i + 1, semitones: dist, text: `${keyName(a)} to ${keyName(b)} is a big key change between "${entries[i].title || 'Untitled'}" and "${entries[i + 1].title || 'Untitled'}".` });
  }
  return out;
}

/** Move one item to a new place, returning a new array (or the same one when nothing moves). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const end = Math.max(0, Math.min(list.length - 1, to));
  const next = list.slice();
  const [x] = next.splice(from, 1);
  next.splice(end, 0, x);
  return next;
}

/** A printable run sheet as plain text. */
export function setlistText(name: string, entries: SetlistEntry[]): string {
  const lines = [name.trim() || 'Setlist', setTotals(entries).label, ''];
  entries.forEach((e, i) => {
    const k = playedKey(e);
    const bits = [k ? `key ${k}` : null, e.capo ? `capo ${e.capo}` : null, `${Math.round(e.bpm)} bpm`, e.transpose ? `${e.transpose > 0 ? '+' : ''}${e.transpose} from the written key` : null].filter(Boolean);
    lines.push(`${i + 1}. ${e.title.trim() || 'Untitled'}  (${bits.join(', ')})`);
    if (e.note.trim()) lines.push(`   ${e.note.trim()}`);
  });
  return lines.join('\n') + '\n';
}

export const transposeLabel = (n: number) => (n === 0 ? 'as written' : n > 0 ? `up ${n}` : `down ${-n}`);
export { transposeChord };
