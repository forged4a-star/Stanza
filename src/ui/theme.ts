import { useColorScheme } from 'react-native';
import { useSettings, type PaletteName } from '../store/settings';

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

export function makeTheme(dark: boolean, palette: PaletteName = 'calm'): Theme {
  const p = PALETTES[palette];
  return dark
    ? {
        dark,
        bg: '#141414',
        surface: '#1d1d1d',
        surface2: '#262626',
        border: '#333333',
        text: '#ecebe8',
        textDim: '#a3a19c',
        textFaint: '#6b6a66',
        accent: '#e2b25a',
        accentText: '#1a1a1a',
        danger: '#ef6b6b',
        warn: '#e8a33d',
        ok: '#7cc47a',
        record: '#ef5350',
        backdrop: 'rgba(0,0,0,0.55)',
        palette: p.dark,
        paletteInk: p.light,
        chord: '#e2b25a',
      }
    : {
        dark,
        bg: '#fbfaf7',
        surface: '#ffffff',
        surface2: '#f1efea',
        border: '#e2dfd8',
        text: '#1d1c1a',
        textDim: '#6b6862',
        textFaint: '#a9a59d',
        accent: '#b5762a',
        accentText: '#ffffff',
        danger: '#c43d3d',
        warn: '#b8730d',
        ok: '#3b8a3a',
        record: '#d93b3b',
        backdrop: 'rgba(20,18,15,0.35)',
        palette: p.light,
        paletteInk: INK[palette],
        chord: '#a3501c',
      };
}

export function useTheme(): Theme {
  const pref = useSettings((s) => s.theme);
  const palette = useSettings((s) => s.palette);
  const system = useColorScheme();
  const dark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return makeTheme(dark, palette);
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
