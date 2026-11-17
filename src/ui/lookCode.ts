/**
 * Looks you can send: a look and a person's tweaks as one line of text, e.g.
 *   stanza-look/1/neon/dark/a:ff4d8d,r:0.8,lf:serif~k
 * The last character is a checksum so a damaged paste is caught. Also
 * `sanitizeCustom`, which keeps any tweaks (saved, pasted, or typed) inside sensible limits.
 */
import { isHex, toHex, parseHex } from './color';
import { FONT_FAMILIES, type FontKey } from './fontFamilies';
import { LOOKS, type BgStyle, type Density, type LookCustom, type SurfaceStyle } from './looks';
import { LINE_SPACING, LYRIC_SIZE } from './themeEngine';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const DENSITIES: Density[] = ['compact', 'comfortable', 'roomy'];
const BGS: BgStyle[] = ['solid', 'glow'];
const SURFACES: SurfaceStyle[] = ['soft', 'flat', 'outline'];

/** Keep only valid tweaks, each within its limits. Unknown or broken values are dropped. */
export function sanitizeCustom(input: unknown): LookCustom {
  const c = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: LookCustom = {};
  if (typeof c.accent === 'string' && isHex(c.accent)) out.accent = toHex(parseHex(c.accent.startsWith('#') ? c.accent : '#' + c.accent));
  if (typeof c.radius === 'number' && Number.isFinite(c.radius)) out.radius = Math.round(clamp(c.radius, 0, 1) * 100) / 100;
  if (DENSITIES.includes(c.density as Density)) out.density = c.density as Density;
  if (typeof c.lyricFont === 'string' && c.lyricFont in FONT_FAMILIES) out.lyricFont = c.lyricFont as FontKey;
  if (typeof c.displayFont === 'string' && c.displayFont in FONT_FAMILIES) out.displayFont = c.displayFont as FontKey;
  if (typeof c.lyricSize === 'number' && Number.isFinite(c.lyricSize)) out.lyricSize = Math.round(clamp(c.lyricSize, LYRIC_SIZE.min, LYRIC_SIZE.max));
  if (typeof c.lineSpacing === 'number' && Number.isFinite(c.lineSpacing)) out.lineSpacing = Math.round(clamp(c.lineSpacing, LINE_SPACING.min, LINE_SPACING.max) * 100) / 100;
  if (BGS.includes(c.bgStyle as BgStyle)) out.bgStyle = c.bgStyle as BgStyle;
  if (SURFACES.includes(c.surfaceStyle as SurfaceStyle)) out.surfaceStyle = c.surfaceStyle as SurfaceStyle;
  return out;
}

export type ModePref = 'system' | 'light' | 'dark';

const PREFIX = 'stanza-look/1/';
const checksum = (body: string) => {
  let n = 0;
  for (let i = 0; i < body.length; i++) n = (n * 31 + body.charCodeAt(i)) % 36;
  return n.toString(36);
};

export function encodeLook(look: string, mode: ModePref, custom: LookCustom): string {
  const c = sanitizeCustom(custom);
  const parts: string[] = [];
  if (c.accent) parts.push('a:' + c.accent.slice(1));
  if (c.radius !== undefined) parts.push('r:' + c.radius);
  if (c.density) parts.push('d:' + c.density[0]);
  if (c.lyricFont) parts.push('lf:' + c.lyricFont);
  if (c.displayFont) parts.push('df:' + c.displayFont);
  if (c.lyricSize !== undefined) parts.push('ls:' + c.lyricSize);
  if (c.lineSpacing !== undefined) parts.push('sp:' + c.lineSpacing);
  if (c.bgStyle) parts.push('bg:' + c.bgStyle[0]);
  if (c.surfaceStyle) parts.push('sf:' + c.surfaceStyle[0]);
  const body = `${PREFIX}${look}/${mode}/${parts.join(',') || '-'}`;
  return `${body}~${checksum(body)}`;
}

export type DecodedLook = { ok: true; look: string; mode: ModePref; custom: LookCustom } | { ok: false; error: string };

export function decodeLook(text: string): DecodedLook {
  const m = text.match(/stanza-look\/1\/[^\s]*~[0-9a-z]/i);
  if (!m) return { ok: false, error: 'That does not look like a look code. It starts with "stanza-look/".' };
  const code = m[0];
  const tilde = code.lastIndexOf('~');
  const body = code.slice(0, tilde);
  if (checksum(body) !== code.slice(tilde + 1).toLowerCase()) return { ok: false, error: 'The code was changed or cut off. Ask for it again.' };
  const [look, mode, rest = '-'] = body.slice(PREFIX.length).split('/');
  if (!LOOKS.some((l) => l.id === look)) return { ok: false, error: `This code needs a look called "${look}", which this version of Stanza does not have.` };
  if (!['system', 'light', 'dark'].includes(mode)) return { ok: false, error: 'The code is missing parts.' };
  const raw: Record<string, unknown> = {};
  if (rest !== '-') {
    for (const kv of rest.split(',')) {
      const i = kv.indexOf(':');
      if (i < 0) continue;
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (k === 'a') raw.accent = '#' + v;
      else if (k === 'r') raw.radius = Number(v);
      else if (k === 'd') raw.density = DENSITIES.find((d) => d[0] === v);
      else if (k === 'lf') raw.lyricFont = v;
      else if (k === 'df') raw.displayFont = v;
      else if (k === 'ls') raw.lyricSize = Number(v);
      else if (k === 'sp') raw.lineSpacing = Number(v);
      else if (k === 'bg') raw.bgStyle = BGS.find((b) => b[0] === v);
      else if (k === 'sf') raw.surfaceStyle = SURFACES.find((s) => s[0] === v);
    }
  }
  return { ok: true, look, mode: mode as ModePref, custom: sanitizeCustom(raw) };
}
