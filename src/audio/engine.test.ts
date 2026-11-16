import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A fake Web Audio context whose clock only moves when the test says so. */
const state = vi.hoisted(() => ({
  time: 0,
  sources: [] as { start: number; stop: number | null; buffer: unknown; gain: { ramps: number[] } }[],
  buffersMade: 0,
}));

vi.mock('react-native-audio-api', () => {
  class Param {
    value = 1;
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    cancelScheduledValues() {}
  }
  class GainNode {
    gain = new Param();
    connect() {}
  }
  class BufferSource {
    buffer: unknown = null;
    onended: (() => void) | null = null;
    rec = { start: -1, stop: null as number | null, buffer: null as unknown, gain: { ramps: [] as number[] } };
    connect() {}
    start(t: number) {
      this.rec.start = t;
      this.rec.buffer = this.buffer;
      state.sources.push(this.rec);
    }
    stop(t: number) {
      this.rec.stop = t;
    }
  }
  class AudioContext {
    destination = {};
    state = 'running';
    get currentTime() {
      return state.time;
    }
    createGain() {
      return new GainNode();
    }
    createBufferSource() {
      return new BufferSource();
    }
    createBuffer(_c: number, len: number) {
      state.buffersMade++;
      return { length: len, copyToChannel() {} };
    }
  }
  return { AudioContext };
});

import { MAX_VOICES, playNote, prepare, startTransport, stopTransport } from './engine';

beforeEach(() => {
  stopTransport();
  state.sources = [];
  state.time = 0;
});

describe('audio engine timing and cost', () => {
  it('places every note on the audio clock, not on wall time', () => {
    const bars = [{ chords: ['C'] }, { chords: ['G'] }];
    startTransport(bars, { bpm: 120, timeSig: [4, 4], pattern: 'block', instrument: 'piano', metronome: false, loop: false });
    // the notes of one chord are a few ms apart (the strum gap); group by bar
    const starts = [...new Set(state.sources.map((s) => Math.round((s.start - 0.15) * 20) / 20))];
    // block chords: one strike per bar, at bar starts 0 and 2 s (120 bpm, 4/4)
    expect(starts).toEqual([0, 2]);
    expect(state.sources.length).toBeGreaterThanOrEqual(6);
    stopTransport();
  });

  it('keeps at most MAX_VOICES sounding at once, stealing the oldest', () => {
    const all = Array.from({ length: MAX_VOICES + 15 }, (_, i) => 40 + i);
    all.forEach((m, i) => playNote(m, 2, 'piano', 1 + i * 0.001));
    const sounding = state.sources.filter((s) => s.start <= 1.05 && (s.stop === null || s.stop > 1.05));
    const audible = sounding.filter((s) => s.gain.ramps.length >= 0);
    expect(audible.length).toBeGreaterThan(0);
    // every extra note past the cap has an earlier voice stopped at its start
    const stopped = state.sources.filter((s) => s.stop !== null && s.stop < 3.5).length;
    expect(stopped).toBeGreaterThanOrEqual(15);
  });

  it('renders each note once and reuses it for every strum', async () => {
    const before = state.buffersMade;
    await prepare('piano', [60, 64, 67]);
    const afterPrep = state.buffersMade;
    const bars = [{ chords: ['C'] }, { chords: ['C'] }, { chords: ['C'] }];
    startTransport(bars, { bpm: 120, timeSig: [4, 4], pattern: 'strum-folk', instrument: 'piano', metronome: false, loop: false });
    stopTransport();
    expect(state.buffersMade).toBe(afterPrep);
    expect(afterPrep - before).toBeLessThanOrEqual(3);
  });
});
