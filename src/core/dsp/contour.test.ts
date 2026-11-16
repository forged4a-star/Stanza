import { describe, expect, it } from 'vitest';
import { contourOf, wordMoves } from './contour';

const SR = 22050;
/** a sine that holds `segments` of [seconds, hz] in turn (hz = 0 is silence) */
function tone(segments: [number, number][], glideTo?: number): Float32Array {
  const total = segments.reduce((n, [s]) => n + s, 0);
  const x = new Float32Array(Math.round(total * SR));
  let at = 0;
  let phase = 0;
  for (const [sec, hz] of segments) {
    const n = Math.round(sec * SR);
    for (let i = 0; i < n; i++) {
      const f = hz && glideTo ? hz + ((glideTo - hz) * i) / n : hz;
      phase += (2 * Math.PI * f) / SR;
      x[at + i] = hz ? 0.5 * Math.sin(phase) : 0;
    }
    at += n;
  }
  return x;
}

describe('take contour', () => {
  it('reads two held notes as two levels (A3 then E4)', () => {
    const c = contourOf(tone([[1, 220], [1, 330]]), SR, 40)!;
    const first = c.bins.slice(2, 16).filter((v): v is number => v !== null);
    const last = c.bins.slice(24, 38).filter((v): v is number => v !== null);
    expect(first.reduce((a, b) => a + b) / first.length).toBeCloseTo(57, 0);
    expect(last.reduce((a, b) => a + b) / last.length).toBeCloseTo(64, 0);
  });
  it('trims silence before and after the singing', () => {
    const c = contourOf(tone([[0.8, 0], [1, 220], [0.8, 0]]), SR, 30)!;
    expect(c.startMs).toBeGreaterThan(600);
    expect(c.endMs).toBeLessThan(2000);
    expect(c.bins.filter((b) => b !== null).length).toBeGreaterThan(24);
  });
  it('is null for silence or noise-free emptiness', () => {
    expect(contourOf(new Float32Array(SR), SR)).toBeNull();
  });
  it('assigns words their stretch: low word then high word', () => {
    const c = contourOf(tone([[1, 220], [1, 330]]), SR, 40)!;
    const w = wordMoves(c, 'hello there');
    expect(w.map((x) => x.word)).toEqual(['hello', 'there']);
    expect(w[0].level).toBe('low');
    expect(w[1].level).toBe('high');
    expect(w[0].mean!).toBeLessThan(w[1].mean!);
  });
  it('says a word rises when the pitch climbs across it', () => {
    const c = contourOf(tone([[2, 200]], 400), SR, 40)!;
    const [only] = wordMoves(c, 'sunrise');
    expect(only.move).toBe('rises');
    const flat = wordMoves(contourOf(tone([[2, 250]]), SR, 40)!, 'steady')[0];
    expect(flat.move).toBe('holds');
  });
  it('lines with no words give no moves', () => {
    expect(wordMoves(contourOf(tone([[1, 220]]), SR, 20)!, '')).toEqual([]);
  });
});
