/**
 * Rhyme web: every family of rhyming sounds in the song, the line endings that
 * rhyme with nothing, and families that carry too much of the song.
 */
import { CLICHE_RHYMES } from '../lyrics/shape';
import { sectionDisplayNames, type SectionWithLines } from '../model';
import { analyzeSound } from './sound';

export interface WebWord {
  text: string;
  /** flat line index across the song */
  lineIndex: number;
  sectionIndex: number;
  /** line number within its section, from 1 */
  row: number;
  atLineEnd: boolean;
  /** how many times this word appears in the family */
  count: number;
}

export interface WebFamily {
  id: number;
  kind: 'perfect' | 'slant';
  color: number;
  words: WebWord[];
  /** line endings in this family */
  endings: number;
  /** share of all line endings that belong to it, 0..1 */
  share: number;
}

export interface RhymeWeb {
  families: WebFamily[];
  /** line-end words that rhyme with nothing else */
  orphans: WebWord[];
  lineCount: number;
  /** plain-language observations */
  notes: string[];
}

const lastWord = (text: string) => (text.toLowerCase().match(/[a-z']+/g) ?? []).pop() ?? '';

export function rhymeWeb(sections: SectionWithLines[]): RhymeWeb {
  const flat: { id: string; sectionId: string; text: string; si: number; row: number }[] = [];
  sections.forEach((s, si) => s.lines.forEach((l, row) => flat.push({ id: l.id, sectionId: s.id, text: l.text, si, row })));
  const sound = analyzeSound(flat, { modes: ['perfect', 'slant'], sensitivity: 0.5, scope: 'all' });
  const names = sectionDisplayNames(sections);
  const written = flat.map((l, i) => i).filter((i) => flat[i].text.trim());
  const lineCount = written.length;

  const inFamily = new Set<number>();
  const families: WebFamily[] = sound.families.map((f) => {
    const byText = new Map<string, WebWord>();
    let endings = 0;
    for (const m of f.members) {
      if (m.atLineEnd) {
        endings++;
        inFamily.add(m.lineIndex);
      }
      // the member text is only the rhyming tail ("sire"); show the whole word at line ends
      const shown = (m.atLineEnd ? lastWord(flat[m.lineIndex].text) : '') || m.text.toLowerCase();
      const key = shown;
      const hit = byText.get(key);
      if (hit) hit.count++;
      else byText.set(key, { text: shown, lineIndex: m.lineIndex, sectionIndex: flat[m.lineIndex].si, row: flat[m.lineIndex].row + 1, atLineEnd: m.atLineEnd, count: 1 });
    }
    return { id: f.id, kind: f.kind, color: f.color, words: [...byText.values()], endings, share: lineCount ? endings / lineCount : 0 };
  });
  families.sort((a, b) => b.words.length - a.words.length || b.endings - a.endings);

  const orphans: WebWord[] = written
    .filter((i) => !inFamily.has(i) && lastWord(flat[i].text))
    .map((i) => ({ text: lastWord(flat[i].text), lineIndex: i, sectionIndex: flat[i].si, row: flat[i].row + 1, atLineEnd: true, count: 1 }));

  const notes: string[] = [];
  if (lineCount >= 4 && orphans.length) {
    const where = orphans
      .slice(0, 4)
      .map((o) => `"${o.text}" (${names[o.sectionIndex]}, line ${o.row})`)
      .join(', ');
    notes.push(`${orphans.length} of ${lineCount} line endings rhyme with nothing: ${where}${orphans.length > 4 ? ', …' : ''}.`);
  }
  for (const f of families) {
    if (f.endings >= 4 && f.share >= 0.5) {
      const w = f.words.filter((x) => x.atLineEnd).map((x) => x.text).slice(0, 3).join(', ');
      notes.push(`One sound (${w}…) ends ${f.endings} of ${lineCount} lines. Another family would give the song a second colour.`);
    }
    const texts = new Set(f.words.map((x) => x.text));
    for (const [a, b] of CLICHE_RHYMES) if (texts.has(a) && texts.has(b)) notes.push(`"${a}" and "${b}" is a very well-worn rhyme.`);
  }
  return { families, orphans, lineCount, notes };
}

/** Place families on a ring and their words around each, for drawing. Deterministic. */
export interface WebLayout {
  width: number;
  height: number;
  families: { family: WebFamily; x: number; y: number; r: number; words: { word: WebWord; x: number; y: number }[] }[];
}

export function layoutWeb(web: RhymeWeb, width: number): WebLayout {
  const fams = web.families;
  const n = fams.length;
  if (!n) return { width, height: 0, families: [] };
  // each family is a cluster; clusters sit in a grid that fits the width
  const cols = Math.max(1, Math.min(n, width >= 520 ? 3 : 2));
  const cell = width / cols;
  const out: WebLayout['families'] = [];
  const rowsNeeded = Math.ceil(n / cols);
  const rowH = Math.max(150, cell * 0.95);
  fams.forEach((family, i) => {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * rowH + rowH / 2;
    const k = family.words.length;
    const r = Math.min(cell, rowH) * 0.34;
    out.push({
      family,
      x: cx,
      y: cy,
      r,
      words: family.words.map((word, j) => ({ word, x: cx + Math.cos((2 * Math.PI * j) / k - Math.PI / 2) * r, y: cy + Math.sin((2 * Math.PI * j) / k - Math.PI / 2) * r })),
    });
  });
  return { width, height: rowsNeeded * rowH, families: out };
}
