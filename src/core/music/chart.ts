/**
 * Chord chart from a recording: slice the audio into overlapping windows, score
 * every chord in each one, then find the most likely path through time (a chord
 * only changes when the evidence is strong enough). Changes are then snapped to
 * bars using the tempo.
 */
import { keyFromChroma } from '../dsp/analyze';
import type { ChordBar } from '../model';
import { chordScores, chromaAndBass } from './detect';
import { noteName } from './theory';

/** Qualities worth naming from a mix of instruments. Richer ones are too easy to confuse. */
export const CHART_SUFFIXES = ['', 'm', '7', 'm7', 'maj7'];

export interface ChartSegment {
  /** seconds */
  start: number;
  end: number;
  chord: string;
}

export interface ChartResult {
  segments: ChartSegment[];
  seconds: number;
  /** the key the chords suggest, e.g. "C major" */
  key: string | null;
}

export interface TimelineOptions {
  /** window length in seconds */
  window?: number;
  hop?: number;
  /** cost of changing chord; higher means steadier charts */
  switchPenalty?: number;
  /** shortest chord worth showing, in seconds */
  minChord?: number;
}

type RawFrame = { t: number; chroma: number[]; bass: number | null; energy: number };

const frameSizes = (sr: number, opts: TimelineOptions) => ({ win: Math.round((opts.window ?? 0.8) * sr), hop: Math.round((opts.hop ?? 0.4) * sr) });

export function chordTimeline(samples: Float32Array, sr: number, opts: TimelineOptions = {}): ChartResult {
  const { win, hop } = frameSizes(sr, opts);
  const raw: RawFrame[] = [];
  for (let off = 0; off + win <= samples.length; off += hop) raw.push({ t: (off + win / 2) / sr, ...chromaAndBass(samples.subarray(off, off + win), sr) });
  return finishTimeline(raw, samples.length / sr, hop / sr, opts);
}

/** The same analysis in small slices, so a long recording never freezes the screen. */
export async function chordTimelineAsync(samples: Float32Array, sr: number, opts: TimelineOptions = {}, onProgress?: (fraction: number) => void): Promise<ChartResult> {
  const { win, hop } = frameSizes(sr, opts);
  const raw: RawFrame[] = [];
  const total = Math.max(1, Math.floor((samples.length - win) / hop) + 1);
  for (let off = 0, i = 0; off + win <= samples.length; off += hop, i++) {
    raw.push({ t: (off + win / 2) / sr, ...chromaAndBass(samples.subarray(off, off + win), sr) });
    if (i % 12 === 11) {
      onProgress?.(Math.min(1, i / total));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(1);
  return finishTimeline(raw, samples.length / sr, hop / sr, opts);
}

function finishTimeline(raw: RawFrame[], seconds: number, hopS: number, opts: TimelineOptions): ChartResult {
  const penalty = opts.switchPenalty ?? 0.5;
  const minChord = opts.minChord ?? 0.7;
  const S = CHART_SUFFIXES.length;
  const NS = 12 * S; // states; index NS is "no chord"
  const frames: { t: number; scores: Float64Array; quiet: boolean }[] = [];
  const total = new Array<number>(12).fill(0);
  let maxEnergy = 0;
  for (const r of raw) maxEnergy = Math.max(maxEnergy, r.energy);
  if (!raw.length || maxEnergy < 1e-9) return { segments: [], seconds, key: null };
  for (const r of raw) {
    r.chroma.forEach((v, i) => (total[i] += v));
    frames.push({ t: r.t, scores: chordScores(r.chroma, r.bass, CHART_SUFFIXES), quiet: r.energy < maxEnergy * 0.04 });
  }
  const n = frames.length;
  // Viterbi over 60 chords plus "no chord"
  const NONE = 0.15; // emission of the no-chord state
  const emit = (f: (typeof frames)[number], s: number) => (s === NS ? (f.quiet ? 1.2 : NONE) : f.quiet ? -0.6 : f.scores[s]);
  let score = new Float64Array(NS + 1);
  const back: Int16Array[] = [];
  for (let s = 0; s <= NS; s++) score[s] = emit(frames[0], s);
  for (let t = 1; t < n; t++) {
    let best = 0;
    for (let s = 1; s <= NS; s++) if (score[s] > score[best]) best = s;
    const next = new Float64Array(NS + 1);
    const from = new Int16Array(NS + 1);
    for (let s = 0; s <= NS; s++) {
      // staying is free; changing from the best state costs the penalty
      const stay = score[s];
      const move = score[best] - penalty;
      if (stay >= move) (next[s] = stay), (from[s] = s);
      else (next[s] = move), (from[s] = best);
      next[s] += emit(frames[t], s);
    }
    score = next;
    back.push(from);
  }
  let end = 0;
  for (let s = 1; s <= NS; s++) if (score[s] > score[end]) end = s;
  const path = new Array<number>(n);
  path[n - 1] = end;
  for (let t = n - 1; t > 0; t--) path[t - 1] = back[t - 1][path[t]];

  const name = (s: number) => (s === NS ? 'N' : noteName(Math.floor(s / S)) + CHART_SUFFIXES[s % S]);
  let segs: ChartSegment[] = [];
  path.forEach((s, i) => {
    const c = name(s);
    const start = Math.max(0, frames[i].t - hopS / 2);
    const last = segs[segs.length - 1];
    if (last && last.chord === c) last.end = frames[i].t + hopS / 2;
    else segs.push({ start, end: frames[i].t + hopS / 2, chord: c });
  });
  // a chord too short to be real is absorbed by the one before it
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].end - segs[i].start < minChord && segs.length > 1) {
        const into = i > 0 ? i - 1 : 1;
        segs[into].start = Math.min(segs[into].start, segs[i].start);
        segs[into].end = Math.max(segs[into].end, segs[i].end);
        segs.splice(i, 1);
        changed = true;
        break;
      }
    }
    // neighbours that now match join up
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].chord === segs[i - 1].chord) {
        segs[i - 1].end = segs[i].end;
        segs.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  segs = segs.map((s) => ({ ...s, start: Math.round(s.start * 100) / 100, end: Math.min(seconds, Math.round(s.end * 100) / 100) }));
  const k = keyFromChroma(total);
  return { segments: segs.filter((s) => s.chord !== 'N'), seconds, key: k ? k.name : null };
}

export interface BarOptions {
  bpm: number;
  beatsPerBar?: number;
  /** seconds of the recording where bar one starts; defaults to the first chord */
  offset?: number;
}

/** Snap chord changes to bars: one chord per bar, or two when the second half of the bar changes. */
export function chordsToBars(segments: ChartSegment[], opts: BarOptions): ChordBar[] {
  if (!segments.length || !(opts.bpm > 0)) return [];
  const beats = opts.beatsPerBar ?? 4;
  const beat = 60 / opts.bpm;
  const t0 = opts.offset ?? segments[0].start;
  const endT = segments[segments.length - 1].end;
  const bars = Math.max(1, Math.round((endT - t0) / (beat * beats)));
  const at = (t: number) => {
    const s = segments.find((x) => t >= x.start && t < x.end) ?? (t < segments[0].start ? segments[0] : segments[segments.length - 1]);
    return s.chord;
  };
  const out: ChordBar[] = [];
  for (let b = 0; b < bars; b++) {
    const perBeat = Array.from({ length: beats }, (_, i) => at(t0 + (b * beats + i + 0.5) * beat));
    const half = Math.floor(beats / 2);
    if (beats % 2 === 0 && half >= 1) {
      const first = majority(perBeat.slice(0, half));
      const second = majority(perBeat.slice(half));
      out.push({ chords: first === second ? [first] : [first, second] });
    } else out.push({ chords: [majority(perBeat)] });
  }
  return out;
}

function majority(v: string[]): string {
  const c = new Map<string, number>();
  for (const x of v) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
