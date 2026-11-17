/**
 * Looks: complete, hand-tuned visual styles. Each has a dark and a light
 * version, its own typefaces, corner roundness and background. Everything
 * can then be adjusted on top (accent colour, shape, spacing, type).
 */
import type { FontKey } from './fontFamilies';

export type Density = 'compact' | 'comfortable' | 'roomy';
export type BgStyle = 'solid' | 'glow';
export type SurfaceStyle = 'soft' | 'flat' | 'outline';

export interface LookColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  /** the second colour of the accent gradient */
  accent2: string;
  danger: string;
  warn: string;
  ok: string;
  record: string;
  chord: string;
}

/** What a person changes on top of a look. Anything left out follows the look. */
export interface LookCustom {
  accent?: string;
  radius?: number;
  density?: Density;
  lyricFont?: FontKey;
  displayFont?: FontKey;
  lyricSize?: number;
  lineSpacing?: number;
  bgStyle?: BgStyle;
  surfaceStyle?: SurfaceStyle;
}

export interface Look {
  id: string;
  name: string;
  blurb: string;
  dark: LookColors;
  light: LookColors;
  /** corner roundness, 0 (square) to 1 (very round) */
  radius: number;
  density: Density;
  lyricFont: FontKey;
  displayFont: FontKey;
  bgStyle: BgStyle;
  surfaceStyle: SurfaceStyle;
}

export const LOOKS: Look[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Studio at night. Amber and coral on deep blue-black.',
    radius: 0.62,
    density: 'comfortable',
    lyricFont: 'sans',
    displayFont: 'display',
    bgStyle: 'glow',
    surfaceStyle: 'soft',
    dark: { bg: '#0d0f14', surface: '#151922', surface2: '#1e2330', border: '#2a3140', text: '#eef0f5', textDim: '#a1a9ba', textFaint: '#667084', accent: '#f5b85b', accent2: '#f2705f', danger: '#ff7a7a', warn: '#f5b85b', ok: '#6fd39a', record: '#ff5a5f', chord: '#f5b85b' },
    light: { bg: '#f5f3ee', surface: '#ffffff', surface2: '#eeebe4', border: '#dfdad0', text: '#1c1b19', textDim: '#66625b', textFaint: '#a39e94', accent: '#c2761c', accent2: '#d4503c', danger: '#c43d3d', warn: '#b8730d', ok: '#2f8a4f', record: '#d93b3b', chord: '#a3501c' },
  },
  {
    id: 'paper',
    name: 'Paper',
    blurb: 'A well-used notebook. Cream pages, ink, terracotta.',
    radius: 0.32,
    density: 'comfortable',
    lyricFont: 'serif',
    displayFont: 'display',
    bgStyle: 'solid',
    surfaceStyle: 'outline',
    light: { bg: '#f6f0e2', surface: '#fffbf2', surface2: '#f0e7d3', border: '#e0d4b8', text: '#2a2418', textDim: '#6f6552', textFaint: '#a89d86', accent: '#b4532a', accent2: '#d98a3d', danger: '#b3372f', warn: '#b8730d', ok: '#4a7d3a', record: '#c8372d', chord: '#9a4520' },
    dark: { bg: '#1a1612', surface: '#231e18', surface2: '#2d261e', border: '#3a3228', text: '#f1e9d8', textDim: '#b3a68f', textFaint: '#7a6f5c', accent: '#e0905a', accent2: '#f0b35c', danger: '#ef7a70', warn: '#f0b35c', ok: '#8fc07a', record: '#ef5a50', chord: '#e8a15f' },
  },
  {
    id: 'neon',
    name: 'Neon',
    blurb: 'After hours. Electric violet into cyan.',
    radius: 0.85,
    density: 'comfortable',
    lyricFont: 'grotesk',
    displayFont: 'grotesk',
    bgStyle: 'glow',
    surfaceStyle: 'soft',
    dark: { bg: '#0a0920', surface: '#12113a', surface2: '#1b1950', border: '#2c2a6b', text: '#eeeaff', textDim: '#a9a5d6', textFaint: '#6b68a8', accent: '#8b6cff', accent2: '#25d4f2', danger: '#ff6b8b', warn: '#ffc857', ok: '#4de3a0', record: '#ff3d7f', chord: '#25d4f2' },
    light: { bg: '#f3f1ff', surface: '#ffffff', surface2: '#ebe8ff', border: '#d6d0f5', text: '#1a1640', textDim: '#5d5890', textFaint: '#9b97c9', accent: '#5b3df5', accent2: '#0a9db8', danger: '#d12e5a', warn: '#b57a00', ok: '#13966a', record: '#e0245e', chord: '#0a7f96' },
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    blurb: 'Warm and friendly. Coral to gold, handwritten lines.',
    radius: 0.9,
    density: 'roomy',
    lyricFont: 'hand',
    displayFont: 'display',
    bgStyle: 'glow',
    surfaceStyle: 'soft',
    light: { bg: '#fff3ea', surface: '#ffffff', surface2: '#ffeadb', border: '#f5d3bd', text: '#2b1b16', textDim: '#7a5a4d', textFaint: '#b99a8b', accent: '#f0553a', accent2: '#ff9f43', danger: '#c43d3d', warn: '#c27a0a', ok: '#2f8f5a', record: '#e03a3a', chord: '#c9411f' },
    dark: { bg: '#1e1219', surface: '#281821', surface2: '#35202c', border: '#4a2d3b', text: '#ffe9dc', textDim: '#d1a99a', textFaint: '#8d6a64', accent: '#ff7a59', accent2: '#ffb04a', danger: '#ff8a80', warn: '#ffb04a', ok: '#86d6a0', record: '#ff5a5a', chord: '#ffb04a' },
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Quiet and green. Moss, sage and a touch of gold.',
    radius: 0.5,
    density: 'comfortable',
    lyricFont: 'serif',
    displayFont: 'serif',
    bgStyle: 'glow',
    surfaceStyle: 'soft',
    dark: { bg: '#0c1411', surface: '#121d18', surface2: '#1a2a23', border: '#254035', text: '#e8f1ec', textDim: '#9db8ab', textFaint: '#5f7d6f', accent: '#7fd6a4', accent2: '#d6c36b', danger: '#ff8a80', warn: '#e9c46a', ok: '#7fd6a4', record: '#ff6b6b', chord: '#d6c36b' },
    light: { bg: '#f0f5ee', surface: '#fbfdf9', surface2: '#e6efe3', border: '#cfdccb', text: '#17261d', textDim: '#566b5d', textFaint: '#92a798', accent: '#23794c', accent2: '#a98a1e', danger: '#b83b33', warn: '#9a7410', ok: '#2f8f5b', record: '#d03b3b', chord: '#7d6616' },
  },
  {
    id: 'mono',
    name: 'Mono',
    blurb: 'Black, white, typewriter. Nothing but the words.',
    radius: 0.1,
    density: 'compact',
    lyricFont: 'mono',
    displayFont: 'mono',
    bgStyle: 'solid',
    surfaceStyle: 'outline',
    dark: { bg: '#000000', surface: '#0f0f0f', surface2: '#1a1a1a', border: '#2e2e2e', text: '#f5f5f5', textDim: '#a3a3a3', textFaint: '#666666', accent: '#ffffff', accent2: '#bdbdbd', danger: '#ff6b6b', warn: '#ffd166', ok: '#7ddf8b', record: '#ff4d4d', chord: '#ffffff' },
    light: { bg: '#ffffff', surface: '#ffffff', surface2: '#f0f0f0', border: '#d4d4d4', text: '#0a0a0a', textDim: '#5c5c5c', textFaint: '#9a9a9a', accent: '#0a0a0a', accent2: '#525252', danger: '#c62828', warn: '#a86500', ok: '#1b7f3b', record: '#d32f2f', chord: '#0a0a0a' },
  },
];

export const DEFAULT_LOOK = 'midnight';
export const lookById = (id: string | null | undefined): Look => LOOKS.find((l) => l.id === id) ?? LOOKS[0];

/** Accent choices offered in the customiser (the look's own accent is always the first choice). */
export const ACCENT_SWATCHES = ['#f5b85b', '#f2705f', '#ff4d8d', '#c06bff', '#8b6cff', '#4d8dff', '#25d4f2', '#3ddc97', '#9ad94a', '#f0d24a', '#ff9f43', '#e8e8ea'];
