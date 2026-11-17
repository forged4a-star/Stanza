/**
 * Name a chord from audio (a strum into the mic): build a chromagram, find
 * the bass, and match against chord templates for all 12 roots.
 */
import { magnitudeSpectrum } from '../dsp/fft';
import { mod12, noteName, QUALITY_BY_SUFFIX } from './theory';

const TEMPLATES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '5', 'add9', '6', 'm6'];

export interface DetectedChord {
  name: string;
  /** 0..1 */
  confidence: number;
  /** runner-up names, for the user to pick from */
  alternatives: string[];
}

/** Chroma (12 bins, C first) and a bass pitch class from one block of audio. */
export function chromaAndBass(x: Float32Array, sr: number): { chroma: number[]; bass: number | null; energy: number } {
  const n = 8192 <= x.length ? 8192 : 4096;
  const chroma = new Array<number>(12).fill(0);
  const bassChroma = new Array<number>(12).fill(0);
  const binHz = sr / n;
  const mag = new Float32Array(n >> 1);
  let energy = 0;
  let frames = 0;
  for (let off = 0; off + n <= x.length; off += n >> 1) {
    magnitudeSpectrum(x, off, n, mag);
    frames++;
    // collect spectral peaks
    const peaks: { f: number; m: number }[] = [];
    for (let k = 2; k < (n >> 1) - 1; k++) {
      const f = k * binHz;
      if (f < 60 || f > 2200) continue;
      if (!(mag[k] > mag[k - 1] && mag[k] >= mag[k + 1])) continue;
      const a = mag[k - 1];
      const b = mag[k];
      const c = mag[k + 1];
      const p = (0.5 * (a - c)) / (a - 2 * b + c || 1);
      peaks.push({ f: (k + p) * binHz, m: b });
    }
    const top = Math.max(1e-12, ...peaks.map((q) => q.m));
    const strong = peaks.filter((q) => q.m > top * 0.02);
    for (const q of strong) {
      energy += q.m * q.m;
      // a peak at 3x, 5x or 6x a stronger lower peak is mostly that note's overtone
      // (octave overtones land on the same pitch class, so they're harmless)
      let w = 1;
      for (const low of strong) {
        if (low.f >= q.f || low.m < q.m * 0.5) continue;
        const r = q.f / low.f;
        for (const h of [3, 5, 6]) if (Math.abs(r - h) / h < 0.015) w = Math.min(w, 0.15);
      }
      const midi = 69 + 12 * Math.log2(q.f / 440);
      const pc = mod12(Math.round(midi));
      chroma[pc] += q.m * w;
      if (q.f < 260) bassChroma[pc] += q.m / (q.f / 80);
    }
  }
  const maxB = Math.max(...bassChroma);
  const bass = maxB > 0 ? bassChroma.indexOf(maxB) : null;
  return { chroma, bass, energy: frames ? energy / frames : 0 };
}

/**
 * How well each chord (every root with each of the given qualities) explains a chroma, using the same
 * scoring as chordFromChroma. Index is root * suffixes.length + suffix index.
 */
export function chordScores(chroma: number[], bass: number | null, suffixes: string[]): Float64Array {
  const total = chroma.reduce((s, v) => s + v, 0);
  const out = new Float64Array(12 * suffixes.length).fill(-1);
  if (total <= 0) return out;
  const norm = chroma.map((v) => v / total);
  for (let root = 0; root < 12; root++) {
    suffixes.forEach((suffix, si) => {
      const q = QUALITY_BY_SUFFIX[suffix];
      const tones = new Set(q.intervals.map((i) => mod12(root + i)));
      let inside = 0;
      for (const t of tones) inside += norm[t];
      let score = inside - (1 - inside) * 1.1 - (tones.size - 3) * 0.04;
      if (Math.min(...[...tones].map((t) => norm[t])) < 0.03) score -= 0.35;
      if (bass !== null && bass === root) score += 0.08;
      out[root * suffixes.length + si] = score;
    });
  }
  return out;
}

export function chordFromChroma(chroma: number[], bass: number | null): DetectedChord | null {
  const total = chroma.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const norm = chroma.map((v) => v / total);
  const scored: { name: string; score: number }[] = [];
  for (let root = 0; root < 12; root++) {
    for (const suffix of TEMPLATES) {
      const q = QUALITY_BY_SUFFIX[suffix];
      const tones = new Set(q.intervals.map((i) => mod12(root + i)));
      let inside = 0;
      for (const t of tones) inside += norm[t];
      // energy outside the chord counts against it; bigger chords pay a small complexity cost
      const outside = 1 - inside;
      let score = inside - outside * 1.1 - (tones.size - 3) * 0.04;
      // every chord tone should actually be there
      const weakest = Math.min(...[...tones].map((t) => norm[t]));
      if (weakest < 0.03) score -= 0.35;
      if (bass !== null && bass === root) score += 0.08;
      scored.push({ name: noteName(root) + suffix, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  let name = best.name;
  // slash chord when the bass is a chord tone other than the root
  const rootPc = (/^([A-G]#?)/.exec(best.name)![1]);
  if (bass !== null && noteName(bass) !== rootPc) {
    const q = QUALITY_BY_SUFFIX[best.name.slice(rootPc.length)];
    const rootN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(rootPc);
    if (q.intervals.map((i) => mod12(rootN + i)).includes(bass)) name = `${best.name}/${noteName(bass)}`;
  }
  const confidence = Math.max(0, Math.min(1, (best.score - scored[1].score) * 4 + best.score * 0.5));
  return { name, confidence, alternatives: scored.slice(1, 4).map((s) => s.name) };
}

export function detectChord(x: Float32Array, sr: number): DetectedChord | null {
  const { chroma, bass, energy } = chromaAndBass(x, sr);
  if (energy < 1e-6) return null;
  return chordFromChroma(chroma, bass);
}
