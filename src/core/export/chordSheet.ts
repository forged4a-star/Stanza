/**
 * The classic chord sheet: a line of chords above each lyric line, each chord
 * sitting over the syllable it belongs to. Plain monospace text that pastes
 * anywhere (and reads back through the lyrics importer).
 */
import { sectionDisplayNames, type SongDoc } from '../model';
import { analyzeLine } from '../phonetics/line';
import { romanNumeral, parseKey, transposeChord } from '../music/theory';

export interface ChordSheetOptions {
  transpose?: number;
  roman?: boolean;
}

/** Chords positioned at character columns; chords that would collide are nudged right. */
export function chordLineFor(text: string, chords: { syl: number; chord: string }[], label: (c: string) => string): string {
  if (!chords.length) return '';
  const info = analyzeLine(text);
  const placed = chords
    .map((c) => ({ at: info.syllables[Math.min(c.syl, info.syllables.length - 1)]?.start ?? 0, text: label(c.chord) }))
    .sort((a, b) => a.at - b.at);
  let out = '';
  for (const p of placed) {
    // keep at least one space between chords
    const col = Math.max(p.at, out.length ? out.length + 1 : 0);
    out = out.padEnd(col, ' ') + p.text;
  }
  return out;
}

export function chordSheetText(doc: SongDoc, opts: ChordSheetOptions = {}): string {
  const t = opts.transpose ?? 0;
  const key = parseKey(doc.song.key);
  const label = (c: string) => {
    const moved = t ? transposeChord(c, t) : c;
    return opts.roman && key ? romanNumeral(moved, key) : moved;
  };
  const names = sectionDisplayNames(doc.sections);
  const head: string[] = [doc.song.title.trim() || 'Untitled'];
  const bits: string[] = [];
  if (doc.song.key) bits.push(`Key: ${t ? transposeChord(doc.song.key, t) : doc.song.key}`);
  if (doc.song.capo) bits.push(`Capo ${doc.song.capo}`);
  bits.push(`${Math.round(doc.song.bpm)} bpm`);
  head.push(bits.join('   '), '');
  const out: string[] = [...head];
  doc.sections.forEach((s, i) => {
    out.push(`[${names[i]}]`);
    if (s.bars.length) {
      const cells = s.bars.map((b) => b.chords.map(label).join(' '));
      for (let k = 0; k < cells.length; k += 4) out.push('| ' + cells.slice(k, k + 4).join(' | ') + ' |');
    }
    for (const l of s.lines) {
      const chordLine = chordLineFor(l.text, l.chords, label);
      if (chordLine) out.push(chordLine);
      out.push(l.text);
    }
    while (out[out.length - 1] === '') out.pop();
    out.push('');
  });
  return out.join('\n').replace(/\n+$/, '\n');
}
