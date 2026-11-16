/**
 * Turn pasted lyrics into labelled sections. Rule-based and offline: reads
 * section headers ("[Chorus]", "Verse 2:"), blank-line breaks, repeated blocks
 * (a block that comes back is a chorus), chord lines above lyrics, and text
 * that arrives double-spaced from notes apps.
 */
import type { LineChord, SectionKind } from '../model';
import { parseChord } from '../music/theory';
import { analyzeLine, syllableAtOffset } from '../phonetics/line';

export interface ImportedLine {
  text: string;
  chords: LineChord[];
}

export interface ImportedSection {
  kind: SectionKind;
  label: string;
  lines: ImportedLine[];
  /** chords found with no lyric under them */
  bars: string[];
  /** how the kind was decided, for the confirmation screen */
  why: 'header' | 'repeats' | 'position' | 'default';
}

export interface ImportResult {
  title: string | null;
  sections: ImportedSection[];
}

const HEADER = /^\s*[\[(#*\s]*\s*(intro|verse|pre[-\s]?chorus|prechorus|pre|chorus|hook|refrain|post[-\s]?chorus|bridge|middle\s?8|outro|ending|interlude|instrumental|solo|break)\s*(\d+)?\s*[\])*]*\s*[:.\-–—]?\s*(?:\(?x\s?\d+\)?)?\s*$/i;

function headerKind(word: string): { kind: SectionKind; label: string } {
  const w = word.toLowerCase().replace(/[-\s]/g, '');
  if (w === 'intro') return { kind: 'intro', label: '' };
  if (w === 'verse') return { kind: 'verse', label: '' };
  if (w === 'prechorus' || w === 'pre') return { kind: 'pre', label: '' };
  if (w === 'chorus' || w === 'hook' || w === 'refrain') return { kind: 'chorus', label: w === 'chorus' ? '' : word[0].toUpperCase() + word.slice(1).toLowerCase() };
  if (w === 'postchorus') return { kind: 'post', label: '' };
  if (w === 'bridge' || w === 'middle8') return { kind: 'bridge', label: w === 'bridge' ? '' : 'Middle 8' };
  if (w === 'outro' || w === 'ending') return { kind: 'outro', label: '' };
  return { kind: 'custom', label: word[0].toUpperCase() + word.slice(1).toLowerCase() };
}

/** A line made only of chord names ("Am   F  C/E  G7"). */
function chordLine(line: string): { chord: string; col: number }[] | null {
  const tokens = [...line.matchAll(/\S+/g)];
  if (!tokens.length) return null;
  const out: { chord: string; col: number }[] = [];
  for (const m of tokens) {
    const tok = m[0].replace(/^[|(]+|[|),]+$/g, '');
    if (!tok) continue;
    // single letters like "A" or "I" in a sentence aren't chords unless everything is
    if (!parseChord(tok)) return null;
    out.push({ chord: tok, col: m.index! });
  }
  // "A" alone or "Am I" style false positives: need 2+ chords or a non-trivial one
  if (out.length === 1 && /^[A-G]$/.test(out[0].chord) && line.trim().length === 1) return out;
  return out.length ? out : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

export function importLyrics(raw: string): ImportResult {
  let rows = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map((r) => r.replace(/\s+$/, ''));
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();

  // Double-spaced paste: every lyric line is followed by a blank one. Treat a
  // single blank as a plain line break and a bigger gap as a section break.
  const filled = rows.filter((r) => r.trim()).length;
  let adjacent = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].trim() && rows[i - 1].trim()) adjacent++;
  if (filled >= 4 && adjacent === 0) {
    const out: string[] = [];
    let blanks = 0;
    for (const r of rows) {
      if (!r.trim()) {
        blanks++;
        continue;
      }
      if (out.length && blanks >= 2) out.push('');
      blanks = 0;
      out.push(r);
    }
    rows = out;
  }

  let title: string | null = null;
  const tm = /^\s*title\s*[:\-]\s*(.+)$/i.exec(rows[0] ?? '');
  if (tm) {
    title = tm[1].trim();
    rows.shift();
  }

  const sections: ImportedSection[] = [];
  let cur: ImportedSection | null = null;
  let pending: { chord: string; col: number }[] | null = null;
  const close = () => {
    if (cur && pending) cur.bars.push(...pending.map((p) => p.chord));
    pending = null;
    if (cur && (cur.lines.length || cur.bars.length || cur.why === 'header')) sections.push(cur);
    cur = null;
  };
  for (const row of rows) {
    if (!row.trim()) {
      close();
      continue;
    }
    const h = HEADER.exec(row);
    if (h) {
      close();
      const k = headerKind(h[1]);
      cur = { kind: k.kind, label: k.label, lines: [], bars: [], why: 'header' };
      continue;
    }
    if (!cur) cur = { kind: 'verse', label: '', lines: [], bars: [], why: 'default' };
    const chords = chordLine(row);
    if (chords) {
      if (pending) cur.bars.push(...pending.map((p) => p.chord));
      pending = chords;
      continue;
    }
    // inline ChordPro style: "[Am]Hello [F]there"
    let text = row;
    const lineChords: LineChord[] = [];
    if (/\[[A-G][^\]\s]*\]/.test(row)) {
      const found: { chord: string; col: number }[] = [];
      text = '';
      let last = 0;
      for (const m of row.matchAll(/\[([^\]\s]+)\]/g)) {
        text += row.slice(last, m.index);
        if (parseChord(m[1])) found.push({ chord: m[1], col: text.length });
        else text += m[0];
        last = m.index! + m[0].length;
      }
      text += row.slice(last);
      pending = found.length ? found : pending;
    }
    text = text.trim() === text ? text : text.replace(/^\s+/, (lead) => (pending ? lead : ''));
    if (pending) {
      const info = analyzeLine(text);
      if (info.syllables.length) {
        const seen = new Set<number>();
        for (const p of pending) {
          const syl = syllableAtOffset(info, Math.min(p.col, Math.max(0, text.length - 1)));
          if (syl >= 0 && !seen.has(syl)) {
            seen.add(syl);
            lineChords.push({ syl, chord: p.chord });
          }
        }
      } else cur.bars.push(...pending.map((p) => p.chord));
      pending = null;
    }
    cur.lines.push({ text: text.trim(), chords: lineChords });
  }
  close();

  // unlabelled blocks: one that comes back is a chorus; a new one late in the song is a bridge
  const keyOf = (s: ImportedSection) => norm(s.lines.map((l) => l.text).join(' '));
  const counts = new Map<string, number>();
  for (const s of sections) if (s.lines.length) counts.set(keyOf(s), (counts.get(keyOf(s)) ?? 0) + 1);
  let chorusesSeen = 0;
  const hasHeaders = sections.some((s) => s.why === 'header');
  sections.forEach((s, i) => {
    if (s.why === 'header') {
      if (s.kind === 'chorus') chorusesSeen++;
      return;
    }
    if (!s.lines.length) return;
    if ((counts.get(keyOf(s)) ?? 0) >= 2) {
      s.kind = 'chorus';
      s.why = 'repeats';
      chorusesSeen++;
    } else if (!hasHeaders && chorusesSeen >= 2 && i < sections.length - 1 && sections.slice(i + 1).some((x) => (counts.get(keyOf(x)) ?? 0) >= 2)) {
      s.kind = 'bridge';
      s.why = 'position';
    }
  });
  return { title, sections: sections.filter((s) => s.lines.length || s.bars.length) };
}
