/**
 * The chord shapes guitarists actually learn: the open "CAGED" shapes plus the
 * movable E-form and A-form barre shapes, written out by hand. The search in
 * voicings.ts is only a fallback for chords that are not covered here.
 *
 * Frets are low E to high E. 'x' = muted, 0 = open.
 */
import { mod12, parseNote } from './theory';

export interface LibraryShape {
  frets: number[];
  /** lower = more standard; used to order shapes for the same chord */
  rank: number;
  barre: { fret: number; from: number; to: number } | null;
  label: string;
}

const f = (s: string): number[] => s.split('').map((c) => (c === 'x' ? -1 : c === 'a' ? 10 : c === 'b' ? 11 : Number(c)));

/** [chord symbol (root + suffix, optional /bass), frets, rank]. Frets 10 and 11 are a and b. */
const OPEN: [string, string, number][] = [
  // major
  ['C', 'x32010', 0], ['A', 'x02220', 0], ['G', '320003', 0], ['E', '022100', 0], ['D', 'xx0232', 0],
  ['G', '320033', 1], ['A', '577655', 9],
  // minor
  ['Am', 'x02210', 0], ['Em', '022000', 0], ['Dm', 'xx0231', 0],
  ['Bm', 'x24432', 1],
  // F: full barre comes from the movable E-form; this is the common four-string version
  ['F', 'xx3211', 4],
  // sevenths
  ['C7', 'x32310', 0], ['G7', '320001', 0], ['D7', 'xx0212', 0], ['A7', 'x02020', 0], ['E7', '020100', 0], ['B7', 'x21202', 0],
  ['Am7', 'x02010', 0], ['Em7', '022030', 1], ['Em7', '020000', 0], ['Dm7', 'xx0211', 0],
  ['Cmaj7', 'x32000', 0], ['Gmaj7', '320002', 0], ['Dmaj7', 'xx0222', 0], ['Amaj7', 'x02120', 0], ['Fmaj7', 'xx3210', 0], ['Emaj7', '021100', 0],
  // sus / add / 6
  ['Asus2', 'x02200', 0], ['Asus4', 'x02230', 0], ['Dsus2', 'xx0230', 0], ['Dsus4', 'xx0233', 0], ['Esus4', '022200', 0],
  ['Cadd9', 'x32030', 0], ['Gsus4', '330013', 1], ['A7sus4', 'x02030', 0], ['G6', '320000', 0], ['C6', 'x32210', 1],
  ['Dadd9', 'xx0230', 3],
  // dim / aug
  ['Bdim', 'x2343x', 0], ['Caug', 'x32110', 0],
  // slash chords people use constantly
  ['G/B', 'x20003', 0], ['D/F#', '200232', 0], ['C/G', '332010', 0], ['Am/G', '302210', 0], ['C/E', '032010', 0], ['Em/B', 'x22000', 0],
  ['D/A', 'x00232', 0], ['E/G#', '422100', 0], ['A/E', '002220', 0],
];

interface Movable {
  suffix: string;
  /** string the root sits on: 0 = low E, 1 = A */
  rootString: 0 | 1;
  /** fret offsets from the root fret; -1 = muted */
  rel: number[];
  rank: number;
  label: string;
}

const M = (suffix: string, rootString: 0 | 1, rel: number[], rank: number, label: string): Movable => ({ suffix, rootString, rel, rank, label });
const MOVABLE: Movable[] = [
  // E-form (root on the low E string)
  M('', 0, [0, 2, 2, 1, 0, 0], 0, 'E-shape barre'), M('m', 0, [0, 2, 2, 0, 0, 0], 0, 'Em-shape barre'),
  M('7', 0, [0, 2, 0, 1, 0, 0], 0, 'E7-shape barre'), M('m7', 0, [0, 2, 0, 0, 0, 0], 0, 'Em7-shape barre'),
  M('maj7', 0, [0, 2, 1, 1, 0, 0], 0, 'Emaj7-shape barre'), M('sus4', 0, [0, 2, 2, 2, 0, 0], 0, 'Esus4-shape barre'),
  M('m6', 0, [0, 2, 2, 0, 2, 0], 1, 'Em6-shape barre'), M('5', 0, [0, 2, 2, -1, -1, -1], 0, 'power chord'),
  // A-form (root on the A string)
  M('', 1, [-1, 0, 2, 2, 2, 0], 1, 'A-shape barre'), M('m', 1, [-1, 0, 2, 2, 1, 0], 1, 'Am-shape barre'),
  M('7', 1, [-1, 0, 2, 0, 2, 0], 1, 'A7-shape barre'), M('m7', 1, [-1, 0, 2, 0, 1, 0], 1, 'Am7-shape barre'),
  M('maj7', 1, [-1, 0, 2, 1, 2, 0], 1, 'Amaj7-shape barre'), M('sus4', 1, [-1, 0, 2, 2, 3, 0], 1, 'Asus4-shape barre'),
  M('sus2', 1, [-1, 0, 2, 2, 0, 0], 1, 'Asus2-shape barre'), M('6', 1, [-1, 0, 2, 2, 2, 2], 1, 'A6-shape barre'),
  M('m7b5', 1, [-1, 0, 1, 0, 1, -1], 1, 'half-diminished'), M('dim7', 1, [-1, 0, 1, 2, 1, -1], 1, 'diminished 7th'),
  M('5', 1, [-1, 0, 2, 2, -1, -1], 1, 'power chord'),
];

const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

function splitSymbol(sym: string): { root: number; suffix: string; bass: number } {
  const m = sym.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/)!;
  const root = parseNote(m[1])!;
  return { root, suffix: m[2], bass: m[3] ? parseNote(m[3])! : root };
}

const OPEN_INDEX = OPEN.map(([sym, frets, rank]) => ({ ...splitSymbol(sym), frets: f(frets), rank, sym }));

/** Curated shapes for a chord (root pitch class + canonical suffix + bass), best first. */
export function libraryShapes(root: number, suffix: string, bass: number): LibraryShape[] {
  const out: LibraryShape[] = [];
  for (const o of OPEN_INDEX) {
    if (o.root === root && o.suffix === suffix && o.bass === bass) out.push({ frets: o.frets, rank: o.rank, barre: o.rank === 9 ? { fret: 5, from: 0, to: 5 } : null, label: o.rank === 9 ? 'barre' : 'open shape' });
  }
  // movable shapes only for plain (non-slash) chords
  if (bass === root) {
    for (const mv of MOVABLE) {
      if (mv.suffix !== suffix) continue;
      // fret of the root on its string
      let n = mod12(root - mod12(OPEN_STRINGS[mv.rootString]));
      if (n === 0) n = 12; // the open version is already listed; 12 is the same shape an octave up
      if (n > 9 && n !== 12) continue;
      if (n === 12) continue;
      const frets = mv.rel.map((r) => (r < 0 ? -1 : n + r));
      const lastPlayed = frets.reduce((acc, x, i) => (x >= 0 ? i : acc), 0);
      const bar = mv.suffix === '5' ? null : { fret: n, from: mv.rootString, to: lastPlayed };
      out.push({ frets, rank: 3 + mv.rank + n * 0.4, barre: bar, label: `${mv.label} at fret ${n}` });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}
