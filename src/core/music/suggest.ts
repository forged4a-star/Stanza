/**
 * Next-chord suggestions, ranked by how common the move is in popular music,
 * each labelled by what it does (tension, release, lift, darken). Optional
 * extras: borrowed chords (modal interchange), secondary dominants and pivot
 * chords for a key change. Plus a library of classic progressions/cadences.
 */
import { chordSymbol, diatonicChords, keyName, keyPrefersFlats, mod12, noteName, parseChord, romanNumeral, scalePcs, type Key } from './theory';

export type ChordFunction = 'tension' | 'release' | 'lift' | 'darken' | 'colour';

export interface Suggestion {
  chord: string;
  roman: string;
  /** 0..1, relative commonness of the move */
  weight: number;
  fn: ChordFunction;
  /** short explanation */
  why: string;
  source: 'diatonic' | 'borrowed' | 'secondary' | 'pivot';
  /** for pivots: the key it leads to */
  toKey?: string;
}

/**
 * Transition weights between scale degrees (0 = I … 6 = vii°) in major,
 * approximating published pop/rock corpus statistics (I→V, I→IV, V→I, IV→I,
 * vi→IV, ii→V dominate).
 */
export const MAJOR_T: number[][] = [
  /* I   */ [0, 0.08, 0.04, 0.3, 0.3, 0.22, 0.02],
  /* ii  */ [0.12, 0, 0.04, 0.16, 0.55, 0.1, 0.03],
  /* iii */ [0.08, 0.06, 0, 0.36, 0.12, 0.36, 0.02],
  /* IV  */ [0.38, 0.08, 0.04, 0, 0.34, 0.14, 0.02],
  /* V   */ [0.52, 0.04, 0.04, 0.18, 0, 0.2, 0.02],
  /* vi  */ [0.14, 0.14, 0.06, 0.38, 0.26, 0, 0.02],
  /* vii */ [0.6, 0.02, 0.18, 0.02, 0.06, 0.12, 0],
];

/** Natural minor degrees (0 = i … 6 = VII). */
export const MINOR_T: number[][] = [
  /* i   */ [0, 0.04, 0.16, 0.2, 0.16, 0.26, 0.18],
  /* ii° */ [0.2, 0, 0.06, 0.06, 0.6, 0.04, 0.04],
  /* III */ [0.12, 0.02, 0, 0.16, 0.08, 0.26, 0.36],
  /* iv  */ [0.34, 0.04, 0.06, 0, 0.26, 0.12, 0.18],
  /* v/V */ [0.56, 0.02, 0.04, 0.12, 0, 0.2, 0.06],
  /* VI  */ [0.18, 0.02, 0.2, 0.18, 0.12, 0, 0.3],
  /* VII */ [0.36, 0.02, 0.32, 0.06, 0.04, 0.2, 0],
];

function degreeOf(chord: string, key: Key): number {
  const c = parseChord(chord);
  if (!c) return -1;
  return scalePcs(key).indexOf(mod12(c.root));
}

/** Brightness of a chord quality, used to label moves as lifting or darkening. */
const brightness = (name: string) => {
  const c = parseChord(name);
  if (!c) return 0;
  return c.quality.family === 'major' ? 1 : c.quality.family === 'sus' ? 0.6 : c.quality.family === 'minor' ? 0 : -0.5;
};

function labelMove(from: string | null, to: string, key: Key): { fn: ChordFunction; why: string } {
  const c = parseChord(to)!;
  const deg = scalePcs(key).indexOf(mod12(c.root));
  const tonic = deg === 0;
  const dominant = c.quality.intervals.includes(10) && c.quality.family === 'major';
  if (tonic) return { fn: 'release', why: 'resolves home' };
  if (deg === 4 || (key.mode === 'minor' && deg === 4) || c.quality.family === 'dim' || (dominant && deg !== 3)) return { fn: 'tension', why: 'pulls back towards home' };
  if (c.quality.family === 'sus') return { fn: 'tension', why: 'suspended, wants to resolve' };
  const fb = from ? brightness(from) : 0.5;
  const tb = brightness(to);
  if (tb > fb || (deg === 3 && key.mode === 'major')) return { fn: 'lift', why: deg === 3 ? 'opens up, away from home' : 'brightens' };
  if (tb < fb) return { fn: 'darken', why: 'turns minor, more inward' };
  return { fn: 'colour', why: 'a sideways step' };
}

export interface SuggestOptions {
  borrowed?: boolean;
  secondary?: boolean;
  pivots?: boolean;
  sevenths?: boolean;
}

export function suggestNext(prev: string | null, key: Key, opts: SuggestOptions = {}): Suggestion[] {
  const diat = diatonicChords(key, opts.sevenths);
  const table = key.mode === 'major' ? MAJOR_T : MINOR_T;
  const from = prev ? degreeOf(prev, key) : -1;
  const row = from >= 0 ? table[from] : key.mode === 'major' ? [0.4, 0.06, 0.03, 0.18, 0.12, 0.18, 0.01] : [0.45, 0.02, 0.12, 0.12, 0.08, 0.13, 0.08];
  const out: Suggestion[] = [];
  diat.forEach((ch, d) => {
    let chord = ch;
    // in minor, the dominant is usually made major (harmonic minor) for a stronger pull
    if (key.mode === 'minor' && d === 4) chord = noteName(scalePcs(key)[4], keyPrefersFlats(key)) + (opts.sevenths ? '7' : '');
    if (prev && parseChord(prev) && parseChord(chord) && chordSymbol(parseChord(prev)!) === chordSymbol(parseChord(chord)!)) return;
    const { fn, why } = labelMove(prev, chord, key);
    out.push({ chord, roman: romanNumeral(chord, key), weight: row[d], fn, why, source: 'diatonic' });
  });

  const flats = keyPrefersFlats(key);
  // borrowed roots are flattened degrees (bVII, bVI, bIII): spell them with flats
  const at = (semis: number, suffix: string) => noteName(key.tonic + semis, true) + suffix;

  if (opts.borrowed) {
    const borrowed: [string, number, string][] =
      key.mode === 'major'
        ? [
            [at(5, 'm'), 0.12, 'minor iv borrowed from the parallel minor: bittersweet'],
            [at(10, ''), 0.1, 'bVII, the rock/mixolydian lift'],
            [at(8, ''), 0.08, 'bVI, cinematic and dark'],
            [at(3, ''), 0.05, 'bIII, a bold borrowed colour'],
            [at(2, 'm7b5'), 0.03, 'ii half-diminished, from minor'],
          ]
        : [
            [at(5, ''), 0.08, 'major IV borrowed from dorian: a ray of light'],
            [at(0, ''), 0.06, 'major I, the Picardy third'],
            [at(2, ''), 0.04, 'major II from melodic minor'],
          ];
    for (const [chord, w, why] of borrowed) {
      const c = parseChord(chord)!;
      out.push({ chord, roman: romanNumeral(chord, key), weight: w, fn: c.quality.family === 'major' ? 'lift' : 'darken', why, source: 'borrowed' });
    }
  }

  if (opts.secondary) {
    // V7 of each diatonic chord except the tonic and diminished
    const scale = scalePcs(key);
    diat.forEach((target, d) => {
      const tc = parseChord(target)!;
      if (d === 0 || tc.quality.family === 'dim') return;
      const chord = noteName(scale[d] + 7, flats) + '7';
      const roman = `V7/${romanNumeral(target, key).replace(/7|maj7/, '')}`;
      out.push({ chord, roman, weight: d === 4 ? 0.08 : d === 1 || d === 5 ? 0.06 : 0.04, fn: 'tension', why: `points strongly to ${target}`, source: 'secondary' });
    });
  }

  if (opts.pivots) {
    for (const p of pivotChords(key)) out.push(p);
  }

  // normalise weights so the top suggestion reads as 1
  const max = Math.max(...out.map((s) => s.weight), 1e-9);
  return out.map((s) => ({ ...s, weight: s.weight / max })).sort((a, b) => b.weight - a.weight);
}

/** Closely related keys and the chords they share with the current key. */
export function pivotChords(key: Key): Suggestion[] {
  const targets: { k: Key; label: string }[] =
    key.mode === 'major'
      ? [
          { k: { tonic: mod12(key.tonic + 7), mode: 'major' }, label: 'up a fifth (dominant key)' },
          { k: { tonic: mod12(key.tonic + 5), mode: 'major' }, label: 'subdominant key' },
          { k: { tonic: mod12(key.tonic + 9), mode: 'minor' }, label: 'relative minor' },
          { k: { tonic: mod12(key.tonic + 2), mode: 'major' }, label: 'up a whole step' },
        ]
      : [
          { k: { tonic: mod12(key.tonic + 3), mode: 'major' }, label: 'relative major' },
          { k: { tonic: mod12(key.tonic + 7), mode: 'minor' }, label: 'minor dominant key' },
          { k: { tonic: mod12(key.tonic + 5), mode: 'minor' }, label: 'minor subdominant key' },
        ];
  const mine = diatonicChords(key);
  const out: Suggestion[] = [];
  for (const { k, label } of targets) {
    const theirs = diatonicChords(k);
    const shared = mine.filter((c) => theirs.some((t) => parseChord(t) && chordSymbol(parseChord(t)!, false) === chordSymbol(parseChord(c)!, false)));
    // best pivots are strong chords in the new key: its IV/ii (lead to its V) — prefer those
    const ranked = shared
      .map((c) => ({ c, d: degreeOf(c, k) }))
      .filter((x) => x.d > 0)
      .sort((a, b) => [3, 1, 5, 2, 4, 6].indexOf(a.d) - [3, 1, 5, 2, 4, 6].indexOf(b.d));
    const best = ranked[0];
    if (!best) {
      // no shared chord (e.g. up a whole step): use the new key's V as a direct pivot
      const v = noteName(k.tonic + 7, keyPrefersFlats(k)) + '7';
      out.push({ chord: v, roman: `V7 of ${keyName(k)}`, weight: 0.03, fn: 'tension', why: `direct modulation, ${label}`, source: 'pivot', toKey: keyName(k) });
      continue;
    }
    out.push({
      chord: best.c,
      roman: `${romanNumeral(best.c, key)} = ${romanNumeral(best.c, k)} in ${keyName(k)}`,
      weight: 0.04,
      fn: 'colour',
      why: `pivot to ${keyName(k)} (${label}); follow with ${diatonicChords(k)[4]}`,
      source: 'pivot',
      toKey: keyName(k),
    });
  }
  return out;
}

// ------------------------------------------------------------------ library

export interface ClassicProgression {
  name: string;
  roman: string[];
  mode: 'major' | 'minor';
  kind: 'progression' | 'cadence';
  note: string;
}

export const PROGRESSIONS: ClassicProgression[] = [
  { name: 'Axis (I–V–vi–IV)', roman: ['I', 'V', 'vi', 'IV'], mode: 'major', kind: 'progression', note: 'The most common pop loop.' },
  { name: '50s / doo-wop', roman: ['I', 'vi', 'IV', 'V'], mode: 'major', kind: 'progression', note: 'Sweet and nostalgic.' },
  { name: 'Sensitive (vi–IV–I–V)', roman: ['vi', 'IV', 'I', 'V'], mode: 'major', kind: 'progression', note: 'The axis started on the minor.' },
  { name: 'Three-chord', roman: ['I', 'IV', 'V', 'IV'], mode: 'major', kind: 'progression', note: 'Rock, folk, blues roots.' },
  { name: 'Jazz turnaround', roman: ['ii', 'V', 'I', 'vi'], mode: 'major', kind: 'progression', note: 'Smooth, circular motion.' },
  { name: 'Pachelbel', roman: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'], mode: 'major', kind: 'progression', note: 'Stately, descending bass.' },
  { name: 'Mixolydian rock', roman: ['I', 'bVII', 'IV', 'I'], mode: 'major', kind: 'progression', note: 'Borrowed bVII swagger.' },
  { name: 'Creep / minor iv', roman: ['I', 'III', 'IV', 'iv'], mode: 'major', kind: 'progression', note: 'Major III and borrowed iv: aching.' },
  { name: 'Royal road', roman: ['IV', 'V', 'iii', 'vi'], mode: 'major', kind: 'progression', note: 'J-pop favourite, yearning.' },
  { name: '12-bar blues', roman: ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'], mode: 'major', kind: 'progression', note: 'One chord per bar.' },
  { name: 'Andalusian', roman: ['i', 'VII', 'VI', 'V'], mode: 'minor', kind: 'progression', note: 'Descending, flamenco drama.' },
  { name: 'Aeolian loop', roman: ['i', 'VI', 'III', 'VII'], mode: 'minor', kind: 'progression', note: 'Epic minor pop.' },
  { name: 'Minor plagal', roman: ['i', 'iv', 'i', 'V'], mode: 'minor', kind: 'progression', note: 'Dark with a pull home.' },
  { name: 'Authentic cadence', roman: ['V', 'I'], mode: 'major', kind: 'cadence', note: 'Full stop.' },
  { name: 'Plagal ("amen")', roman: ['IV', 'I'], mode: 'major', kind: 'cadence', note: 'Soft landing.' },
  { name: 'Half cadence', roman: ['ii', 'V'], mode: 'major', kind: 'cadence', note: 'A comma: leaves you hanging.' },
  { name: 'Deceptive', roman: ['V', 'vi'], mode: 'major', kind: 'cadence', note: 'Expect home, land somewhere sadder.' },
  { name: 'Backdoor', roman: ['iv', 'bVII', 'I'], mode: 'major', kind: 'cadence', note: 'Sneaks home through the back.' },
  { name: 'Minor authentic', roman: ['V', 'i'], mode: 'minor', kind: 'cadence', note: 'Harmonic-minor V resolving.' },
];

const ROMAN_DEG: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };
const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SEMIS = [0, 2, 3, 5, 7, 8, 10];

/** Realise a Roman numeral ("bVII", "iv", "V7", "ii°") in a key. */
export function romanToChord(roman: string, key: Key): string | null {
  const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|ø|\+)?(7|maj7)?$/.exec(roman);
  if (!m) return null;
  const [, acc, numeral, deco, seventh] = m;
  const deg = ROMAN_DEG[numeral.toUpperCase()];
  const semis = (key.mode === 'minor' ? MINOR_SEMIS : MAJOR_SEMIS)[deg] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0);
  // in minor, a major "V" is the raised dominant
  const root = mod12(key.tonic + semis);
  const lower = numeral === numeral.toLowerCase();
  let suffix = lower ? 'm' : '';
  if (deco === '°') suffix = seventh ? 'dim7' : 'dim';
  else if (deco === 'ø') suffix = 'm7b5';
  else if (deco === '+') suffix = 'aug';
  else if (seventh === '7') suffix = lower ? 'm7' : '7';
  else if (seventh === 'maj7') suffix = lower ? 'mMaj7' : 'maj7';
  return noteName(root, keyPrefersFlats(key) || acc === 'b') + suffix;
}

export function realiseProgression(p: ClassicProgression, key: Key): string[] {
  // a major-mode progression in a minor key is played in the relative major and vice versa
  const k = p.mode === key.mode ? key : key.mode === 'minor' ? { tonic: mod12(key.tonic + 3), mode: 'major' as const } : { tonic: mod12(key.tonic + 9), mode: 'minor' as const };
  return p.roman.map((r) => romanToChord(r, k) ?? r);
}
