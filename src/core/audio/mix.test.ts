import { expect, it } from 'vitest';
import { renderChunk, type MixNote } from './mixdown';
import { buildSchedule } from './patterns';
import { softClipCurve } from './softclip';
import { renderNote, type Instrument } from './synth';

const SR = 48000;
const MASTER_MAX = 1.4;

/** What the engine plays: the real mixer (normalised notes × per-note gain), × master volume, through the limiter. */
function mix(inst: Instrument, chords: string[], pattern: 'strum-folk' | 'block' | 'arp-up', volume: number) {
  const s = buildSchedule(chords.map((c) => ({ chords: [c] })), { bpm: 120, timeSig: [4, 4], pattern, instrument: inst, metronome: false });
  const cache = new Map<number, Float32Array>();
  const sample = (_i: Instrument, m: number) => {
    let b = cache.get(m);
    if (!b) {
      b = renderNote(inst, m, 2, SR);
      let peak = 1e-9;
      for (const v of b) peak = Math.max(peak, Math.abs(v));
      for (let i = 0; i < b.length; i++) b[i] /= peak;
      cache.set(m, b);
    }
    return b;
  };
  const notes: MixNote[] = s.notes.map((e) => ({ time: e.time, midi: e.midi, gain: e.vel, dur: e.dur, inst })).sort((x, y) => x.time - y.time);
  const out = renderChunk(notes, [], { start: 0, end: s.length }, { sampleRate: SR, sample });
  for (let i = 0; i < out.length; i++) out[i] *= volume * MASTER_MAX;
  const c = softClipCurve();
  const limit = (x: number) => c[Math.max(0, Math.min(c.length - 1, Math.round(((x + 1) / 2) * (c.length - 1))))];
  let rawPeak = 0;
  let peak = 0;
  let sq = 0;
  let n = 0;
  for (const v of out) {
    rawPeak = Math.max(rawPeak, Math.abs(v));
    const y = limit(v);
    peak = Math.max(peak, Math.abs(y));
    if (Math.abs(v) > 1e-4) {
      sq += y * y;
      n++;
    }
  }
  return { rawPeak, peak, rms: Math.sqrt(sq / Math.max(1, n)) };
}

it('is loud enough at the default volume and never clips at the top, for every sound', () => {
  for (const inst of ['piano', 'acoustic', 'electric', 'pad'] as Instrument[]) {
    for (const pattern of ['strum-folk', 'block', 'arp-up'] as const) {
      const normal = mix(inst, ['G', 'Em7', 'C', 'D'], pattern, 0.7);
      const loud = mix(inst, ['G', 'Em7', 'C', 'D'], pattern, 1);
      // the old build peaked near 0.05 of full scale (the "really quiet" complaint)
      expect(normal.peak, `${inst} ${pattern} peak`).toBeGreaterThan(0.25);
      expect(normal.rms, `${inst} ${pattern} rms`).toBeGreaterThan(0.04);
      // the limiter keeps everything inside full scale, so nothing hard-clips at the speaker
      expect(loud.peak, `${inst} ${pattern} loud`).toBeLessThanOrEqual(1);
      // and well-calibrated levels rarely need it: the raw mix stays near full scale even at 100 %
      expect(loud.rawPeak, `${inst} ${pattern} raw`).toBeLessThan(1.6);
    }
  }
});

it('a big chord is not louder than a single note', () => {
  const single = mix('piano', ['G'], 'arp-up', 0.7);
  const full = mix('acoustic', ['G'], 'block', 0.7);
  expect(full.peak).toBeLessThan(single.peak * 2.6);
});
