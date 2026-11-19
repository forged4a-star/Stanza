/** Turn a stream of pitch readings into a steady tuner needle. */
import { freqToMidi, midiName } from '../music/theory';

export interface TunerReading {
  /** e.g. "A2" */
  label: string;
  /** note name without octave */
  note: string;
  octave: number;
  midi: number;
  /** -50..+50: how far from the note, negative = flat */
  cents: number;
  freq: number;
}

/** The nearest note to a frequency and how many cents off it is. */
export function readingFor(freq: number, a4 = 440): TunerReading | null {
  if (!(freq > 20) || !(freq < 5000)) return null;
  const exact = freqToMidi(freq / (a4 / 440));
  const midi = Math.round(exact);
  const cents = Math.round((exact - midi) * 100);
  const label = midiName(midi);
  return { label, note: label.replace(/-?\d+$/, ''), octave: Math.floor(midi / 12) - 1, midi, cents, freq };
}

export type TuneState = 'flat' | 'sharp' | 'in-tune';

/** In tune means within 5 cents. */
export const tuneState = (cents: number): TuneState => (Math.abs(cents) <= 5 ? 'in-tune' : cents < 0 ? 'flat' : 'sharp');

/**
 * Smooths readings so the needle does not jitter: the median of the last few
 * voiced frames, held briefly when the sound drops out.
 */
export class TunerSmoother {
  private recent: number[] = [];
  private silent = 0;
  constructor(private size = 5, private hold = 6) {}

  /** Feed one frame's frequency (0 for none). Returns the smoothed frequency or null. */
  push(freq: number): number | null {
    if (freq > 0) {
      this.silent = 0;
      this.recent.push(freq);
      if (this.recent.length > this.size) this.recent.shift();
    } else if (++this.silent > this.hold) {
      this.recent = [];
    }
    if (!this.recent.length) return null;
    // a jump of more than 3 semitones is a new note: forget the old ones
    const last = this.recent[this.recent.length - 1];
    this.recent = this.recent.filter((f) => Math.abs(12 * Math.log2(f / last)) < 3);
    const s = [...this.recent].sort((a, b) => a - b);
    return s[s.length >> 1];
  }

  reset() {
    this.recent = [];
    this.silent = 0;
  }
}
