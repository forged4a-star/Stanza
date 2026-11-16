/**
 * Offline word tools: rhymes (perfect / near / multisyllabic), thesaurus,
 * definitions and related words. All data is bundled; nothing hits the network.
 */
import wnData from '../../data/wordnet.json';
import { SortedLines } from '../util/sortedLines';
import { dictLookup, normalizeWord, pronounce, rhymeIndex, rhymeKey, stressPattern, countSyllables } from './pronounce';
import { parseTail, tailScore } from './sound';

export interface WordHit {
  word: string;
  syllables: number;
  /** "10", "010" ... */
  stress: string;
  freq: number;
  /** 0..1, how close the sound is (1 for perfect rhymes) */
  score: number;
}

export interface WordFilter {
  syllables?: number | null;
  /** exact stress pattern, e.g. "10"; secondary stress (2) counts as stressed */
  stress?: string | null;
  limit?: number;
}

const normStress = (s: string) => s.replace(/2/g, '1');

function makeHit(word: string, score: number): WordHit | null {
  const p = dictLookup(word);
  if (!p) return null;
  const enc = p.prons[0];
  return { word, syllables: countSyllables(enc), stress: stressPattern(enc), freq: p.freq, score };
}

function applyFilter(hits: WordHit[], f: WordFilter): WordHit[] {
  let out = hits;
  if (f.syllables) out = out.filter((h) => h.syllables === f.syllables);
  if (f.stress) out = out.filter((h) => normStress(h.stress) === normStress(f.stress!));
  return out.slice(0, f.limit ?? 200);
}

const isPlain = (w: string) => /^[a-z][a-z']*$/.test(w) && !w.endsWith("'s");

/** Perfect rhymes: identical sound from the last stressed vowel on. */
export function perfectRhymes(rawWord: string, filter: WordFilter = {}): WordHit[] {
  const word = normalizeWord(rawWord);
  const p = pronounce(word);
  const seen = new Set<string>([word]);
  const hits: WordHit[] = [];
  for (const enc of p.prons) {
    const key = rhymeKey(enc);
    if (!key) continue;
    const list = rhymeIndex.get(key);
    if (!list) continue;
    for (const w of list.split(' ')) {
      if (seen.has(w) || !isPlain(w)) continue;
      // "fire" should not suggest "campfire"; "light" should not suggest "delight"... keep those, but drop pure suffix copies
      if (w.endsWith(word) && w.length > word.length) continue;
      seen.add(w);
      const h = makeHit(w, 1);
      if (h) hits.push(h);
    }
  }
  hits.sort((a, b) => b.freq - a.freq || a.syllables - b.syllables);
  return applyFilter(hits, filter);
}

/** Near (slant) rhymes: similar stressed vowel and ending, ranked by closeness. */
export function nearRhymes(rawWord: string, filter: WordFilter = {}): WordHit[] {
  const word = normalizeWord(rawWord);
  const p = pronounce(word);
  const key = p.prons[0] ? rhymeKey(p.prons[0]) : null;
  if (!key) return [];
  const target = parseTail(key);
  const perfectKeys = new Set(p.prons.map(rhymeKey));
  const scored: { key: string; score: number }[] = [];
  rhymeIndex.scanAll((k) => {
    if (perfectKeys.has(k)) return;
    const t = parseTail(k);
    if (Math.abs(t.length - target.length) > 1) return;
    const s = tailScore(target, t);
    if (s >= 0.62) scored.push({ key: k, score: s });
  });
  scored.sort((a, b) => b.score - a.score);
  const hits: WordHit[] = [];
  const seen = new Set<string>([word]);
  for (const { key: k, score } of scored.slice(0, 120)) {
    const list = rhymeIndex.get(k)!.split(' ');
    let taken = 0;
    for (const w of list) {
      if (taken >= 12) break;
      if (seen.has(w) || !isPlain(w)) continue;
      const h = makeHit(w, score);
      if (!h || h.freq < 2) continue;
      seen.add(w);
      hits.push(h);
      taken++;
    }
  }
  hits.sort((a, b) => b.score - a.score || b.freq - a.freq);
  return applyFilter(hits, { limit: 300, ...filter });
}

/**
 * Multisyllabic rhymes: words/phrases whose last two or more syllables match
 * (vowels identical from the stressed syllable on, e.g. "fantastic" →
 * "elastic", "gymnastic", "plastic" (2), "bombastic").
 */
export function multiRhymes(rawWord: string, filter: WordFilter = {}): WordHit[] {
  const word = normalizeWord(rawWord);
  const p = pronounce(word);
  const enc = p.prons[0];
  if (!enc) return [];
  // Use the vowels from the stressed syllable onward, or the last 2 syllables if the stress is final.
  const syl = countSyllables(enc);
  let key = rhymeKey(enc)!;
  let tail = parseTail(key);
  if (tail.length < 2 && syl >= 2) {
    // extend back one syllable: e.g. "decide" → "-ecide"
    const vowels: number[] = [];
    for (let i = 0; i < enc.length; i++) if ('a@AcWYEReIioOUu'.includes(enc[i])) vowels.push(i);
    key = enc.slice(vowels[vowels.length - 2]).replace(/[012]/g, '');
    tail = parseTail(key);
  }
  if (tail.length < 2) return [];
  const vowelSeq = tail.map((t) => t.v).join('');
  const hits: WordHit[] = [];
  const seen = new Set<string>([word]);
  rhymeIndex.scanAll((k, list) => {
    const t = parseTail(k);
    if (t.length < tail.length) return;
    const tt = t.slice(t.length - tail.length);
    if (tt.map((x) => x.v).join('') !== vowelSeq) return;
    const s = tailScore(tail, tt);
    if (s < 0.7) return;
    for (const w of list.split(' ')) {
      if (seen.has(w) || !isPlain(w)) continue;
      const h = makeHit(w, s);
      if (!h || h.freq < 1) continue;
      seen.add(w);
      hits.push(h);
    }
  });
  hits.sort((a, b) => b.score - a.score || b.freq - a.freq);
  return applyFilter(hits, { limit: 200, ...filter });
}

// ------------------------------------------------------------------ WordNet

const wnWords = new SortedLines((wnData as { words: string }).words);
const wnSynsets = new SortedLines((wnData as { synsets: string }).synsets);

export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb';
const POS: Record<string, PartOfSpeech> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

export interface Sense {
  pos: PartOfSpeech;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  /** broader terms ("dog" → "canine") */
  broader: string[];
  /** narrower terms ("dog" → "puppy", "poodle") */
  narrower: string[];
  /** similar / see-also */
  similar: string[];
}

interface RawSynset {
  pos: string;
  def: string;
  lemmas: string[];
  rel: string;
}

function synsetAt(idx: number): RawSynset | null {
  const line = wnSynsets.lineAt(idx);
  if (!line) return null;
  const [pos, def, lemmas, rel] = line.split('|');
  return { pos, def, lemmas: lemmas ? lemmas.split(',') : [], rel: rel ?? '' };
}

function relTargets(rel: string, sym: string): number[] {
  for (const part of rel.split(';')) {
    if (part.startsWith(sym) && sym !== '!') return part.slice(1).split(',').map((x) => parseInt(x, 36));
  }
  return [];
}

/** Base form for lookup: "running" → "run", "cities" → "city" (very light). */
function lemmaCandidates(w: string): string[] {
  const out = [w];
  const add = (x: string) => x.length > 1 && !out.includes(x) && out.push(x);
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s')) add(w.slice(0, -1));
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) add(w.slice(0, -4));
  }
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  }
  if (w.endsWith("in'")) add(w.slice(0, -1) + 'g');
  return out;
}

export function senses(rawWord: string): { lemma: string; senses: Sense[] } | null {
  const word = normalizeWord(rawWord);
  for (const lemma of lemmaCandidates(word)) {
    const v = wnWords.get(lemma);
    if (!v) continue;
    const list: Sense[] = [];
    for (const id of v.split(',')) {
      const s = synsetAt(parseInt(id, 36));
      if (!s) continue;
      const names = (idxs: number[]) => {
        const out: string[] = [];
        for (const i of idxs) {
          const t = synsetAt(i);
          if (t) for (const l of t.lemmas.slice(0, 3)) if (l !== lemma && !out.includes(l)) out.push(l);
        }
        return out.slice(0, 12);
      };
      const ant = s.rel.split(';').find((p) => p.startsWith('!'));
      list.push({
        pos: POS[s.pos] ?? 'noun',
        definition: s.def,
        synonyms: s.lemmas.filter((l) => l !== lemma),
        antonyms: ant ? ant.slice(1).split(',') : [],
        broader: names(relTargets(s.rel, '@')),
        narrower: names(relTargets(s.rel, '~')),
        similar: names([...relTargets(s.rel, '&'), ...relTargets(s.rel, '^')]),
      });
    }
    if (list.length) return { lemma, senses: list };
  }
  return null;
}

/** Flattened synonyms (all senses), most common sense first, filterable. */
export function synonyms(rawWord: string, filter: WordFilter = {}): WordHit[] {
  const r = senses(rawWord);
  if (!r) return [];
  const seen = new Set<string>();
  const hits: WordHit[] = [];
  r.senses.forEach((s, i) => {
    for (const w of [...s.synonyms, ...s.similar]) {
      if (seen.has(w) || w.includes(' ')) continue;
      seen.add(w);
      const h = makeHit(w, 1 - i * 0.05);
      if (h) hits.push(h);
    }
  });
  return applyFilter(hits, filter);
}

/** Related words: broader, narrower and see-also terms (good for imagery). */
export function relatedWords(rawWord: string, filter: WordFilter = {}): WordHit[] {
  const r = senses(rawWord);
  if (!r) return [];
  const seen = new Set<string>();
  const hits: WordHit[] = [];
  for (const s of r.senses.slice(0, 4)) {
    for (const w of [...s.narrower, ...s.broader, ...s.similar]) {
      if (seen.has(w) || w.includes(' ')) continue;
      seen.add(w);
      const h = makeHit(w, 0.5);
      if (h) hits.push(h);
    }
  }
  hits.sort((a, b) => b.freq - a.freq);
  return applyFilter(hits, filter);
}
