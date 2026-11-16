#!/usr/bin/env node
/**
 * Builds the offline reference data bundled with the app.
 *
 *   scripts/raw/cmudict.dict   (CMU Pronouncing Dictionary, BSD-style licence)
 *   wordnet-db                 (Princeton WordNet 3.1, WordNet licence)
 *   subtlex-word-frequencies   (word frequency ranks, used only for ordering)
 *
 * Output (all plain ASCII, newline-delimited, sorted for binary search):
 *   src/data/cmudict.json  { dict, rhymes }
 *   src/data/wordnet.json  { words, synsets }
 *
 * Run: node scripts/build-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'data');
fs.mkdirSync(out, { recursive: true });

// Keep in sync with src/core/phonetics/arpabet.ts (a unit test checks this).
const CODE = {
  AA: 'a', AE: '@', AH: 'A', AO: 'c', AW: 'W', AY: 'Y', EH: 'E', ER: 'R', EY: 'e',
  IH: 'I', IY: 'i', OW: 'o', OY: 'O', UH: 'U', UW: 'u',
  B: 'b', CH: 'C', D: 'd', DH: 'D', F: 'f', G: 'g', HH: 'h', JH: 'J', K: 'k', L: 'l',
  M: 'm', N: 'n', NG: 'G', P: 'p', R: 'r', S: 's', SH: 'S', T: 't', TH: 'T', V: 'v',
  W: 'w', Y: 'y', Z: 'z', ZH: 'Z',
};
const VOWELS = new Set(['a', '@', 'A', 'c', 'W', 'Y', 'E', 'R', 'e', 'I', 'i', 'o', 'O', 'U', 'u']);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- frequency
const freq = new Map();
for (const { word, count } of require('subtlex-word-frequencies')) {
  const w = word.toLowerCase();
  freq.set(w, Math.max(freq.get(w) ?? 0, count));
}
const freqDigit = (w) => {
  const c = freq.get(w) ?? (w.includes("'") ? (freq.get(w.split("'")[0]) ?? 0) / 3 : 0);
  if (!c || c < 1) return 0;
  return Math.min(9, 1 + Math.floor(Math.log10(c) * 1.4));
};

// ---------------------------------------------------------------- CMU dict
const raw = fs.readFileSync(path.join(root, 'scripts', 'raw', 'cmudict.dict'), 'utf8');
/** word -> encoded pronunciations */
const prons = new Map();
for (const line0 of raw.split('\n')) {
  const line = line0.replace(/#.*$/, '').trim();
  if (!line) continue;
  const parts = line.split(/\s+/);
  let word = parts[0].replace(/\(\d+\)$/, '');
  if (!/^[a-z'.-]+$/.test(word)) continue;
  word = word.replace(/\./g, '');
  if (!word || !/[a-z]/.test(word)) continue;
  let enc = '';
  for (const ph of parts.slice(1)) {
    const m = /^([A-Z]+)([012])?$/.exec(ph);
    if (!m || !CODE[m[1]]) throw new Error('bad phoneme ' + ph + ' in ' + line);
    enc += CODE[m[1]] + (m[2] ?? '');
  }
  if (!prons.has(word)) prons.set(word, []);
  const list = prons.get(word);
  if (!list.includes(enc)) list.push(enc);
}

/** Rhyme key: phonemes (no stress digits) from the last stressed vowel to the end. */
function rhymeKey(enc) {
  let start = -1;
  let anyVowel = -1;
  let secondary = -1;
  for (let i = 0; i < enc.length; i++) {
    if (VOWELS.has(enc[i])) {
      anyVowel = i;
      if (enc[i + 1] === '1') start = i;
      else if (enc[i + 1] === '2') secondary = i;
    }
  }
  if (start < 0) start = secondary >= 0 ? secondary : anyVowel;
  if (start < 0) return null;
  return enc.slice(start).replace(/[012]/g, '');
}

// Words WordNet only knows capitalised (surnames, places): flagged so rhyme
// lists can leave them out.
const properOnly = new Set();
{
  const wnDir0 = path.join(path.dirname(require.resolve('wordnet-db/package.json')), 'dict');
  const lower = new Set();
  const upper = new Set();
  for (const file of ['noun', 'verb', 'adj', 'adv']) {
    const text = fs.readFileSync(path.join(wnDir0, `data.${file}`), 'latin1');
    for (const line of text.split('\n')) {
      if (!line || line.startsWith('  ')) continue;
      const head = line.slice(0, line.indexOf('|')).trim().split(' ');
      const n = parseInt(head[3], 16);
      for (let k = 0, i = 4; k < n; k++, i += 2) {
        const w = head[i].replace(/\((a|p|ip)\)$/, '');
        if (/^[A-Z]/.test(w)) upper.add(w.toLowerCase());
        else lower.add(w);
      }
    }
  }
  for (const w of upper) if (!lower.has(w)) properOnly.add(w);
}

const words = [...prons.keys()].sort(cmp);
const dictLines = [];
const rhymeMap = new Map();
for (const w of words) {
  const list = prons.get(w);
  const f = freqDigit(w);
  dictLines.push(`${w}\t${list.join('/')}\t${f}${properOnly.has(w) ? 'P' : ''}`);
  const seen = new Set();
  for (const enc of list) {
    const key = rhymeKey(enc);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!rhymeMap.has(key)) rhymeMap.set(key, []);
    rhymeMap.get(key).push(w);
  }
}
const rhymeLines = [...rhymeMap.keys()].sort(cmp).map((key) => {
  const ws = rhymeMap.get(key).sort((a, b) => freqDigit(b) - freqDigit(a) || cmp(a, b));
  return `${key}\t${ws.join(' ')}`;
});
const cmu = { dict: dictLines.join('\n'), rhymes: rhymeLines.join('\n') };
fs.writeFileSync(path.join(out, 'cmudict.json'), JSON.stringify(cmu));
console.log(
  `cmudict: ${words.length} words, ${rhymeLines.length} rhyme keys, ` +
    `${((cmu.dict.length + cmu.rhymes.length) / 1e6).toFixed(2)} MB`
);

// ---------------------------------------------------------------- WordNet
const wnDir = path.join(path.dirname(require.resolve('wordnet-db/package.json')), 'dict');
const POS_FILES = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
/** offsetKey (pos+offset) -> synset */
const synsets = new Map();
const clean = (s) => s.replace(/[\t\n|]/g, ' ').replace(/[^\x20-\x7e]/g, '').trim();

for (const [pos, file] of Object.entries(POS_FILES)) {
  const text = fs.readFileSync(path.join(wnDir, `data.${file}`), 'latin1');
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const bar = line.indexOf('|');
    const head = line.slice(0, bar).trim().split(' ');
    const gloss = line.slice(bar + 1).trim();
    const offset = head[0];
    const wCount = parseInt(head[3], 16);
    const lemmas = [];
    let i = 4;
    for (let k = 0; k < wCount; k++, i += 2) lemmas.push(head[i].replace(/\((a|p|ip)\)$/, ''));
    const pCount = parseInt(head[i], 10);
    i++;
    const rels = [];
    for (let k = 0; k < pCount; k++, i += 4) {
      rels.push({ sym: head[i], target: head[i + 2] + head[i + 1], st: head[i + 3] });
    }
    // definition only: drop the quoted usage examples
    let def = gloss.split(/;\s*"/)[0].trim();
    if (def.length > 160) def = def.slice(0, 157).replace(/\s+\S*$/, '') + '...';
    synsets.set(pos + offset, { pos, lemmas, rels, def: clean(def) });
  }
}

const isPlainWord = (l) => /^[a-z][a-z'-]*$/.test(l);
const keepLemma = (l) => isPlainWord(l) && prons.has(l);
const kept = [...synsets.entries()].filter(([, s]) => s.lemmas.some(keepLemma));
// Order by synset key so indices are stable between builds.
kept.sort((a, b) => cmp(a[0], b[0]));
const indexOf = new Map(kept.map(([k], i) => [k, i]));
const displayLemma = (l) => l.replace(/_/g, ' ');
const okSyn = (l) => /^[a-z][a-z'_-]*$/.test(l);

const synsetLines = kept.map(([, s]) => {
  const lemmas = s.lemmas.filter(okSyn).map(displayLemma);
  const ants = new Set();
  const groups = { '@': [], '~': [], '&': [], '^': [] };
  for (const r of s.rels) {
    const targetKey = (r.target.startsWith('s') ? 'a' : r.target[0]) + r.target.slice(1);
    const t = synsets.get(targetKey);
    if (!t) continue;
    if (r.sym === '!') {
      // lexical antonym: st = source word number / target word number (hex)
      const tw = parseInt(r.st.slice(2), 16);
      const lemma = t.lemmas[tw - 1];
      if (lemma && okSyn(lemma)) ants.add(displayLemma(lemma));
    } else if (r.sym === '@' || r.sym === '@i' || r.sym === '~' || r.sym === '&' || r.sym === '^') {
      const idx = indexOf.get(targetKey);
      const g = groups[r.sym[0]];
      if (idx !== undefined && g.length < 14) g.push(idx.toString(36));
    }
  }
  let rel = '';
  if (ants.size) rel += '!' + [...ants].join(',');
  for (const sym of ['@', '~', '&', '^']) if (groups[sym].length) rel += (rel ? ';' : '') + sym + groups[sym].join(',');
  return `${s.pos}|${s.def}|${lemmas.join(',')}|${rel}`;
});

// word -> ordered synset indices (most frequent senses first, per the index files)
const wordSenses = new Map();
for (const [pos, file] of Object.entries(POS_FILES)) {
  const text = fs.readFileSync(path.join(wnDir, `index.${file}`), 'latin1');
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const p = line.trim().split(' ');
    const lemma = p[0];
    if (!keepLemma(lemma)) continue;
    const synCount = parseInt(p[2], 10);
    const ptrCount = parseInt(p[3], 10);
    const tagged = parseInt(p[5 + ptrCount], 10);
    const offsets = p.slice(6 + ptrCount, 6 + ptrCount + synCount);
    // skip senses where the word only appears capitalised (proper nouns: "Holmes", "Logan")
    const idxs = offsets
      .filter((o) => {
        const syn = synsets.get(pos + o);
        return syn && syn.lemmas.some((l) => l === lemma);
      })
      .map((o) => indexOf.get(pos + o))
      .filter((x) => x !== undefined);
    if (!idxs.length) continue;
    if (!wordSenses.has(lemma)) wordSenses.set(lemma, []);
    wordSenses.get(lemma).push({ tagged, idxs });
  }
}
const wordLines = [...wordSenses.keys()].sort(cmp).map((w) => {
  const groups = wordSenses.get(w).sort((a, b) => b.tagged - a.tagged);
  // interleave: first sense of each part of speech, then the rest
  const first = groups.map((g) => g.idxs[0]);
  const rest = groups.flatMap((g) => g.idxs.slice(1));
  const all = [...new Set([...first, ...rest])].slice(0, 12);
  return `${w}\t${all.map((i) => i.toString(36)).join(',')}`;
});

const wn = { words: wordLines.join('\n'), synsets: synsetLines.join('\n') };
fs.writeFileSync(path.join(out, 'wordnet.json'), JSON.stringify(wn));
console.log(
  `wordnet: ${wordLines.length} words, ${synsetLines.length} synsets, ` +
    `${((wn.words.length + wn.synsets.length) / 1e6).toFixed(2)} MB`
);
