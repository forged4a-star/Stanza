import { describe, expect, it } from 'vitest';
import { multiRhymes, nearRhymes, perfectRhymes, relatedWords, senses, synonyms } from './lookup';
import { analyzeSound, iambicShare, phonemeCounts, repeatedWords, vowelHeatmap, type InputLine } from './sound';

const lines = (texts: string[], section = 's1'): InputLine[] => texts.map((text, i) => ({ id: section + i, sectionId: section, text }));
const words = (hits: { word: string }[]) => hits.map((h) => h.word);

describe('rhyme scheme', () => {
  it('labels ABAB and AABB', () => {
    const abab = analyzeSound(lines(['I walked along the shore at night', 'the water black and cold', 'I held a little flickering light', 'and wished that I was old']));
    expect(abab.scheme).toEqual(['A', 'B', 'A', 'B']);
    const aabb = analyzeSound(lines(['the cat sat on the mat', 'and that was that', 'the dog ran in the fog', 'and jumped across a log']));
    expect(aabb.scheme).toEqual(['A', 'A', 'B', 'B']);
  });
  it('restarts letters per section and keeps blank lines unlabelled', () => {
    const r = analyzeSound([...lines(['fire', 'desire'], 'v'), { id: 'x', sectionId: 'c', text: '' }, ...lines(['rain', 'again'], 'c')]);
    expect(r.scheme).toEqual(['A', 'A', null, 'A', 'A']);
  });
  it('finds slant rhymes only when slant is on', () => {
    const t = lines(['I keep on trying to find my home', 'but every road I walk alone']);
    expect(analyzeSound(t, { modes: ['perfect'], sensitivity: 0.5, scope: 'end' }).marks.flat(2).length).toBe(0);
    const slant = analyzeSound(t, { modes: ['perfect', 'slant'], sensitivity: 0.7, scope: 'end' });
    expect(slant.marks.flat(2).some((m) => m.mode === 'slant')).toBe(true);
    expect(slant.scheme).toEqual(['A', 'A']);
  });
  it('highlights per syllable, only the rhyming part', () => {
    const r = analyzeSound(lines(['a flame of desire', 'we sat by the fire']), { modes: ['perfect'], sensitivity: 0.5, scope: 'end' });
    const first = r.lines[0];
    const marked = first.syllables.filter((_, i) => r.marks[0][i].length).map((s) => first.text.slice(s.start, s.end));
    // CMU: de-SI-re (3 syllables); the rhyme covers the stressed syllable and what follows
    expect(marked).toEqual(['si', 're']);
    expect(r.families).toHaveLength(1);
    expect(r.families[0].members.map((m) => m.text)).toEqual(['sire', 'fire']);
  });
  it('detects internal rhymes when scope is all', () => {
    const r = analyzeSound(lines(['the night is bright and I feel alright']), { modes: ['perfect'], sensitivity: 0.5, scope: 'all' });
    expect(r.families[0].members.length).toBe(3);
    const end = analyzeSound(lines(['the night is bright and I feel alright']), { modes: ['perfect'], sensitivity: 0.5, scope: 'end' });
    expect(end.families.length).toBe(0);
  });
});

describe('other sound modes', () => {
  it('finds multisyllabic rhymes', () => {
    const r = analyzeSound(lines(['my rhymes are so fantastic', 'my style is like elastic']), { modes: ['multi'], sensitivity: 0.5, scope: 'all' });
    const multi = r.marks.map((l, li) => l.map((m, si) => (m.some((x) => x.mode === 'multi') ? r.lines[li].text.slice(r.lines[li].syllables[si].start, r.lines[li].syllables[si].end) : '')).join(''));
    expect(multi[0]).toContain('tastic');
    expect(multi[1]).toContain('lastic');
  });
  it('finds alliteration and assonance', () => {
    const r = analyzeSound(lines(['Peter picked a peck of pickled peppers']), { modes: ['alliteration'], sensitivity: 0.5, scope: 'all' });
    expect(r.marks[0].filter((m) => m.length).length).toBeGreaterThanOrEqual(4);
    const a = analyzeSound(lines(['the rain in Spain stays mainly in the plain']), { modes: ['assonance'], sensitivity: 0.5, scope: 'all' });
    expect(a.marks[0].filter((m) => m.some((x) => x.group === 've')).length).toBeGreaterThanOrEqual(4);
  });
  it('counts phonemes, vowels and repeated words', () => {
    const r = analyzeSound(lines(['love love love', 'all you need is love']));
    expect(repeatedWords(r.lines)[0]).toEqual({ word: 'love', count: 4 });
    const pc = phonemeCounts(r.lines);
    expect(pc.find((p) => p.code === 'l')!.count).toBeGreaterThanOrEqual(5);
    const heat = vowelHeatmap([r.lines]);
    expect(heat[0].reduce((a, b) => a + b, 0)).toBe(r.lines.reduce((n, l) => n + l.syllables.length, 0));
  });
});

describe('iambic structure', () => {
  it('marks weak–strong feet and leaves breaks unmarked', () => {
    // "the NIGHT is DARK and FULL of FEAR": four clean iambs
    const r = analyzeSound(lines(['the night is dark and full of fear']), { modes: ['iambic'], sensitivity: 0.5, scope: 'all' });
    const feet = r.marks[0].map((m) => m.find((x) => x.mode === 'iambic')?.group ?? null);
    expect(feet).toEqual(['i0:0', 'i0:0', 'i0:1', 'i0:1', 'i0:2', 'i0:2', 'i0:3', 'i0:3']);
    expect(iambicShare(r.marks[0])).toBe(1);
    // trochaic start ("BEAU-ti-ful"): the first stressed syllable has no weak partner before it
    const t = analyzeSound(lines(['beautiful morning']), { modes: ['iambic'], sensitivity: 0.5, scope: 'all' });
    expect(t.marks[0][0].length).toBe(0);
    expect(iambicShare(t.marks[0])).toBeLessThan(1);
  });
});

describe('word lookup', () => {
  it('finds perfect rhymes, filterable by syllables and stress', () => {
    const r = words(perfectRhymes('fire'));
    expect(r).toEqual(expect.arrayContaining(['desire', 'higher', 'wire', 'liar']));
    expect(r).not.toContain('fire');
    const two = perfectRhymes('fire', { syllables: 3, stress: '010' });
    expect(two.every((h) => h.syllables === 3 && h.stress.replace(/2/g, '1') === '010')).toBe(true);
    expect(words(two)).toContain('desire');
  });
  it('finds near rhymes', () => {
    const r = words(nearRhymes('home'));
    expect(r.slice(0, 80)).toEqual(expect.arrayContaining(['alone']));
  });
  it('finds multisyllabic rhymes', () => {
    expect(words(multiRhymes('fantastic'))).toEqual(expect.arrayContaining(['elastic', 'plastic']));
  });
  it('has thesaurus, definitions and related words offline', () => {
    const s = senses('happy')!;
    expect(s.senses[0].definition).toMatch(/joy/);
    expect(s.senses[0].antonyms).toContain('unhappy');
    expect(words(synonyms('sad'))).toEqual(expect.arrayContaining(['sorrowful']));
    expect(senses('running')!.lemma).toBe('running');
    expect(senses('cities')!.lemma).toBe('city');
    expect(relatedWords('tree').length).toBeGreaterThan(5);
  });
});
