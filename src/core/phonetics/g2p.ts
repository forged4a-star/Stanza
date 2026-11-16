/**
 * Rule-based grapheme-to-phoneme fallback for words the CMU dictionary does not
 * know (slang, coinages, names). Deliberately simple: it aims to get the
 * syllable count, the stressed vowel and the ending right, which is what
 * syllable counting and rhyme detection depend on.
 *
 * Output is an encoded pronunciation (see arpabet.ts), e.g. "blI1GkI0G".
 */
import { isVowel } from './arpabet';

interface Rule {
  /** letters to match at the current position */
  g: string;
  /** phoneme codes produced */
  p: string;
  /** optional context guards */
  start?: boolean;
  end?: boolean;
  /** next letter must be one of */
  before?: string;
  /** previous letter must be one of */
  after?: string;
}

const V = 'aeiouy';
const FRONT = 'eiy';

// Longest graphemes first within each letter. Contexts keep it from over-firing.
const RULES: Rule[] = [
  // --- endings and big chunks
  { g: 'tion', p: 'SAn' },
  { g: 'ssion', p: 'SAn' },
  { g: 'sion', p: 'ZAn', after: V },
  { g: 'sion', p: 'SAn' },
  { g: 'cian', p: 'SAn' },
  { g: 'cious', p: 'SAs' },
  { g: 'tious', p: 'SAs' },
  { g: 'ture', p: 'CR', end: true },
  { g: 'sure', p: 'ZR', end: true, after: V },
  { g: 'ought', p: 'ct' },
  { g: 'aught', p: 'ct' },
  { g: 'ough', p: 'o', end: true },
  { g: 'ough', p: 'Af' },
  { g: 'eigh', p: 'e' },
  { g: 'augh', p: 'c' },
  { g: 'igh', p: 'Y' },
  { g: 'tch', p: 'C' },
  { g: 'dge', p: 'J' },
  { g: 'dg', p: 'J' },
  { g: 'ous', p: 'As', end: true },
  { g: 'ing', p: 'IG', end: true },
  { g: 'ings', p: 'IGz', end: true },
  { g: 'ed', p: 'Id', end: true, after: 'td' },
  { g: 'ed', p: 't', end: true, after: 'pkfsxc' },
  { g: 'ed', p: 't', end: true, after: 'h' },
  { g: 'ed', p: 'd', end: true, after: 'bglmnrvwzy' },
  { g: 'es', p: 'Iz', end: true, after: 'sxzh' },
  { g: 'es', p: 'Iz', end: true, after: 'c' },
  { g: 'es', p: 'z', end: true },
  { g: 'le', p: 'Al', end: true, after: 'bcdfgkpstz' },
  { g: 'les', p: 'Alz', end: true, after: 'bcdfgkpstz' },
  { g: 'ey', p: 'i', end: true },
  { g: 'ies', p: 'iz', end: true },
  { g: 'ied', p: 'id', end: true },
  { g: 'ie', p: 'i', end: true },
  { g: 'ee', p: 'i' },
  { g: 'ea', p: 'i' },
  { g: 'oo', p: 'u' },
  { g: 'ou', p: 'W' },
  { g: 'ow', p: 'o', end: true },
  { g: 'ow', p: 'W' },
  { g: 'oi', p: 'O' },
  { g: 'oy', p: 'O' },
  { g: 'ai', p: 'e' },
  { g: 'ay', p: 'e' },
  { g: 'au', p: 'c' },
  { g: 'aw', p: 'c' },
  { g: 'oa', p: 'o' },
  { g: 'oe', p: 'o', end: true },
  { g: 'ue', p: 'u', end: true },
  { g: 'ui', p: 'u' },
  { g: 'ew', p: 'u' },
  { g: 'eu', p: 'u' },
  { g: 'ei', p: 'e' },
  // --- r-coloured vowels
  { g: 'air', p: 'Er' },
  { g: 'are', p: 'Er', end: true },
  { g: 'ear', p: 'Ir' },
  { g: 'eer', p: 'Ir' },
  { g: 'ier', p: 'Ir', end: true },
  { g: 'ire', p: 'YR', end: true },
  { g: 'ore', p: 'cr', end: true },
  { g: 'oar', p: 'cr' },
  { g: 'our', p: 'WR' },
  { g: 'ure', p: 'Ur', end: true },
  { g: 'arr', p: '@r', before: V },
  { g: 'err', p: 'Er', before: V },
  { g: 'orr', p: 'cr', before: V },
  { g: 'ar', p: 'ar' },
  { g: 'or', p: 'cr' },
  { g: 'er', p: 'R' },
  { g: 'ir', p: 'R' },
  { g: 'ur', p: 'R' },
  { g: 'yr', p: 'R' },
  // --- consonant digraphs
  { g: 'sch', p: 'sk' },
  { g: 'ch', p: 'C' },
  { g: 'sh', p: 'S' },
  { g: 'th', p: 'T' },
  { g: 'ph', p: 'f' },
  { g: 'wh', p: 'w' },
  { g: 'gh', p: 'g', start: true },
  { g: 'gh', p: '' },
  { g: 'ck', p: 'k' },
  { g: 'ng', p: 'G', end: true },
  { g: 'ngs', p: 'Gz', end: true },
  { g: 'nk', p: 'Gk' },
  { g: 'qu', p: 'kw' },
  { g: 'kn', p: 'n', start: true },
  { g: 'gn', p: 'n', start: true },
  { g: 'wr', p: 'r', start: true },
  { g: 'ps', p: 's', start: true },
  { g: 'mb', p: 'm', end: true },
  { g: 'sc', p: 's', before: FRONT },
  { g: 'cc', p: 'ks', before: FRONT },
  { g: 'ce', p: 's', end: true },
  { g: 'ge', p: 'J', end: true },
  { g: 'se', p: 'z', end: true, after: V },
  { g: 've', p: 'v', end: true },
  { g: 'c', p: 's', before: FRONT },
  { g: 'c', p: 'k' },
  { g: 'g', p: 'J', before: 'ey' },
  { g: 'g', p: 'g' },
  { g: 'x', p: 'z', start: true },
  { g: 'x', p: 'ks' },
  { g: 'j', p: 'J' },
  { g: 'q', p: 'k' },
  { g: 's', p: 'z', end: true, after: 'bdglmnrvwaeiouy' },
  { g: 's', p: 's' },
  { g: 'y', p: 'y', start: true },
  { g: 'y', p: 'y', after: V, before: V },
  { g: 'b', p: 'b' },
  { g: 'd', p: 'd' },
  { g: 'f', p: 'f' },
  { g: 'h', p: 'h' },
  { g: 'k', p: 'k' },
  { g: 'l', p: 'l' },
  { g: 'm', p: 'm' },
  { g: 'n', p: 'n' },
  { g: 'p', p: 'p' },
  { g: 'r', p: 'r' },
  { g: 't', p: 't' },
  { g: 'v', p: 'v' },
  { g: 'w', p: 'w' },
  { g: 'z', p: 'z' },
];

const RULES_BY_LETTER = new Map<string, Rule[]>();
for (const r of RULES) {
  const k = r.g[0];
  if (!RULES_BY_LETTER.has(k)) RULES_BY_LETTER.set(k, []);
  RULES_BY_LETTER.get(k)!.push(r);
}
for (const list of RULES_BY_LETTER.values()) list.sort((a, b) => b.g.length - a.g.length);

const SHORT: Record<string, string> = { a: '@', e: 'E', i: 'I', o: 'a', u: 'A', y: 'I' };
const LONG: Record<string, string> = { a: 'e', e: 'i', i: 'Y', o: 'o', u: 'u', y: 'Y' };

function isCons(ch: string | undefined): boolean {
  return !!ch && ch >= 'a' && ch <= 'z' && !V.includes(ch);
}

/** Single vowel letter in context -> phoneme. */
function vowelSound(w: string, i: number): string {
  const ch = w[i];
  const next = w[i + 1];
  const next2 = w[i + 2];
  const atEnd = i === w.length - 1;
  if (ch === 'e' && atEnd) {
    // silent final e, except in short words like "me", "she", "be"
    const hasOtherVowel = /[aeiouy]/.test(w.slice(0, i));
    return hasOtherVowel ? '' : 'i';
  }
  if (ch === 'y' && atEnd) return /[aeiou]/.test(w.slice(0, i)) ? 'i' : 'Y';
  if (ch === 'o' && atEnd) return 'o';
  if (ch === 'a' && atEnd) return 'A';
  if (ch === 'i' && atEnd) return 'i';
  if (ch === 'u' && atEnd) return 'u';
  if (w.startsWith('tion', i + 1) && 'aou'.includes(ch)) return LONG[ch];
  if (w.startsWith('tion', i + 1) && ch === 'e') return 'i';
  // magic e: vowel + single consonant + final e ("time", "hope"), also before -es/-ed
  if (isCons(next) && next2 === 'e') {
    const rest = w.slice(i + 3);
    if (rest === '' || rest === 's' || rest === 'd') return LONG[ch];
  }
  // open syllable before a single consonant + vowel in the middle ("ba-by", "o-pen")
  if (isCons(next) && next2 && V.includes(next2) && next !== 'x' && i === firstVowelIndex(w)) {
    // only for the first vowel of a short word; otherwise stay short
    if (w.length <= 5 && ch !== 'e') return LONG[ch];
  }
  // "i" before nd/ld ("find", "wild"), "o" before ld/st ("cold", "most")
  if (ch === 'i' && (w.startsWith('nd', i + 1) || w.startsWith('ld', i + 1)) && i + 3 >= w.length) return 'Y';
  if (ch === 'o' && (w.startsWith('ld', i + 1) || w.startsWith('st', i + 1) || w.startsWith('ll', i + 1)) && i + 3 >= w.length)
    return 'o';
  if (ch === 'a' && w.startsWith('ll', i + 1)) return 'c';
  return SHORT[ch];
}

function firstVowelIndex(w: string): number {
  for (let i = 0; i < w.length; i++) if (V.includes(w[i]) && !(w[i] === 'y' && i === 0)) return i;
  return -1;
}

function lettersToPhones(w: string): string {
  let out = '';
  let i = 0;
  while (i < w.length) {
    const ch = w[i];
    if (ch < 'a' || ch > 'z') {
      i++;
      continue;
    }
    // doubled consonant -> single
    if (isCons(ch) && w[i + 1] === ch && ch !== 'c') {
      i++;
      continue;
    }
    let matched = false;
    for (const r of RULES_BY_LETTER.get(ch) ?? []) {
      if (!w.startsWith(r.g, i)) continue;
      if (r.start && i !== 0) continue;
      if (r.end && i + r.g.length !== w.length) continue;
      if (r.before !== undefined && !(w[i + r.g.length] && r.before.includes(w[i + r.g.length]))) continue;
      if (r.after !== undefined && !(i > 0 && r.after.includes(w[i - 1]))) continue;
      // a single-letter consonant rule for 'y' must not swallow vowel y
      out += r.p;
      i += r.g.length;
      matched = true;
      break;
    }
    if (matched) continue;
    if (V.includes(ch)) {
      out += vowelSound(w, i);
    }
    i++;
  }
  return out;
}

const FINAL_STRESS = /(ee|eer|ese|ette|oon|ique|esque|aire)$/;
const PRE_SUFFIX_STRESS = /(tion|sion|cian|ic|ical|ity|ial|ian|ious|eous|ify|itive|graphy|logy)$/;
const WEAK_PREFIX = /^(a|be|de|re|un|ex|en|em|in|im|con|com|pre|pro|dis|mis|for|sur|per)(?=[^aeiou])/;

function assignStress(w: string, phones: string): string {
  const vowelIdx: number[] = [];
  for (let i = 0; i < phones.length; i++) if (isVowel(phones[i])) vowelIdx.push(i);
  const n = vowelIdx.length;
  if (n === 0) return phones;
  let primary = 0;
  if (n === 1) primary = 0;
  else if (FINAL_STRESS.test(w)) primary = n - 1;
  else if (PRE_SUFFIX_STRESS.test(w)) {
    const m = PRE_SUFFIX_STRESS.exec(w)![1];
    const sufSyl = m === 'ical' || m === 'ity' || m === 'ify' || m === 'itive' || m === 'graphy' || m === 'logy' ? 2 : m === 'ial' || m === 'ian' || m === 'ious' || m === 'eous' ? (n >= 3 ? 2 : 1) : 1;
    primary = Math.max(0, n - sufSyl - 1);
    if (m === 'graphy' || m === 'logy') primary = Math.max(0, n - 3);
  } else if (n === 2) primary = WEAK_PREFIX.test(w) && !/(er|le|y|ow|en|et|el|al|or|ing|ed)$/.test(w) ? 1 : 0;
  else if (n === 3) primary = WEAK_PREFIX.test(w) ? 1 : 0;
  else primary = n - 3;

  let out = '';
  let v = 0;
  for (let i = 0; i < phones.length; i++) {
    out += phones[i];
    if (isVowel(phones[i])) {
      out += v === primary ? '1' : '0';
      v++;
    }
  }
  return out;
}

/** Best-effort pronunciation for an unknown word (lowercase letters/apostrophes). */
export function guessPronunciation(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  let phones = lettersToPhones(w);
  if (!/[a@AcWYEReIioOUu]/.test(phones)) {
    // no vowel at all ("hmm", "shh", "brr"): treat as one syllable around a schwa
    phones = phones.length ? phones[0] + 'A' + phones.slice(1) : 'A';
  }
  return assignStress(w, phones);
}
