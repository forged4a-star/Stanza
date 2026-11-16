/**
 * Word swap preview: what a replacement word would do to a line. Shows the
 * line, its syllable count and stress against the original, and which lines
 * it rhymes with before and after. It only reports; it never picks the word.
 */
import { analyzeLine } from '../phonetics/line';
import { analyzeSound } from '../phonetics/sound';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Swap the first whole-word occurrence, keeping a capital letter if the old word had one. */
export function swapWord(line: string, word: string, replacement: string): string | null {
  const re = new RegExp(`(^|[^\\w'])(${esc(word)})(?![\\w'])`, 'i');
  const m = re.exec(line);
  if (!m) return null;
  const old = m[2];
  const r = old[0] === old[0].toUpperCase() && old[0] !== old[0].toLowerCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  return line.slice(0, m.index + m[1].length) + r + line.slice(m.index + m[1].length + old.length);
}

/** One digit per syllable: 1 where the line is spoken strongly, 0 where weakly. */
export function stressOf(line: string): string {
  return analyzeLine(line)
    .syllables.map((s) => (s.level >= 1 ? '1' : '0'))
    .join('');
}

export interface SwapBadge {
  /** change in syllables (replacement minus original) */
  delta: number;
  /** same number of syllables and the same stress pattern */
  fits: boolean;
}

/** Cheap check for a long list of candidates. */
export function swapBadge(line: string, word: string, replacement: string): SwapBadge | null {
  const next = swapWord(line, word, replacement);
  if (next === null) return null;
  const a = analyzeLine(line).syllables.length;
  const b = analyzeLine(next).syllables.length;
  return { delta: b - a, fits: a === b && stressOf(line) === stressOf(next) };
}

export interface SwapPreview {
  text: string;
  before: number;
  after: number;
  delta: number;
  stressBefore: string;
  stressAfter: string;
  fits: boolean;
  /** other lines (numbered from 1) in the section this line rhymed with before / after the swap */
  rhymesBefore: number[];
  rhymesAfter: number[];
}

/** Full preview for one chosen word, including what it does to the rhymes in the section. */
export function previewSwap(sectionLines: string[], index: number, word: string, replacement: string): SwapPreview | null {
  const line = sectionLines[index];
  const text = line === undefined ? null : swapWord(line, word, replacement);
  if (text === null) return null;
  const rhymes = (lines: string[]) => {
    const input = lines.map((t, i) => ({ id: 'l' + i, sectionId: 's', text: t }));
    const sc = analyzeSound(input, { modes: ['perfect', 'slant'], sensitivity: 0.5, scope: 'end' }).scheme;
    const mine = sc[index];
    return mine ? sc.map((x, i) => (i !== index && x === mine ? i + 1 : 0)).filter(Boolean) : [];
  };
  const after = sectionLines.map((l, i) => (i === index ? text : l));
  const before = analyzeLine(line).syllables.length;
  const now = analyzeLine(text).syllables.length;
  const stressBefore = stressOf(line);
  const stressAfter = stressOf(text);
  return {
    text,
    before,
    after: now,
    delta: now - before,
    stressBefore,
    stressAfter,
    fits: before === now && stressBefore === stressAfter,
    rhymesBefore: rhymes(sectionLines),
    rhymesAfter: rhymes(after),
  };
}
