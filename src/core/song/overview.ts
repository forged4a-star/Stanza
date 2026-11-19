/**
 * A bird's-eye view of a song: how long each section is and where the words,
 * chords and melody are busy or quiet. Pure numbers and plain-language notes;
 * nothing here writes or suggests lyrics.
 */
import { sectionDisplayNames, type SectionKind, type SongDoc } from '../model';
import { stepsPerBar } from '../music/melody';
import { analyzeLine } from '../phonetics/line';

export interface SectionSpan {
  index: number;
  name: string;
  kind: SectionKind;
  /** length in bars: the chord grid or melody, or two bars per written line if that is longer */
  bars: number;
  /** this section's share of the whole song, 0..1 */
  share: number;
  lines: number;
  hasChords: boolean;
  hasMelody: boolean;
  /** true when the length is a guess from the number of lines (no chords or melody to measure) */
  estimated: boolean;
}

export type HeatRowId = 'words' | 'chords' | 'melody';

export interface HeatRow {
  id: HeatRowId;
  label: string;
  /** one value per section, 0..1 across the song, or null when the section has none of it */
  cells: (number | null)[];
  /** the unscaled number behind each cell (syllables per bar, chords per bar, semitones of range) */
  raw: (number | null)[];
}

export interface Overview {
  spans: SectionSpan[];
  totalBars: number;
  rows: HeatRow[];
  /** plain observations, most useful first */
  notes: string[];
}

/** Scale to 0.15..1 so the quietest section still shows; one lone value reads as 0.6. */
export function scale01(values: (number | null)[]): (number | null)[] {
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return values.map(() => null);
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  return values.map((v) => (v === null ? null : hi === lo ? (present.length === 1 ? 0.6 : 0.5) : 0.15 + (0.85 * (v - lo)) / (hi - lo)));
}

export function songOverview(doc: SongDoc): Overview {
  const { timeSig } = doc.song;
  const per = stepsPerBar(timeSig);
  const names = sectionDisplayNames(doc.sections);
  const raw = doc.sections.map((s) => {
    const lines = s.lines.filter((l) => l.text.trim());
    const melodyBars = s.melody.length ? Math.ceil(Math.max(...s.melody.map((n) => n.start + n.length)) / per) : 0;
    const measured = Math.max(s.bars.length, melodyBars);
    const guessed = lines.length * 2;
    const bars = Math.max(measured, guessed, lines.length || measured ? 1 : 0);
    const syllables = lines.reduce((n, l) => n + analyzeLine(l.text).syllables.length, 0);
    const pitches = s.melody.map((n) => n.pitch);
    return {
      lines: lines.length,
      bars,
      estimated: measured === 0 && bars > 0,
      syllables,
      chordChanges: s.bars.reduce((n, b) => n + b.chords.length, 0),
      range: pitches.length ? Math.max(...pitches) - Math.min(...pitches) : null,
      hasChords: s.bars.length > 0 || s.lines.some((l) => l.chords.length > 0),
      hasMelody: s.melody.length > 0,
    };
  });
  const totalBars = raw.reduce((n, r) => n + r.bars, 0);
  const spans: SectionSpan[] = doc.sections.map((s, i) => ({
    index: i,
    name: names[i],
    kind: s.kind,
    bars: raw[i].bars,
    share: totalBars ? raw[i].bars / totalBars : 0,
    lines: raw[i].lines,
    hasChords: raw[i].hasChords,
    hasMelody: raw[i].hasMelody,
    estimated: raw[i].estimated,
  }));
  const perBar = (n: number, i: number) => (raw[i].bars ? n / raw[i].bars : null);
  const wordsRaw = raw.map((r, i) => (r.syllables ? perBar(r.syllables, i) : null));
  // chord rate is per bar of the chord grid itself (a four-chord loop sung over eight bars is still one chord a bar)
  const chordsRaw = raw.map((r, i) => (doc.sections[i].bars.length ? r.chordChanges / doc.sections[i].bars.length : null));
  const melodyRaw = raw.map((r) => r.range);
  const rows: HeatRow[] = [
    { id: 'words', label: 'Words', cells: scale01(wordsRaw), raw: wordsRaw },
    { id: 'chords', label: 'Chords', cells: scale01(chordsRaw), raw: chordsRaw },
    { id: 'melody', label: 'Melody', cells: scale01(melodyRaw), raw: melodyRaw },
  ];
  return { spans, totalBars, rows, notes: overviewNotes(spans) };
}

function overviewNotes(spans: SectionSpan[]): string[] {
  const notes: string[] = [];
  const live = spans.filter((s) => s.bars > 0);
  if (live.length >= 3) {
    const avg = live.reduce((n, s) => n + s.bars, 0) / live.length;
    for (const s of live) {
      if (s.bars >= avg * 1.8 && s.bars - avg >= 4) notes.push(`${s.name} is the longest part at ${s.bars} bars; the others average ${Math.round(avg)}.`);
    }
  }
  const choruses = spans.filter((s) => s.kind === 'chorus' && s.bars > 0);
  if (choruses.length === 1 && spans.length >= 3) notes.push('The chorus only comes round once.');
  const anyChords = spans.some((s) => s.hasChords);
  if (anyChords) {
    const bare = spans.filter((s) => s.lines > 0 && !s.hasChords);
    if (bare.length && bare.length < spans.length) notes.push(`No chords yet in ${bare.map((s) => s.name).join(', ')}.`);
  }
  const empty = spans.filter((s) => s.bars === 0);
  if (empty.length) notes.push(`${empty.map((s) => s.name).join(', ')} ${empty.length === 1 ? 'is' : 'are'} still empty.`);
  const first = spans.find((s) => s.bars > 0);
  if (first && first.kind === 'chorus' && spans.length >= 3) notes.push('The song opens on the chorus.');
  return notes;
}
