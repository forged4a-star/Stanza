/**
 * Turn chord bars into timed note events with a playing pattern (block chords,
 * strums, arpeggios), plus metronome clicks. Pure: the audio engine only plays
 * what this returns.
 */
import type { ChordBar } from '../model';
import { guitarShapes, GUITAR_TUNING } from '../music/voicings';
import { chordVoicing, parseChord } from '../music/theory';
import type { Instrument } from './synth';

export type PatternId = 'block' | 'pulse' | 'strum-folk' | 'strum-pop' | 'arp-up' | 'arp-updown' | 'bass-chord';

export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: 'block', label: 'Whole bar' },
  { id: 'pulse', label: 'On the beat' },
  { id: 'strum-folk', label: 'Strum D-DU-UDU' },
  { id: 'strum-pop', label: 'Strum D-D-UDU' },
  { id: 'arp-up', label: 'Arpeggio up' },
  { id: 'arp-updown', label: 'Arpeggio up-down' },
  { id: 'bass-chord', label: 'Bass + chord' },
];

export interface NoteEvent {
  /** seconds from the start */
  time: number;
  midi: number;
  dur: number;
  vel: number;
}

export interface ClickEvent {
  time: number;
  accent: boolean;
}

export interface Schedule {
  notes: NoteEvent[];
  clicks: ClickEvent[];
  /** length in seconds (one loop) */
  length: number;
  /** bar start times, for a playhead */
  barTimes: number[];
}

/** Strum hits within one bar of 4/4, in eighth notes: [eighth, down?] */
const STRUMS: Record<string, [number, boolean][]> = {
  'strum-folk': [[0, true], [2, true], [3, false], [5, false], [6, true], [7, false]],
  'strum-pop': [[0, true], [2, true], [5, false], [6, true], [7, false]],
};

/** Notes for a chord on a given instrument (guitar shapes for strummed sounds). */
export function chordNotes(name: string, inst: Instrument, capo = 0): number[] {
  const c = parseChord(name);
  if (!c) return [];
  if (inst === 'acoustic' || inst === 'electric') {
    const shape = guitarShapes(name, { capo, max: 1 })[0];
    if (shape) return shape.frets.map((f, i) => (f < 0 ? -1 : GUITAR_TUNING[i] + capo + f)).filter((n) => n >= 0);
  }
  return chordVoicing(c);
}

export function buildSchedule(
  bars: ChordBar[],
  opts: { bpm: number; timeSig: [number, number]; pattern: PatternId; instrument: Instrument; metronome: boolean; capo?: number }
): Schedule {
  const [beats, unit] = opts.timeSig;
  const beat = (60 / opts.bpm) * (4 / unit);
  const barLen = beats * beat;
  const eighth = beat / 2;
  const notes: NoteEvent[] = [];
  const clicks: ClickEvent[] = [];
  const barTimes: number[] = [];
  const strumGap = opts.instrument === 'piano' ? 0.004 : 0.014;

  bars.forEach((bar, bi) => {
    const t0 = bi * barLen;
    barTimes.push(t0);
    if (opts.metronome) for (let b = 0; b < beats; b++) clicks.push({ time: t0 + b * beat, accent: b === 0 });
    const n = Math.max(1, bar.chords.length);
    bar.chords.forEach((name, ci) => {
      const notesOf = chordNotes(name, opts.instrument, opts.capo);
      if (!notesOf.length) return;
      const start = t0 + (ci * barLen) / n;
      const span = barLen / n;
      const add = (time: number, midi: number, dur: number, vel: number) => {
        if (time < start + span - 1e-6) notes.push({ time, midi, dur: Math.min(dur, start + span - time + 0.05), vel });
      };
      const strum = (time: number, down: boolean, vel: number, dur: number) => {
        const order = down ? notesOf : [...notesOf].reverse().slice(0, Math.max(3, notesOf.length - 2));
        order.forEach((m, k) => add(time + k * strumGap, m, dur, vel * (down ? 1 : 0.75)));
      };
      switch (opts.pattern) {
        case 'block':
          strum(start, true, 0.8, span);
          break;
        case 'pulse':
          for (let b = 0; b < Math.round(span / beat); b++) strum(start + b * beat, true, b === 0 ? 0.85 : 0.65, beat * 0.9);
          break;
        case 'strum-folk':
        case 'strum-pop': {
          const hits = STRUMS[opts.pattern];
          const eighths = Math.round(span / eighth);
          for (let rep = 0; rep * 8 < eighths; rep++) {
            for (const [e, down] of hits) {
              const k = rep * 8 + e;
              if (k >= eighths) continue;
              strum(start + k * eighth, down, e === 0 ? 0.85 : 0.65, eighth * 2);
            }
          }
          break;
        }
        case 'arp-up':
        case 'arp-updown': {
          const seq = opts.pattern === 'arp-up' ? notesOf : [...notesOf, ...[...notesOf].reverse().slice(1, -1)];
          const steps = Math.round(span / eighth);
          for (let k = 0; k < steps; k++) add(start + k * eighth, seq[k % seq.length], eighth * 2.5, k === 0 ? 0.8 : 0.6);
          break;
        }
        case 'bass-chord': {
          const bass = notesOf[0];
          const upper = notesOf.slice(1);
          for (let b = 0; b < Math.round(span / beat); b++) {
            if (b % 2 === 0) add(start + b * beat, bass, beat * 1.5, 0.85);
            else upper.forEach((m, k) => add(start + b * beat + k * strumGap, m, beat * 0.9, 0.6));
          }
          break;
        }
      }
    });
  });
  notes.sort((a, b) => a.time - b.time);
  return { notes, clicks, length: bars.length * barLen, barTimes };
}
