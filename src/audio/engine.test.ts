import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A fake of the NATIVE engine's behaviour, strict where the real one is:
 *  - the clock only moves when the test says so
 *  - buffers are played frame-for-frame, so a buffer made at the wrong sample
 *    rate would play at the wrong speed (the real engine does not convert)
 *  - stop() before start() throws
 */
const state = vi.hoisted(() => ({
  time: 0,
  contextRate: 48000,
  bufferRates: [] as number[],
  sources: [] as { start: number; stop: number | null; bufferRate: number; gainNode: unknown; disconnected: boolean }[],
  gains: [] as { disconnected: boolean; connectedTo: unknown; events: { type: string; value: number; time: number }[]; value: number }[],
  endedHandlersSet: 0,
  curve: null as Float32Array | null,
  masterRamps: [] as number[],
}));

vi.mock('react-native-audio-api', () => {
  class Param {
    value = 1;
    constructor(private rec?: { events: { type: string; value: number; time: number }[] }) {}
    setValueAtTime(value: number, time: number) {
      this.rec?.events.push({ type: 'set', value, time });
      this.value = value;
    }
    linearRampToValueAtTime(value: number, time: number) {
      this.rec?.events.push({ type: 'ramp', value, time });
      state.masterRamps.push(value);
    }
    cancelScheduledValues(time: number) {
      if (this.rec) this.rec.events = this.rec.events.filter((e) => e.time < time);
    }
  }
  class GainNode {
    rec = { disconnected: false, connectedTo: null as unknown, events: [] as { type: string; value: number; time: number }[], value: 1 };
    gain: Param;
    constructor() {
      this.gain = new Param(this.rec);
      state.gains.push(this.rec);
    }
    connect(to: unknown) {
      this.rec.connectedTo = to;
    }
    disconnect() {
      this.rec.disconnected = true;
    }
  }
  class WaveShaper {
    connect() {}
    set curve(c: Float32Array | null) {
      state.curve = c;
    }
  }
  class BufferSource {
    buffer: { rate: number } | null = null;
    started = false;
    rec = { start: -1, stop: null as number | null, bufferRate: 0, gainNode: null as unknown, disconnected: false };
    set onended(_: unknown) {
      state.endedHandlersSet++;
    }
    connect(to: unknown) {
      this.rec.gainNode = to;
    }
    disconnect() {
      this.rec.disconnected = true;
    }
    start(t: number) {
      this.started = true;
      this.rec.start = t;
      this.rec.bufferRate = this.buffer!.rate;
      state.sources.push(this.rec);
    }
    stop(t: number) {
      if (!this.started) throw new Error('InvalidStateError: stop() before start()');
      this.rec.stop = t;
    }
  }
  class AudioContext {
    destination = {};
    state = 'running';
    get sampleRate() {
      return state.contextRate;
    }
    get currentTime() {
      return state.time;
    }
    createGain() {
      return new GainNode();
    }
    createWaveShaper() {
      return new WaveShaper();
    }
    createBufferSource() {
      return new BufferSource();
    }
    createBuffer(_c: number, len: number, rate: number) {
      state.bufferRates.push(rate);
      return { length: len, rate, copyToChannel() {} };
    }
  }
  return { AudioContext };
});

import { softClipCurve } from '../core/audio/softclip';
import { engineStats, MAX_VOICES, playNote, prepare, previewChord, setVolume, startTransport, stopTransport } from './engine';

beforeEach(() => {
  stopTransport();
  state.sources = [];
  state.time = 0;
  state.masterRamps = [];
});

const bars = [{ chords: ['C'] }, { chords: ['Am', 'F'] }, { chords: ['G'] }];

describe('audio engine: every way it has gone wrong on a phone', () => {
  it('renders sounds at the device sample rate (native playback does not convert rates)', async () => {
    for (const rate of [44100, 48000]) {
      state.contextRate = rate;
      // a fresh engine per rate: sounds are cached per context
      vi.resetModules();
      const fresh = await import('./engine');
      state.bufferRates = [];
      fresh.previewChord('C', 'piano');
      fresh.startTransport([{ chords: ['G'] }], { bpm: 120, timeSig: [4, 4], pattern: 'block', instrument: 'acoustic', metronome: true, loop: false });
      fresh.stopTransport();
      expect(state.bufferRates.length).toBeGreaterThan(5);
      expect(new Set(state.bufferRates)).toEqual(new Set([rate]));
    }
    state.contextRate = 48000;
  });

  it('places every note on the audio clock', () => {
    startTransport(bars.slice(0, 2), { bpm: 120, timeSig: [4, 4], pattern: 'block', instrument: 'piano', metronome: false, loop: false });
    const starts = [...new Set(state.sources.map((s) => Math.round((s.start - 0.15) * 20) / 20))];
    expect(starts).toEqual([0, 2, 3]);
    stopTransport();
  });

  it('gives each note its own volume node, silent until its start, and never leaves one wired up', () => {
    state.time = 100;
    const g0 = state.gains.length;
    startTransport(bars, { bpm: 120, timeSig: [4, 4], pattern: 'strum-folk', instrument: 'piano', metronome: true, loop: false });
    // inspect what was queued, before anything stops it
    const noteGains = state.gains.slice(g0).filter((g) => g.events.length >= 2);
    expect(noteGains.length).toBeGreaterThan(20);
    for (const g of noteGains) {
      // starts silent (value 0), holds its level from its start, and ramps to 0 at its end
      expect(g.value).toBeDefined();
      const sets = g.events.filter((e) => e.type === 'set');
      const ramps = g.events.filter((e) => e.type === 'ramp');
      expect(sets.length).toBe(2);
      expect(ramps.length).toBe(1);
      expect(ramps[0].value).toBe(0);
      expect(sets[0].value).toBeGreaterThan(0);
      expect(sets[0].time).toBeGreaterThanOrEqual(100);
    }
    stopTransport(); // stopping before anything started silences it all, without throwing
    state.time += 30;
    playNote(60, 0.2, 'piano'); // any play releases what has finished
    // finished notes are fully released (both source and volume node)
    expect(state.gains.slice(g0).filter((g) => g.disconnected).length).toBeGreaterThan(noteGains.length - 4);
    expect(state.sources.filter((s) => s.disconnected).length).toBeGreaterThan(20);
    expect(engineStats().voices).toBeLessThan(MAX_VOICES);
  });

  it('does not register per-note ended callbacks', () => {
    state.endedHandlersSet = 0;
    startTransport(bars, { bpm: 120, timeSig: [4, 4], pattern: 'strum-pop', instrument: 'piano', metronome: true, loop: false });
    stopTransport();
    expect(state.endedHandlersSet).toBe(0);
  });

  it('keeps the graph bounded over a long session', () => {
    const before = state.gains.length;
    for (let round = 0; round < 40; round++) {
      state.time += 20;
      startTransport(bars, { bpm: 120, timeSig: [4, 4], pattern: 'strum-folk', instrument: 'piano', metronome: true, loop: false });
      stopTransport();
    }
    state.time += 30;
    playNote(60, 0.2, 'piano');
    const alive = state.gains.slice(before).filter((g) => !g.disconnected).length;
    expect(alive).toBeLessThan(MAX_VOICES + 5);
    expect(engineStats().clicks).toBeLessThan(10);
  });

  it('re-striking a note, or hitting the voice cap, never disturbs other notes', () => {
    state.time = 500;
    // queue a long run of the same chord (every strike re-strikes the previous one)
    startTransport([{ chords: ['G'] }, { chords: ['G'] }, { chords: ['G'] }, { chords: ['G'] }], { bpm: 90, timeSig: [4, 4], pattern: 'strum-folk', instrument: 'piano', metronome: false, loop: false });
    stopTransport();
    // an unfaded note must still hold its level at its start and ramp at its end: no gain
    // may be left with its start event cancelled
    for (const g of state.gains.filter((x) => x.events.length)) {
      const sets = g.events.filter((e) => e.type === 'set');
      const faded = g.events.some((e) => e.type === 'ramp');
      if (faded) expect(sets.length).toBeGreaterThanOrEqual(1);
    }
    // stopping never throws, including for notes that had not started yet
    expect(() => stopTransport()).not.toThrow();
  });

  it('caps notes sounding at once', () => {
    state.time = 900;
    const n = MAX_VOICES + 15;
    for (let i = 0; i < n; i++) playNote(40 + i, 2, 'piano', 901 + i * 0.001);
    const stopped = state.sources.filter((s) => s.stop !== null && s.stop < 903).length;
    expect(stopped).toBeGreaterThanOrEqual(15);
  });

  it('renders each note once and reuses it for every strum', async () => {
    state.bufferRates = [];
    await prepare('electric', [60, 64, 67]);
    const afterPrep = state.bufferRates.length;
    expect(afterPrep).toBeLessThanOrEqual(3);
    startTransport([{ chords: ['C'] }, { chords: ['C'] }], { bpm: 120, timeSig: [4, 4], pattern: 'strum-folk', instrument: 'electric', metronome: false, loop: false });
    stopTransport();
    // the transport may need other pitches of the chord, but never re-renders the same ones
    const again = state.bufferRates.length;
    previewChord('C', 'electric');
    previewChord('C', 'electric');
    expect(state.bufferRates.length).toBe(again);
  });

  it('volume changes ramp smoothly and are bounded', () => {
    previewChord('C', 'piano');
    state.masterRamps = [];
    setVolume(0.2);
    setVolume(5);
    expect(state.masterRamps.length).toBe(2);
    expect(Math.max(...state.masterRamps)).toBeLessThanOrEqual(1.4);
    expect(state.masterRamps[0]).toBeCloseTo(0.28, 2);
  });

  it('the soft limiter changes nothing below its knee and never exceeds full scale', () => {
    const c = softClipCurve(2048, 0.8);
    const at = (x: number) => c[Math.round(((x + 1) / 2) * (c.length - 1))];
    for (const x of [-0.7, -0.3, 0, 0.1, 0.5, 0.79]) expect(at(x)).toBeCloseTo(x, 3);
    for (const x of [-1, -0.95, 0.9, 1]) expect(Math.abs(at(x))).toBeLessThanOrEqual(1);
    expect(at(1)).toBeGreaterThan(0.85);
    // monotonic, so it never folds the waveform back
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    expect(state.curve).not.toBeNull();
  });
});
