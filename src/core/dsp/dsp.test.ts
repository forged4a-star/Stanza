import { describe, expect, it } from 'vitest';
import { midiToFreq } from '../music/theory';
import { analyzeTake, detectKey, detectTempo, keyFromChroma } from './analyze';
import { pitchTrack, segmentNotes, yin } from './pitch';

const SR = 22050;

function tone(freqs: number[], dur: number, sr = SR, amp = 0.3): Float32Array {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  for (const f of freqs) for (let h = 1; h <= 4; h++) for (let i = 0; i < n; i++) out[i] += (amp / h / freqs.length) * Math.sin((2 * Math.PI * f * h * i) / sr);
  // short fade to avoid clicks
  for (let i = 0; i < Math.min(200, n); i++) {
    out[i] *= i / 200;
    out[n - 1 - i] *= i / 200;
  }
  return out;
}

const concat = (parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

function noise(n: number, amp: number, seed = 1) {
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    out[i] = ((s / 2147483647) * 2 - 1) * amp;
  }
  return out;
}

describe('pitch', () => {
  it('YIN finds the fundamental of a harmonic tone', () => {
    for (const f of [98, 220, 440, 659.3]) {
      const [est] = yin(tone([f], 0.1).subarray(0, 2048), SR);
      expect(Math.abs(est - f) / f).toBeLessThan(0.01);
    }
  });
  it('segments a sung line into notes', () => {
    const melody = [60, 62, 64, 64, 67];
    const sig = concat(melody.flatMap((m) => [tone([midiToFreq(m)], 0.35), new Float32Array(Math.floor(SR * 0.05))]));
    const notes = segmentNotes(pitchTrack(sig, SR));
    expect(notes.map((n) => n.pitch)).toEqual(melody);
    expect(notes[0].duration).toBeGreaterThan(0.25);
  });
});

describe('tempo', () => {
  for (const bpm of [72, 100, 128]) {
    it(`detects ${bpm} bpm from a click/strum pattern`, () => {
      const beat = 60 / bpm;
      const n = Math.floor(SR * 12);
      const x = noise(n, 0.005);
      for (let t = 0.2; t < 12; t += beat) {
        const hit = tone([196, 247, 294], 0.12);
        const off = Math.floor(t * SR);
        for (let i = 0; i < hit.length && off + i < n; i++) x[off + i] += hit[i] * (Math.round((t - 0.2) / beat) % 4 === 0 ? 1.4 : 1);
      }
      const r = detectTempo(x, SR)!;
      expect(Math.abs(r.bpm - bpm)).toBeLessThan(2);
    });
  }
});

describe('key', () => {
  it('profiles: a C major scale histogram reads as C major', () => {
    expect(keyFromChroma([5, 0, 3, 0, 4, 3, 0, 5, 0, 3, 0, 2])!.name).toBe('C major');
  });
  it('detects key from a chord progression', () => {
    const chord = (ms: number[], d = 1) => tone(ms.map(midiToFreq), d);
    // G major: G C D G Em C D G
    const prog = concat([[55, 59, 62], [48, 52, 55], [50, 54, 57], [55, 59, 62], [52, 55, 59], [48, 52, 55], [50, 54, 57], [55, 59, 62, 67]].map((c) => chord(c)));
    expect(detectKey(prog, SR)!.name).toBe('G major');
    // A minor: Am Dm E Am
    const minor = concat([[57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64], [57, 60, 64]].map((c) => chord(c, 1.2)));
    expect(detectKey(minor, SR)!.name).toBe('A minor');
  });
  it('analyzeTake returns bpm, key, duration and waveform', () => {
    const sig = concat([60, 64, 67, 72, 67, 64, 60, 60].map((m) => tone([midiToFreq(m)], 0.5)));
    const r = analyzeTake(sig, SR);
    expect(r.durationMs).toBe(4000);
    expect(r.waveform).toHaveLength(64);
    expect(r.key).toBe('C major');
  });
});
