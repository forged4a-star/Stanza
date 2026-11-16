import { describe, expect, it } from 'vitest';
import { previewSwap, swapBadge, swapWord } from './swap';

describe('word swap preview', () => {
  it('swaps a whole word and keeps capitalisation', () => {
    expect(swapWord('I walked along the river', 'river', 'stream')).toBe('I walked along the stream');
    expect(swapWord('Rain on the glass', 'rain', 'snow')).toBe('Snow on the glass');
    expect(swapWord('a drain in the rain', 'rain', 'snow')).toBe('a drain in the snow');
    expect(swapWord('no match here', 'xyz', 'abc')).toBeNull();
  });
  it('does not touch part of another word', () => {
    expect(swapWord('the train runs', 'rain', 'snow')).toBeNull();
    expect(swapWord("don't rain", 't', 'x')).toBeNull();
  });
  it('badge: same shape fits, extra syllable does not', () => {
    expect(swapBadge('walking in the rain', 'rain', 'pain')).toEqual({ delta: 0, fits: true });
    const longer = swapBadge('walking in the rain', 'rain', 'downpour');
    expect(longer!.delta).toBe(1);
    expect(longer!.fits).toBe(false);
  });
  it('preview reports syllables and rhymes before and after', () => {
    const lines = ['walking in the rain', 'feeling all the pain', 'thinking of the door'];
    const keep = previewSwap(lines, 0, 'rain', 'lane')!;
    expect(keep.rhymesBefore).toEqual([2]);
    expect(keep.rhymesAfter).toEqual([2]);
    expect(keep.fits).toBe(true);
    const lose = previewSwap(lines, 0, 'rain', 'street')!;
    expect(lose.rhymesBefore).toEqual([2]);
    expect(lose.rhymesAfter).toEqual([]);
    expect(lose.text).toBe('walking in the street');
  });
  it('preview of a swap that is not in the line is null', () => {
    expect(previewSwap(['hello there'], 0, 'moon', 'sun')).toBeNull();
    expect(previewSwap(['hello there'], 3, 'moon', 'sun')).toBeNull();
  });
});
