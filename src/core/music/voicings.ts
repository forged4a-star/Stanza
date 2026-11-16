/**
 * Chord diagrams. Guitar shapes are searched (standard tuning, any capo) and
 * scored for playability; piano voicings are the chord tones in close position.
 */
import { libraryShapes } from './shapeLibrary';
import { chordPcs, mod12, parseChord, type Chord } from './theory';

/** Standard tuning, low E to high E, as MIDI notes. */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];

export interface GuitarShape {
  /** fret per string, low E first; -1 = muted, 0 = open (relative to the capo) */
  frets: number[];
  /** lowest fretted position shown in the diagram (1 = nut) */
  baseFret: number;
  /** barre across strings at this fret, if any */
  barre: { fret: number; from: number; to: number } | null;
  score: number;
  /** where the shape comes from: a standard textbook shape, or found by search */
  source?: 'standard' | 'search';
  label?: string;
}

/**
 * Find the best few playable shapes for a chord. Searches every 4-fret window
 * up to the 12th fret and every string combination, then scores: covers all
 * important tones, correct bass, open strings, low position, few fingers.
 */
export function guitarShapes(name: string, opts: { capo?: number; max?: number; alsoSearch?: boolean } = {}): GuitarShape[] {
  const chord = parseChord(name);
  if (!chord) return [];
  const capo = opts.capo ?? 0;
  // standard textbook shapes first (relative to the capo, so shift the chord down by it)
  const standard: GuitarShape[] = libraryShapes(mod12(chord.root - capo), chord.quality.suffix, mod12((chord.bass ?? chord.root) - capo)).map((l) => {
    const fretted = l.frets.filter((x) => x > 0);
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    return { frets: l.frets, baseFret: maxF <= 4 ? 1 : minF, barre: l.barre, score: 100 - l.rank, source: 'standard', label: l.label };
  });
  if (standard.length >= (opts.max ?? 4) && !opts.alsoSearch) return standard.slice(0, opts.max ?? 4);
  const tuning = GUITAR_TUNING.map((n) => n + capo);
  const pcs = chordPcs(chord);
  const bass = chord.bass ?? chord.root;
  // tones we can drop on big chords: the fifth, then (for 11ths/13ths) the 9th
  const essential = essentialTones(chord);
  const shapes: GuitarShape[] = [];
  const seen = new Set<string>();

  for (let lo = 0; lo <= 10; lo++) {
    const hi = lo === 0 ? 3 : lo + 3;
    // options per string: muted, or any fret in [lo, hi] (plus open) giving a chord tone
    const options: number[][] = tuning.map((open) => {
      const o = [-1];
      if (mod12(open) !== -1 && pcs.includes(mod12(open))) o.push(0);
      for (let f = Math.max(1, lo); f <= hi; f++) if (pcs.includes(mod12(open + f))) o.push(f);
      return o;
    });
    const frets = new Array<number>(6).fill(-1);
    const walk = (s: number) => {
      if (s === 6) {
        const shape = evaluate(frets, tuning, bass, essential, pcs);
        if (shape) {
          const key = shape.frets.join(',');
          if (!seen.has(key)) {
            seen.add(key);
            shapes.push(shape);
          }
        }
        return;
      }
      for (const f of options[s]) {
        frets[s] = f;
        walk(s + 1);
      }
    };
    walk(0);
  }
  shapes.sort((a, b) => b.score - a.score);
  const known = new Set(standard.map((x) => x.frets.join(',')));
  const merged = [...standard, ...shapes.filter((x) => !known.has(x.frets.join(',')))];
  return merged.slice(0, opts.max ?? 4);
}

function essentialTones(c: Chord): number[] {
  const ivs = c.quality.intervals;
  const pcs = ivs.map((i) => mod12(c.root + i));
  // drop the fifth when there are 4+ tones (unless it's altered: dim/aug)
  let out = pcs.filter((p, i) => !(ivs.length >= 4 && ivs[i] === 7));
  // drop the 9th from 11th/13th chords
  if (ivs.length >= 6) out = out.filter((p, i) => ivs[i] !== 14);
  if (c.bass !== null && !out.includes(c.bass)) out.push(c.bass);
  return [...new Set(out)];
}

function evaluate(frets: number[], tuning: number[], bass: number, essential: number[], pcs: number[]): GuitarShape | null {
  const played = frets.map((f, i) => (f < 0 ? null : tuning[i] + f));
  const sounding = played.filter((n): n is number => n !== null);
  if (sounding.length < 3) return null;
  // muted strings only at the low end, like real hands
  const firstPlayed = frets.findIndex((f) => f >= 0);
  const innerMutes = frets.slice(firstPlayed).filter((f) => f < 0).length;
  if (innerMutes > 0) return null;
  // bass note must be the lowest sounding note
  if (mod12(sounding[0]) !== bass) return null;
  const have = new Set(sounding.map(mod12));
  for (const e of essential) if (!have.has(e)) return null;
  const fretted = frets.filter((f) => f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > 3) return null;
  // fingers: a barre at the lowest fret covers all strings at that fret from the first to the last
  const atMin = frets.map((f, i) => (f === minF ? i : -1)).filter((i) => i >= 0);
  let barre: GuitarShape['barre'] = null;
  let fingers = fretted.length;
  if (minF > 0 && (atMin.length >= 3 || (atMin.length >= 2 && fretted.length > 4))) {
    const from = atMin[0];
    const to = atMin[atMin.length - 1];
    // a barre can't pass over an open string
    const openInside = frets.slice(from, to + 1).some((f) => f === 0);
    if (!openInside && frets.slice(from, to + 1).every((f) => f >= minF || f < 0)) {
      barre = { fret: minF, from, to };
      fingers = 1 + fretted.filter((f) => f > minF).length;
    }
  }
  if (fingers > 4) return null;
  const opens = frets.filter((f) => f === 0).length;
  const doubledTones = sounding.length - have.size;
  const span = fretted.length ? maxF - minF : 0;
  // open strings help in open position; higher up, mixing them in is awkward
  const openPos = maxF <= 3;
  const innerOpens = frets.slice(firstPlayed).filter((f, i, arr) => f === 0 && arr.slice(0, i).some((x) => x > 0) && arr.slice(i + 1).some((x) => x > 0)).length;
  let score = sounding.length * 2 + (openPos ? opens * 2.5 : 0) - (openPos ? 0 : innerOpens * 2) - minF * 1.2 - fingers * 0.8 - (barre ? 1.5 : 0) - Math.max(0, doubledTones - 2) - span * 0.7;
  // full voicings preferred: all tones present including optional ones
  score += [...pcs].filter((p) => have.has(p)).length * 0.5;
  // mutes on the top string sound thin
  if (frets[5] < 0) score -= 3;
  return { frets: [...frets], baseFret: maxF <= 4 ? 1 : minF, barre, score, source: 'search' };
}

/** Piano: chord tones as MIDI notes in close position from around middle C (bass separate). */
export function pianoVoicing(name: string): { bass: number; notes: number[] } | null {
  const c = parseChord(name);
  if (!c) return null;
  const notes: number[] = [];
  let base = 60 + mod12(c.root);
  if (base > 66) base -= 12;
  for (const iv of c.quality.intervals) notes.push(base + (iv >= 12 ? iv - 12 : iv) + (iv >= 12 ? 12 : 0));
  return { bass: 48 + mod12(c.bass ?? c.root) - (mod12(c.bass ?? c.root) > 7 ? 12 : 0), notes: [...new Set(notes)].sort((a, b) => a - b) };
}
