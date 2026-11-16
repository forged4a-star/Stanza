/**
 * Everything the lyric page shows in the margins and highlights, computed
 * from the song in one pass and memoised. Deferred so typing stays instant.
 */
import { useDeferredValue, useMemo } from 'react';
import { parallelSectionIndex, sectionDisplayNames, type SongDoc } from '../../core/model';
import { analyzeLine, type LineInfo } from '../../core/phonetics/line';
import { analyzeSound, type Mark, type RhymeFamily, type SoundMode } from '../../core/phonetics/sound';

export interface LineMeta {
  info: LineInfo;
  syllables: number;
  /** syllable count of the matching line in the parallel section, when it differs */
  mismatch: { other: number; where: string } | null;
  scheme: string | null;
  marks: Mark[][];
}

export interface SongAnalysis {
  lines: Map<string, LineMeta>;
  families: RhymeFamily[];
  names: string[];
  /** lineIndex (flat) → line id */
  order: string[];
}

export function useSongAnalysis(doc: SongDoc | null, opts: { highlight: boolean; modes: SoundMode[]; sensitivity: number; scope: 'end' | 'all' }): SongAnalysis | null {
  const sections = useDeferredValue(doc?.sections);
  const { highlight, modes, sensitivity, scope } = opts;
  const modesKey = modes.join(',');
  return useMemo(() => {
    if (!sections) return null;
    const names = sectionDisplayNames(sections);
    const flat = sections.flatMap((s) => s.lines.map((l) => ({ id: l.id, sectionId: s.id, text: l.text })));
    const sound = analyzeSound(flat, { modes: highlight ? (modesKey ? (modesKey.split(',') as SoundMode[]) : []) : [], sensitivity, scope });
    const lines = new Map<string, LineMeta>();
    flat.forEach((l, i) => {
      lines.set(l.id, { info: sound.lines[i], syllables: sound.lines[i].syllables.length, mismatch: null, scheme: sound.scheme[i], marks: sound.marks[i] });
    });
    sections.forEach((s, si) => {
      const p = parallelSectionIndex(sections, si);
      if (p === null) return;
      const other = sections[p];
      s.lines.forEach((l, li) => {
        const o = other.lines[li];
        if (!o || !o.text.trim() || !l.text.trim()) return;
        const mine = lines.get(l.id)!;
        const theirs = analyzeLine(o.text).syllables.length;
        if (theirs !== mine.syllables) mine.mismatch = { other: theirs, where: `${names[p]}, line ${li + 1}` };
      });
    });
    return { lines, families: sound.families, names, order: flat.map((l) => l.id) };
  }, [sections, highlight, modesKey, sensitivity, scope]);
}
