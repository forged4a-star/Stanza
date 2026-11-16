/**
 * Chord and melody playback.
 *
 * Timing: every note is placed on the audio clock (`currentTime`) when it is
 * queued, so its start time never depends on the JS thread. A timer only tops
 * up the *next* loop (two loops are always queued ahead) and moves the bar
 * highlight, which is display only.
 *
 * Sound: one AudioContext; each (instrument, pitch) is rendered once at the
 * device's own sample rate (the native engine plays buffers frame-for-frame,
 * it does not convert rates) and normalised to a common level; every note has
 * its own volume node, released as soon as the note finishes.
 */
import { AudioContext, type AudioBuffer, type AudioBufferSourceNode, type GainNode } from 'react-native-audio-api';
import { buildSchedule, chordGain, chordNotes, type PatternId, type Schedule } from '../core/audio/patterns';
import type { CustomStrum } from '../core/audio/strums';
import { softClipCurve } from '../core/audio/softclip';
import { renderClick, renderNote, type Instrument } from '../core/audio/synth';
import type { ChordBar } from '../core/model';

/** Length of a cached note. Shorter notes are faded out on schedule. */
const NOTE_SECONDS = 2;
/** Most notes allowed to sound at the same instant. */
export const MAX_VOICES = 20;
/** Cached buffers kept at once (about 20 MB at 48 kHz). */
const MAX_BUFFERS = 48;
/** How many loops are always queued ahead of the audio clock. */
const LOOKAHEAD_LOOPS = 2;
/** Output level at slider 100 % (the soft limiter protects the top end). */
const MASTER_MAX = 1.4;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let clickOut: GainNode | null = null;
let volume = 0.7;
const buffers = new Map<string, AudioBuffer>();
const clickBuffers = new Map<boolean, AudioBuffer>();

interface Voice {
  pitch: number;
  start: number;
  end: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  fadeAt: (t: number) => void;
}
/** every voice that is sounding or queued to sound (pruned by time) */
let voices: Voice[] = [];
let clickSources: { src: AudioBufferSourceNode; end: number }[] = [];

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume * MASTER_MAX;
    const limiter = ctx.createWaveShaper();
    limiter.curve = softClipCurve();
    master.connect(limiter);
    limiter.connect(ctx.destination);
    clickOut = ctx.createGain();
    clickOut.gain.value = 1;
    clickOut.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

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

function noteBuffer(inst: Instrument, midi: number): AudioBuffer {
  const key = `${inst}:${midi}`;
  let b = buffers.get(key);
  if (!b) {
    if (buffers.size >= MAX_BUFFERS) buffers.clear();
    const sr = context().sampleRate;
    b = toBuffer(normalised(renderNote(inst, midi, NOTE_SECONDS, sr)));
    buffers.set(key, b);
  }
  return b;
}

function clickBuffer(accent: boolean): AudioBuffer {
  let b = clickBuffers.get(accent);
  if (!b) {
    b = toBuffer(renderClick(context().sampleRate, accent));
    clickBuffers.set(accent, b);
  }
  return b;
}

/**
 * Render sounds for these pitches now, a couple at a time between event-loop
 * turns, so the UI never freezes. Call it ahead of when the sounds are needed.
 */
export function prepare(inst: Instrument, midis: number[]): Promise<void> {
  context();
  const todo = [...new Set(midis)].filter((m) => !buffers.has(`${inst}:${m}`));
  return new Promise((resolve) => {
    const step = () => {
      for (let k = 0; k < 2 && todo.length; k++) noteBuffer(inst, todo.shift()!);
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
    // node already finished or released
  }
};

/** Release everything that has finished sounding, by audio time (no events needed). */
function reap(t: number) {
  if (voices.some((v) => v.end < t - 0.15)) {
    const keep: Voice[] = [];
    for (const v of voices) {
      if (v.end < t - 0.15) {
        safe(() => v.src.disconnect());
        safe(() => v.gain.disconnect());
      } else keep.push(v);
    }
    voices = keep;
  }
  if (clickSources.some((k) => k.end < t - 0.15)) {
    clickSources = clickSources.filter((k) => {
      if (k.end >= t - 0.15) return true;
      safe(() => k.src.disconnect());
      return false;
    });
  }
}

/** Ring a note on its own volume node. `end` is when it has finished sounding. */
function play(inst: Instrument, midi: number, when: number, gain: number, dur?: number): Voice {
  const c = context();
  const start = Math.max(when, c.currentTime);
  reap(c.currentTime);
  const end = start + (dur ?? NOTE_SECONDS);

  // a note re-struck on the same pitch replaces the old one (no stacking)
  for (const v of voices) if (v.pitch === midi && v.start <= start && v.end > start + 0.05) v.fadeAt(start);

  // polyphony cap: count what is sounding at this instant; steal the oldest if full
  const sounding = voices.filter((v) => v.start <= start && v.end > start);
  if (sounding.length >= MAX_VOICES) {
    sounding.sort((a, b) => a.start - b.start);
    for (let k = 0; k < sounding.length - MAX_VOICES + 1; k++) sounding[k].fadeAt(start);
  }

  const g = c.createGain();
  g.gain.value = 0; // silent until the scheduled start, whatever happens to timing
  g.gain.setValueAtTime(gain, start);
  g.gain.setValueAtTime(gain, end - 0.04);
  g.gain.linearRampToValueAtTime(0, end);
  g.connect(master!);

  const src = c.createBufferSource();
  src.buffer = noteBuffer(inst, midi);
  src.connect(g);
  src.start(start);
  src.stop(end + 0.02);

  const voice: Voice = {
    pitch: midi,
    start,
    end,
    src,
    gain: g,
    fadeAt: (t: number) => {
      const at = Math.max(t, c.currentTime);
      if (at >= voice.end - 0.04) return; // already on its way out
      safe(() => {
        g.gain.cancelScheduledValues(at);
        if (at <= voice.start) {
          // never started: keep it silent and stop it
          g.gain.setValueAtTime(0, at);
          src.stop(Math.max(at, c.currentTime));
          voice.end = at;
          return;
        }
        g.gain.setValueAtTime(gain, at);
        g.gain.linearRampToValueAtTime(0, at + 0.03);
        src.stop(at + 0.04);
        voice.end = at + 0.04;
      });
    },
  };
  voices.push(voice);
  return voice;
}

export function now(): number {
  return context().currentTime;
}

/** Hear a chord once. */
export function previewChord(name: string, inst: Instrument = 'piano', capo = 0) {
  const notes = chordNotes(name, inst, capo);
  const t = now() + 0.02;
  const gap = inst === 'piano' || inst === 'pad' ? 0.003 : 0.016;
  const g = 0.9 * chordGain(notes.length);
  notes.forEach((m, i) => play(inst, m, t + i * gap, g, 1.5));
}

/** Hear a single note (melody preview). */
export function playNote(midi: number, dur = 0.4, inst: Instrument = 'piano', at = 0) {
  play(inst, midi, (at || now()) + 0.01, 0.9 * chordGain(1), dur);
}

/** Silence everything (sounding and queued). */
export function stopAll() {
  const c = ctx;
  if (!c) return;
  for (const v of voices) v.fadeAt(c.currentTime);
  for (const k of clickSources) safe(() => k.src.stop(c.currentTime));
}

/** Number of live audio nodes this engine holds (for tests and diagnostics). */
export function engineStats() {
  return { voices: voices.length, clicks: clickSources.length, buffers: buffers.size, sampleRate: ctx?.sampleRate ?? 0, volume };
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
  queueTimer: ReturnType<typeof setInterval> | null;
  visualTimers: ReturnType<typeof setTimeout>[];
}
let run: Run | null = null;

export function stopTransport() {
  if (!run) return;
  run.stopped = true;
  if (run.queueTimer) clearInterval(run.queueTimer);
  for (const t of run.visualTimers) clearTimeout(t);
  run = null;
  stopAll();
}

export function isPlaying() {
  return run !== null;
}

/**
 * Play chord bars (and optional melody). Every note of a loop is placed on the
 * audio clock when that loop is queued; nothing about the sound depends on a
 * timer firing on time.
 */
export function startTransport(bars: ChordBar[], opts: TransportOptions): Schedule | null {
  stopTransport();
  const schedule = buildSchedule(bars, opts);
  const extra = [...(opts.extra ?? [])].sort((a, b) => a.time - b.time);
  if (!schedule.length && !extra.length) return null;
  const length = schedule.length || Math.max(...extra.map((e) => e.time + e.dur));
  const c = context();
  const r: Run = { stopped: false, queueTimer: null, visualTimers: [] };
  run = r;
  const t0 = c.currentTime + 0.15;
  const loops = opts.loop ? Infinity : 1;
  let queued = 0;

  const queueLoop = (n: number) => {
    const base = t0 + n * length;
    const events: { time: number; inst: Instrument; midi: number; gain: number; dur: number }[] = [];
    for (const e of schedule.notes) events.push({ time: e.time, inst: opts.instrument, midi: e.midi, gain: e.vel, dur: e.dur });
    for (const e of extra) events.push({ time: e.time, inst: 'piano', midi: e.midi, gain: 0.9 * chordGain(1), dur: e.dur });
    events.sort((x, y) => x.time - y.time);
    for (const e of events) play(e.inst, e.midi, base + e.time, e.gain, e.dur);
    if (opts.metronome) {
      for (const k of schedule.clicks) {
        const at = Math.max(base + k.time, c.currentTime);
        const src = c.createBufferSource();
        src.buffer = clickBuffer(k.accent);
        src.connect(clickOut!);
        src.start(at);
        clickSources.push({ src, end: at + 0.1 });
      }
    }
    // the highlight is display only: it may run late, but never shifts the sound
    if (opts.onBar) {
      schedule.barTimes.forEach((bt, i) => {
        const delay = (base + bt - c.currentTime) * 1000;
        r.visualTimers.push(setTimeout(() => !r.stopped && opts.onBar!(i), Math.max(0, delay)));
      });
    }
  };

  // queue ahead of the clock; a 500 ms timer keeps at least two loops queued
  const topUp = () => {
    if (r.stopped) return;
    reap(c.currentTime);
    while (queued < loops && t0 + queued * length < c.currentTime + LOOKAHEAD_LOOPS * length) queueLoop(queued++);
  };
  topUp();

  if (!opts.loop) {
    const endAt = t0 + length;
    r.visualTimers.push(
      setTimeout(
        () => {
          if (r.stopped) return;
          run = null;
          r.stopped = true;
          opts.onEnd?.();
        },
        Math.max(0, (endAt - c.currentTime) * 1000 + 300)
      )
    );
  } else {
    r.queueTimer = setInterval(topUp, 500);
  }
  return schedule;
}
