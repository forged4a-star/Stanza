/**
 * Chord and melody playback.
 *
 * Timing: every note is scheduled on the audio clock (`context.currentTime`)
 * when it is queued, so its start time never depends on the JS thread. A
 * timer only runs to queue the *next* loop ahead of time (two loops of audio
 * are always already scheduled), and to update the bar highlight, which is
 * purely visual and can lag without affecting sound.
 *
 * Cost: one AudioContext for the app's lifetime; each (instrument, pitch) is
 * rendered once at a reduced rate and reused; voices are capped and the
 * oldest is faded when a new note would exceed the cap.
 */
import { AudioContext, type AudioBuffer, type GainNode } from 'react-native-audio-api';
import { buildSchedule, chordNotes, type PatternId, type Schedule } from '../core/audio/patterns';
import { renderClick, renderNote, type Instrument } from '../core/audio/synth';
import type { ChordBar } from '../core/model';

/** Sounds are rendered at this rate: half the memory and CPU of 44.1 kHz, plenty for synth tones. */
const RENDER_RATE = 22050;
/** Length of a cached note. Shorter notes are faded out on schedule. */
const NOTE_SECONDS = 2.5;
/** Most notes allowed to sound at the same instant. */
export const MAX_VOICES = 20;
/** Cached buffers kept at once (about 13 MB at the settings above). */
const MAX_BUFFERS = 64;
/** How far ahead of time whole loops are queued. */
const LOOKAHEAD_LOOPS = 2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
const clickBuffers = new Map<boolean, AudioBuffer>();

interface Voice {
  pitch: number;
  start: number;
  end: number;
  stop: (t?: number) => void;
  fadeAt: (t: number) => void;
}
/** every voice that is sounding or queued to sound (pruned as they finish) */
let voices: Voice[] = [];

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    // Plain headroom. (An earlier version put a tanh waveshaper here: it
    // distorted every note, which is part of what sounded crackly.)
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function toBuffer(data: Float32Array): AudioBuffer {
  const c = context();
  const b = c.createBuffer(1, data.length, RENDER_RATE);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return b;
}

function noteBuffer(inst: Instrument, midi: number): AudioBuffer {
  const key = `${inst}:${midi}`;
  let b = buffers.get(key);
  if (!b) {
    if (buffers.size >= MAX_BUFFERS) buffers.clear();
    b = toBuffer(renderNote(inst, midi, NOTE_SECONDS, RENDER_RATE));
    buffers.set(key, b);
  }
  return b;
}

function clickBuffer(accent: boolean): AudioBuffer {
  let b = clickBuffers.get(accent);
  if (!b) {
    b = toBuffer(renderClick(RENDER_RATE, accent));
    clickBuffers.set(accent, b);
  }
  return b;
}

/**
 * Render sounds for these pitches now, a few at a time between event-loop
 * turns, so opening a song doesn't freeze the UI. Call it when a song opens.
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

/** Ring a note: returns the voice. `end` is when it has finished sounding. */
function play(inst: Instrument, midi: number, when: number, vel: number, dur?: number): Voice {
  const c = context();
  const start = Math.max(when, c.currentTime);
  const length = dur ?? NOTE_SECONDS;
  const end = start + length;

  // a note re-struck on the same pitch replaces the old one (no stacking)
  for (const v of voices) if (v.pitch === midi && v.start <= start && v.end > start) v.fadeAt(start);

  // polyphony cap: count what is sounding at this instant; steal the oldest if full
  const sounding = voices.filter((v) => v.start <= start && v.end > start);
  if (sounding.length >= MAX_VOICES) {
    sounding.sort((a, b) => a.start - b.start);
    for (let k = 0; k < sounding.length - MAX_VOICES + 1; k++) sounding[k].fadeAt(start);
  }

  const src = c.createBufferSource();
  src.buffer = noteBuffer(inst, midi);
  const g = c.createGain();
  g.gain.setValueAtTime(vel, start);
  src.connect(g);
  g.connect(master!);
  src.start(start);
  const fadeAt = (t: number) => {
    try {
      const at = Math.max(t, c.currentTime);
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(vel, at);
      g.gain.linearRampToValueAtTime(0, at + 0.03);
      src.stop(at + 0.04);
      voice.end = Math.min(voice.end, at + 0.04);
    } catch {
      // already finished
    }
  };
  // a fixed-length note fades out on time; the buffer itself is longer
  g.gain.setValueAtTime(vel, end - 0.04);
  g.gain.linearRampToValueAtTime(0, end);
  src.stop(end + 0.02);

  const voice: Voice = { pitch: midi, start, end, stop: (t) => src.stop(t ?? c.currentTime), fadeAt };
  voices.push(voice);
  src.onended = () => {
    voices = voices.filter((v) => v !== voice);
  };
  // drop finished voices now and then so the list stays short
  if (voices.length > 4 * MAX_VOICES) voices = voices.filter((v) => v.end > c.currentTime - 1);
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
  notes.forEach((m, i) => play(inst, m, t + i * gap, 0.7, 1.5));
}

/** Hear a single note (melody preview). */
export function playNote(midi: number, dur = 0.4, inst: Instrument = 'piano', at = 0) {
  play(inst, midi, (at || now()) + 0.01, 0.9, dur);
}

/** Silence everything (sounding and queued). */
export function stopAll() {
  const c = ctx;
  if (!c) return;
  for (const v of voices) v.fadeAt(c.currentTime);
  voices = [];
}

// ------------------------------------------------------------------ transport

export interface TransportOptions {
  bpm: number;
  timeSig: [number, number];
  pattern: PatternId;
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
    for (const e of schedule.notes) play(opts.instrument, e.midi, base + e.time, e.vel, e.dur);
    for (const e of extra) play('piano', e.midi, base + e.time, 0.9, e.dur);
    if (opts.metronome) {
      for (const k of schedule.clicks) {
        const src = c.createBufferSource();
        src.buffer = clickBuffer(k.accent);
        src.connect(master!);
        src.start(Math.max(base + k.time, c.currentTime));
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

  // queue two loops now, then keep at least LOOKAHEAD_LOOPS queued ahead of the clock
  const topUp = () => {
    if (r.stopped) return;
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

/** Warm the sounds a song needs (call on open, after the UI has settled). */
export function prepareFor(bars: ChordBar[], inst: Instrument, capo = 0): Promise<void> {
  const midis: number[] = [];
  for (const b of bars) for (const name of b.chords) for (const m of chordNotes(name, inst, capo)) midis.push(m);
  return prepare(inst, midis);
}
