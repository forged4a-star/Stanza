/**
 * Line analysis: text -> words -> syllables, each syllable carrying its
 * phonemes, stress and the span of characters it covers in the line. Every
 * highlight, count, chord anchor and melody link in the app hangs off this.
 */
import { isVowel } from './arpabet';
import { normalizeWord, pronounce } from './pronounce';

export interface Syllable {
  /** character span in the line text [start, end) */
  start: number;
  end: number;
  onset: string;
  vowel: string;
  coda: string;
  /** lexical stress from the dictionary: 1 primary, 2 secondary, 0 none */
  stress: 0 | 1 | 2;
  /** how strongly it is spoken in the line: 2 strong, 1 medium, 0 weak */
  level: 0 | 1 | 2;
  wordIndex: number;
  /** index within its word */
  indexInWord: number;
}

export interface Word {
  text: string;
  /** normalised form used for lookup */
  norm: string;
  start: number;
  end: number;
  /** index of the word's first syllable in LineInfo.syllables, and how many */
  firstSyl: number;
  sylCount: number;
  functionWord: boolean;
  /** false when the pronunciation was guessed by rules */
  known: boolean;
}

export interface LineInfo {
  text: string;
  words: Word[];
  syllables: Syllable[];
}

export const FUNCTION_WORDS = new Set(
  (
    "a an the of to in on at by for from with and or but as if is am are was were be been it its it's i'm my your his her " +
    "our their me you he she we they him them us that this than so do does did has have had can could will would shall " +
    "should i i'll i've i'd you're you'll you've he's she's we're we'll they're there's that's 's 'cause cause 'til til till " +
    "into onto upon some any when where while who whom which what then there here just 'em em ya y'all yeah oh ooh ah " +
    "uh mm hmm la na da whoa hey"
  ).split(' ')
);

const LEGAL_ONSETS = new Set(
  (
    'pl pr bl br tr dr kl kr gl gr fl fr Tr Sr sl sm sn sp st sk sw tw dw kw gw Tw hw sf ' +
    'py by fy vy ky gy hy my ny ty dy ly sy Ty ' +
    'spl spr str skr skw spy sty sky'
  ).split(' ')
);

export interface PhoneSyllable {
  onset: string;
  vowel: string;
  coda: string;
  stress: 0 | 1 | 2;
}

/** Split an encoded pronunciation into syllables (maximal-onset principle). */
export function syllabify(enc: string): PhoneSyllable[] {
  const phones: string[] = [];
  const stresses: number[] = [];
  for (const ch of enc) {
    if (ch >= '0' && ch <= '2') stresses[phones.length - 1] = Number(ch);
    else phones.push(ch);
  }
  const vowelPos: number[] = [];
  for (let i = 0; i < phones.length; i++) if (isVowel(phones[i])) vowelPos.push(i);
  const out: PhoneSyllable[] = [];
  if (!vowelPos.length) return out;
  let onsetStart = 0;
  for (let k = 0; k < vowelPos.length; k++) {
    const v = vowelPos[k];
    const onset = phones.slice(onsetStart, v).join('');
    let coda = '';
    if (k === vowelPos.length - 1) {
      coda = phones.slice(v + 1).join('');
      onsetStart = phones.length;
    } else {
      const cluster = phones.slice(v + 1, vowelPos[k + 1]).join('');
      let cut = 0;
      for (; cut < cluster.length; cut++) {
        const cand = cluster.slice(cut);
        if (cand.length === 1 ? cand !== 'G' : LEGAL_ONSETS.has(cand)) break;
      }
      coda = cluster.slice(0, cut);
      onsetStart = v + 1 + cut;
    }
    out.push({ onset, vowel: phones[v], coda, stress: (stresses[v] ?? 0) as 0 | 1 | 2 });
  }
  return out;
}

const VOWEL_LETTERS = 'aeiouy';
const ONSET_PAIRS = new Set('tr dr pr br cr gr fr pl bl cl gl fl st sp sc sk sm sn sw tw'.split(' '));
const DIGRAPHS = new Set('ch sh th ph wh gh'.split(' '));

/**
 * Split a spelled word into `n` chunks that line up with its syllables. This is
 * for display only (which letters to colour), so it is heuristic: vowel groups
 * are nuclei, silent e's are folded in, and consonants split the usual way.
 * Returns the end offset of each chunk (the last is always word.length).
 */
export function splitSpelling(word: string, n: number): number[] {
  const len = word.length;
  if (n <= 1 || len <= 1) return fill(n, len);
  const w = word.toLowerCase();
  const isV = (i: number) => {
    const ch = w[i];
    if (!ch || !VOWEL_LETTERS.includes(ch)) return false;
    if (ch === 'y') {
      if (i === 0) return false;
      const next = w[i + 1];
      if (next && 'aeiou'.includes(next)) return false;
    }
    return true;
  };
  let nuclei: [number, number][] = [];
  for (let i = 0; i < len; ) {
    if (isV(i)) {
      let j = i + 1;
      while (j < len && isV(j)) j++;
      nuclei.push([i, j]);
      i = j;
    } else i++;
  }
  // "qu": the u is not a nucleus
  nuclei = nuclei
    .map(([a, b]): [number, number] => (w[a] === 'u' && a > 0 && w[a - 1] === 'q' ? [a + 1, b] : [a, b]))
    .filter(([a, b]) => b > a);

  const isSingleE = (k: number) => nuclei[k][1] - nuclei[k][0] === 1 && w[nuclei[k][0]] === 'e';
  if (nuclei.length > n && nuclei.length > 1) {
    const k = nuclei.length - 1;
    const [a] = nuclei[k];
    // silent final e ("time"), but not consonant + le ("table")
    if (isSingleE(k) && a === len - 1 && !(w[len - 2] === 'l' && len >= 3 && !isV(len - 3))) nuclei.pop();
    // silent e in -ed / -es
    else if (isSingleE(k) && a === len - 2 && (w[len - 1] === 'd' || w[len - 1] === 's')) nuclei.pop();
  }
  // still too many: drop interior single e's (lovely, careful), then merge from the end
  while (nuclei.length > n) {
    let drop = -1;
    for (let k = nuclei.length - 2; k >= 1; k--) {
      if (isSingleE(k)) {
        drop = k;
        break;
      }
    }
    if (drop < 0) drop = nuclei.length - 1;
    if (nuclei.length <= 1) break;
    nuclei.splice(drop, 1);
  }
  // too few: split the longest vowel group (li-on, po-et, cre-ate)
  while (nuclei.length < n) {
    let best = -1;
    let bestLen = 1;
    for (let k = nuclei.length - 1; k >= 0; k--) {
      const l = nuclei[k][1] - nuclei[k][0];
      if (l > bestLen) {
        best = k;
        bestLen = l;
      }
    }
    if (best < 0) break;
    const [a, b] = nuclei[best];
    nuclei.splice(best, 1, [a, a + 1], [a + 1, b]);
  }
  if (nuclei.length !== n) {
    // syllabic consonant at the end (rhy-thm, pri-sm) or nothing sensible: split evenly
    return fill(n, len);
  }
  const ends: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const a = nuclei[k][1];
    const b = nuclei[k + 1][0];
    const cs = w.slice(a, b);
    let take = 0;
    if (cs.length === 1) take = 1;
    else if (cs.length >= 2) {
      const last2 = cs.slice(-2);
      const finalLe = b === len - 1 && w[b] === 'e' && cs.endsWith('l');
      if (finalLe) take = Math.min(2, cs.length);
      else if (cs.endsWith('ck') || cs.endsWith('ng')) take = 0;
      else if (DIGRAPHS.has(last2)) take = 2;
      else if (cs.length >= 3 && ONSET_PAIRS.has(last2)) take = 2;
      else take = 1;
    }
    ends.push(Math.max(a, b - take));
  }
  ends.push(len);
  return ends;
}

function fill(n: number, len: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= n; k++) out.push(k === n ? len : Math.max(1, Math.round((len * k) / n)));
  return out;
}

const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = ' ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');

/** 0..999999 spoken; years 1100-1999 as "nineteen ninety nine". */
export function numberToWords(num: number): string[] {
  if (!Number.isFinite(num) || num < 0 || num > 999999) return [];
  if (num < 20) return [ONES[num]];
  if (num < 100) return num % 10 ? [TENS[Math.floor(num / 10)], ONES[num % 10]] : [TENS[num / 10]];
  if (num >= 1100 && num < 2000 && num % 100 !== 0) {
    return [...numberToWords(Math.floor(num / 100)), ...(num % 100 < 10 ? ['oh'] : []), ...numberToWords(num % 100)];
  }
  if (num < 1000) {
    const rest = num % 100;
    return [ONES[Math.floor(num / 100)], 'hundred', ...(rest ? numberToWords(rest) : [])];
  }
  const rest = num % 1000;
  return [...numberToWords(Math.floor(num / 1000)), 'thousand', ...(rest ? numberToWords(rest) : [])];
}

const TOKEN = /['‘’]?[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['‘’][A-Za-zÀ-ÖØ-öø-ÿ]+)*['‘’]?|\d+/g;

const cache = new Map<string, LineInfo>();
const CACHE_MAX = 3000;

export function analyzeLine(text: string): LineInfo {
  const cached = cache.get(text);
  if (cached) return cached;
  const words: Word[] = [];
  const syllables: Syllable[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text))) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;
    const wordIndex = words.length;
    const firstSyl = syllables.length;
    let known = true;
    let norm = '';
    let functionWord = false;
    let parts: PhoneSyllable[] = [];
    if (/^\d+$/.test(raw)) {
      norm = raw;
      for (const w of numberToWords(Number(raw))) parts.push(...syllabify(pronounce(w).prons[0] ?? ''));
    } else {
      norm = normalizeWord(raw);
      const p = pronounce(norm);
      known = p.source !== 'guess';
      parts = syllabify(p.prons[0] ?? '');
      functionWord = FUNCTION_WORDS.has(norm) || FUNCTION_WORDS.has(norm.replace(/^'|'$/g, ''));
    }
    // letters only (skip quote marks at the edges) for the spelling split
    let ls = 0;
    let le = raw.length;
    while (ls < le && !/[A-Za-z0-9À-ÿ]/.test(raw[ls])) ls++;
    while (le > ls && !/[A-Za-z0-9À-ÿ']/.test(raw[le - 1])) le--;
    const ends = splitSpelling(raw.slice(ls, le), parts.length);
    const mono = parts.length === 1;
    for (let k = 0; k < parts.length; k++) {
      const ps = parts[k];
      const s = k === 0 ? start : start + ls + ends[k - 1];
      const e = k === parts.length - 1 ? end : start + ls + ends[k];
      let level: 0 | 1 | 2;
      if (mono) level = functionWord ? 0 : 2;
      else level = ps.stress === 1 ? 2 : ps.stress === 2 ? 1 : 0;
      syllables.push({ start: s, end: Math.max(s, e), onset: ps.onset, vowel: ps.vowel, coda: ps.coda, stress: ps.stress, level, wordIndex, indexInWord: k });
    }
    words.push({ text: raw, norm, start, end, firstSyl, sylCount: parts.length, functionWord, known });
  }
  const info: LineInfo = { text, words, syllables };
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(text, info);
  return info;
}

export const syllableCount = (text: string): number => analyzeLine(text).syllables.length;

/** "/ x x /" style pattern: one mark per syllable. */
export function stressMarks(text: string): (0 | 1 | 2)[] {
  return analyzeLine(text).syllables.map((s) => s.level);
}

/** Index of the syllable covering a character offset, or the nearest one after it. */
export function syllableAtOffset(info: LineInfo, offset: number): number {
  const syls = info.syllables;
  for (let i = 0; i < syls.length; i++) {
    if (offset < syls[i].end) return i;
  }
  return syls.length - 1;
}

/** The word under a caret position (or just before it). */
export function wordAtOffset(info: LineInfo, offset: number): Word | null {
  let best: Word | null = null;
  for (const w of info.words) {
    if (offset >= w.start && offset <= w.end) return w;
    if (w.end <= offset) best = w;
  }
  return best;
}
