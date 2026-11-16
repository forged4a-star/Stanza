/**
 * Offline analysis of a recorded take: tempo (BPM) and key. Works on mono
 * PCM. Heuristic but robust enough for voice memos, strummed guitar or piano.
 */
import { keyName, mod12, type Key } from '../music/theory';
import { magnitudeSpectrum, resample } from './fft';
import { pitchTrack } from './pitch';

export const ANALYSIS_RATE = 22050;

// ------------------------------------------------------------------ tempo

/** Onset strength envelope via half-wave rectified spectral flux (log magnitude). */
export function onsetEnvelope(x: Float32Array, sr: number, hop = 256, n = 1024): { env: Float32Array; rate: number } {
  const frames = Math.max(0, Math.floor((x.length - n) / hop));
  const env = new Float32Array(frames);
  let prev = new Float32Array(n >> 1);
  let cur = new Float32Array(n >> 1);
  const maxBin = Math.min(n >> 1, Math.floor((8000 / sr) * n));
  for (let f = 0; f < frames; f++) {
    magnitudeSpectrum(x, f * hop, n, cur);
    let flux = 0;
    for (let k = 1; k < maxBin; k++) {
      const v = Math.log1p(100 * cur[k]);
      const d = v - prev[k];
      if (d > 0) flux += d;
      cur[k] = v;
    }
    env[f] = f === 0 ? 0 : flux;
    [prev, cur] = [cur, prev];
  }
  // remove slow trend (local mean) and rectify
  const w = 16;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(frames - 1, i + w); j++) {
      s += env[j];
      c++;
    }
    out[i] = Math.max(0, env[i] - s / c);
  }
  // widen the peaks a little so beats that fall between frames still line up
  const K = [1, 2, 3, 2, 1];
  const smooth = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let v = 0;
    for (let k = -2; k <= 2; k++) v += (out[i + k] ?? 0) * K[k + 2];
    smooth[i] = v / 9;
  }
  return { env: smooth, rate: sr / hop };
}

export interface TempoResult {
  bpm: number;
  /** 0..1 */
  confidence: number;
}

export function detectTempo(x: Float32Array, sr: number, minBpm = 60, maxBpm = 180): TempoResult | null {
  const { env, rate } = onsetEnvelope(x, sr);
  if (env.length < rate * 3) return null; // need ~3 s
  const n = env.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += (env[i] - mean) ** 2;
  if (energy <= 1e-9) return null;
  const lagMin = Math.floor((60 / maxBpm) * rate);
  const lagMax = Math.ceil((60 / (minBpm / 2)) * rate);
  const ac = new Float32Array(lagMax + 2);
  for (let lag = 1; lag <= lagMax + 1 && lag < n; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (env[i] - mean) * (env[i + lag] - mean);
    ac[lag] = s / (n - lag);
  }
  // score each candidate with its multiples (comb) and a mild preference around 100-120 bpm
  let best = 0;
  let bestScore = -Infinity;
  const scores: number[] = [];
  for (let lag = lagMin; lag <= Math.floor((60 / minBpm) * rate); lag++) {
    let s = ac[lag] + 0.5 * (ac[lag * 2] ?? 0) + 0.25 * (ac[lag * 4] ?? 0);
    const bpm = (60 * rate) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
    s *= 0.6 + 0.4 * prior;
    scores.push(s);
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  if (bestScore <= 0) return null;
  // parabolic refine
  const a = ac[best - 1];
  const b = ac[best];
  const c = ac[best + 1];
  const den = a - 2 * b + c;
  const refined = den !== 0 ? best + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : best;
  const bpm = (60 * rate) / refined;
  const sorted = [...scores].sort((p, q) => q - p);
  const median = sorted[sorted.length >> 1];
  const confidence = Math.max(0, Math.min(1, (bestScore - median) / (Math.abs(bestScore) + 1e-9)));
  return { bpm: Math.round(bpm * 10) / 10, confidence };
}

// ------------------------------------------------------------------ key

// Krumhansl-Kessler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export interface KeyResult {
  key: Key;
  name: string;
  /** correlation of the best key, -1..1 */
  score: number;
  /** margin over the runner-up (bigger = surer) */
  margin: number;
}

/** Best key for a 12-bin pitch-class histogram. */
export function keyFromChroma(chroma: number[]): KeyResult | null {
  if (chroma.reduce((s, v) => s + v, 0) <= 0) return null;
  const results: { key: Key; score: number }[] = [];
  for (let t = 0; t < 12; t++) {
    const rot = chroma.map((_, i) => chroma[mod12(i + t)]);
    results.push({ key: { tonic: t, mode: 'major' }, score: correlate(rot, MAJOR_PROFILE) });
    results.push({ key: { tonic: t, mode: 'minor' }, score: correlate(rot, MINOR_PROFILE) });
  }
  results.sort((a, b) => b.score - a.score);
  return { key: results[0].key, name: keyName(results[0].key, true), score: results[0].score, margin: results[0].score - results[1].score };
}

/** Chromagram from the spectrum (for chords/instruments). */
export function chromaFromSpectrum(x: Float32Array, sr: number, n = 4096, hop = 2048): number[] {
  const chroma = new Array<number>(12).fill(0);
  const binHz = sr / n;
  const lo = Math.ceil(55 / binHz);
  const hi = Math.min(n >> 1, Math.floor(2000 / binHz));
  const pcOfBin: number[] = [];
  for (let k = 0; k <= hi; k++) pcOfBin[k] = k < lo ? -1 : mod12(Math.round(12 * Math.log2((k * binHz) / 440)) + 9);
  const mag = new Float32Array(n >> 1);
  for (let off = 0; off + n <= x.length; off += hop) {
    magnitudeSpectrum(x, off, n, mag);
    // keep spectral peaks only, to reduce leakage between neighbours
    for (let k = lo + 1; k < hi; k++) {
      if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) chroma[pcOfBin[k]] += Math.sqrt(mag[k]);
    }
  }
  return chroma;
}

/** Pitch-class histogram from a sung/hummed line (weighted by duration and loudness). */
export function chromaFromPitch(x: Float32Array, sr: number): { chroma: number[]; voiced: number } {
  const track = pitchTrack(x, sr, { frame: 1024, hop: 512, minHz: 70, maxHz: 1000 });
  const chroma = new Array<number>(12).fill(0);
  let voiced = 0;
  for (const f of track) {
    if (!f.freq) continue;
    voiced++;
    const midi = 69 + 12 * Math.log2(f.freq / 440);
    chroma[mod12(Math.round(midi))] += f.confidence * Math.sqrt(f.rms);
  }
  return { chroma, voiced: track.length ? voiced / track.length : 0 };
}

export function detectKey(x: Float32Array, sr: number): KeyResult | null {
  const spec = chromaFromSpectrum(x, sr);
  const { chroma: sung, voiced } = chromaFromPitch(x, sr);
  // mostly a clean single voice → trust the pitch track more
  const total = (c: number[]) => c.reduce((s, v) => s + v, 0) || 1;
  const w = voiced > 0.4 ? 0.75 : 0.3;
  const mix = spec.map((v, i) => (1 - w) * (v / total(spec)) + w * (sung[i] / total(sung)));
  return keyFromChroma(mix);
}

export interface TakeAnalysis {
  bpm: number | null;
  key: string | null;
  durationMs: number;
  /** a peak envelope for drawing a small waveform (64 values 0..1) */
  waveform: number[];
}

export function analyzeTake(samples: Float32Array, sampleRate: number): TakeAnalysis {
  const x = resample(samples, sampleRate, ANALYSIS_RATE);
  const tempo = detectTempo(x, ANALYSIS_RATE);
  const key = detectKey(x, ANALYSIS_RATE);
  const waveform: number[] = [];
  const bins = 64;
  const per = Math.max(1, Math.floor(samples.length / bins));
  let peak = 1e-9;
  for (let b = 0; b < bins; b++) {
    let m = 0;
    for (let i = b * per; i < Math.min(samples.length, (b + 1) * per); i++) m = Math.max(m, Math.abs(samples[i]));
    waveform.push(m);
    peak = Math.max(peak, m);
  }
  return {
    bpm: tempo && tempo.confidence > 0.15 ? Math.round(tempo.bpm) : null,
    key: key && key.score > 0.5 ? key.name : null,
    durationMs: Math.round((samples.length / sampleRate) * 1000),
    waveform: waveform.map((v) => Math.round((v / peak) * 100) / 100),
  };
}
