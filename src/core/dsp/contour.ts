/**
 * Pitch contour of a take, and where the melody moves against the words of a
 * line. The take is trimmed to the sung part and the line's syllables are laid
 * along it evenly, so each word gets a stretch of the curve.
 */
import { analyzeLine } from '../phonetics/line';
import { freqToMidi } from '../music/theory';
import { pitchTrack } from './pitch';

export interface Contour {
  /** MIDI pitch per equal slice of the sung part; null where nothing was sung */
  bins: (number | null)[];
  /** length of the whole recording in ms and the sung part's start/end in ms */
  lengthMs: number;
  startMs: number;
  endMs: number;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
};

export function contourOf(samples: Float32Array, sampleRate: number, bins = 120): Contour | null {
  const track = pitchTrack(samples, sampleRate, { frame: sampleRate > 30000 ? 2048 : 1024, hop: 512, minHz: 70, maxHz: 1000 });
  const voiced = track.filter((f) => f.freq > 0);
  if (voiced.length < 4) return null;
  const t0 = voiced[0].time;
  const t1 = voiced[voiced.length - 1].time;
  const span = Math.max(1e-6, t1 - t0);
  const per: number[][] = Array.from({ length: bins }, () => []);
  for (const f of voiced) per[Math.min(bins - 1, Math.floor(((f.time - t0) / span) * bins))].push(freqToMidi(f.freq));
  let prev: number | null = null;
  const out = per.map((p) => {
    if (!p.length) return null;
    let m = median(p);
    // an octave slip is far more likely than a real leap of 9+ semitones
    if (prev !== null) while (m - prev > 9) m -= 12;
    if (prev !== null) while (prev - m > 9) m += 12;
    prev = m;
    return m;
  });
  return { bins: out, lengthMs: Math.round((samples.length / sampleRate) * 1000), startMs: Math.round(t0 * 1000), endMs: Math.round(t1 * 1000) };
}

export interface WordMove {
  word: string;
  /** bin range [from, to) this word occupies */
  from: number;
  to: number;
  /** average pitch of the word (MIDI), null if the word was not sung */
  mean: number | null;
  /** did the pitch rise or fall across the word */
  move: 'rises' | 'falls' | 'holds' | null;
  /** high, mid or low compared with the rest of the take */
  level: 'high' | 'mid' | 'low' | null;
}

const avg = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => n !== null);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};

/** Lay the line's syllables evenly along the sung part and read each word's stretch. */
export function wordMoves(c: Contour, text: string): WordMove[] {
  const info = analyzeLine(text);
  const n = info.syllables.length;
  if (!n) return [];
  const bins = c.bins.length;
  const mid = avg(c.bins);
  const voiced = c.bins.filter((b): b is number => b !== null);
  const spread = voiced.length ? Math.max(...voiced) - Math.min(...voiced) : 0;
  return info.words
    .filter((w) => w.sylCount > 0)
    .map((w) => {
      const from = Math.floor((w.firstSyl / n) * bins);
      const to = Math.max(from + 1, Math.floor(((w.firstSyl + w.sylCount) / n) * bins));
      const slice = c.bins.slice(from, to);
      const mean = avg(slice);
      const h = slice.length >> 1;
      const a = avg(slice.slice(0, Math.max(1, h)));
      const b = avg(slice.slice(Math.max(1, h)));
      const delta = a !== null && b !== null ? b - a : null;
      const move = delta === null ? null : delta > 1.2 ? 'rises' : delta < -1.2 ? 'falls' : 'holds';
      const rel = mean !== null && mid !== null ? mean - mid : null;
      const edge = Math.max(1.5, spread * 0.22);
      const level = rel === null ? null : rel > edge ? 'high' : rel < -edge ? 'low' : 'mid';
      return { word: w.text, from, to, mean, move, level };
    });
}
