/**
 * Least-effort fingering. Given a chord progression, pick one standard shape
 * per chord so the fretting hand moves as little as possible: fingers that can
 * stay put, stay put; slides are short; barres do not jump around the neck.
 */
import { guitarShapes, type GuitarShape } from './voicings';

export interface Movement {
  /** overall effort, 0 = identical shape */
  cost: number;
  /** fingers that stay on the same string and fret */
  stay: number;
  /** fingers that slide along a string to a new fret */
  slide: number;
  /** fingers that lift off or land on a string */
  lift: number;
  /** distance the hand has to travel up or down the neck */
  hand: number;
  barreChange: boolean;
}

const fretted = (s: GuitarShape) => s.frets.filter((x) => x > 0);
/** centre of the hand: the barre fret, or the middle of the fretted notes (open position = 1) */
export function handPosition(s: GuitarShape): number {
  if (s.barre) return s.barre.fret;
  const f = fretted(s);
  return f.length ? Math.max(1, Math.min(...f)) : 1;
}

export function movement(a: GuitarShape, b: GuitarShape): Movement {
  let stay = 0;
  let slide = 0;
  let lift = 0;
  let slideDist = 0;
  for (let i = 0; i < 6; i++) {
    const x = a.frets[i];
    const y = b.frets[i];
    if (x > 0 && y > 0) {
      if (x === y) stay++;
      else {
        slide++;
        slideDist += Math.abs(x - y);
      }
    } else if (x > 0 !== y > 0) lift++;
  }
  const hand = Math.abs(handPosition(a) - handPosition(b));
  const barreChange = !!a.barre !== !!b.barre || (!!a.barre && !!b.barre && (a.barre!.fret !== b.barre!.fret || a.barre!.from !== b.barre!.from));
  // a barre moving, or a barre being formed or released, is the expensive thing for a hand
  const cost = lift * 1 + slide * 0.8 + slideDist * 0.35 + hand * 1.2 + (barreChange ? 1.5 : 0) - Math.min(stay, 3) * 0.5;
  return { cost: Math.max(0, cost), stay, slide, lift, hand, barreChange };
}

export interface FingeringOptions {
  capo?: number;
  /** skip shapes that need a barre (beginner mode) */
  avoidBarres?: boolean;
  /** shapes to consider per chord */
  candidates?: number;
  /** treat the progression as repeating: also cost the last chord back to the first */
  loop?: boolean;
  /** how much to favour the most standard shape over an easier transition */
  standardWeight?: number;
}

export interface FingeringStep {
  chord: string;
  shape: GuitarShape;
  /** movement from the previous chord (null for the first, or the loop-back is on the last) */
  from: Movement | null;
}

/** Plain-words summary of a transition, for the app. */
export function describeMovement(m: Movement | null): string {
  if (!m) return '';
  if (m.cost === 0) return 'same shape';
  const bits: string[] = [];
  if (m.stay) bits.push(`${m.stay} finger${m.stay > 1 ? 's' : ''} stay`);
  const moving = m.slide + m.lift;
  if (moving) bits.push(`${moving} move${moving === 1 ? 's' : ''}`);
  if (m.hand >= 2) bits.push(`slide ${m.hand} frets`);
  return bits.join(' · ');
}

/** Shapes to choose between for one chord. */
export function candidateShapes(chord: string, opts: FingeringOptions = {}): GuitarShape[] {
  const max = opts.candidates ?? 6;
  let shapes = guitarShapes(chord, { capo: opts.capo, max, alsoSearch: false });
  // prefer standard shapes; only fall back to searched ones if there is nothing standard
  const standard = shapes.filter((s) => s.source === 'standard');
  if (standard.length) shapes = standard;
  if (opts.avoidBarres) {
    const easy = shapes.filter((s) => !s.barre);
    if (easy.length) shapes = easy;
  }
  return shapes;
}

/**
 * Dynamic programming over the progression: lowest total of
 * (shape unfamiliarity + movement between neighbours).
 */
export function easiestFingering(chords: string[], opts: FingeringOptions = {}): FingeringStep[] {
  if (!chords.length) return [];
  const w = opts.standardWeight ?? 0.6;
  const cands = chords.map((c) => candidateShapes(c, opts));
  if (cands.some((c) => !c.length)) {
    // chords with no shape at all: keep going with an empty placeholder-free path
    return chords.map((chord, i) => ({ chord, shape: cands[i][0], from: null })).filter((s) => s.shape);
  }
  const base = (s: GuitarShape, list: GuitarShape[]) => list.indexOf(s) * w;
  // best[i][j] = lowest cost of a path ending in candidate j for chord i
  const best: number[][] = [];
  const back: number[][] = [];
  best[0] = cands[0].map((s) => base(s, cands[0]));
  back[0] = cands[0].map(() => -1);
  for (let i = 1; i < chords.length; i++) {
    best[i] = [];
    back[i] = [];
    for (let j = 0; j < cands[i].length; j++) {
      let lo = Infinity;
      let arg = 0;
      for (let k = 0; k < cands[i - 1].length; k++) {
        const c = best[i - 1][k] + movement(cands[i - 1][k], cands[i][j]).cost;
        if (c < lo) (lo = c), (arg = k);
      }
      best[i][j] = lo + base(cands[i][j], cands[i]);
      back[i][j] = arg;
    }
  }
  // optionally close the loop: last chord back to the first costs too
  const last = chords.length - 1;
  let end = 0;
  let endCost = Infinity;
  for (let j = 0; j < cands[last].length; j++) {
    let c = best[last][j];
    if (opts.loop && chords.length > 1) {
      // approximate: add the cost back to the cheapest start shape
      c += Math.min(...cands[0].map((s) => movement(cands[last][j], s).cost));
    }
    if (c < endCost) (endCost = c), (end = j);
  }
  const picks = new Array<number>(chords.length);
  picks[last] = end;
  for (let i = last; i > 0; i--) picks[i - 1] = back[i][picks[i]];
  return chords.map((chord, i) => ({
    chord,
    shape: cands[i][picks[i]],
    from: i === 0 ? null : movement(cands[i - 1][picks[i - 1]], cands[i][picks[i]]),
  }));
}

/** Total effort of a path, for comparing against the plain "first shape for each chord" choice. */
export function pathCost(steps: GuitarShape[]): number {
  let c = 0;
  for (let i = 1; i < steps.length; i++) c += movement(steps[i - 1], steps[i]).cost;
  return c;
}

/** The default choice with no optimisation: the most standard shape for every chord. */
export function plainFingering(chords: string[], opts: FingeringOptions = {}): GuitarShape[] {
  return chords.map((c) => candidateShapes(c, opts)[0]).filter(Boolean);
}
