import { describe, expect, it } from 'vitest';
import { alpha, contrast, ensureContrast, fromHsl, isHex, luminance, mix, parseHex, readableOn, shiftHue, toHex, toHsl } from './color';

describe('colour toolkit', () => {
  it('parses and writes hex, including short and bad input', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('f80')).toEqual([255, 136, 0]);
    expect(parseHex('nope')).toEqual([0, 0, 0]);
    expect(toHex([255, 128, 0])).toBe('#ff8000');
    expect(isHex('#abc')).toBe(true);
    expect(isHex('#abcd')).toBe(false);
  });
  it('mixes and adds opacity', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030');
    expect(alpha('#ff0000', 0.5)).toBe('#ff000080');
    expect(alpha('#ff0000', 1)).toBe('#ff0000ff');
  });
  it('contrast follows the WCAG definition', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(luminance('#ffffff')).toBeCloseTo(1, 3);
  });
  it('picks readable text for light and dark backgrounds', () => {
    expect(readableOn('#ffffff')).toBe('#16151a');
    expect(readableOn('#101010')).toBe('#ffffff');
    expect(contrast('#f2b45a', readableOn('#f2b45a'))).toBeGreaterThan(7);
    expect(contrast('#3b5bdb', readableOn('#3b5bdb'))).toBeGreaterThan(4.5);
  });
  it('hsl round trips', () => {
    for (const c of ['#ff0000', '#00ff00', '#3b5bdb', '#f2b45a', '#808080']) {
      const [h, s, l] = toHsl(c);
      const back = parseHex(fromHsl(h, s, l));
      parseHex(c).forEach((v, i) => expect(Math.abs(back[i] - v)).toBeLessThanOrEqual(1));
    }
  });
  it('shifts hue but keeps lightness', () => {
    const [, , l1] = toHsl('#3b5bdb');
    const shifted = shiftHue('#3b5bdb', 90);
    expect(toHsl(shifted)[2]).toBeCloseTo(l1, 1);
    expect(shifted).not.toBe('#3b5bdb');
    expect(shiftHue('#ff0000', 360)).toBe('#ff0000');
  });
  it('ensureContrast lifts weak colours and leaves good ones', () => {
    expect(ensureContrast('#202020', '#141414', 4.5)).not.toBe('#202020');
    expect(contrast(ensureContrast('#202020', '#141414', 4.5), '#141414')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#ffffff', '#141414')).toBe('#ffffff');
    expect(contrast(ensureContrast('#dddddd', '#ffffff', 4.5), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
