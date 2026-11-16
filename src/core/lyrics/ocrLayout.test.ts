import { describe, expect, it } from 'vitest';
import { ocrToText, type OcrLine } from './ocrLayout';

const row = (text: string, top: number, left = 20): OcrLine => ({ text, frame: { top, left, width: 300, height: 30 } });

describe('OCR layout', () => {
  it('keeps order, drops status-bar clutter and restores section breaks from spacing', () => {
    const lines = [
      row('10:55', 8),
      row('7%', 8, 330),
      // verse: lines 40 px apart (10 px gaps)
      row('When you look in the mirror', 120),
      row('With all your revisions', 160),
      // bigger gap = new section
      row('Why am I the one to go?', 280),
      row("You're the one on the sinking boat", 320),
    ];
    expect(ocrToText(lines)).toBe("When you look in the mirror\nWith all your revisions\n\nWhy am I the one to go?\nYou're the one on the sinking boat");
  });
  it('sorts out-of-order blocks and joins side-by-side fragments of one row', () => {
    const lines = [row('second line', 160), row('first', 120, 20), row('line', 122, 200)];
    expect(ocrToText(lines)).toBe('first line\nsecond line');
  });
  it('falls back to the given order without positions, and handles nothing', () => {
    expect(ocrToText([{ text: 'a' }, { text: ' b ' }])).toBe('a\nb');
    expect(ocrToText([])).toBe('');
  });
});
