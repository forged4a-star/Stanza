/**
 * Word -> pronunciation. CMU dictionary first, then morphology (known base +
 * suffix), then compound splitting, then the rule-based guesser.
 */
import cmuData from '../../data/cmudict.json';
import { SortedLines } from '../util/sortedLines';
import { isVowel } from './arpabet';
import { guessPronunciation } from './g2p';

const dict = new SortedLines((cmuData as { dict: string }).dict);
export const rhymeIndex = new SortedLines((cmuData as { rhymes: string }).rhymes);

export interface Pronunciation {
  /** encoded pronunciations, most common first */
  prons: string[];
  /** 0 (unknown/rare) .. 9 (very common) */
  freq: number;
  /** where it came from */
  source: 'dict' | 'derived' | 'guess';
}

export function dictLookup(word: string): Pronunciation | null {
  const v = dict.get(word);
  if (v === null) return null;
  const tab = v.indexOf('\t');
  return { prons: v.slice(0, tab).split('/'), freq: Number(v.slice(tab + 1)) || 0, source: 'dict' };
}

export const inDictionary = (word: string): boolean => dict.has(word);

/** Iterate every dictionary entry (used by tests and bulk tools). */
export function scanDictionary(fn: (word: string, prons: string[], freq: number) => boolean | void): void {
  dict.scanAll((k, v) => {
    const tab = v.indexOf('\t');
    return fn(k, v.slice(0, tab).split('/'), Number(v.slice(tab + 1)) || 0);
  });
}

const VOICELESS = 'pkfTtsSC';
const SIBILANT = 'szSZCJ';

const last = (s: string) => s.replace(/[012]$/, '').slice(-1);

function addS(p: string): string {
  const l = last(p);
  if (SIBILANT.includes(l)) return p + 'I0z';
  return p + (VOICELESS.includes(l) ? 's' : 'z');
}
function addEd(p: string): string {
  const l = last(p);
  if (l === 't' || l === 'd') return p + 'I0d';
  return p + (VOICELESS.includes(l) ? 't' : 'd');
}
/** drop primary stress to secondary (for the non-head part of a compound) */
const demote = (p: string) => p.replace(/1/g, '2');

interface Suffix {
  re: RegExp;
  /** candidate base spellings given the stem */
  bases: (stem: string) => string[];
  apply: (p: string) => string;
}

const undouble = (s: string) => (s.length > 2 && s[s.length - 1] === s[s.length - 2] ? [s.slice(0, -1)] : []);

const SUFFIXES: Suffix[] = [
  { re: /^(.+)in'$/, bases: (s) => [s + 'ing'], apply: (p) => p.replace(/G$/, 'n') },
  { re: /^(.+)'s$/, bases: (s) => [s], apply: addS },
  { re: /^(.+)s'$/, bases: (s) => [s + 's', s], apply: (p) => p },
  { re: /^(.+)'ll$/, bases: (s) => [s], apply: (p) => p + 'A0l' },
  { re: /^(.+)'d$/, bases: (s) => [s], apply: addEd },
  { re: /^(.+)'ve$/, bases: (s) => [s], apply: (p) => p + 'v' },
  { re: /^(.+)'re$/, bases: (s) => [s], apply: (p) => p + 'R0' },
  { re: /^(.+)n't$/, bases: (s) => [s], apply: (p) => p + 'A0nt' },
  { re: /^(.+)ies$/, bases: (s) => [s + 'y'], apply: addS },
  { re: /^(.+)ied$/, bases: (s) => [s + 'y'], apply: addEd },
  { re: /^(.+)es$/, bases: (s) => [s, s + 'e'], apply: addS },
  { re: /^(.+)s$/, bases: (s) => [s], apply: addS },
  { re: /^(.+)ed$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: addEd },
  { re: /^(.+)ing$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: (p) => p + 'I0G' },
  { re: /^(.+)ings$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: (p) => p + 'I0Gz' },
  { re: /^(.+)iest$/, bases: (s) => [s + 'y'], apply: (p) => p + 'A0st' },
  { re: /^(.+)ier$/, bases: (s) => [s + 'y'], apply: (p) => p + 'R0' },
  { re: /^(.+)ily$/, bases: (s) => [s + 'y'], apply: (p) => p.replace(/i0$/, 'A0') + 'li0' },
  { re: /^(.+)est$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: (p) => p + 'A0st' },
  { re: /^(.+)er$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: (p) => p + 'R0' },
  { re: /^(.+)ers$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: (p) => p + 'R0z' },
  { re: /^(.+)ly$/, bases: (s) => [s], apply: (p) => p + 'li0' },
  { re: /^(.+)ness$/, bases: (s) => [s, s.replace(/i$/, 'y')], apply: (p) => p + 'nA0s' },
  { re: /^(.+)less$/, bases: (s) => [s], apply: (p) => p + 'lA0s' },
  { re: /^(.+)ful$/, bases: (s) => [s], apply: (p) => p + 'fA0l' },
  { re: /^(.+)able$/, bases: (s) => [s, s + 'e'], apply: (p) => p + 'A0bA0l' },
  { re: /^(.+)ish$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: (p) => p + 'I0S' },
  { re: /^(.+)y$/, bases: (s) => [s, s + 'e', ...undouble(s)], apply: (p) => p + 'i0' },
  { re: /^(.+)a$/, bases: (s) => [s + 'er', s + 'ing'], apply: (p) => p.replace(/R0$|I0G$/, 'A0') },
];

const PREFIXES: [string, string][] = [
  ['un', 'A0n'],
  ['re', 'ri0'],
  ['non', 'na2n'],
  ['over', 'o2vR0'],
  ['under', 'A2ndR0'],
  ['out', 'W2t'],
  ['mis', 'mI0s'],
  ['dis', 'dI0s'],
  ['pre', 'pri0'],
  ['super', 'su2pR0'],
  ['anti', '@2nti0'],
];

function derive(word: string, depth = 0): string[] | null {
  for (const suf of SUFFIXES) {
    const m = suf.re.exec(word);
    if (!m || m[1].length < 2) continue;
    for (const base of suf.bases(m[1])) {
      const hit = dictLookup(base) ?? (depth === 0 ? wrap(derive(base, 1)) : null);
      if (hit) return hit.prons.slice(0, 2).map(suf.apply);
    }
  }
  if (depth === 0) {
    for (const [pre, pp] of PREFIXES) {
      if (word.startsWith(pre) && word.length - pre.length >= 3) {
        const rest = word.slice(pre.length);
        const hit = dictLookup(rest) ?? wrap(derive(rest, 1));
        if (hit) return [pp + hit.prons[0]];
      }
    }
    // compound: two known words, prefer the most balanced split
    let best: string[] | null = null;
    let bestScore = -1;
    for (let i = 3; i <= word.length - 3; i++) {
      const a = dictLookup(word.slice(0, i));
      if (!a) continue;
      const b = dictLookup(word.slice(i));
      if (!b) continue;
      const score = Math.min(i, word.length - i) + (a.freq + b.freq) / 4;
      if (score > bestScore) {
        bestScore = score;
        best = [a.prons[0] + demote(b.prons[0])];
      }
    }
    if (best) return best;
  }
  return null;
}

const wrap = (prons: string[] | null): Pronunciation | null => (prons ? { prons, freq: 0, source: 'derived' } : null);

const cache = new Map<string, Pronunciation>();
const CACHE_MAX = 5000;

/** Normalise a token for lookup: lowercase, straight apostrophes, no accents. */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z']/g, '');
}

/** Always returns something: dictionary entry, a derived form, or a guess. */
export function pronounce(rawWord: string): Pronunciation {
  const word = normalizeWord(rawWord);
  const cached = cache.get(word);
  if (cached) return cached;
  let result: Pronunciation | null = null;
  if (word) {
    const candidates = [word];
    const noLead = word.replace(/^'+/, '');
    const noTrail = word.replace(/'+$/, '');
    const bare = noLead.replace(/'+$/, '');
    for (const c of [noTrail, noLead, bare]) if (c && !candidates.includes(c)) candidates.push(c);
    for (const c of candidates) {
      result = dictLookup(c);
      if (result) break;
    }
    if (!result) {
      for (const c of candidates) {
        result = wrap(derive(c));
        if (result) break;
      }
    }
    if (!result) {
      const g = guessPronunciation(bare || word);
      result = { prons: g ? [g] : [], freq: 0, source: 'guess' };
    }
  } else {
    result = { prons: [], freq: 0, source: 'guess' };
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(word, result);
  return result;
}

export function countSyllables(enc: string): number {
  let n = 0;
  for (const ch of enc) if (isVowel(ch)) n++;
  return n;
}

/** "0", "10", "010" ... one digit per syllable (1 primary, 2 secondary, 0 none). */
export function stressPattern(enc: string): string {
  let out = '';
  for (let i = 0; i < enc.length; i++) {
    if (isVowel(enc[i])) {
      const d = enc[i + 1];
      out += d === '1' || d === '2' ? d : '0';
    }
  }
  return out;
}

/** Phonemes (no stress digits) from the last stressed vowel to the end: the perfect-rhyme key. */
export function rhymeKey(enc: string): string | null {
  let start = -1;
  let secondary = -1;
  let any = -1;
  for (let i = 0; i < enc.length; i++) {
    if (isVowel(enc[i])) {
      any = i;
      if (enc[i + 1] === '1') start = i;
      else if (enc[i + 1] === '2') secondary = i;
    }
  }
  if (start < 0) start = secondary >= 0 ? secondary : any;
  if (start < 0) return null;
  return enc.slice(start).replace(/[012]/g, '');
}
