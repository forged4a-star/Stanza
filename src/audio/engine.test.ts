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
  sources: [] as { start: number; stop: number | null; bufferRate: number; gainNode: unknown; disconnected: boolean; buffer: unknown }[],
  gains: [] as { disconnected: boolean; connectedTo: unknown; events: { type: string; value: number; time: number }[]; value: number }[],
  endedHandlersSet: 0,
  curve: null as Float32Array | null,
  masterRamps: [] as number[],
  buffers: [] as { length: number; rate: number; data: Float32Array | null }[],
  latency: '' as string,
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
    buffer: { rate: number; data?: Float32Array | null } | null = null;
    started = false;
    rec = { start: -1, stop: null as number | null, bufferRate: 0, gainNode: null as unknown, disconnected: false, buffer: null as unknown };
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
      this.rec.buffer = this.buffer;
      state.sources.push(this.rec);
    }
    stop(t: number) {
      if (!this.started) throw new Error('InvalidStateError: stop() before start()');
      this.rec.stop = t;
    }
  }
  class AudioContext {
    constructor(opts?: { latencyHint?: string }) {
      state.latency = opts?.latencyHint ?? 'interactive';
    }
    close() {
      return Promise.resolve();
    }
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
      const b = { length: len, rate, data: null as Float32Array | null, copyToChannel(d: Float32Array) { b.data = d.slice(); } };
      state.buffers.push(b);
      return b;
    }
  }
  return { AudioContext };
});

import { softClipCurve } from '../core/audio/softclip';
import { engineStats, playNote, prepare, previewChord, setVolume, startTransport, stopTransport } from './engine';

beforeEach(() => {
  stopTransport();
  vi.useFakeTimers();
  state.sources = [];
  state.buffers = [];
  state.time = 0;
  state.masterRamps = [];
});

/** move the audio clock and let the engine's timer run, in small steps */
function advance(seconds: number) {
  for (let t = 0; t < seconds; t += 0.2) {
    state.time += 0.2;
    vi.advanceTimersByTime(200);
  }
}

const bars = [{ chords: ['C'] }, { chords: ['Am', 'F'] }, { chords: ['G'] }];
const longSong = Array.from({ length: 32 }, (_, i) => ({ chords: [['G', 'Em', 'C', 'D'][i % 4]] }));
const busy = { bpm: 120, timeSig: [4, 4] as [number, number], pattern: 'strum-folk', instrument: 'acoustic' as const, metronome: true };

describe('audio engine: every way it has gone wrong on a phone', () => {
  it('renders sounds at the device sample rate (native playback does not convert rates)', async () => {
    for (const rate of [44100, 48000]) {
      state.contextRate = rate;
      vi.resetModules();
      const fresh = await import('./engine');
      state.bufferRates = [];
      fresh.previewChord('C', 'piano');
      fresh.startTransport([{ chords: ['G'] }], { ...busy, loop: false });
      fresh.stopTransport();
      expect(state.bufferRates.length).toBeGreaterThan(1);
      expect(new Set(state.bufferRates)).toEqual(new Set([rate]));
    }
    state.contextRate = 48000;
  });

  it('a long, busy song keeps only a handful of sources connected (the cause of the crackle)', () => {
    startTransport(longSong, { ...busy, loop: true }); // 32 bars of strumming: about 1,500 strummed notes per pass
    let most = 0;
    for (let step = 0; step < 400; step++) {
      advance(0.2);
      const connected = state.sources.filter((s) => !s.disconnected && (s.stop === null || s.stop > state.time)).length;
      most = Math.max(most, connected);
    }
    stopTransport();
    expect(most).toBeLessThanOrEqual(5);
    // 80 seconds of music in chunks of a few seconds, not one source per note
    expect(state.sources.length).toBeLessThan(40);
  });

  it('each chunk starts on the audio clock, on a bar line', () => {
    state.time = 10;
    startTransport(longSong.slice(0, 8), { ...busy, loop: false });
    advance(20);
    const starts = state.sources.map((s) => s.start - state.sources[0].start);
    // 2-second bars, chunks of at least 4 seconds: 0, 4, 8, 12
    expect(starts.map((x) => Math.round(x * 1000) / 1000)).toEqual([0, 4, 8, 12]);
    expect(state.sources[0].start).toBeGreaterThan(10);
    stopTransport();
  });

  it('a loop reuses its mixed chunks on every pass instead of mixing them again', () => {
    startTransport(bars, { ...busy, loop: true });
    advance(4);
    const mixed = state.buffers.length;
    advance(30); // several more passes
    expect(state.buffers.length).toBe(mixed);
    const passes = new Set(state.sources.map((s) => s.buffer)).size;
    expect(passes).toBeLessThanOrEqual(2); // the same buffer objects, started again
    expect(state.sources.length).toBeGreaterThan(passes * 3);
    stopTransport();
  });

  it('the mixed sound is real audio: not silent, no NaN, and in range', () => {
    startTransport(bars, { ...busy, loop: false });
    stopTransport();
    const mixed = state.buffers.filter((b) => b.data && b.data.length > 48000);
    expect(mixed.length).toBeGreaterThan(0);
    for (const b of mixed) {
      let peak = 0;
      for (const v of b.data!) {
        expect(Number.isNaN(v)).toBe(false);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThan(1.6);
    }
  });

  it('stopping fades everything out (no click), including chunks queued but not started', () => {
    state.time = 50;
    startTransport(longSong, { ...busy, loop: true });
    advance(1);
    const g0 = state.gains.length;
    expect(() => stopTransport()).not.toThrow();
    const started = state.sources.filter((s) => s.start <= state.time);
    for (const s of started) expect(s.stop).not.toBeNull();
    const fades = state.gains.slice(0, g0).filter((g) => g.events.some((e) => e.type === 'ramp' && e.value === 0));
    expect(fades.length).toBeGreaterThanOrEqual(started.length);
    // anything queued for later never plays
    for (const s of state.sources.filter((x) => x.start > state.time)) expect(s.stop).not.toBeNull();
  });

  it('a song that is not looped ends by itself and tells the app', () => {
    const onEnd = vi.fn();
    startTransport(bars, { ...busy, loop: false, onEnd });
    advance(10);
    expect(onEnd).toHaveBeenCalledTimes(1);
    const after = state.sources.length;
    advance(10);
    expect(state.sources.length).toBe(after);
  });

  it('the bar highlight follows the music without touching the sound', () => {
    const seen: number[] = [];
    startTransport(bars, { ...busy, loop: false, onBar: (i) => seen.push(i) });
    advance(8);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('a chord preview or a single note is one source', () => {
    const before = state.sources.length;
    previewChord('C', 'acoustic');
    expect(state.sources.length).toBe(before + 1);
    playNote(64, 0.3);
    expect(state.sources.length).toBe(before + 2);
  });

  it('keeps the graph bounded over a long session', () => {
    for (let round = 0; round < 40; round++) {
      startTransport(bars, { ...busy, loop: false });
      advance(0.4);
      stopTransport();
      previewChord('G', 'piano');
      advance(2);
    }
    advance(5);
    playNote(60, 0.2, 'piano'); // any play releases what has finished
    expect(engineStats().voices).toBeLessThan(5);
  });

  it('does not register ended callbacks', () => {
    state.endedHandlersSet = 0;
    startTransport(bars, { ...busy, loop: false });
    advance(8);
    expect(state.endedHandlersSet).toBe(0);
  });

  it('renders each note sound once and reuses it', async () => {
    vi.useRealTimers(); // preparing works between event-loop turns
    await prepare('electric', [60, 64, 67]);
    const a = engineStats().buffers;
    await prepare('electric', [60, 64, 67]);
    expect(engineStats().buffers).toBe(a);
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

  it('opens the output in smooth playback mode (deep buffers), not the fragile low-latency default', async () => {
    vi.resetModules();
    const fresh = await import('./engine');
    fresh.previewChord('C');
    expect(state.latency).toBe('playback');
    // switching to the fast mode reopens the output, and back again
    fresh.setAudioLatency('interactive');
    fresh.previewChord('C');
    expect(state.latency).toBe('interactive');
    fresh.setAudioLatency('playback');
    fresh.previewChord('C');
    expect(state.latency).toBe('playback');
  });

  it('the soft limiter changes nothing below its knee and never exceeds full scale', () => {
    const c = softClipCurve(2048, 0.8);
    const at = (x: number) => c[Math.round(((x + 1) / 2) * (c.length - 1))];
    for (const x of [-0.7, -0.3, 0, 0.1, 0.5, 0.79]) expect(at(x)).toBeCloseTo(x, 3);
    for (const x of [-1, -0.95, 0.9, 1]) expect(Math.abs(at(x))).toBeLessThanOrEqual(1);
    expect(at(1)).toBeGreaterThan(0.85);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    expect(state.curve).not.toBeNull();
  });
});
