/**
 * Plays the synth: chord previews, single notes, and a looping transport with
 * a lookahead scheduler (sample-accurate start times from the audio clock).
 * Built on react-native-audio-api, which is the Web Audio API on every
 * platform (native on Android, the browser's on web).
 */
import { AudioContext, type AudioBuffer, type GainNode } from 'react-native-audio-api';
import { buildSchedule, chordNotes, type PatternId, type Schedule } from '../core/audio/patterns';
import { renderClick, renderNote, type Instrument } from '../core/audio/synth';
import type { ChordBar } from '../core/model';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const cache = new Map<string, AudioBuffer>();

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    // Headroom first (a six-string chord sums to several times one note),
    // then a soft limiter so peaks round off instead of clipping harshly.
    master = ctx.createGain();
    master.gain.value = 0.3;
    const limiter = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5);
    }
    limiter.curve = curve;
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function toBuffer(data: Float32Array): AudioBuffer {
  const c = context();
  const b = c.createBuffer(1, data.length, c.sampleRate);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return b;
}

/** note buffers are cached per instrument, pitch and (bucketed) length */
function noteBuffer(inst: Instrument, midi: number, dur: number): AudioBuffer {
  const d = Math.min(3, Math.max(0.25, Math.ceil(dur * 4) / 4));
  const key = `${inst}:${midi}:${d}`;
  let b = cache.get(key);
  if (!b) {
    b = toBuffer(renderNote(inst, midi, d, context().sampleRate));
    if (cache.size > 400) cache.clear();
    cache.set(key, b);
  }
  return b;
}

function clickBuffer(accent: boolean): AudioBuffer {
  const key = `click:${accent}`;
  let b = cache.get(key);
  if (!b) {
    b = toBuffer(renderClick(context().sampleRate, accent));
    cache.set(key, b);
  }
  return b;
}

interface Voice {
  stop: (t?: number) => void;
  fade: (t: number) => void;
}
const live = new Set<Voice>();
/** the note currently ringing at each pitch, so a re-struck string replaces it instead of stacking */
const ringing = new Map<number, Voice>();

function play(buffer: AudioBuffer, when: number, vel = 1, pitch?: number) {
  const c = context();
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = vel;
  src.connect(g);
  g.connect(master!);
  const at = Math.max(when, c.currentTime);
  src.start(at);
  const handle: Voice = {
    stop: (t?: number) => src.stop(t ?? c.currentTime),
    fade: (t: number) => {
      try {
        g.gain.setValueAtTime(vel, t);
        g.gain.linearRampToValueAtTime(0, t + 0.03);
        src.stop(t + 0.05);
      } catch {
        // already ended
      }
    },
  };
  if (pitch !== undefined) {
    ringing.get(pitch)?.fade(at);
    ringing.set(pitch, handle);
  }
  live.add(handle);
  src.onended = () => {
    live.delete(handle);
    if (pitch !== undefined && ringing.get(pitch) === handle) ringing.delete(pitch);
  };
  return handle;
}

export function now(): number {
  return context().currentTime;
}

/** Hear a chord once. */
export function previewChord(name: string, inst: Instrument = 'piano', capo = 0) {
  const notes = chordNotes(name, inst, capo);
  const t = now() + 0.02;
  const gap = inst === 'piano' || inst === 'pad' ? 0.003 : 0.016;
  notes.forEach((m, i) => play(noteBuffer(inst, m, 1.5), t + i * gap, 0.7, m));
}

/** Hear single notes (melody preview). */
export function playNote(midi: number, dur = 0.4, inst: Instrument = 'piano', at = 0) {
  play(noteBuffer(inst, midi, dur), (at || now()) + 0.01, 0.9, 1000 + midi);
}

export function stopAll() {
  for (const h of live) {
    try {
      h.stop();
    } catch {
      // already stopped
    }
  }
  live.clear();
  ringing.clear();
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
  /** extra timed notes to play with the chords (melody), seconds from start */
  extra?: { time: number; midi: number; dur: number }[];
  /** called (on the JS thread, roughly in time) when each bar starts */
  onBar?: (index: number) => void;
  onEnd?: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function stopTransport() {
  if (timer) clearInterval(timer);
  timer = null;
  stopAll();
}

export function isPlaying() {
  return timer !== null;
}

/**
 * Play chord bars (and optional melody). Events are scheduled ~150 ms ahead on
 * the audio clock from a 25 ms timer, so JS jank never shifts the timing.
 */
export function startTransport(bars: ChordBar[], opts: TransportOptions): Schedule | null {
  stopTransport();
  const schedule = buildSchedule(bars, opts);
  if (!schedule.length && !opts.extra?.length) return null;
  const length = schedule.length || Math.max(...(opts.extra ?? []).map((e) => e.time + e.dur));
  const c = context();
  // render every sound up front: synthesising mid-playback stalls the scheduler and garbles timing
  for (const e of schedule.notes) noteBuffer(opts.instrument, e.midi, e.dur);
  for (const e of opts.extra ?? []) noteBuffer('piano', e.midi, e.dur);
  if (schedule.clicks.length) {
    clickBuffer(true);
    clickBuffer(false);
  }
  const t0 = c.currentTime + 0.12;
  let loopIndex = 0;
  let ni = 0;
  let ci = 0;
  let ei = 0;
  let bi = 0;
  const extra = [...(opts.extra ?? [])].sort((a, b) => a.time - b.time);
  const ahead = 0.15;
  const tick = () => {
    const horizon = c.currentTime + ahead;
    for (;;) {
      const base = t0 + loopIndex * length;
      let progressed = false;
      while (ni < schedule.notes.length && base + schedule.notes[ni].time < horizon) {
        const e = schedule.notes[ni++];
        play(noteBuffer(opts.instrument, e.midi, e.dur), base + e.time, e.vel, e.midi);
        progressed = true;
      }
      while (ci < schedule.clicks.length && base + schedule.clicks[ci].time < horizon) {
        const k = schedule.clicks[ci++];
        play(clickBuffer(k.accent), base + k.time, 1);
        progressed = true;
      }
      while (ei < extra.length && base + extra[ei].time < horizon) {
        const e = extra[ei++];
        play(noteBuffer('piano', e.midi, e.dur), base + e.time, 1, 1000 + e.midi);
        progressed = true;
      }
      while (bi < schedule.barTimes.length && base + schedule.barTimes[bi] < c.currentTime + 0.03) {
        opts.onBar?.(bi++);
      }
      const done = ni >= schedule.notes.length && ci >= schedule.clicks.length && ei >= extra.length;
      if (done && base + length < horizon) {
        if (!opts.loop) {
          if (base + length < c.currentTime) {
            stopTransport();
            opts.onEnd?.();
          }
          return;
        }
        loopIndex++;
        ni = ci = ei = bi = 0;
        continue;
      }
      if (!progressed) return;
    }
  };
  tick();
  timer = setInterval(tick, 25);
  return schedule;
}
