/**
 * Lyric card: a few lines of a song as a picture to share. This file only
 * works out the layout (wrapping, sizing, centring) and writes it as SVG text;
 * the app draws the same layout on screen and turns it into a PNG.
 */
export interface CardTheme {
  id: string;
  name: string;
  bg: string;
  fg: string;
  sub: string;
  accent: string;
}

export const CARD_THEMES: CardTheme[] = [
  { id: 'paper', name: 'Paper', bg: '#f7f3ea', fg: '#1f1b16', sub: '#7d7466', accent: '#b4722a' },
  { id: 'ink', name: 'Ink', bg: '#141414', fg: '#f2efe8', sub: '#9a958a', accent: '#e0a458' },
  { id: 'dusk', name: 'Dusk', bg: '#23294a', fg: '#f4ecdf', sub: '#aab0d6', accent: '#f0b36b' },
  { id: 'sage', name: 'Sage', bg: '#dfe7dc', fg: '#1d2a21', sub: '#5f7266', accent: '#3d7a57' },
];

export type CardRatio = 'square' | 'story';

export interface CardLine {
  text: string;
  y: number;
}

export interface CardLayout {
  width: number;
  height: number;
  theme: CardTheme;
  size: number;
  lines: CardLine[];
  title: string;
  footer: string;
  /** some lines did not fit even at the smallest size */
  truncated: boolean;
}

export const CARD_WIDTH = 1080;
const MARGIN = 96;
const MIN_SIZE = 30;
const MAX_SIZE = 72;
/** average width of a character as a fraction of the font size, for a serif face */
const CHAR_W = 0.5;


/** Break a line into pieces no wider than `max`, at spaces where possible. */
export function wrapLine(text: string, size: number, max: number): string[] {
  const t = text.trim();
  if (!t) return [''];
  const maxChars = Math.max(4, Math.floor(max / (size * CHAR_W)));
  const out: string[] = [];
  let cur = '';
  for (const word of t.split(/\s+/)) {
    let w = word;
    while (w.length > maxChars) {
      if (cur) (out.push(cur), (cur = ''));
      out.push(w.slice(0, maxChars - 1) + '-');
      w = w.slice(maxChars - 1);
    }
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else (out.push(cur), (cur = w));
  }
  if (cur) out.push(cur);
  return out;
}

export function layoutCard(lyrics: string[], opts: { title: string; footer?: string; theme?: CardTheme; ratio?: CardRatio }): CardLayout {
  const theme = opts.theme ?? CARD_THEMES[0];
  const height = opts.ratio === 'story' ? 1920 : 1080;
  const top = MARGIN + 40;
  const bottom = height - MARGIN - 70;
  const avail = bottom - top;
  const max = CARD_WIDTH - MARGIN * 2;
  const lines = lyrics.map((l) => l.trimEnd());
  let size = MAX_SIZE;
  let wrapped: string[] = [];
  for (; size >= MIN_SIZE; size -= 2) {
    wrapped = lines.flatMap((l) => wrapLine(l, size, max));
    if (wrapped.length * size * 1.4 <= avail) break;
  }
  size = Math.max(MIN_SIZE, size);
  let truncated = false;
  const rows = Math.floor(avail / (size * 1.4));
  if (wrapped.length > rows) {
    wrapped = wrapped.slice(0, Math.max(1, rows));
    wrapped[wrapped.length - 1] = wrapped[wrapped.length - 1].replace(/[\s.,;:!?-]*$/, '') + '…';
    truncated = true;
  }
  const step = size * 1.4;
  const block = wrapped.length * step;
  const y0 = top + (avail - block) / 2 + size;
  return {
    width: CARD_WIDTH,
    height,
    theme,
    size,
    lines: wrapped.map((text, i) => ({ text, y: Math.round(y0 + i * step) })),
    title: opts.title,
    footer: opts.footer ?? 'Stanza',
    truncated,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The card as an SVG document. */
export function cardSvg(l: CardLayout): string {
  const font = "Georgia, 'Times New Roman', serif";
  const body = l.lines
    .filter((x) => x.text)
    .map((x) => `<text x="${MARGIN}" y="${x.y}" font-family="${font}" font-size="${l.size}" fill="${l.theme.fg}">${esc(x.text)}</text>`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}">` +
    `<rect width="${l.width}" height="${l.height}" fill="${l.theme.bg}"/>` +
    `<rect x="${MARGIN}" y="${MARGIN}" width="72" height="6" rx="3" fill="${l.theme.accent}"/>` +
    body +
    `<text x="${MARGIN}" y="${l.height - MARGIN}" font-family="${font}" font-size="30" font-style="italic" fill="${l.theme.sub}">${esc(l.title)}</text>` +
    `<text x="${l.width - MARGIN}" y="${l.height - MARGIN}" font-family="${font}" font-size="26" text-anchor="end" fill="${l.theme.sub}">${esc(l.footer)}</text>` +
    `</svg>`
  );
}

export { MARGIN as CARD_MARGIN };
