/**
 * Offline mixing for the chord player. Instead of handing the phone's audio
 * thread hundreds of little sound sources (one per strummed string, each with
 * its own volume automation), the notes are mixed here into a few chunks of
 * plain audio, and only those chunks are played. The native graph then holds a
 * handful of nodes however long or busy the song is.
 *
 * Everything here is plain arithmetic on Float32Arrays, so it is exactly
 * testable: chunk joins, note endings and re-struck strings can be checked
 * sample by sample.
 */
import type { Instrument } from './synth';

export interface MixNote {
  /** seconds from the start of the loop */
  time: number;
  midi: number;
  gain: number;
  /** how long the note should ring, seconds */
  dur: number;
  inst: Instrument;
}

export interface MixClick {
  time: number;
  accent: boolean;
  gain?: number;
}

export interface Chunk {
  /** seconds of musical time, [start, end) */
  start: number;
  end: number;
}

/** Fade-out at the end of every note, seconds. Long enough to never click, short enough to sound tight. */
export const RELEASE = 0.04;
/** Fade-in at the start of every note, seconds (the instrument's own attack still comes through). */
export const ATTACK = 0.002;

/**
 * Split one loop into chunks that start on bar lines, each at least `minLen`
 * seconds long (except possibly the last), so the player only ever needs a
 * few chunks queued at once.
 */
export function planChunks(barTimes: number[], length: number, minLen = 4): Chunk[] {
  const starts = barTimes.length ? [...barTimes] : [0];
  if (starts[0] !== 0) starts.unshift(0);
  const out: Chunk[] = [];
  let cur = 0;
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] - cur >= minLen) {
      out.push({ start: cur, end: starts[i] });
      cur = starts[i];
    }
  }
  if (length > cur) out.push({ start: cur, end: length });
  // a very short final chunk joins the one before it
  if (out.length > 1 && out[out.length - 1].end - out[out.length - 1].start < minLen / 2) {
    const last = out.pop()!;
    out[out.length - 1].end = last.end;
  }
  return out.length ? out : [{ start: 0, end: Math.max(length, 0.001) }];
}

/**
 * When each note really stops: at its own length, or earlier where the same
 * pitch (on the same instrument) is struck again. With `loopLength`, a strike
 * at the start of the next loop also cuts a note ringing at the end of this one.
 * `notes` must be sorted by time; the result is in the same order.
 */
export function noteEnds(notes: MixNote[], loopLength?: number): number[] {
  const ends = notes.map((n) => n.time + n.dur);
  const next = new Map<string, number>();
  for (let i = notes.length - 1; i >= 0; i--) {
    const k = `${notes[i].inst}:${notes[i].midi}`;
    const after = next.get(k);
    if (after !== undefined) ends[i] = Math.min(ends[i], after);
    next.set(k, notes[i].time);
  }
  if (loopLength !== undefined) {
    // the first strike of each pitch in the loop, heard again one loop later
    const first = new Map<string, number>();
    for (const n of notes) {
      const k = `${n.inst}:${n.midi}`;
      if (!first.has(k)) first.set(k, n.time + loopLength);
    }
    const lastIndex = new Map<string, number>();
    notes.forEach((n, i) => lastIndex.set(`${n.inst}:${n.midi}`, i));
    for (const [k, i] of lastIndex) ends[i] = Math.min(ends[i], first.get(k)!);
  }
  return ends;
}

export interface RenderOptions {
  sampleRate: number;
  /** the note's sound, already rendered and normalised */
  sample: (inst: Instrument, midi: number) => Float32Array;
  click?: (accent: boolean) => Float32Array;
  /** precomputed from noteEnds, same order as `notes` */
  ends?: number[];
}

/**
 * Mix the notes and clicks that start inside `chunk` into one buffer. The
 * buffer begins at chunk.start and runs until the last of those sounds has
 * faded, so chunks overlap where notes ring across a bar line; played on the
 * same clock, the overlaps add up to exactly the whole mix.
 */
export function renderChunk(notes: MixNote[], clicks: MixClick[], chunk: Chunk, opts: RenderOptions): Float32Array {
  const sr = opts.sampleRate;
  const ends = opts.ends ?? noteEnds(notes);
  const att = Math.max(1, Math.round(ATTACK * sr));
  const rel = Math.max(1, Math.round(RELEASE * sr));
  const inChunk = (t: number) => t >= chunk.start && t < chunk.end;

  // what each note will add: where, how long, and its sound
  const plans: { off: number; hold: number; total: number; data: Float32Array; gain: number }[] = [];
  let last = Math.round((chunk.end - chunk.start) * sr);
  notes.forEach((n, i) => {
    if (!inChunk(n.time)) return;
    const data = opts.sample(n.inst, n.midi);
    const off = Math.round((n.time - chunk.start) * sr);
    const hold = Math.max(0, Math.min(data.length - rel, Math.round((ends[i] - n.time) * sr)));
    const total = Math.min(data.length, hold + rel);
    plans.push({ off, hold, total, data, gain: n.gain });
    last = Math.max(last, off + total);
  });
  const clickPlans: { off: number; data: Float32Array; gain: number }[] = [];
  if (opts.click) {
    for (const c of clicks) {
      if (!inChunk(c.time)) continue;
      const data = opts.click(c.accent);
      const off = Math.round((c.time - chunk.start) * sr);
      clickPlans.push({ off, data, gain: c.gain ?? 1 });
      last = Math.max(last, off + data.length);
    }
  }

  const out = new Float32Array(Math.max(1, last));
  for (const p of plans) {
    const { off, hold, total, data, gain } = p;
    for (let i = 0; i < total; i++) {
      let env = gain;
      if (i < att) env *= i / att;
      if (i >= hold) env *= 1 - (i - hold) / rel;
      out[off + i] += data[i] * env;
    }
  }
  for (const c of clickPlans) for (let i = 0; i < c.data.length; i++) out[c.off + i] += c.data[i] * c.gain;
  return out;
}

/** Peak absolute value (for diagnostics and tests). */
export function peak(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}
