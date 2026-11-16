/**
 * Phoneme inventory. Internally every phoneme is one character ("code") so that
 * pronunciations are compact strings; ARPAbet and IPA are for display only.
 * Keep CODE in sync with scripts/build-data.mjs.
 */

export interface PhoneInfo {
  code: string;
  arpa: string;
  ipa: string;
  example: string;
  vowel: boolean;
}

const TABLE: [arpa: string, code: string, ipa: string, example: string][] = [
  ['AA', 'a', 'ɑ', 'father'],
  ['AE', '@', 'æ', 'cat'],
  ['AH', 'A', 'ʌ', 'love'],
  ['AO', 'c', 'ɔ', 'law'],
  ['AW', 'W', 'aʊ', 'now'],
  ['AY', 'Y', 'aɪ', 'my'],
  ['EH', 'E', 'ɛ', 'bed'],
  ['ER', 'R', 'ɝ', 'her'],
  ['EY', 'e', 'eɪ', 'say'],
  ['IH', 'I', 'ɪ', 'sit'],
  ['IY', 'i', 'i', 'see'],
  ['OW', 'o', 'oʊ', 'go'],
  ['OY', 'O', 'ɔɪ', 'boy'],
  ['UH', 'U', 'ʊ', 'good'],
  ['UW', 'u', 'u', 'blue'],
  ['B', 'b', 'b', 'be'],
  ['CH', 'C', 'tʃ', 'cheese'],
  ['D', 'd', 'd', 'day'],
  ['DH', 'D', 'ð', 'the'],
  ['F', 'f', 'f', 'fee'],
  ['G', 'g', 'g', 'go'],
  ['HH', 'h', 'h', 'he'],
  ['JH', 'J', 'dʒ', 'joy'],
  ['K', 'k', 'k', 'key'],
  ['L', 'l', 'l', 'lie'],
  ['M', 'm', 'm', 'me'],
  ['N', 'n', 'n', 'no'],
  ['NG', 'G', 'ŋ', 'sing'],
  ['P', 'p', 'p', 'pay'],
  ['R', 'r', 'r', 'run'],
  ['S', 's', 's', 'see'],
  ['SH', 'S', 'ʃ', 'she'],
  ['T', 't', 't', 'tea'],
  ['TH', 'T', 'θ', 'thin'],
  ['V', 'v', 'v', 'very'],
  ['W', 'w', 'w', 'we'],
  ['Y', 'y', 'j', 'yes'],
  ['Z', 'z', 'z', 'zoo'],
  ['ZH', 'Z', 'ʒ', 'vision'],
];

export const VOWEL_CODES = 'a@AcWYEReIioOUu';
export const CONSONANT_CODES = 'bCdDfghJklmnGprsStTvwyzZ';

export const PHONES: Record<string, PhoneInfo> = {};
export const ARPA_TO_CODE: Record<string, string> = {};
for (const [arpa, code, ipa, example] of TABLE) {
  PHONES[code] = { code, arpa, ipa, example, vowel: VOWEL_CODES.includes(code) };
  ARPA_TO_CODE[arpa] = code;
}

export const isVowel = (code: string): boolean => VOWEL_CODES.indexOf(code) >= 0;

/** "F AY1 ER0" -> "fY1R0" */
export function encodeArpabet(arpa: string): string {
  let out = '';
  for (const tok of arpa.trim().split(/\s+/)) {
    const m = /^([A-Z]+)([012])?$/.exec(tok);
    if (!m || !ARPA_TO_CODE[m[1]]) throw new Error(`Unknown phoneme: ${tok}`);
    out += ARPA_TO_CODE[m[1]] + (m[2] ?? '');
  }
  return out;
}

/** "fY1R0" -> "F AY1 ER0" */
export function decodeToArpabet(enc: string): string {
  const out: string[] = [];
  for (const ch of enc) {
    if (ch >= '0' && ch <= '2') out[out.length - 1] += ch;
    else out.push(PHONES[ch]?.arpa ?? '?');
  }
  return out.join(' ');
}

/** "fY1R0" -> "ˈfaɪɝ" (stress marks before the stressed syllable's vowel, approximately) */
export function toIpa(enc: string): string {
  let out = '';
  for (let i = 0; i < enc.length; i++) {
    const ch = enc[i];
    if (ch >= '0' && ch <= '2') continue;
    const stress = enc[i + 1];
    if (stress === '1') out += 'ˈ';
    else if (stress === '2') out += 'ˌ';
    out += PHONES[ch]?.ipa ?? '';
  }
  return out;
}

// ------------------------------------------------------------------ similarity

/** Vowel features: [height 0-3 (open→close), backness 0-2 (front→back), rounded, diphthong] */
const VOWEL_FEATURES: Record<string, [number, number, number, number]> = {
  i: [3, 0, 0, 0],
  I: [2.5, 0, 0, 0],
  e: [2, 0, 0, 1],
  E: [1.5, 0, 0, 0],
  '@': [0.5, 0, 0, 0],
  a: [0, 2, 0, 0],
  A: [1.2, 1, 0, 0],
  c: [1, 2, 1, 0],
  o: [2, 2, 1, 1],
  U: [2.5, 2, 1, 0],
  u: [3, 2, 1, 0],
  R: [1.5, 1, 0.5, 0],
  Y: [0.5, 1, 0, 1],
  W: [0.5, 1.2, 0.5, 1],
  O: [1.5, 1.6, 1, 1],
};

const vowelSimCache = new Map<string, number>();

/** 1 = same vowel, 0 = unrelated. Neighbouring vowels (sit/see, bed/bad) score in between. */
export function vowelSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const key = a < b ? a + b : b + a;
  // cot/caught: merged for most North American singers
  if (key === 'ac') return 0.92;
  const hit = vowelSimCache.get(key);
  if (hit !== undefined) return hit;
  const fa = VOWEL_FEATURES[a];
  const fb = VOWEL_FEATURES[b];
  let sim = 0;
  if (fa && fb) {
    const d =
      Math.abs(fa[0] - fb[0]) * 0.9 +
      Math.abs(fa[1] - fb[1]) * 0.55 +
      Math.abs(fa[2] - fb[2]) * 0.35 +
      Math.abs(fa[3] - fb[3]) * 0.8;
    sim = Math.max(0, 0.85 - d * 0.55);
  }
  vowelSimCache.set(key, sim);
  return sim;
}

type Manner = 'stop' | 'fric' | 'affr' | 'nasal' | 'liquid' | 'glide';
/** [manner, place, voiced] */
const CONS_FEATURES: Record<string, [Manner, string, boolean]> = {
  p: ['stop', 'lab', false],
  b: ['stop', 'lab', true],
  t: ['stop', 'alv', false],
  d: ['stop', 'alv', true],
  k: ['stop', 'vel', false],
  g: ['stop', 'vel', true],
  f: ['fric', 'lab', false],
  v: ['fric', 'lab', true],
  T: ['fric', 'den', false],
  D: ['fric', 'den', true],
  s: ['fric', 'alv', false],
  z: ['fric', 'alv', true],
  S: ['fric', 'pal', false],
  Z: ['fric', 'pal', true],
  h: ['fric', 'glo', false],
  C: ['affr', 'pal', false],
  J: ['affr', 'pal', true],
  m: ['nasal', 'lab', true],
  n: ['nasal', 'alv', true],
  G: ['nasal', 'vel', true],
  l: ['liquid', 'alv', true],
  r: ['liquid', 'pal', true],
  w: ['glide', 'lab', true],
  y: ['glide', 'pal', true],
};

/** 1 = same consonant; voicing pairs (t/d) ≈ 0.8; same manner (m/n) ≈ 0.6. */
export function consonantSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const fa = CONS_FEATURES[a];
  const fb = CONS_FEATURES[b];
  if (!fa || !fb) return 0;
  if (fa[0] === fb[0] && fa[1] === fb[1]) return 0.8;
  if (fa[0] === fb[0]) return 0.6;
  // sibilant affricates vs fricatives at the same place: ch/sh, j/zh
  if (fa[1] === fb[1] && fa[1] === 'pal' && fa[0] !== 'liquid' && fb[0] !== 'liquid' && fa[0] !== 'glide' && fb[0] !== 'glide')
    return 0.55;
  if (fa[1] === fb[1] && fa[2] === fb[2]) return 0.3;
  return 0;
}

/** Similarity of two consonant clusters (e.g. codas), 0..1, via weighted edit distance. */
export function clusterSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) {
    // open vs closed syllable: a lone trailing s/z (plural) barely matters
    const other = n === 0 ? b : a;
    if (other === 's' || other === 'z') return 0.7;
    return other.length === 1 ? 0.3 : 0.15;
  }
  // dp[i][j] = min cost aligning a[0..i) with b[0..j)
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  const insCost = (ch: string, atEnd: boolean) => (atEnd && (ch === 's' || ch === 'z') ? 0.45 : 1);
  prev[0] = 0;
  for (let j = 1; j <= m; j++) prev[j] = prev[j - 1] + insCost(b[j - 1], j === m);
  for (let i = 1; i <= n; i++) {
    cur[0] = prev[0] + insCost(a[i - 1], i === n);
    for (let j = 1; j <= m; j++) {
      const sub = prev[j - 1] + (1 - consonantSimilarity(a[i - 1], b[j - 1]));
      const del = prev[j] + insCost(a[i - 1], i === n);
      const ins = cur[j - 1] + insCost(b[j - 1], j === m);
      cur[j] = Math.min(sub, del, ins);
    }
    [prev, cur] = [cur, prev];
  }
  return Math.max(0, 1 - prev[m] / Math.max(n, m));
}

/** Closed (high) vowels: hard to sustain loudly, especially up high. */
export const CLOSED_VOWELS = 'iIuUR';
export const OPEN_VOWELS = 'a@AcWYEeoO';
