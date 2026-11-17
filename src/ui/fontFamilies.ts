/**
 * The typefaces you can pick, by name only (no files here, so tests can use it).
 * `system` is the phone's own font. The others are bundled; see fonts.ts.
 */
export type FontKey = 'system' | 'sans' | 'serif' | 'display' | 'hand' | 'mono' | 'grotesk';

export interface FontFamily {
  id: FontKey;
  label: string;
  /** family names as registered with the app; undefined means the system font */
  regular?: string;
  bold?: string;
  /** some faces run small or wide; this evens out their size */
  scale: number;
}

export const FONT_FAMILIES: Record<FontKey, FontFamily> = {
  system: { id: 'system', label: 'System', scale: 1 },
  sans: { id: 'sans', label: 'Clean', regular: 'Inter_400Regular', bold: 'Inter_600SemiBold', scale: 1 },
  serif: { id: 'serif', label: 'Book', regular: 'Lora_400Regular', bold: 'Lora_600SemiBold', scale: 1.04 },
  display: { id: 'display', label: 'Poster', regular: 'Fraunces_500Medium', bold: 'Fraunces_700Bold', scale: 1 },
  hand: { id: 'hand', label: 'Handwritten', regular: 'Caveat_500Medium', bold: 'Caveat_700Bold', scale: 1.28 },
  mono: { id: 'mono', label: 'Typewriter', regular: 'JetBrainsMono_400Regular', bold: 'JetBrainsMono_700Bold', scale: 0.9 },
  grotesk: { id: 'grotesk', label: 'Modern', regular: 'SpaceGrotesk_500Medium', bold: 'SpaceGrotesk_700Bold', scale: 0.98 },
};

export const FONT_ORDER: FontKey[] = ['system', 'sans', 'serif', 'display', 'hand', 'mono', 'grotesk'];
