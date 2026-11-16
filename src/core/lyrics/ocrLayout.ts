/**
 * Turn OCR output (lines with positions) into plain lyric text: reading
 * order, status-bar clutter removed, and a blank line wherever the vertical
 * gap is bigger than normal line spacing (so section breaks survive).
 */
export interface OcrLine {
  text: string;
  frame?: { top: number; left: number; width: number; height: number };
}

const CHROME = [/^\d{1,2}:\d{2}(\s?[AP]M)?$/i, /^\d{1,3}\s?%$/, /^(LTE|5G|4G|3G|WI-?FI|VOLTE)$/i, /^[•·.\s]+$/];

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

export function ocrToText(input: OcrLine[]): string {
  const lines = input.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text && !CHROME.some((re) => re.test(l.text)));
  if (!lines.length) return '';
  // without positions there is nothing to infer: keep the order we were given
  if (lines.some((l) => !l.frame)) return lines.map((l) => l.text).join('\n');
  const pos = lines.map((l) => ({ text: l.text, top: l.frame!.top, bottom: l.frame!.top + l.frame!.height, left: l.frame!.left, h: l.frame!.height }));
  pos.sort((a, b) => a.top - b.top || a.left - b.left);
  const h = median(pos.map((p) => p.h)) || 1;
  const out: string[] = [];
  let prev: (typeof pos)[number] | null = null;
  for (const p of pos) {
    if (prev) {
      // overlapping rows (columns side by side) are joined with a space; otherwise it's a new line
      const overlap = Math.min(prev.bottom, p.bottom) - Math.max(prev.top, p.top);
      if (overlap > 0.5 * Math.min(prev.h, p.h)) {
        out[out.length - 1] += ' ' + p.text;
        prev = { ...p, top: Math.min(prev.top, p.top), bottom: Math.max(prev.bottom, p.bottom) };
        continue;
      }
      const gap = p.top - prev.bottom;
      if (gap > 0.8 * h) out.push('');
    }
    out.push(p.text);
    prev = p;
  }
  return out.join('\n');
}
