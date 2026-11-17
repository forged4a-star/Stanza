import { describe, expect, it } from 'vitest';
import { chordsToBars, chordTimeline } from './chart';

const SR = 22050;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** audio of chords played in turn: each is [midi notes, seconds]; null notes = silence. Harmonics make it sound like a real instrument. */
function play(chords: [number[] | null, number][]): Float32Array {
  const total = chords.reduce((n, [, s]) => n + s, 0);
  const x = new Float32Array(Math.round(total * SR));
  let at = 0;
  for (const [notes, sec] of chords) {
    const n = Math.round(sec * SR);
    if (notes) {
      for (const m of notes) {
        const f = hz(m);
        for (const [h, amp] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]] as [number, number][]) {
          const w = (2 * Math.PI * f * h) / SR;
          for (let i = 0; i < n; i++) x[at + i] += (amp * 0.12 * Math.sin(w * i)) * (1 - Math.exp(-i / 200)); // soft attack
        }
      }
    }
    at += n;
  }
  return x;
}

// open-position voicings, bass note first
const C = [48, 52, 55, 60, 64];
const Am = [45, 52, 57, 60, 64];
const F = [41, 48, 53, 57, 60];
const G = [43, 50, 55, 59, 62];
const Em = [40, 47, 52, 55, 59];
const G7 = [43, 47, 50, 53, 59];

describe('chord timeline', () => {
  it('finds C, Am, F, G played two seconds each', () => {
    const r = chordTimeline(play([[C, 2], [Am, 2], [F, 2], [G, 2]]), SR);
    expect(r.segments.map((s) => s.chord)).toEqual(['C', 'Am', 'F', 'G']);
    expect(r.segments[1].start).toBeGreaterThan(1.5);
    expect(r.segments[1].start).toBeLessThan(2.5);
    expect(r.seconds).toBeCloseTo(8, 1);
  });
  it('tells minor from major and names a dominant seventh', () => {
    const r = chordTimeline(play([[Em, 2.5], [G7, 2.5]]), SR);
    expect(r.segments.map((s) => s.chord)).toEqual(['Em', 'G7']);
  });
  it('leaves a silent gap out and starts at the first chord', () => {
    const r = chordTimeline(play([[null, 1.5], [C, 2], [G, 2]]), SR);
    expect(r.segments.map((s) => s.chord)).toEqual(['C', 'G']);
    expect(r.segments[0].start).toBeGreaterThan(1);
  });
  it('does not flicker: a chord held for a long time is one segment', () => {
    const r = chordTimeline(play([[C, 6]]), SR);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].chord).toBe('C');
  });
  it('returns nothing for silence, and copes with a very short clip', () => {
    expect(chordTimeline(new Float32Array(SR * 3), SR).segments).toEqual([]);
    expect(chordTimeline(new Float32Array(100), SR).segments).toEqual([]);
  });
  it('guesses the key from the chords', () => {
    const r = chordTimeline(play([[C, 2], [Am, 2], [F, 2], [G, 2]]), SR);
    expect(r.key).toMatch(/^C major|A minor/);
  });
});

describe('chords to bars', () => {
  const segs = [
    { start: 0, end: 2, chord: 'C' },
    { start: 2, end: 4, chord: 'Am' },
    { start: 4, end: 6, chord: 'F' },
    { start: 6, end: 8, chord: 'G' },
  ];
  it('one chord per bar at 120 bpm (a bar is two seconds)', () => {
    expect(chordsToBars(segs, { bpm: 120 })).toEqual([{ chords: ['C'] }, { chords: ['Am'] }, { chords: ['F'] }, { chords: ['G'] }]);
  });
  it('two chords per bar when the changes come every half bar', () => {
    expect(chordsToBars(segs, { bpm: 60 }).map((b) => b.chords)).toEqual([['C', 'Am'], ['F', 'G']]);
  });
  it('starts the first bar at the first chord, even after a quiet intro', () => {
    const late = segs.map((s) => ({ ...s, start: s.start + 3, end: s.end + 3 }));
    expect(chordsToBars(late, { bpm: 120 }).map((b) => b.chords[0])).toEqual(['C', 'Am', 'F', 'G']);
    expect(chordsToBars(late, { bpm: 120, offset: 3 }).length).toBe(4);
  });
  it('waltz time', () => {
    const w = [{ start: 0, end: 1.5, chord: 'G' }, { start: 1.5, end: 3, chord: 'D' }];
    expect(chordsToBars(w, { bpm: 120, beatsPerBar: 3 }).map((b) => b.chords)).toEqual([['G'], ['D']]);
  });
  it('is empty with no chords or a bad tempo', () => {
    expect(chordsToBars([], { bpm: 120 })).toEqual([]);
    expect(chordsToBars(segs, { bpm: 0 })).toEqual([]);
  });
});

describe('chunked analysis', () => {
  it('gives exactly the same chart as the one-shot version, and reports progress', async () => {
    const { chordTimelineAsync } = await import('./chart');
    const audio = play([[C, 2], [Am, 2], [F, 2], [G, 2]]);
    const seen: number[] = [];
    const a = await chordTimelineAsync(audio, SR, {}, (f) => seen.push(f));
    expect(a).toEqual(chordTimeline(audio, SR));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1])).toBe(true);
  });
});
