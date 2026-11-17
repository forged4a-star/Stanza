import { useMemo } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';
import { useSettings } from '../store/settings';
import { resolveTheme, type Theme } from './themeEngine';

export type { Theme, PaletteName } from './themeEngine';
export { resolveTheme } from './themeEngine';

/** Light or dark, from the person's choice and the phone's setting. */
export function useIsDark(): boolean {
  const pref = useSettings((s) => s.theme);
  const system = useColorScheme();
  return pref === 'dark' || (pref === 'system' && system === 'dark');
}

/** The theme the app draws with. Rebuilt only when the look, its tweaks, the highlight colours or light/dark change. */
export function useTheme(): Theme {
  const look = useSettings((s) => s.look);
  const custom = useSettings((s) => s.custom);
  const palette = useSettings((s) => s.palette);
  const dark = useIsDark();
  return useMemo(() => resolveTheme(look, dark, custom, palette), [look, dark, custom, palette]);
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
/** minimum touch target */
export const TAP = 48;
export const font = {
  lyric: 19,
  lyricLine: 30,
  body: 16,
  small: 13,
  tiny: 11,
  title: 24,
};

/** The text style every lyric line must use (typeface, size, line height), so the editor and its overlay always line up. */
export const lyricText = (t: Theme) => ({ fontFamily: t.lyric.fontFamily, fontSize: t.lyric.fontSize, lineHeight: t.lyric.lineHeight });

/** Heading text in the look's display typeface (or bold system text). */
export const displayText = (t: Theme, size: number): TextStyle =>
  // the line height leaves room for tall letters, so nothing is clipped at the top of a heading
  t.fonts.displayBold ? { fontFamily: t.fonts.displayBold, fontWeight: 'normal', fontSize: size, lineHeight: Math.round(size * 1.28) } : { fontWeight: '700', fontSize: size, lineHeight: Math.round(size * 1.28) };
