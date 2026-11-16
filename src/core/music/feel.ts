/**
 * Chord swap by feel: pick a mood and see the same chord dressed differently.
 * Each swap keeps the root (and any slash bass) and changes only the colour,
 * so the harmony still fits and the song stays in its key.
 */
import { parseChord } from './theory';

export type Mood = 'warmer' | 'tenser' | 'open' | 'brighter' | 'darker';
export const MOODS: { id: Mood; label: string }[] = [
  { id: 'warmer', label: 'Warmer' },
  { id: 'tenser', label: 'Tenser' },
  { id: 'open', label: 'More open' },
  { id: 'brighter', label: 'Brighter' },
  { id: 'darker', label: 'Darker' },
];

export interface FeelSwap {
  chord: string;
  why: string;
}

/** suffix of the chord you have → [new suffix, why] */
const RULES: Record<Mood, Record<string, [string, string][]>> = {
  warmer: {
    '': [['maj7', 'a soft major 7th'], ['add9', 'a gentle 9th on top'], ['6', 'a sweet 6th']],
    m: [['m7', 'a mellow minor 7th'], ['m9', 'a rich 9th'], ['madd9', 'a tender added 9th']],
    '7': [['9', 'a fuller 9th'], ['13', 'a rich 13th']],
    maj7: [['maj9', 'a rounder 9th'], ['6/9', 'a settled 6/9']],
    m7: [['m9', 'a richer 9th'], ['m11', 'a deep 11th']],
    sus4: [['sus2', 'a softer suspension']],
    dim: [['m7b5', 'a smoother half-diminished']],
  },
  tenser: {
    '': [['7', 'a dominant 7th that wants to move'], ['sus4', 'a suspended 4th that hangs'], ['aug', 'a raised 5th that leans']],
    m: [['mMaj7', 'a sharp major 7th over minor'], ['m7b5', 'a half-diminished ache'], ['dim', 'a diminished squeeze']],
    '7': [['7#9', 'a crunchy sharp 9th'], ['7b9', 'a flat 9th pull'], ['7sus4', 'a suspended 4th delay']],
    maj7: [['7', 'a dominant 7th, unresolved'], ['aug', 'a raised 5th']],
    m7: [['m7b5', 'a half-diminished ache'], ['7', 'a dominant lean']],
    sus4: [['7sus4', 'a bluesy suspended 7th']],
    sus2: [['sus4', 'a suspended 4th that hangs']],
  },
  open: {
    '': [['sus2', 'an open 2nd, no 3rd'], ['add9', 'a ringing 9th'], ['5', 'a bare power chord']],
    m: [['madd9', 'a spacious added 9th'], ['sus2', 'an open 2nd, no minor 3rd'], ['5', 'a bare power chord']],
    '7': [['7sus4', 'an open suspended 7th'], ['5', 'a bare power chord']],
    maj7: [['sus2', 'an open 2nd'], ['add9', 'a ringing 9th']],
    m7: [['sus2', 'an open 2nd'], ['m11', 'a wide 11th']],
  },
  brighter: {
    m: [['', 'the major chord on the same root'], ['m6', 'a lifted 6th'], ['sus2', 'an airy suspended 2nd']],
    m7: [['m6', 'a lifted 6th'], ['maj7', 'the major 7th on the same root']],
    '': [['6', 'a sunny 6th'], ['6/9', 'a bright 6/9'], ['maj9', 'a shimmering 9th']],
    '7': [['6', 'a sunny 6th instead of the 7th'], ['maj7', 'a major 7th shimmer']],
    maj7: [['maj9', 'a shimmering 9th'], ['6/9', 'a bright 6/9']],
    dim: [['m', 'a plain minor']],
  },
  darker: {
    '': [['m', 'the minor chord on the same root'], ['m7', 'a dark minor 7th'], ['dim', 'a diminished shadow']],
    maj7: [['m7', 'a dark minor 7th'], ['mMaj7', 'a minor chord with a bright edge']],
    '7': [['m7', 'a minor 7th'], ['7b9', 'a flat 9th shadow']],
    m: [['m7b5', 'a half-diminished shadow'], ['dim', 'a diminished shadow'], ['m11', 'a deep 11th']],
    m7: [['m7b5', 'a half-diminished shadow'], ['m11', 'a deep 11th']],
    sus4: [['m', 'a minor chord, resolving down']],
    '6': [['m6', 'a minor 6th']],
  },
};

/** Up to four swaps for the mood, or none if the chord has no sensible version of that mood. */
export function feelSwaps(chord: string, mood: Mood): FeelSwap[] {
  const c = parseChord(chord);
  if (!c) return [];
  const root = c.rootName;
  const bass = c.bassName ? '/' + c.bassName : '';
  const out: FeelSwap[] = [];
  for (const [suffix, why] of RULES[mood][c.quality.suffix] ?? []) {
    const name = root + suffix + bass;
    const parsed = parseChord(name);
    if (!parsed || parsed.quality.suffix !== suffix || parsed.root !== c.root) continue;
    out.push({ chord: name, why });
  }
  return out.slice(0, 4);
}

