import { describe, expect, it } from 'vitest';
import { CARDS, checkCard, drawCard, type CardSection } from './constraints';

let n = 0;
const sec = (...lines: string[]): CardSection => ({ id: 's' + n++, lines: lines.map((text, i) => ({ id: `l${n}-${i}`, text })) });
const rows = (id: string, ...secs: CardSection[]) => checkCard(id, secs).map((v) => `${v.sectionIndex}:${v.row}`);

describe('constraint cards', () => {
  it('small words flags long words and says which', () => {
    const v = checkCard('small-words', [sec('the cold wind blows', 'a river runs away')]);
    expect(v.map((x) => x.row)).toEqual([2]);
    expect(v[0].message).toMatch(/river/);
  });
  it('tight lines flags lines over 8 syllables', () => {
    expect(rows('tight', sec('short line here', 'this particular line goes on and on and on forever'))).toEqual(['0:2']);
  });
  it('land hard flags a soft ending', () => {
    const v = rows('land-hard', sec('I fall asleep', 'I will never be alone to', 'down by the sea'));
    expect(v.length).toBeGreaterThan(0);
    expect(v).not.toContain('0:1');
  });
  it('no end rhymes flags the second of a rhyming pair', () => {
    expect(rows('no-end-rhyme', sec('walking in the rain', 'feeling all the pain', 'thinking of the door'))).toEqual(['0:2']);
  });
  it('everything rhymes flags a line that rhymes with nothing', () => {
    expect(rows('all-rhyme', sec('walking in the rain', 'feeling all the pain', 'thinking of the door'))).toEqual(['0:3']);
  });
  it('nothing twice flags a repeated content word but not little words', () => {
    expect(rows('no-repeat', sec('the river is cold', 'the river is wide', 'and the sky is grey'))).toEqual(['0:2']);
  });
  it('only questions', () => {
    expect(rows('questions', sec('where did you go?', 'I looked for you'))).toEqual(['0:2']);
  });
  it('no articles', () => {
    expect(rows('no-articles', sec('down by the sea', 'down by sea', 'a long road'))).toEqual(['0:1', '0:3']);
  });
  it('start alike passes alliteration and flags the rest', () => {
    expect(rows('alliterate', sec('silver sea shines', 'a long cold road'))).toEqual(['0:2']);
  });
  it('ignores empty lines and unknown cards', () => {
    expect(checkCard('small-words', [sec('', '   ')])).toEqual([]);
    expect(checkCard('nope', [sec('anything at all')])).toEqual([]);
  });
  it('drawing never returns the card you hold, and is repeatable', () => {
    for (let s = 1; s < 50; s++) expect(drawCard(s, 'tight').id).not.toBe('tight');
    expect(drawCard(7).id).toBe(drawCard(7).id);
    expect(new Set(Array.from({ length: 200 }, (_, i) => drawCard(i + 1).id)).size).toBe(CARDS.length);
  });
});
