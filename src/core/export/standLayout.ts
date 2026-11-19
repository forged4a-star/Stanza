/**
 * Music-stand layout: split a song into pages that fit a screen, so a
 * performer turns pages instead of scrolling. Heights are estimates in
 * pixels (text width is guessed from the font size), kept slightly generous so
 * a page never overflows. Spacing at the top and bottom of a page is dropped.
 */
import { sectionDisplayNames, type SongDoc } from '../model';

export type BlockKind = 'header' | 'bars' | 'line' | 'blank' | 'gap';

export interface StandBlock {
  kind: BlockKind;
  section: number;
  /** index of the line within its section, for 'line' and 'blank' */
  line?: number;
  h: number;
}

export interface StandOptions {
  /** lyric font size, px */
  size: number;
  /** width of one column, px */
  colWidth: number;
  showChords: boolean;
}

/** Average glyph width as a fraction of the font size (a little wide, so wrapping is not underestimated). */
const GLYPH = 0.52;

export function standBlocks(doc: SongDoc, o: StandOptions): StandBlock[] {
  const { size, colWidth, showChords } = o;
  const out: StandBlock[] = [];
  const perRow = Math.max(8, Math.floor(colWidth / (size * GLYPH)));
  doc.sections.forEach((s, i) => {
    out.push({ kind: 'header', section: i, h: size * 0.5 * 1.3 + 6 });
    if (showChords && s.bars.length) {
      const chars = s.bars.map((b) => b.chords.join(' ') || '·').join('  |  ').length;
      const rows = Math.max(1, Math.ceil((chars * size * 0.8 * GLYPH) / colWidth));
      out.push({ kind: 'bars', section: i, h: rows * size * 0.8 * 1.3 + 6 });
    }
    s.lines.forEach((l, j) => {
      if (!l.text.trim()) {
        out.push({ kind: 'blank', section: i, line: j, h: size * 0.8 });
        return;
      }
      const rows = Math.max(1, Math.ceil(l.text.length / perRow));
      const chordRow = showChords && l.chords.length ? size * 1.1 : 0;
      out.push({ kind: 'line', section: i, line: j, h: rows * (chordRow + size * 1.3) + 6 });
    });
    out.push({ kind: 'gap', section: i, h: size });
  });
  return out;
}

/**
 * Pack blocks into pages of `pageHeight`. A section's heading never sits alone
 * at the bottom of a page, and spacing at the top of a page is dropped.
 */
export function paginate(blocks: StandBlock[], pageHeight: number): StandBlock[][] {
  const pages: StandBlock[][] = [];
  let page: StandBlock[] = [];
  let used = 0;
  const flush = () => {
    // spacing at the bottom of a page is just wasted room
    while (page.length && (page[page.length - 1].kind === 'gap' || page[page.length - 1].kind === 'blank')) page.pop();
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if ((b.kind === 'gap' || b.kind === 'blank') && page.length === 0) continue;
    // a heading (and the chord row under it) needs the first words of its section on the same page
    let need = b.h;
    if (b.kind === 'header') {
      let j = i + 1;
      if (blocks[j]?.kind === 'bars') need += blocks[j++].h;
      if (blocks[j]) need += blocks[j].h;
    }
    if (used + need > pageHeight && page.length) flush();
    if ((b.kind === 'gap' || b.kind === 'blank') && page.length === 0) continue;
    page.push(b);
    used += b.h;
  }
  flush();
  return pages;
}

/** Pages shown together: one on a phone, two side by side on a wide screen. */
export function spreadsOf<T>(pages: T[], perSpread: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < pages.length; i += perSpread) out.push(pages.slice(i, i + perSpread));
  return out;
}

export const columnsFor = (width: number) => (width >= 900 ? 2 : 1);

export { sectionDisplayNames };
