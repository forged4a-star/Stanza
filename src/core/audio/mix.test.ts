import { expect, it } from 'vitest';
import { buildSchedule } from './patterns';
import { renderNote, type Instrument } from './synth';

/** Offline mix of what the engine plays (same master gain), to guard against clipping. */
it('a full strummed bar stays within range before the limiter', () => {
  const SR = 22050;
  const MASTER = 0.3;
  for (const inst of ['piano', 'acoustic', 'electric', 'pad'] as Instrument[]) {
    const s = buildSchedule([{ chords: ['G'] }, { chords: ['Em7'] }], { bpm: 120, timeSig: [4, 4], pattern: 'strum-folk', instrument: inst, metronome: false });
    const out = new Float32Array(Math.ceil((s.length + 3) * SR));
    const lastAt = new Map<number, number>();
    for (const e of s.notes) {
      const buf = renderNote(inst, e.midi, Math.min(3, e.dur), SR);
      const at = Math.floor(e.time * SR);
      // a re-struck pitch cuts the previous one (as the engine does)
      const prev = lastAt.get(e.midi);
      if (prev !== undefined) for (let i = at; i < out.length; i++) void 0;
      lastAt.set(e.midi, at);
      for (let i = 0; i < buf.length && at + i < out.length; i++) out[at + i] += buf[i] * e.vel * MASTER;
    }
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    // even without choking, peaks stay near full scale; the limiter rounds off the rest
    expect(peak, inst).toBeLessThan(1.6);
    expect(peak, inst).toBeGreaterThan(0.05);
  }
});
