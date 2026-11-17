import { describe, expect, it } from 'vitest';
import { contrast } from './color';
import { FONT_FAMILIES } from './fontFamilies';
import { ACCENT_SWATCHES, LOOKS } from './looks';
import { LINE_SPACING, LYRIC_SIZE, resolveTheme } from './themeEngine';

describe('looks', () => {
  for (const look of LOOKS) {
    for (const dark of [true, false]) {
      const name = `${look.id} ${dark ? 'dark' : 'light'}`;
      it(`${name}: text, dim text, accent buttons and chords are readable`, () => {
        const t = resolveTheme(look.id, dark);
        expect(contrast(t.text, t.bg), 'text on page').toBeGreaterThanOrEqual(7);
        expect(contrast(t.text, t.surface), 'text on panel').toBeGreaterThanOrEqual(7);
        expect(contrast(t.textDim, t.bg), 'dim text on page').toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.textDim, t.surface), 'dim text on panel').toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.accentText, t.accent), 'label on accent button').toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.chord, t.bg), 'chords on page').toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.danger, t.bg), 'error text').toBeGreaterThanOrEqual(3);
      });
    }
  }
  it('every look has its own name, a one-line description and real fonts', () => {
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
    for (const l of LOOKS) {
      expect(l.name.length).toBeGreaterThan(2);
      expect(l.blurb.length).toBeGreaterThan(10);
      expect(FONT_FAMILIES[l.lyricFont]).toBeTruthy();
      expect(FONT_FAMILIES[l.displayFont]).toBeTruthy();
    }
  });
  it('an unknown look falls back to the first one', () => {
    expect(resolveTheme('does-not-exist', true).lookId).toBe(LOOKS[0].id);
  });
});

describe('custom accent', () => {
  it('stays readable on every look, in light and dark, for every swatch', () => {
    for (const look of LOOKS) {
      for (const dark of [true, false]) {
        for (const accent of ACCENT_SWATCHES) {
          const t = resolveTheme(look.id, dark, { accent });
          expect(t.accent).toBe(accent.toLowerCase());
          expect(contrast(t.accentText, t.accent), `${look.id} ${dark} ${accent} button`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(t.chord, t.bg), `${look.id} ${dark} ${accent} chord`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
  it('makes a companion colour for the gradient, and accepts hex without #', () => {
    const t = resolveTheme('midnight', true, { accent: '4d8dff' });
    expect(t.accent).toBe('#4d8dff');
    expect(t.accent2).not.toBe(t.accent);
    expect(t.gradient).toContain('#4d8dff');
  });
  it('ignores a bad accent', () => {
    expect(resolveTheme('midnight', true, { accent: 'banana' }).accent).toBe(LOOKS[0].dark.accent);
  });
});

describe('shape, space and type', () => {
  it('rounder settings give bigger corners, and the scale never breaks', () => {
    const sharp = resolveTheme('midnight', true, { radius: 0 }).r;
    const round = resolveTheme('midnight', true, { radius: 1 }).r;
    expect(sharp.md).toBeLessThan(round.md);
    expect(sharp.lg).toBeLessThan(round.lg);
    for (const r of [sharp, round]) expect(r.sm).toBeLessThanOrEqual(r.md), expect(r.md).toBeLessThanOrEqual(r.lg), expect(r.lg).toBeLessThanOrEqual(r.xl);
    expect(resolveTheme('midnight', true, { radius: 9 }).r.md).toBe(round.md);
  });
  it('density scales spacing', () => {
    expect(resolveTheme('midnight', true, { density: 'compact' }).sp(16)).toBeLessThan(16);
    expect(resolveTheme('midnight', true, { density: 'comfortable' }).sp(16)).toBe(16);
    expect(resolveTheme('midnight', true, { density: 'roomy' }).sp(16)).toBeGreaterThan(16);
  });
  it('lyric metrics follow the font, size and spacing, within sensible limits', () => {
    const base = resolveTheme('midnight', true, { lyricFont: 'sans', lyricSize: 20, lineSpacing: 1.5 }).lyric;
    expect(base.fontSize).toBe(20);
    expect(base.lineHeight).toBe(30);
    expect(base.fontFamily).toBe('Inter_400Regular');
    // handwriting runs small, so it is scaled up to look the same size
    expect(resolveTheme('midnight', true, { lyricFont: 'hand', lyricSize: 20 }).lyric.fontSize).toBeGreaterThan(20);
    expect(resolveTheme('midnight', true, { lyricFont: 'system' }).lyric.fontFamily).toBeUndefined();
    const huge = resolveTheme('midnight', true, { lyricFont: 'sans', lyricSize: 999, lineSpacing: 99 }).lyric;
    expect(huge.fontSize).toBe(LYRIC_SIZE.max);
    expect(huge.lineHeight).toBe(Math.round(LYRIC_SIZE.max * LINE_SPACING.max));
    const tiny = resolveTheme('midnight', true, { lyricFont: 'sans', lyricSize: 1, lineSpacing: 0 }).lyric;
    expect(tiny.fontSize).toBe(LYRIC_SIZE.min);
    expect(tiny.lineHeight).toBeGreaterThan(tiny.fontSize);
  });
  it('a line is always taller than its text', () => {
    for (const f of Object.keys(FONT_FAMILIES) as (keyof typeof FONT_FAMILIES)[]) {
      const m = resolveTheme('midnight', true, { lyricFont: f }).lyric;
      expect(m.lineHeight).toBeGreaterThan(m.fontSize);
    }
  });
  it('glow backgrounds get a gradient, solid ones do not', () => {
    expect(resolveTheme('midnight', true).pageGradient).toMatch(/^linear-gradient/);
    expect(resolveTheme('mono', true).pageGradient).toBeUndefined();
    expect(resolveTheme('mono', true, { bgStyle: 'glow' }).pageGradient).toMatch(/^linear-gradient/);
    expect(resolveTheme('midnight', true, { bgStyle: 'solid' }).pageGradient).toBeUndefined();
  });
  it('highlight colours still follow the highlight palette choice', () => {
    expect(resolveTheme('midnight', true, {}, 'colorblind').palette.length).toBe(8);
    expect(resolveTheme('midnight', false, {}, 'calm').palette.length).toBe(10);
  });
});

describe('shadows', () => {
  it('light looks get a soft panel shadow, dark ones rely on borders; the glow follows the accent', () => {
    expect(resolveTheme('midnight', false).shadow.card).toMatch(/^0 4px 16px #/);
    expect(resolveTheme('midnight', true).shadow.card).toBeUndefined();
    expect(resolveTheme('midnight', true, { accent: '#4d8dff' }).shadow.glow).toContain('#4d8dff');
  });
});
