/**
 * A reference drone: seamless looping tones for a key's root and fifth.
 * Each tone is one buffer holding a whole number of cycles, so it can loop
 * forever without a click and stays in tune to a fraction of a cent.
 */
import { freqToMidi, mod12, midiToFreq, parseKey, type Key } from '../music/theory';

export type DroneKind = 'root' | 'fifth' | 'open';

/** Harmonic weights (1x, 2x, 3x, 4x): enough overtones to be heard on a phone speaker. */
const HARMONICS = [1, 0.5, 0.28, 0.12];

/** How many cycles go in one loop, and the real frequency the loop plays at. */
export function loopShape(freq: number, sampleRate: number): { cycles: number; length: number; actual: number } {
  const cycles = Math.max(1, Math.round(freq));
  const length = Math.max(2, Math.round((cycles * sampleRate) / freq));
  return { cycles, length, actual: (cycles * sampleRate) / length };
}

/** One seamless loop of a drone tone at `freq` Hz, peak 0.8. */
export function droneLoop(freq: number, sampleRate: number): Float32Array {
  const { cycles, length } = loopShape(freq, sampleRate);
  const out = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    let v = 0;
    for (let h = 0; h < HARMONICS.length; h++) v += HARMONICS[h] * Math.sin((2 * Math.PI * (h + 1) * cycles * i) / length);
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const g = peak ? 0.8 / peak : 1;
  for (let i = 0; i < length; i++) out[i] *= g;
  return out;
}

/** The notes to sound: root in the low octave (C2..B2), plus the fifth above it unless 'root'. */
export function droneMidis(key: string | Key | null | undefined, kind: DroneKind = 'fifth'): number[] {
  const k = typeof key === 'string' || key == null ? parseKey(key ?? null) : key;
  const tonic = k ? k.tonic : 0; // no key set: C
  const root = 36 + mod12(tonic);
  if (kind === 'root') return [root];
  if (kind === 'fifth') return [root, root + 7];
  return [root, root + 7, root + 12];
}

export const droneFreqs = (midis: number[]) => midis.map((m) => midiToFreq(m));

/** How far a drone loop is from the exact pitch, in cents. */
export function loopErrorCents(midi: number, sampleRate: number): number {
  const f = midiToFreq(midi);
  return 1200 * Math.log2(loopShape(f, sampleRate).actual / f);
}

export { freqToMidi };
