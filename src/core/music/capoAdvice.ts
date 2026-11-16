/**
 * Capo helper: which capo position turns the song's chords into shapes that
 * are easy to play. The sound stays exactly the same; only the shapes change.
 */
import { easiestFingering } from './fingering';
import { parseChord, transposeChord } from './theory';
import { candidateShapes } from './fingering';

/** Chords most players learn first. Landing on these is what makes a capo choice feel easy. */
export const FRIENDLY = new Set(['C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm', 'C7', 'G7', 'D7', 'A7', 'E7', 'B7', 'Am7', 'Em7', 'Dm7', 'Cmaj7', 'Gmaj7', 'Dmaj7', 'Amaj7', 'Fmaj7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4', 'Cadd9']);

export interface CapoOption {
  capo: number;
  /** the shapes you play, unique, in song order */
  shapes: string[];
  /** shapes that have no barre-free version */
  barres: string[];
  /** shapes that are not among the first chords most players learn */
  notFriendly: string[];
  /** chords with no standard shape at all */
  unknown: string[];
  /** lower is easier */
  score: number;
  /** every shape is open and friendly */
  allOpen: boolean;
}

export function capoAdvice(chords: string[], opts: { maxCapo?: number } = {}): CapoOption[] {
  const seq = chords.filter((c) => parseChord(c));
  const unique = [...new Set(seq)];
  if (!unique.length) return [];
  const out: CapoOption[] = [];
  for (let capo = 0; capo <= (opts.maxCapo ?? 7); capo++) {
    const played = seq.map((c) => (capo ? transposeChord(c, -capo) : c));
    const shapes = [...new Set(played)];
    const barres: string[] = [];
    const unknown: string[] = [];
    const notFriendly: string[] = [];
    for (const s of shapes) {
      const list = candidateShapes(s, { candidates: 8 });
      if (!list.length || list[0].source !== 'standard') unknown.push(s);
      else if (!list.some((x) => !x.barre)) barres.push(s);
      if (!FRIENDLY.has(s)) notFriendly.push(s);
    }
    // how far the hand travels through the progression, using barre-free shapes where they exist
    const path = easiestFingering(played, { avoidBarres: true, loop: true });
    const move = path.reduce((n, p) => n + (p.from?.cost ?? 0), 0) / Math.max(1, path.length);
    const score = unknown.length * 6 + barres.length * 3 + notFriendly.length * 1.0 + move * 0.25 + capo * 0.12;
    out.push({ capo, shapes, barres, notFriendly, unknown, score, allOpen: barres.length === 0 && unknown.length === 0 && notFriendly.length === 0 });
  }
  return out.sort((a, b) => a.score - b.score || a.capo - b.capo);
}

/** Plain-words summary of an option. */
export function describeCapo(o: CapoOption): string {
  const where = o.capo === 0 ? 'No capo' : `Capo ${o.capo}`;
  const kind = o.allOpen ? 'all easy open shapes' : o.barres.length ? `${o.barres.length} barre chord${o.barres.length > 1 ? 's' : ''}` : o.unknown.length ? 'some unusual shapes' : 'no barres';
  return `${where}: play ${o.shapes.join(' ')} (${kind})`;
}
