/**
 * Small offline synthesiser: renders one note to PCM. No samples are bundled;
 * every sound is generated, so it works offline and costs no app size.
 */
import { midiToFreq } from '../music/theory';

export type Instrument = 'piano' | 'acoustic' | 'electric' | 'pad';
export const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'acoustic', label: 'Acoustic' },
  { id: 'electric', label: 'Electric' },
  { id: 'pad', label: 'Pad' },
];

/** Deterministic noise so renders are repeatable (and testable). */
function noise(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

function piano(f: number, dur: number, sr: number, vel: number): Float32Array {
  const len = Math.floor(sr * (dur + 0.25));
  const out = new Float32Array(len);
  const decayBase = 1.1 + f / 600;
  for (let h = 1; h <= 10; h++) {
    const fh = f * h * (1 + 0.0004 * h * h); // slight string stiffness
    if (fh > sr / 2.2) break;
    const amp = (vel * 0.32) / Math.pow(h, 1.35);
    const decay = Math.exp(-(decayBase * (1 + h * 0.35)) / sr);
    // rotating phasor: no sin/exp per sample
    const w = (2 * Math.PI * fh) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    let re = 1;
    let im = 0;
    let g = amp;
    for (let i = 0; i < len; i++) {
      out[i] += g * im;
      const nre = re * cw - im * sw;
      im = re * sw + im * cw;
      re = nre;
      g *= decay;
    }
  }
  envelope(out, sr, 0.004, dur, 0.2);
  return out;
}

/** Karplus–Strong plucked string. */
function pluck(f: number, dur: number, sr: number, vel: number, bright: number, sustain: number, seed: number): Float32Array {
  const len = Math.floor(sr * (dur + 0.3));
  const out = new Float32Array(len);
  const period = sr / f;
  const n = Math.max(2, Math.floor(period));
  const frac = period - n;
  const buf = new Float32Array(n + 1);
  const rnd = noise(seed);
  // initial excitation: noise, low-passed by `bright`
  let prev = 0;
  for (let i = 0; i <= n; i++) {
    const v = rnd();
    prev = prev + bright * (v - prev);
    buf[i] = prev;
  }
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % (n + 1)];
    const y = a * (1 - frac) + b * frac;
    out[i] = y;
    buf[idx] = sustain * 0.5 * (a + b);
    idx = (idx + 1) % (n + 1);
  }
  // normalise the pluck's level
  let peak = 1e-9;
  for (let i = 0; i < Math.min(len, sr * 0.05); i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = (vel * 0.35) / peak;
  for (let i = 0; i < len; i++) out[i] *= g;
  envelope(out, sr, 0.001, dur, 0.12);
  return out;
}

function pad(f: number, dur: number, sr: number, vel: number): Float32Array {
  const len = Math.floor(sr * (dur + 0.6));
  const out = new Float32Array(len);
  for (const detune of [-0.07, 0, 0.07]) {
    const fd = f * Math.pow(2, detune / 12);
    for (let h = 1; h <= 9; h++) {
      if (fd * h > sr / 2.2) break;
      const amp = (vel * 0.1) / h / Math.pow(h, 0.5);
      const w = (2 * Math.PI * fd * h) / sr;
      const ph = h * 1.7 + detune * 10;
      // rotating phasor: one multiply-add per sample instead of a sin() call
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      let re = Math.cos(ph);
      let im = Math.sin(ph);
      for (let i = 0; i < len; i++) {
        out[i] += amp * im;
        const nre = re * cw - im * sw;
        im = re * sw + im * cw;
        re = nre;
      }
    }
  }
  // gentle one-pole low-pass for warmth
  let y = 0;
  const a = Math.min(1, (2 * Math.PI * 1800) / sr);
  for (let i = 0; i < len; i++) {
    y += a * (out[i] - y);
    out[i] = y;
  }
  envelope(out, sr, 0.25, dur, 0.5);
  return out;
}

/** attack, hold until `dur`, release over `rel` seconds */
function envelope(x: Float32Array, sr: number, att: number, dur: number, rel: number) {
  const a = Math.max(1, Math.floor(att * sr));
  const relStart = Math.floor(dur * sr);
  const r = Math.max(1, Math.floor(rel * sr));
  for (let i = 0; i < x.length; i++) {
    let g = 1;
    if (i < a) g = i / a;
    if (i >= relStart) g *= Math.max(0, 1 - (i - relStart) / r);
    x[i] *= g;
  }
}

export function renderNote(inst: Instrument, midi: number, dur: number, sr: number, vel = 0.8): Float32Array {
  const f = midiToFreq(midi);
  switch (inst) {
    case 'piano':
      return piano(f, dur, sr, vel);
    case 'acoustic':
      return pluck(f, dur, sr, vel, 0.55, 0.996, midi * 7919);
    case 'electric': {
      const x = pluck(f, dur, sr, vel, 0.8, 0.9985, midi * 104729);
      // soft clip for a little grit
      for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 2.4) * 0.42;
      return x;
    }
    case 'pad':
      return pad(f, dur, sr, vel);
  }
}

/** Metronome tick: short sine burst; accent on beat one. */
export function renderClick(sr: number, accent: boolean): Float32Array {
  const len = Math.floor(sr * 0.05);
  const out = new Float32Array(len);
  const f = accent ? 1760 : 1200;
  for (let i = 0; i < len; i++) out[i] = (accent ? 0.5 : 0.35) * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp((-i / sr) * 90);
  return out;
}

/** Average BPM from tap times (ms); ignores taps after a long pause. */
export function tapTempo(times: number[]): number | null {
  const recent: number[] = [];
  for (let i = times.length - 1; i > 0 && recent.length < 8; i--) {
    const d = times[i] - times[i - 1];
    if (d > 2000 || d < 200) break;
    recent.push(d);
  }
  if (recent.length < 2) return null;
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Math.round(60000 / avg);
}
