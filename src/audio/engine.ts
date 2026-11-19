/**
 * Chord and melody playback.
 *
 * Why it is built this way: a phone's audio thread has a few milliseconds to
 * produce each slice of sound. Earlier versions gave it one source and one
 * volume node per strummed string, queued two loops ahead (hundreds or
 * thousands of nodes for a long song), and on phones the audio thread could
 * not keep up: crackles that got worse with longer or busier progressions.
 *
 * Now the notes are mixed here, in plain code, into chunks of a few seconds
 * (see core/audio/mixdown.ts), and only those chunks are played: about two to
 * four sources are connected at any time, however long or busy the song.
 *
 * Timing: each chunk is started on the audio clock (`currentTime`), so the
 * sound never depends on a timer firing on time. A timer only renders and
 * queues the next chunk a few seconds ahead, and moves the bar highlight.
 *
 * Sound: one AudioContext; every (instrument, pitch) is rendered once at the
 * device's own sample rate (the native engine plays buffers frame-for-frame;
 * it does not convert rates) and normalised to a common level.
 */
import { AudioContext, type AudioBuffer, type AudioBufferSourceNode, type GainNode } from 'react-native-audio-api';
import { droneFreqs, droneLoop } from '../core/audio/drone';
import { noteEnds, planChunks, renderChunk, type MixClick, type MixNote } from '../core/audio/mixdown';
import { buildSchedule, chordGain, chordNotes, type PatternId, type Schedule } from '../core/audio/patterns';
import type { CustomStrum } from '../core/audio/strums';
import { softClipCurve } from '../core/audio/softclip';
import { renderClick, renderNote, type Instrument } from '../core/audio/synth';
import type { ChordBar } from '../core/model';

/** Length of a cached note sound. Shorter notes fade out where they end. */
const NOTE_SECONDS = 2;
/** Note sounds kept at once (about 18 MB at 48 kHz). */
const MAX_NOTES = 48;
/** Seconds of audio queued ahead of the clock. */
const LOOKAHEAD = 6;
/** How often the queue is topped up, ms. */
const PUMP_MS = 200;
/** Output level at slider 100 % (the soft limiter protects the top end). */
const MASTER_MAX = 1.4;
/** Fade used when stopping, so a stop never clicks. */
const STOP_FADE = 0.025;

let ctx: AudioContext | null = null;
/**
 * How the phone's audio output is opened. 'playback' gives Android deep output
 * buffers, which ride through the small hiccups any phone has. The library's
 * default ('interactive') asks for an exclusive low-latency stream fed every
 * 128 samples (under 3 ms), and on many phones that crackles under load.
 */
export type AudioLatency = 'playback' | 'interactive';
let latency: AudioLatency = 'playback';
let master: GainNode | null = null;
let volume = 0.7;
const noteCache = new Map<string, Float32Array>();
const clickCache = new Map<boolean, Float32Array>();

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
  end: number;
}
/** every source that is playing or queued (pruned by time) */
let live: Voice[] = [];

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: latency });
    master = ctx.createGain();
    master.gain.value = volume * MASTER_MAX;
    const limiter = ctx.createWaveShaper();
    limiter.curve = softClipCurve();
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Reopen the audio output in another mode (from Settings). Sounds are re-rendered at the new rate as needed. */
export function setAudioLatency(mode: AudioLatency) {
  if (mode === latency) return;
  latency = mode;
  if (!ctx) return;
  stopTransport();
  stopDrone();
  const old = ctx;
  ctx = null;
  master = null;
  live = [];
  drone = [];
  noteCache.clear();
  clickCache.clear();
  safe(() => void old.close());
}

export const audioLatency = () => latency;

/** 0..1, applied with a short ramp so it never clicks. */
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (!master || !ctx) return;
  const t = ctx.currentTime;
  const g = master.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(volume * MASTER_MAX, t + 0.03);
}

function toBuffer(data: Float32Array): AudioBuffer {
  const c = context();
  const b = c.createBuffer(1, data.length, c.sampleRate);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return b;
}

/** Scale to a common peak so every instrument and pitch is equally loud. */
function normalised(x: Float32Array, peak = 1): Float32Array {
  let m = 1e-9;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  const g = peak / m;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

function noteSample(inst: Instrument, midi: number): Float32Array {
  const key = `${inst}:${midi}`;
  let s = noteCache.get(key);
  if (!s) {
    if (noteCache.size >= MAX_NOTES) noteCache.clear();
    s = normalised(renderNote(inst, midi, NOTE_SECONDS, context().sampleRate));
    noteCache.set(key, s);
  }
  return s;
}

function clickSample(accent: boolean): Float32Array {
  let s = clickCache.get(accent);
  if (!s) {
    s = renderClick(context().sampleRate, accent);
    clickCache.set(accent, s);
  }
  return s;
}

/**
 * Render sounds for these pitches now, a couple at a time between event-loop
 * turns, so the UI never freezes. Call it ahead of when the sounds are needed.
 */
export function prepare(inst: Instrument, midis: number[]): Promise<void> {
  context();
  const todo = [...new Set(midis)].filter((m) => !noteCache.has(`${inst}:${m}`));
  return new Promise((resolve) => {
    const step = () => {
      for (let k = 0; k < 2 && todo.length; k++) noteSample(inst, todo.shift()!);
      if (todo.length) setTimeout(step, 0);
      else resolve();
    };
    step();
  });
}

/** Warm the sounds for a list of chord names (the chords you are about to hear). */
export function prepareChords(names: string[], inst: Instrument, capo = 0): Promise<void> {
  const midis: number[] = [];
  for (const n of names) for (const m of chordNotes(n, inst, capo)) midis.push(m);
  return prepare(inst, midis);
}

/** Warm the sounds a song's bars use. */
export function prepareFor(bars: ChordBar[], inst: Instrument, capo = 0): Promise<void> {
  return prepareChords(bars.flatMap((b) => b.chords), inst, capo);
}

const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    // already finished or released
  }
};

/** Release every source that has finished, by audio time. */
function reap(t: number) {
  if (!live.some((v) => v.end < t - 0.2)) return;
  const keep: Voice[] = [];
  for (const v of live) {
    if (v.end < t - 0.2) {
      safe(() => v.src.disconnect());
      safe(() => v.gain.disconnect());
    } else keep.push(v);
  }
  live = keep;
}

/** Play a buffer at an audio-clock time, through its own volume node (so it can be faded on stop). */
function playBuffer(buf: AudioBuffer, when: number, seconds: number): Voice {
  const c = context();
  reap(c.currentTime);
  const start = Math.max(when, c.currentTime);
  const gain = c.createGain();
  gain.gain.value = 1;
  gain.connect(master!);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  src.start(start);
  const v: Voice = { src, gain, start, end: start + seconds };
  live.push(v);
  return v;
}

function fadeOut(v: Voice, t: number) {
  const c = context();
  const at = Math.max(t, c.currentTime);
  if (at >= v.end) return;
  safe(() => {
    const g = v.gain.gain;
    g.cancelScheduledValues(at);
    if (at <= v.start) {
      // not started yet: it never will
      g.setValueAtTime(0, at);
      v.src.stop(at);
      v.end = at;
      return;
    }
    g.setValueAtTime(1, at);
    g.linearRampToValueAtTime(0, at + STOP_FADE);
    v.src.stop(at + STOP_FADE + 0.005);
    v.end = at + STOP_FADE + 0.005;
  });
}

/** Mix a few notes into one buffer and play it (previews and single notes). */
function playNotes(notes: MixNote[], when: number) {
  const c = context();
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const data = renderChunk(sorted, [], { start: 0, end: sorted[sorted.length - 1].time + 1e-3 }, { sampleRate: c.sampleRate, sample: noteSample });
  playBuffer(toBuffer(data), when, data.length / c.sampleRate);
}

export function now(): number {
  return context().currentTime;
}

/** Hear a chord once. */
export function previewChord(name: string, inst: Instrument = 'piano', capo = 0) {
  const midis = chordNotes(name, inst, capo);
  if (!midis.length) return;
  const gap = inst === 'piano' || inst === 'pad' ? 0.003 : 0.016;
  const g = 0.9 * chordGain(midis.length);
  playNotes(
    midis.map((m, i) => ({ time: i * gap, midi: m, gain: g, dur: 1.5, inst })),
    now() + 0.02
  );
}

/** Hear a single note (melody preview). */
export function playNote(midi: number, dur = 0.4, inst: Instrument = 'piano', at = 0) {
  playNotes([{ time: 0, midi, gain: 0.9 * chordGain(1), dur, inst }], (at || now()) + 0.01);
}

/** Silence everything (sounding and queued), with a short fade. */
export function stopAll() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const v of live) fadeOut(v, t);
}

// ------------------------------------------------------------------ drone

/** Each drone note is one looping source (a seamless one-second buffer), so a drone is two or three sources however long it sounds. */
interface DroneVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}
let drone: DroneVoice[] = [];
const DRONE_FADE = 0.2;

/** Start a steady reference tone on these notes (replacing any drone already sounding). */
export function startDrone(midis: number[]) {
  stopDrone();
  if (!midis.length) return;
  const c = context();
  const t = c.currentTime;
  const per = 0.55 / Math.sqrt(midis.length);
  droneFreqs(midis).forEach((f) => {
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(per, t + DRONE_FADE);
    gain.connect(master!);
    const src = c.createBufferSource();
    src.buffer = toBuffer(droneLoop(f, c.sampleRate));
    src.loop = true;
    src.connect(gain);
    src.start(t);
    drone.push({ src, gain });
  });
}

/** Fade the drone out and release it. */
export function stopDrone() {
  if (!ctx || !drone.length) {
    drone = [];
    return;
  }
  const t = ctx.currentTime;
  for (const v of drone) {
    safe(() => {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + DRONE_FADE);
      v.src.stop(t + DRONE_FADE + 0.02);
    });
  }
  drone = [];
}

export const isDroning = () => drone.length > 0;

/** What the engine is holding right now (for tests and the audio check in Settings). */
export function engineStats() {
  return {
    /** sources playing or queued: stays at a handful whatever the song */
    voices: live.length + drone.length,
    /** chunks rendered for the current transport */
    chunks: run?.chunksRendered ?? 0,
    /** note sounds cached */
    buffers: noteCache.size,
    sampleRate: ctx?.sampleRate ?? 0,
    volume,
    latency,
  };
}

// ------------------------------------------------------------------ transport

export interface TransportOptions {
  bpm: number;
  timeSig: [number, number];
  pattern: PatternId | string;
  customStrums?: CustomStrum[];
  instrument: Instrument;
  metronome: boolean;
  loop: boolean;
  capo?: number;
  /** melody notes played with the chords: seconds from the start of the loop */
  extra?: { time: number; midi: number; dur: number }[];
  /** called (roughly on time, for display only) when each bar starts */
  onBar?: (index: number) => void;
  onEnd?: () => void;
}

interface Run {
  stopped: boolean;
  pump: ReturnType<typeof setInterval> | null;
  visualTimers: ReturnType<typeof setTimeout>[];
  chunksRendered: number;
}
let run: Run | null = null;

export function stopTransport() {
  if (!run) return;
  run.stopped = true;
  if (run.pump) clearInterval(run.pump);
  for (const t of run.visualTimers) clearTimeout(t);
  run = null;
  stopAll();
}

export function isPlaying() {
  return run !== null;
}

/**
 * Play chord bars (and optional melody). The loop is cut into chunks of a few
 * seconds on bar lines; each chunk is mixed once (and reused on every pass of
 * a loop) and started on the audio clock.
 */
export function startTransport(bars: ChordBar[], opts: TransportOptions): Schedule | null {
  stopTransport();
  const schedule = buildSchedule(bars, opts);
  const extra = opts.extra ?? [];
  if (!schedule.length && !extra.length) return null;
  const length = schedule.length || Math.max(...extra.map((e) => e.time + e.dur));
  const c = context();
  const sr = c.sampleRate;

  const notes: MixNote[] = [
    ...schedule.notes.map((e) => ({ time: e.time, midi: e.midi, gain: e.vel, dur: e.dur, inst: opts.instrument })),
    ...extra.map((e) => ({ time: e.time, midi: e.midi, gain: 0.9 * chordGain(1), dur: e.dur, inst: 'piano' as Instrument })),
  ].sort((a, b) => a.time - b.time);
  const clicks: MixClick[] = opts.metronome ? schedule.clicks.map((k) => ({ time: k.time, accent: k.accent })) : [];
  const ends = noteEnds(notes, opts.loop ? length : undefined);
  const chunks = planChunks(schedule.barTimes.length ? schedule.barTimes : [0], length, 4);
  const buffers: (AudioBuffer | null)[] = chunks.map(() => null);
  const seconds: number[] = chunks.map(() => 0);

  const r: Run = { stopped: false, pump: null, visualTimers: [], chunksRendered: 0 };
  run = r;
  const render = (k: number) => {
    if (!buffers[k]) {
      const data = renderChunk(notes, clicks, chunks[k], { sampleRate: sr, sample: noteSample, click: clickSample, ends });
      buffers[k] = toBuffer(data);
      seconds[k] = data.length / sr;
      r.chunksRendered++;
    }
    return buffers[k]!;
  };

  // mix the opening before choosing the start time, so it can never start late
  render(0);
  const t0 = c.currentTime + 0.12;
  const total = opts.loop ? Infinity : chunks.length;
  let next = 0;

  const pump = () => {
    if (r.stopped) return;
    reap(c.currentTime);
    let slowRenders = 0;
    while (next < total) {
      const pass = Math.floor(next / chunks.length);
      const k = next % chunks.length;
      const at = t0 + pass * length + chunks[k].start;
      if (at > c.currentTime + LOOKAHEAD) break;
      // mixing ahead of time is spread out, one chunk per tick, unless it is needed soon
      if (!buffers[k]) {
        if (slowRenders >= 1 && at - c.currentTime > 1) break;
        slowRenders++;
      }
      const buf = render(k);
      playBuffer(buf, at, seconds[k]);
      if (k === 0 && opts.onBar) {
        const base = t0 + pass * length;
        schedule.barTimes.forEach((bt, i) => {
          const delay = (base + bt - c.currentTime) * 1000;
          r.visualTimers.push(setTimeout(() => !r.stopped && opts.onBar!(i), Math.max(0, delay)));
        });
      }
      next++;
    }
  };
  pump();
  r.pump = setInterval(pump, PUMP_MS);

  if (!opts.loop) {
    r.visualTimers.push(
      setTimeout(
        () => {
          if (r.stopped) return;
          if (r.pump) clearInterval(r.pump);
          run = null;
          r.stopped = true;
          opts.onEnd?.();
        },
        Math.max(0, (t0 + length - c.currentTime) * 1000 + 300)
      )
    );
  }
  return schedule;
}
