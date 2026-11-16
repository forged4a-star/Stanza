/**
 * Monophonic pitch tracking (YIN) and note segmentation. Used for key
 * detection of sung takes, hum-to-MIDI and the tuner-style readouts.
 */
import { freqToMidi } from '../music/theory';

export interface PitchFrame {
  /** seconds */
  time: number;
  /** Hz, or 0 when unvoiced */
  freq: number;
  /** 0..1 */
  confidence: number;
  rms: number;
}

/** YIN pitch estimate for one frame. Returns [freq, confidence] (freq 0 if none). */
export function yin(frame: Float32Array, sampleRate: number, minHz = 70, maxHz = 1100, threshold = 0.12): [number, number] {
  const n = frame.length;
  const maxLag = Math.min(Math.floor(sampleRate / minHz), (n >> 1) - 1);
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const d = new Float32Array(maxLag + 2);
  const w = n - maxLag - 1;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) {
      const diff = frame[i] - frame[i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxLag && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // no dip under threshold: take the global minimum if it's reasonably low
    let best = minLag;
    for (let t = minLag; t <= maxLag; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.35) return [0, 0];
    tau = best;
  }
  // parabolic interpolation
  const a = d[tau - 1] ?? d[tau];
  const b = d[tau];
  const c = d[tau + 1] ?? d[tau];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const period = tau + Math.max(-1, Math.min(1, shift));
  return [sampleRate / period, Math.max(0, Math.min(1, 1 - b))];
}

export function pitchTrack(signal: Float32Array, sampleRate: number, opts: { frame?: number; hop?: number; minHz?: number; maxHz?: number } = {}): PitchFrame[] {
  const frame = opts.frame ?? 1024;
  const hop = opts.hop ?? 256;
  const out: PitchFrame[] = [];
  let peak = 0;
  for (let i = 0; i < signal.length; i++) peak = Math.max(peak, Math.abs(signal[i]));
  const gate = Math.max(0.01, peak * 0.06);
  for (let off = 0; off + frame <= signal.length; off += hop) {
    const f = signal.subarray(off, off + frame);
    let e = 0;
    for (let i = 0; i < frame; i++) e += f[i] * f[i];
    const rms = Math.sqrt(e / frame);
    if (rms < gate) {
      out.push({ time: off / sampleRate, freq: 0, confidence: 0, rms });
      continue;
    }
    const [freq, confidence] = yin(f, sampleRate, opts.minHz, opts.maxHz);
    out.push({ time: off / sampleRate, freq: confidence > 0.6 ? freq : 0, confidence, rms });
  }
  return out;
}

export interface NoteEvent {
  /** seconds */
  start: number;
  duration: number;
  /** rounded MIDI pitch */
  pitch: number;
  /** average deviation in cents from the rounded pitch */
  cents: number;
}

/**
 * Turn a pitch track into notes: median-smooth, split where the pitch moves
 * by more than ~0.7 semitone or the voice stops, drop blips shorter than
 * `minDur` seconds.
 */
export function segmentNotes(track: PitchFrame[], minDur = 0.09): NoteEvent[] {
  if (track.length < 2) return [];
  const hop = track[1].time - track[0].time;
  const midi = track.map((f) => (f.freq > 0 ? freqToMidi(f.freq) : NaN));
  // median filter (5) over voiced frames
  const sm = midi.map((v, i) => {
    if (Number.isNaN(v)) return NaN;
    const win = midi.slice(Math.max(0, i - 2), i + 3).filter((x) => !Number.isNaN(x));
    win.sort((a, b) => a - b);
    return win[win.length >> 1];
  });
  const notes: NoteEvent[] = [];
  let start = -1;
  let acc: number[] = [];
  let peakRms = 0;
  const close = (endIdx: number) => {
    if (start < 0 || !acc.length) return;
    const dur = (endIdx - start) * hop;
    if (dur >= minDur) {
      const sorted = [...acc].sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1];
      const pitch = Math.round(med);
      notes.push({ start: track[start].time, duration: dur, pitch, cents: Math.round((med - pitch) * 100) });
    }
    start = -1;
    acc = [];
    peakRms = 0;
  };
  for (let i = 0; i < sm.length; i++) {
    const v = sm[i];
    // a clear dip in loudness ends the note (re-sung same pitch, consonant)
    if (Number.isNaN(v) || (start >= 0 && track[i].rms < 0.3 * peakRms)) {
      close(i);
      continue;
    }
    if (start < 0) {
      start = i;
      acc = [v];
      peakRms = track[i].rms;
      continue;
    }
    peakRms = Math.max(peakRms, track[i].rms);
    const ref = acc.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, acc.length);
    if (Math.abs(v - ref) > 0.7) {
      close(i);
      start = i;
      acc = [v];
    } else acc.push(v);
  }
  close(sm.length);
  // merge same-pitch notes separated by a tiny gap (breath/consonant)
  const merged: NoteEvent[] = [];
  for (const n of notes) {
    const last = merged[merged.length - 1];
    if (last && last.pitch === n.pitch && n.start - (last.start + last.duration) < 0.02) last.duration = n.start + n.duration - last.start;
    else merged.push({ ...n });
  }
  return merged;
}
