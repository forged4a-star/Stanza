/** Small colour toolkit for themes: mixing, contrast, hue shifts. Colours are '#rrggbb' strings. */

export type RGB = [number, number, number];

export function parseHex(hex: string): RGB {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function isHex(s: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}

const clamp = (n: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, n));
const h2 = (n: number) => Math.round(clamp(n)).toString(16).padStart(2, '0');
export const toHex = ([r, g, b]: RGB) => `#${h2(r)}${h2(g)}${h2(b)}`;

/** Blend `a` toward `b`: amount 0 is all a, 1 is all b. */
export function mix(a: string, b: string, amount: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const t = clamp(amount, 0, 1);
  return toHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/** '#rrggbb' plus an opacity (0..1) as '#rrggbbaa'. */
export const alpha = (hex: string, a: number) => toHex(parseHex(hex)) + h2(clamp(a, 0, 1) * 255);

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Dark or light text, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrast(bg, '#16151a') >= contrast(bg, '#ffffff') ? '#16151a' : '#ffffff';
}

export function toHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = parseHex(hex).map((c) => c / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r0 ? (g0 - b0) / d + (g0 < b0 ? 6 : 0) : max === g0 ? (b0 - r0) / d + 2 : (r0 - g0) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function fromHsl(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

export const shiftHue = (hex: string, deg: number) => {
  const [h, s, l] = toHsl(hex);
  return fromHsl(h + deg, s, l);
};

/** Move `fg` lighter or darker until it has at least `min` contrast on `bg` (keeps its hue). */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  const [h, s, l] = toHsl(fg);
  const lighten = luminance(bg) < 0.5;
  for (let i = 1; i <= 40; i++) {
    const next = fromHsl(h, s, clamp(l + (lighten ? 1 : -1) * i * 0.025, 0, 1) as number);
    if (contrast(next, bg) >= min) return next;
  }
  return lighten ? '#ffffff' : '#000000';
}
