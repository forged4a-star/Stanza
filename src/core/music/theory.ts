/**
 * Music theory basics: notes, keys, scales, chord parsing/spelling,
 * transposition and Roman numerals. Pure functions, no audio.
 */

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** "C#", "Db", "e", "Bb" → pitch class 0-11, or null. */
export function parseNote(s: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]*)$/.exec(s.trim());
  if (!m) return null;
  let pc = LETTER_PC[m[1].toUpperCase()];
  for (const acc of m[2]) pc += acc === '#' || acc === '♯' ? 1 : -1;
  return mod12(pc);
}

export function noteName(pc: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function midiName(midi: number, flats = false): string {
  return noteName(midi, flats) + (Math.floor(midi / 12) - 1);
}

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

// ------------------------------------------------------------------ keys

export type Mode = 'major' | 'minor';

export interface Key {
  tonic: number;
  mode: Mode;
}

export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** "C", "Am", "F#m", "Bb major", "C# minor" → Key */
export function parseKey(s: string | null | undefined): Key | null {
  if (!s) return null;
  const m = /^\s*([A-Ga-g][#b♯♭]?)\s*(m|min|minor|maj|major|M)?\s*$/.exec(s);
  if (!m) return null;
  const tonic = parseNote(m[1]);
  if (tonic === null) return null;
  const q = m[2] ?? '';
  return { tonic, mode: q === 'm' || q.startsWith('min') ? 'minor' : 'major' };
}

/** Flat keys spell with flats (F, Bb, Eb … and their relative minors). */
export function keyPrefersFlats(k: Key): boolean {
  const majorTonic = k.mode === 'major' ? k.tonic : mod12(k.tonic + 3);
  return [5, 10, 3, 8, 1, 6].includes(majorTonic);
}

export function keyName(k: Key, long = false): string {
  const name = noteName(k.tonic, keyPrefersFlats(k));
  if (long) return `${name} ${k.mode}`;
  return k.mode === 'minor' ? name + 'm' : name;
}

export function scalePcs(k: Key): number[] {
  return (k.mode === 'major' ? MAJOR_SCALE : MINOR_SCALE).map((i) => mod12(k.tonic + i));
}

export const relativeKey = (k: Key): Key => (k.mode === 'major' ? { tonic: mod12(k.tonic + 9), mode: 'minor' } : { tonic: mod12(k.tonic + 3), mode: 'major' });

// ------------------------------------------------------------------ chords

export interface ChordQuality {
  /** canonical suffix used when spelling */
  suffix: string;
  intervals: number[];
  /** triad family for Roman numerals and function */
  family: 'major' | 'minor' | 'dim' | 'aug' | 'sus' | 'power';
}

/** Ordered so longer suffixes are tried first by the parser. */
const QUALITY_LIST: [string[], ChordQuality][] = [
  [['maj13', 'M13', 'Δ13'], { suffix: 'maj13', intervals: [0, 4, 7, 11, 14, 21], family: 'major' }],
  [['maj11', 'M11'], { suffix: 'maj11', intervals: [0, 4, 7, 11, 14, 17], family: 'major' }],
  [['maj9', 'M9', 'Δ9'], { suffix: 'maj9', intervals: [0, 4, 7, 11, 14], family: 'major' }],
  [['maj7', 'M7', 'Δ7', 'Δ', 'ma7'], { suffix: 'maj7', intervals: [0, 4, 7, 11], family: 'major' }],
  [['mMaj7', 'mM7', 'm(maj7)', 'minmaj7'], { suffix: 'mMaj7', intervals: [0, 3, 7, 11], family: 'minor' }],
  [['m7b5', 'ø7', 'ø', 'min7b5', 'm7-5'], { suffix: 'm7b5', intervals: [0, 3, 6, 10], family: 'dim' }],
  [['dim7', '°7', 'o7'], { suffix: 'dim7', intervals: [0, 3, 6, 9], family: 'dim' }],
  [['m13', 'min13'], { suffix: 'm13', intervals: [0, 3, 7, 10, 14, 21], family: 'minor' }],
  [['m11', 'min11'], { suffix: 'm11', intervals: [0, 3, 7, 10, 14, 17], family: 'minor' }],
  [['m9', 'min9'], { suffix: 'm9', intervals: [0, 3, 7, 10, 14], family: 'minor' }],
  [['madd9', 'm(add9)', 'minadd9'], { suffix: 'madd9', intervals: [0, 3, 7, 14], family: 'minor' }],
  [['m7', 'min7', '-7'], { suffix: 'm7', intervals: [0, 3, 7, 10], family: 'minor' }],
  [['m6', 'min6'], { suffix: 'm6', intervals: [0, 3, 7, 9], family: 'minor' }],
  [['7sus4', '7sus'], { suffix: '7sus4', intervals: [0, 5, 7, 10], family: 'sus' }],
  [['9sus4', '9sus'], { suffix: '9sus4', intervals: [0, 5, 7, 10, 14], family: 'sus' }],
  [['13'], { suffix: '13', intervals: [0, 4, 7, 10, 14, 21], family: 'major' }],
  [['11'], { suffix: '11', intervals: [0, 7, 10, 14, 17], family: 'major' }],
  [['7#9'], { suffix: '7#9', intervals: [0, 4, 7, 10, 15], family: 'major' }],
  [['7b9'], { suffix: '7b9', intervals: [0, 4, 7, 10, 13], family: 'major' }],
  [['9'], { suffix: '9', intervals: [0, 4, 7, 10, 14], family: 'major' }],
  [['7'], { suffix: '7', intervals: [0, 4, 7, 10], family: 'major' }],
  [['6/9', '69'], { suffix: '6/9', intervals: [0, 4, 7, 9, 14], family: 'major' }],
  [['6'], { suffix: '6', intervals: [0, 4, 7, 9], family: 'major' }],
  [['add9', 'add2', '(add9)'], { suffix: 'add9', intervals: [0, 4, 7, 14], family: 'major' }],
  [['add11', 'add4'], { suffix: 'add11', intervals: [0, 4, 7, 17], family: 'major' }],
  [['sus2'], { suffix: 'sus2', intervals: [0, 2, 7], family: 'sus' }],
  [['sus4', 'sus'], { suffix: 'sus4', intervals: [0, 5, 7], family: 'sus' }],
  [['dim', '°', 'o'], { suffix: 'dim', intervals: [0, 3, 6], family: 'dim' }],
  [['aug', '+', '#5'], { suffix: 'aug', intervals: [0, 4, 8], family: 'aug' }],
  [['5'], { suffix: '5', intervals: [0, 7], family: 'power' }],
  [['m', 'min', '-', 'mi'], { suffix: 'm', intervals: [0, 3, 7], family: 'minor' }],
  [['maj', 'M', ''], { suffix: '', intervals: [0, 4, 7], family: 'major' }],
];

const SUFFIX_LOOKUP: [string, ChordQuality][] = QUALITY_LIST.flatMap(([aliases, q]) => aliases.map((a): [string, ChordQuality] => [a, q])).sort(
  (a, b) => b[0].length - a[0].length
);

export const QUALITY_BY_SUFFIX: Record<string, ChordQuality> = Object.fromEntries(QUALITY_LIST.map(([, q]) => [q.suffix, q]));

export interface Chord {
  root: number;
  quality: ChordQuality;
  /** slash bass pitch class, or null */
  bass: number | null;
  /** the root as written (keeps the user's sharp/flat choice) */
  rootName: string;
  bassName: string | null;
}

/** Parse "F#m7b5/C", "Bbmaj7", "Gsus4", "D/F#". Returns null for anything that is not a chord. */
export function parseChord(raw: string): Chord | null {
  const s = raw.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(s);
  if (!m) return null;
  const root = parseNote(m[1]);
  if (root === null) return null;
  const rest = m[2];
  let quality: ChordQuality | null = null;
  for (const [alias, q] of SUFFIX_LOOKUP) {
    if (rest === alias) {
      quality = q;
      break;
    }
  }
  if (!quality) return null;
  const bass = m[3] ? parseNote(m[3]) : null;
  return { root, quality, bass, rootName: m[1], bassName: m[3] ?? null };
}

export const isChord = (s: string) => parseChord(s) !== null;

export function chordSymbol(c: Chord, flats?: boolean): string {
  const useFlats = flats ?? c.rootName.includes('b');
  const root = flats === undefined ? c.rootName : noteName(c.root, useFlats);
  const bass = c.bass === null ? '' : '/' + (flats === undefined && c.bassName ? c.bassName : noteName(c.bass, useFlats));
  return root + c.quality.suffix + bass;
}

/** Pitch classes in the chord (bass first if slash). */
export function chordPcs(c: Chord): number[] {
  const pcs = c.quality.intervals.map((i) => mod12(c.root + i));
  const uniq = [...new Set(pcs)];
  if (c.bass === null) return uniq;
  return [c.bass, ...uniq.filter((p) => p !== c.bass)];
}

/**
 * A playable close voicing as MIDI notes: bass note in octave 2-3, chord tones
 * from around middle C. Good for the chord player and MIDI export.
 */
export function chordVoicing(c: Chord, opts: { bass?: boolean; around?: number } = {}): number[] {
  const around = opts.around ?? 60;
  const notes: number[] = [];
  const base = around - 7 + mod12(c.root - (around - 7));
  for (const i of c.quality.intervals) notes.push(base + (i > 12 ? i - 12 : i));
  notes.sort((a, b) => a - b);
  const out = [...new Set(notes)];
  if (opts.bass !== false) {
    // bass note in C2..B2
    out.unshift(36 + mod12(c.bass ?? c.root));
  }
  return out;
}

export function transposeChord(name: string, semitones: number, flats?: boolean): string {
  const c = parseChord(name);
  if (!c) return name;
  const t: Chord = { ...c, root: mod12(c.root + semitones), bass: c.bass === null ? null : mod12(c.bass + semitones) };
  const useFlats = flats ?? (c.rootName.includes('b') || (c.bassName ?? '').includes('b'));
  return noteName(t.root, useFlats) + c.quality.suffix + (t.bass === null ? '' : '/' + noteName(t.bass, useFlats));
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const DEGREE_SEMIS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Roman numeral of a chord in a key, e.g. "vi", "V7", "bVII", "V/V" is not
 * derived here (see suggestions); chromatic roots get b/# prefixes relative
 * to the major scale of the tonic.
 */
export function romanNumeral(name: string, key: Key): string {
  const c = parseChord(name);
  if (!c) return '?';
  const rel = mod12(c.root - key.tonic);
  let deg = DEGREE_SEMIS.indexOf(rel);
  let prefix = '';
  if (deg < 0) {
    // prefer flats for chromatic degrees (bIII, bVI, bVII) except #IV
    if (rel === 6) {
      deg = 3;
      prefix = '#';
    } else {
      deg = DEGREE_SEMIS.indexOf(rel + 1);
      prefix = 'b';
    }
  }
  if (key.mode === 'minor') {
    // in minor, name degrees relative to natural minor: III, VI, VII are plain
    const minorSemis = [0, 2, 3, 5, 7, 8, 10];
    const md = minorSemis.indexOf(rel);
    if (md >= 0) {
      deg = md;
      prefix = '';
    } else if (rel === 11) {
      deg = 6;
      prefix = '#';
    } else if (rel === 9) {
      deg = 5;
      prefix = '#';
    } else if (rel === 4) {
      deg = 2;
      prefix = '#';
    }
  }
  let numeral = ROMAN[deg];
  const fam = c.quality.family;
  if (fam === 'minor' || fam === 'dim') numeral = numeral.toLowerCase();
  let suffix = '';
  const sfx = c.quality.suffix;
  if (fam === 'dim') suffix = sfx === 'm7b5' ? 'ø7' : sfx === 'dim7' ? '°7' : '°';
  else if (fam === 'aug') suffix = '+';
  else if (sfx === 'm') suffix = '';
  else if (sfx.startsWith('m') && !sfx.startsWith('maj')) suffix = sfx.slice(1);
  else suffix = sfx;
  let bass = '';
  if (c.bass !== null) {
    const iv = mod12(c.bass - c.root);
    const inv = c.quality.intervals.map(mod12).indexOf(iv);
    bass = inv === 1 ? '⁶' : inv === 2 ? '⁶₄' : '/' + noteName(c.bass, keyPrefersFlats(key));
  }
  return prefix + numeral + suffix + bass;
}

/** Diatonic triads (or sevenths) of a key, as chord names spelled for the key. */
export function diatonicChords(k: Key, sevenths = false): string[] {
  const scale = scalePcs(k);
  const flats = keyPrefersFlats(k);
  return scale.map((root, i) => {
    const third = mod12(scale[(i + 2) % 7] - root);
    const fifth = mod12(scale[(i + 4) % 7] - root);
    const seventh = mod12(scale[(i + 6) % 7] - root);
    let suffix = '';
    if (third === 4 && fifth === 7) suffix = sevenths ? (seventh === 11 ? 'maj7' : '7') : '';
    else if (third === 3 && fifth === 7) suffix = sevenths ? 'm7' : 'm';
    else if (third === 3 && fifth === 6) suffix = sevenths ? 'm7b5' : 'dim';
    else if (third === 4 && fifth === 8) suffix = 'aug';
    return noteName(root, flats) + suffix;
  });
}

/** Spell a chord's root/bass for a key (Bb not A# in F major). */
export function spellForKey(name: string, key: Key | null): string {
  if (!key) return name;
  const c = parseChord(name);
  if (!c) return name;
  const flats = keyPrefersFlats(key);
  return noteName(c.root, flats) + c.quality.suffix + (c.bass === null ? '' : '/' + noteName(c.bass, flats));
}
