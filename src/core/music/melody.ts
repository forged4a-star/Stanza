/**
 * Melody helpers for the piano roll: scale lock, chord tones under a step,
 * linking notes to lyric syllables, and turning a hummed take into notes.
 */
import type { ChordBar, Line, Note } from '../model';
import { analyzeLine } from '../phonetics/line';
import { pitchTrack, segmentNotes } from '../dsp/pitch';
import { newId } from '../util/id';
import { chordPcs, mod12, parseChord, scalePcs, type Key } from './theory';

/** Sixteenth steps per bar. */
export const stepsPerBar = (timeSig: [number, number]) => (timeSig[0] * 16) / timeSig[1];

/** Nearest pitch in the key's scale (ties go up). */
export function snapToScale(pitch: number, key: Key | null): number {
  if (!key) return pitch;
  const scale = scalePcs(key);
  for (let d = 0; d < 7; d++) {
    if (scale.includes(mod12(pitch + d))) return pitch + d;
    if (scale.includes(mod12(pitch - d))) return pitch - d;
  }
  return pitch;
}

/** Move a pitch by `steps` scale degrees (or semitones without a key). */
export function stepInScale(pitch: number, steps: number, key: Key | null): number {
  if (!key || !steps) return pitch + steps;
  const scale = scalePcs(key);
  let p = snapToScale(pitch, key);
  const dir = Math.sign(steps);
  for (let n = 0; n < Math.abs(steps); n++) {
    do p += dir;
    while (!scale.includes(mod12(p)));
  }
  return p;
}

/** The chord sounding at a step of the section (bars split evenly between their chords). */
export function chordAtStep(bars: ChordBar[], step: number, timeSig: [number, number]): string | null {
  const per = stepsPerBar(timeSig);
  const bar = bars[Math.floor(step / per)];
  if (!bar || !bar.chords.length) return null;
  const within = step % per;
  return bar.chords[Math.min(bar.chords.length - 1, Math.floor((within / per) * bar.chords.length))] ?? null;
}

export function chordTonesAtStep(bars: ChordBar[], step: number, timeSig: [number, number]): number[] {
  const name = chordAtStep(bars, step, timeSig);
  const c = name ? parseChord(name) : null;
  return c ? chordPcs(c) : [];
}

export interface SyllableRef {
  lineId: string;
  syl: number;
  text: string;
  stress: 0 | 1 | 2;
  vowel: string;
  onset: string;
  coda: string;
}

/** All syllables of a section's lines, in order. */
export function sectionSyllables(lines: Line[]): SyllableRef[] {
  const out: SyllableRef[] = [];
  for (const l of lines) {
    const info = analyzeLine(l.text);
    info.syllables.forEach((s, i) =>
      out.push({ lineId: l.id, syl: i, text: l.text.slice(s.start, s.end).trim(), stress: s.level, vowel: s.vowel, onset: s.onset, coda: s.coda })
    );
  }
  return out;
}

/**
 * Link notes to syllables in order (one syllable per note; a note that starts
 * right where the previous one ends on the same pitch-contour is not treated
 * specially — users can unlink to make a melisma).
 */
export function autoLink(melody: Note[], lines: Line[]): Note[] {
  const syls = sectionSyllables(lines);
  const sorted = [...melody].sort((a, b) => a.start - b.start || b.pitch - a.pitch);
  const ids = new Map<string, { lineId: string | null; syl: number | null }>();
  sorted.forEach((n, i) => ids.set(n.id, syls[i] ? { lineId: syls[i].lineId, syl: syls[i].syl } : { lineId: null, syl: null }));
  return melody.map((n) => ({ ...n, ...ids.get(n.id)! }));
}

/** Resolve a note's linked syllable against the current lyrics (null if it no longer exists). */
export function linkedSyllable(n: Note, lines: Line[]): SyllableRef | null {
  if (!n.lineId || n.syl == null) return null;
  const line = lines.find((l) => l.id === n.lineId);
  if (!line) return null;
  const info = analyzeLine(line.text);
  const s = info.syllables[n.syl];
  if (!s) return null;
  return { lineId: line.id, syl: n.syl, text: line.text.slice(s.start, s.end).trim(), stress: s.level, vowel: s.vowel, onset: s.onset, coda: s.coda };
}

/**
 * Hum-to-MIDI: pitch-track a sung/hummed take, segment it into notes and
 * quantise them to the sixteenth grid at the song's tempo (first note on the
 * downbeat), optionally snapped to the key.
 */
export function humToNotes(samples: Float32Array, sr: number, opts: { bpm: number; key: Key | null; snap?: boolean; maxSteps?: number }): Note[] {
  const events = segmentNotes(pitchTrack(samples, sr, { minHz: 70, maxHz: 1000 }), 0.08);
  if (!events.length) return [];
  const step = 60 / opts.bpm / 4;
  const t0 = events[0].start;
  const notes: Note[] = [];
  for (const e of events) {
    const start = Math.round((e.start - t0) / step);
    const length = Math.max(1, Math.round(e.duration / step));
    if (opts.maxSteps && start >= opts.maxSteps) break;
    const pitch = opts.snap !== false ? snapToScale(e.pitch, opts.key) : e.pitch;
    const prev = notes[notes.length - 1];
    // quantising can make neighbours collide: trim the previous note
    if (prev && prev.start + prev.length > start) prev.length = Math.max(1, start - prev.start);
    if (prev && prev.start === start) continue;
    notes.push({ id: newId(), pitch, start, length, lineId: null, syl: null });
  }
  return notes;
}

/** Sung range of a take (for "find my range"): low and high MIDI notes held for a moment. */
export function sungRange(samples: Float32Array, sr: number): { low: number; high: number } | null {
  const notes = segmentNotes(pitchTrack(samples, sr, { minHz: 60, maxHz: 1100 }), 0.25);
  if (!notes.length) return null;
  return { low: Math.min(...notes.map((n) => n.pitch)), high: Math.max(...notes.map((n) => n.pitch)) };
}
