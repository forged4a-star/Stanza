/** Timing for the stage view's auto-scroll: how long the song takes, and how fast to scroll. */
import type { SongDoc } from '../../core/model';

/** Seconds in one bar at the song's tempo and time signature. */
export function barSeconds(doc: SongDoc): number {
  const [beats, unit] = doc.song.timeSig;
  return (beats * (4 / unit) * 60) / Math.max(20, doc.song.bpm);
}

/**
 * About how long the song lasts: each section runs for its chord bars, or two
 * bars per written line if that is longer (a four-chord loop sung over eight lines).
 */
export function songSeconds(doc: SongDoc): number {
  let bars = 0;
  for (const s of doc.sections) {
    const lines = s.lines.filter((l) => l.text.trim()).length;
    bars += Math.max(s.bars.length, lines * 2, lines || s.bars.length ? 1 : 0);
  }
  return Math.max(10, bars * barSeconds(doc));
}

/** Pixels per second so the whole sheet scrolls past in `seconds` at `speed` (1 = tempo pace). */
export function scrollVelocity(maxOffset: number, seconds: number, speed: number): number {
  if (maxOffset <= 0 || seconds <= 0) return 0;
  return (maxOffset / seconds) * speed;
}

export const clampSpeed = (s: number) => Math.min(3, Math.max(0.25, Math.round(s * 20) / 20));

/** Seconds at which each section starts and ends, using the same pacing as songSeconds. */
export function sectionBounds(doc: SongDoc): { start: number; end: number }[] {
  const bar = barSeconds(doc);
  const out: { start: number; end: number }[] = [];
  let at = 0;
  for (const s of doc.sections) {
    const lines = s.lines.filter((l) => l.text.trim()).length;
    const bars = Math.max(s.bars.length, lines * 2, lines || s.bars.length ? 1 : 0);
    out.push({ start: at, end: at + bars * bar });
    at += bars * bar;
  }
  return out;
}

/** Which section the song is in after `elapsed` seconds (the last one once it runs past the end). */
export function sectionAt(doc: SongDoc, elapsed: number): number {
  const b = sectionBounds(doc);
  if (!b.length) return 0;
  const i = b.findIndex((x) => elapsed < x.end);
  return i < 0 ? b.length - 1 : i;
}
