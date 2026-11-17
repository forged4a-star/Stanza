/**
 * Harmonize my melody: for each bar (or half bar) pick the chord that best
 * supports the notes, then choose the path through the song that sounds most
 * natural (common chord moves, a tonic at the start, a resting place at the
 * end). Three styles give three different answers to the same tune.
 */
import { metricWeight } from '../lyrics/checks';
import type { ChordBar, Note } from '../model';
import { keyFromChroma } from '../dsp/analyze';
import { stepsPerBar } from './melody';
import { MAJOR_T, MINOR_T } from './suggest';
import { chordPcs, diatonicChords, keyPrefersFlats, mod12, noteName, parseChord, scalePcs, type Key } from './theory';

export type HarmonyStyle = 'simple' | 'colour' | 'moody';

export interface HarmonyOption {
  style: HarmonyStyle;
  label: string;
  blurb: string;
  bars: ChordBar[];
  /** share of the melody (weighted by length and beat strength) that sits on chord tones, 0..1 */
  fit: number;
  /** the full path score, for ranking */
  score: number;
}

export interface HarmonizeOptions {
  key: Key | null;
  timeSig: [number, number];
  /** 1 = one chord per bar, 2 = a chord every half bar */
  chordsPerBar?: 1 | 2;
  /** number of bars to harmonize; defaults to the length of the melody */
  bars?: number;
}

const STYLES: { style: HarmonyStyle; label: string; blurb: string }[] = [
  { style: 'simple', label: 'Simple', blurb: 'Plain chords from the key. Easy to play and sing over.' },
  { style: 'colour', label: 'Colourful', blurb: 'Sevenths and suspended chords for a richer sound.' },
  { style: 'moody', label: 'Moody', blurb: 'Borrowed and leaning chords for tension and drama.' },
];

/** The key of a melody, from how long each note lasts. Falls back to C major. */
export function guessKey(melody: Note[]): Key {
  const chroma = new Array<number>(12).fill(0);
  for (const n of melody) chroma[mod12(n.pitch)] += n.length;
  const k = keyFromChroma(chroma);
  return k ? k.key : { tonic: 0, mode: 'major' };
}

interface Candidate {
  name: string;
  pcs: Set<number>;
  root: number;
  /** index of the root in the key's scale, or -1 for a chord from outside the key */
  degree: number;
  /** from outside the key (borrowed or a secondary dominant) */
  foreign: boolean;
}

function candidates(key: Key, style: HarmonyStyle): Candidate[] {
  const flats = keyPrefersFlats(key);
  const scale = scalePcs(key);
  const names = new Set<string>(diatonicChords(key));
  const t = key.tonic;
  const add = (pc: number, suffix: string) => names.add(noteName(mod12(pc), flats) + suffix);
  if (style !== 'simple') {
    diatonicChords(key, true).forEach((n) => names.add(n));
    for (const d of [0, 3, 4]) {
      add(scale[d], 'sus4');
      add(scale[d], 'sus2');
    }
    add(scale[0], 'add9');
    add(scale[3], 'add9');
  }
  if (style === 'moody') {
    if (key.mode === 'major') {
      add(t + 5, 'm'); // iv
      add(t + 10, ''); // bVII
      add(t + 8, ''); // bVI
      add(t + 3, ''); // bIII
      add(t + 2, '7'); // V/V
      add(t + 4, '7'); // V/vi
    } else {
      add(t + 5, ''); // IV (lifted)
      add(t + 7, ''); // V (from harmonic minor)
      add(t + 7, '7');
    }
  }
  const out: Candidate[] = [];
  for (const name of names) {
    const c = parseChord(name);
    if (!c) continue;
    const degree = scale.indexOf(c.root);
    const inKey = chordPcs(c).every((pc) => scale.includes(pc));
    out.push({ name, pcs: new Set(chordPcs(c)), root: c.root, degree, foreign: !inKey });
  }
  return out;
}

interface Emission {
  score: number;
  weight: number;
  onTone: number;
}

function emission(notes: Note[], cand: Candidate, scale: number[], s0: number, s1: number, timeSig: [number, number]): Emission {
  let score = 0;
  let weight = 0;
  let onTone = 0;
  for (const n of notes) {
    const a = Math.max(n.start, s0);
    const b = Math.min(n.start + n.length, s1);
    if (b <= a) continue;
    const strong = metricWeight(a, timeSig);
    const w = (b - a) * (0.6 + 0.8 * strong);
    const pc = mod12(n.pitch);
    let s: number;
    if (cand.pcs.has(pc)) {
      s = pc === cand.root ? 1.05 : 1;
      onTone += w;
    } else if (scale.includes(pc)) s = strong >= 0.5 ? -0.3 : 0.2; // a passing note is fine off the beat
    else s = -0.8;
    score += w * s;
    weight += w;
  }
  return { score: weight ? score / weight : 0, weight, onTone };
}

const SLOT_GAIN = 4;

function bestPath(notes: Note[], key: Key, style: HarmonyStyle, slots: { s0: number; s1: number }[], timeSig: [number, number]): { names: string[]; score: number; fit: number } | null {
  const cands = candidates(key, style);
  const scale = scalePcs(key);
  const T = key.mode === 'major' ? MAJOR_T : MINOR_T;
  const trans = (p: Candidate, c: Candidate) => {
    let w = p.name === c.name ? 0.05 : p.degree >= 0 && c.degree >= 0 ? T[p.degree][c.degree] : 0.08;
    // sevenths and sus chords belong to the same function as their triad
    return (style === 'simple' ? 2.8 : style === 'colour' ? 2.4 : 2) * w;
  };
  const emis = slots.map((sl) => cands.map((c) => emission(notes, c, scale, sl.s0, sl.s1, timeSig)));
  const tonicBonus = (c: Candidate, first: boolean, last: boolean) => {
    let b = 0;
    const isTonic = c.degree === 0 && !c.foreign;
    if (first && isTonic) b += 0.6;
    if (last && isTonic) b += 1.0;
    if (last && c.degree === 4 && !c.foreign) b += 0.3;
    return b;
  };
  // richer styles lean toward richer chords whenever they fit the melody as well as a plain one
  const flavour = (c: Candidate) => {
    let b = style === 'moody' && c.foreign ? 0.35 : 0;
    if (style !== 'simple' && /(maj7|m7|7|sus4|sus2|add9)$/.test(c.name)) b += 0.25;
    return b;
  };
  const n = slots.length;
  let score = cands.map((c, i) => emis[0][i].score * SLOT_GAIN + tonicBonus(c, true, n === 1) + flavour(c));
  const back: number[][] = [];
  for (let t = 1; t < n; t++) {
    const next: number[] = [];
    const from: number[] = [];
    cands.forEach((c, i) => {
      let best = -Infinity;
      let arg = 0;
      cands.forEach((p, j) => {
        const v = score[j] + trans(p, c);
        if (v > best) (best = v), (arg = j);
      });
      next.push(best + emis[t][i].score * SLOT_GAIN + tonicBonus(c, false, t === n - 1) + flavour(c));
      from.push(arg);
    });
    score = next;
    back.push(from);
  }
  let end = 0;
  score.forEach((v, i) => v > score[end] && (end = i));
  const path = new Array<number>(n);
  path[n - 1] = end;
  for (let t = n - 1; t > 0; t--) path[t - 1] = back[t - 1][path[t]];
  let on = 0;
  let total = 0;
  path.forEach((ci, t) => {
    on += emis[t][ci].onTone;
    total += emis[t][ci].weight;
  });
  return { names: path.map((ci) => cands[ci].name), score: score[end], fit: total ? on / total : 1 };
}

/** Up to three different ways to put chords under a melody, best style first for this tune. */
export function harmonize(melody: Note[], opts: HarmonizeOptions): HarmonyOption[] {
  const notes = melody.filter((n) => n.length > 0);
  if (!notes.length) return [];
  const per = stepsPerBar(opts.timeSig);
  const end = Math.max(...notes.map((n) => n.start + n.length));
  const bars = Math.max(1, opts.bars ?? Math.ceil(end / per));
  const cpb = opts.chordsPerBar ?? 1;
  const key = opts.key ?? guessKey(notes);
  const size = per / cpb;
  const slots = Array.from({ length: bars * cpb }, (_, i) => ({ s0: i * size, s1: (i + 1) * size }));
  const seen = new Set<string>();
  const out: HarmonyOption[] = [];
  for (const st of STYLES) {
    const r = bestPath(notes, key, st.style, slots, opts.timeSig);
    if (!r) continue;
    const chordBars: ChordBar[] = Array.from({ length: bars }, (_, b) => {
      const names = r.names.slice(b * cpb, b * cpb + cpb);
      // a bar that holds one chord twice is just that chord
      return { chords: names.every((x) => x === names[0]) ? [names[0]] : names };
    });
    const sig = chordBars.map((b) => b.chords.join('/')).join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ style: st.style, label: st.label, blurb: st.blurb, bars: chordBars, fit: r.fit, score: r.score });
  }
  return out;
}
