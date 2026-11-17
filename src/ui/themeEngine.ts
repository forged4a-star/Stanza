/**
 * Turns a look plus a person's tweaks into the theme the app draws with.
 * No React in here, so it can be tested on its own.
 */
import { alpha, ensureContrast, isHex, mix, readableOn, shiftHue, toHex, parseHex } from './color';
import { FONT_FAMILIES } from './fontFamilies';
import { lookById, type BgStyle, type Density, type LookCustom, type SurfaceStyle } from './looks';

export type PaletteName = 'calm' | 'vivid' | 'colorblind';

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentText: string;
  danger: string;
  warn: string;
  ok: string;
  record: string;
  backdrop: string;
  /** colours for rhyme families / sound groups */
  palette: string[];
  /** stronger variant of each palette colour, for text/underlines */
  paletteInk: string[];
  chord: string;
  // ---- the look
  lookId: string;
  accent2: string;
  /** a two-colour fill for primary buttons and highlights */
  gradient: string;
  /** soft background gradient for whole screens (undefined for a flat background) */
  pageGradient: string | undefined;
  bgStyle: BgStyle;
  surfaceStyle: SurfaceStyle;
  density: Density;
  /** corner radii, already scaled to the chosen roundness */
  r: { sm: number; md: number; lg: number; xl: number; pill: number };
  /** scale a spacing value for the chosen density */
  sp: (n: number) => number;
  /** soft elevation for panels (none on dark looks, where borders do the work) and a coloured glow for primary actions */
  shadow: { card: string | undefined; glow: string };
  /** heading and lyric typefaces (undefined = system font) */
  fonts: { display?: string; displayBold?: string; lyric?: string; lyricBold?: string };
  /** the metrics every lyric line must share, so the editor and its overlay always line up */
  lyric: { fontFamily?: string; fontSize: number; lineHeight: number };
}

const PALETTES: Record<PaletteName, { light: string[]; dark: string[] }> = {
  calm: {
    light: ['#f6d58e', '#a9d8f5', '#f3b2b9', '#b9e3b0', '#d7c2f2', '#f7c39b', '#9fe0dc', '#e6d7a1', '#c4d0f7', '#f1b4e0'],
    dark: ['#7a6326', '#2b5c7d', '#7a3640', '#3e6b35', '#5a4682', '#80502b', '#2b6f6a', '#6b6230', '#3d4f86', '#7a3a6a'],
  },
  vivid: {
    light: ['#ffd23f', '#5ec2ff', '#ff7a8a', '#7be06e', '#c08cff', '#ffa45c', '#3fe0d0', '#e8e85a', '#8aa2ff', '#ff8adf'],
    dark: ['#a68400', '#00639c', '#a8283a', '#2f8a24', '#6c2fc0', '#b55b0d', '#008f82', '#8c8c00', '#2f47c2', '#b0288f'],
  },
  // Okabe–Ito: distinguishable with the common forms of colour blindness
  colorblind: {
    light: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#999999'],
    dark: ['#b37a00', '#2e86b8', '#00785a', '#a39a1c', '#005a8c', '#a84a00', '#a35a86', '#6e6e6e'],
  },
};

const INK: Record<PaletteName, string[]> = {
  calm: ['#9a6b00', '#1f6b99', '#a8323f', '#2f7a24', '#6a44a8', '#a85a1c', '#1b7f78', '#7d6d12', '#3550a8', '#a33188'],
  vivid: ['#a68400', '#00639c', '#a8283a', '#2f8a24', '#6c2fc0', '#b55b0d', '#008f82', '#8c8c00', '#2f47c2', '#b0288f'],
  colorblind: ['#b37a00', '#2e86b8', '#00785a', '#8a8200', '#005a8c', '#a84a00', '#a35a86', '#6e6e6e'],
};

const DENSITY: Record<Density, number> = { compact: 0.84, comfortable: 1, roomy: 1.16 };

export const LYRIC_SIZE = { min: 15, max: 30, default: 19 };
export const LINE_SPACING = { min: 1.25, max: 1.95, default: 1.55 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const normHex = (h: string) => toHex(parseHex(h));

export function resolveTheme(lookId: string, dark: boolean, custom: LookCustom = {}, palette: PaletteName = 'calm'): Theme {
  const look = lookById(lookId);
  const c = dark ? look.dark : look.light;
  const customAccent = custom.accent && isHex(custom.accent) ? normHex(custom.accent.startsWith('#') ? custom.accent : '#' + custom.accent) : null;
  const accent = customAccent ?? c.accent;
  const accent2 = customAccent ? shiftHue(customAccent, 28) : c.accent2;
  const bgStyle = custom.bgStyle ?? look.bgStyle;
  const surfaceStyle = custom.surfaceStyle ?? look.surfaceStyle;
  const density = custom.density ?? look.density;
  const k = DENSITY[density];

  const rad = clamp(custom.radius ?? look.radius, 0, 1);
  const r = { sm: Math.round(4 + 8 * rad), md: Math.round(6 + 14 * rad), lg: Math.round(10 + 20 * rad), xl: Math.round(14 + 28 * rad), pill: 999 };

  const lyricKey = custom.lyricFont ?? look.lyricFont;
  const displayKey = custom.displayFont ?? look.displayFont;
  const lf = FONT_FAMILIES[lyricKey];
  const df = FONT_FAMILIES[displayKey];
  const baseSize = clamp(custom.lyricSize ?? LYRIC_SIZE.default, LYRIC_SIZE.min, LYRIC_SIZE.max);
  const fontSize = Math.round(baseSize * lf.scale * 10) / 10;
  const lineHeight = Math.round(fontSize * clamp(custom.lineSpacing ?? LINE_SPACING.default, LINE_SPACING.min, LINE_SPACING.max));

  return {
    dark,
    bg: c.bg,
    surface: c.surface,
    surface2: c.surface2,
    border: c.border,
    text: c.text,
    textDim: c.textDim,
    textFaint: c.textFaint,
    accent,
    accentText: readableOn(accent),
    danger: c.danger,
    warn: c.warn,
    ok: c.ok,
    record: c.record,
    backdrop: dark ? 'rgba(0,0,0,0.6)' : 'rgba(20,18,15,0.38)',
    palette: dark ? PALETTES[palette].dark : PALETTES[palette].light,
    paletteInk: dark ? PALETTES[palette].light : INK[palette],
    // chords are text on the page background, so they must stay readable whatever accent was chosen
    chord: ensureContrast(customAccent ?? c.chord, c.bg, 4.5),
    lookId: look.id,
    accent2,
    gradient: `linear-gradient(135deg, ${accent} 0%, ${accent2} 100%)`,
    pageGradient: bgStyle === 'glow' ? `linear-gradient(180deg, ${mix(c.bg, accent, dark ? 0.15 : 0.1)} 0%, ${c.bg} 44%)` : undefined,
    bgStyle,
    surfaceStyle,
    density,
    r,
    shadow: {
      card: dark ? undefined : `0 4px 16px ${alpha('#2a2418', 0.07)}`,
      glow: `0 6px 20px ${alpha(accent, dark ? 0.32 : 0.26)}`,
    },
    sp: (n: number) => Math.round(n * k),
    fonts: { display: df.regular, displayBold: df.bold, lyric: lf.regular, lyricBold: lf.bold },
    lyric: { fontFamily: lf.regular, fontSize, lineHeight },
  };
}

export { alpha };
