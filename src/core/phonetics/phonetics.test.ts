import { describe, expect, it } from 'vitest';
import { clusterSimilarity, decodeToArpabet, encodeArpabet, vowelSimilarity } from './arpabet';
import { guessPronunciation } from './g2p';
import { analyzeLine, splitSpelling, syllabify, syllableCount } from './line';
import { countSyllables, dictLookup, pronounce, rhymeKey, scanDictionary, stressPattern } from './pronounce';

describe('arpabet', () => {
  it('round-trips and matches the bundled data encoding', () => {
    expect(encodeArpabet('F AY1 ER0')).toBe('fY1R0');
    expect(decodeToArpabet('fY1R0')).toBe('F AY1 ER0');
    expect(decodeToArpabet(dictLookup('desire')!.prons[0])).toBe('D IH0 Z AY1 ER0');
  });
  it('ranks similar sounds', () => {
    expect(vowelSimilarity('I', 'i')).toBeGreaterThan(vowelSimilarity('I', 'a'));
    expect(clusterSimilarity('t', 'd')).toBeGreaterThan(clusterSimilarity('t', 'm'));
    expect(clusterSimilarity('nd', 'nt')).toBeGreaterThan(0.8);
    expect(clusterSimilarity('n', 'nz')).toBeGreaterThan(0.7);
  });
});

describe('dictionary', () => {
  it('looks up words, contractions and frequency', () => {
    expect(dictLookup('love')!.prons[0]).toBe('lA1v');
    expect(dictLookup("don't")).not.toBeNull();
    expect(dictLookup('the')!.freq).toBe(9);
    expect(dictLookup('zzzxq')).toBeNull();
  });
  it('derives unknown inflections from known bases', () => {
    const p = pronounce("runnin'");
    expect(decodeToArpabet(p.prons[0])).toBe('R AH1 N IH0 N');
    expect(pronounce('heartbreakingly').source).not.toBe('guess');
    expect(countSyllables(pronounce('unfriended').prons[0])).toBe(3);
  });
  it('computes rhyme keys and stress patterns', () => {
    expect(rhymeKey(dictLookup('desire')!.prons[0])).toBe(rhymeKey(dictLookup('fire')!.prons[0]));
    expect(stressPattern(dictLookup('beautiful')!.prons[0])).toBe('100');
  });
});

describe('fallback phonemizer', () => {
  it('handles made-up words sensibly', () => {
    expect(countSyllables(guessPronunciation('blorptastic'))).toBe(3);
    expect(countSyllables(guessPronunciation('skrrt'))).toBe(1);
    expect(countSyllables(guessPronunciation('zindle'))).toBe(2);
    expect(rhymeKey(guessPronunciation('glime'))).toBe(rhymeKey(dictLookup('time')!.prons[0]));
    expect(rhymeKey(guessPronunciation('flation'))).toBe(rhymeKey(dictLookup('nation')!.prons[0]));
  });
  it('agrees with the dictionary on syllable counts for most common words', () => {
    let total = 0;
    let same = 0;
    let within1 = 0;
    let rhymeSame = 0;
    scanDictionary((word, prons, freq) => {
      if (freq < 3 || word.includes("'") || word.length < 3) return;
      total++;
      const g = guessPronunciation(word);
      const counts = prons.map(countSyllables);
      const n = countSyllables(g);
      if (counts.includes(n)) same++;
      if (counts.some((c) => Math.abs(c - n) <= 1)) within1++;
      if (prons.some((p) => rhymeKey(p) === rhymeKey(g))) rhymeSame++;
    });
    const acc = same / total;
    console.log(`g2p: ${total} words, syllable count exact ${(acc * 100).toFixed(1)}%, within one ${((within1 / total) * 100).toFixed(1)}%, exact rhyme key ${((rhymeSame / total) * 100).toFixed(1)}%`);
    expect(acc).toBeGreaterThan(0.8);
    expect(within1 / total).toBeGreaterThan(0.97);
  });
});

describe('syllables', () => {
  it('syllabifies with maximal onsets', () => {
    expect(syllabify('E1kstrA0').map((s) => s.onset + s.vowel + s.coda)).toEqual(['Ek', 'strA']);
    expect(syllabify('sI1GR0').map((s) => s.onset + s.vowel + s.coda)).toEqual(['sIG', 'R']);
  });
  it('splits spelling to match syllable counts', () => {
    const chunks = (w: string, n: number) => {
      const ends = splitSpelling(w, n);
      return ends.map((e, i) => w.slice(i ? ends[i - 1] : 0, e));
    };
    expect(chunks('beautiful', 3)).toEqual(['beau', 'ti', 'ful']);
    expect(chunks('table', 2)).toEqual(['ta', 'ble']);
    expect(chunks('time', 1)).toEqual(['time']);
    expect(chunks('lonely', 2)).toEqual(['lone', 'ly']);
    expect(chunks('poet', 2)).toEqual(['po', 'et']);
    expect(chunks('heartbreak', 2)).toEqual(['heart', 'break']);
    expect(chunks('rhythm', 2).join('')).toBe('rhythm');
  });
  it('analyses a line into words and syllables with spans', () => {
    const info = analyzeLine("I'm burnin' down the lonely  boulevard, 24 hours");
    expect(info.words.map((w) => w.text)).toEqual(["I'm", "burnin'", 'down', 'the', 'lonely', 'boulevard', '24', 'hours']);
    for (const w of info.words) expect(w.sylCount).toBeGreaterThan(0);
    // spans tile each word and stay inside the text
    for (const w of info.words) {
      const syls = info.syllables.slice(w.firstSyl, w.firstSyl + w.sylCount);
      expect(syls[0].start).toBe(w.start);
      expect(syls[syls.length - 1].end).toBe(w.end);
      for (let i = 1; i < syls.length; i++) expect(syls[i].start).toBe(syls[i - 1].end);
    }
    expect(syllableCount('Hello darkness my old friend')).toBe(7);
    expect(syllableCount('')).toBe(0);
    expect(syllableCount("And I-I will always love you")).toBe(8);
  });
  it('marks stress levels', () => {
    const info = analyzeLine('the beautiful morning');
    expect(info.syllables.map((s) => s.level)).toEqual([0, 2, 0, 0, 2, 0]);
  });
});
