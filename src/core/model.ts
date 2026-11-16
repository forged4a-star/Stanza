/** Domain types shared by the database, the stores, the UI and export. */

export type SongStatus = 'idea' | 'draft' | 'finished';
export const SONG_STATUSES: SongStatus[] = ['idea', 'draft', 'finished'];

export type SectionKind = 'intro' | 'verse' | 'pre' | 'chorus' | 'post' | 'bridge' | 'outro' | 'custom';
export const SECTION_KINDS: SectionKind[] = ['verse', 'pre', 'chorus', 'post', 'bridge', 'intro', 'outro', 'custom'];
export const SECTION_KIND_NAMES: Record<SectionKind, string> = {
  intro: 'Intro',
  verse: 'Verse',
  pre: 'Pre-chorus',
  chorus: 'Chorus',
  post: 'Post-chorus',
  bridge: 'Bridge',
  outro: 'Outro',
  custom: 'Section',
};

export interface Song {
  id: string;
  title: string;
  folderId: string | null;
  status: SongStatus;
  pinned: boolean;
  tags: string[];
  /** e.g. "C", "F#m", "Bb" — null when unset */
  key: string | null;
  bpm: number;
  /** beats per bar / beat unit, e.g. [4,4] */
  timeSig: [number, number];
  capo: number;
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  deletedAt: number | null;
}

/** A chord placed above a syllable of a lyric line. */
export interface LineChord {
  /** syllable index in the line (see core/phonetics/line.ts) */
  syl: number;
  chord: string;
}

export interface Line {
  id: string;
  sectionId: string;
  sort: number;
  text: string;
  locked: boolean;
  /** stashed alternate versions of this line (the live text is not included) */
  alts: string[];
  chords: LineChord[];
}

/** One bar of the section's chord grid. Each bar holds 1-4 chords splitting it evenly. */
export interface ChordBar {
  chords: string[];
}

export interface Note {
  id: string;
  /** MIDI pitch */
  pitch: number;
  /** start and length in sixteenth-note steps from the start of the section */
  start: number;
  length: number;
  /** linked lyric syllable: line id + syllable index */
  lineId?: string | null;
  syl?: number | null;
}

export interface Section {
  id: string;
  songId: string;
  kind: SectionKind;
  /** user label for custom sections, or an override like "Final chorus"; '' = automatic */
  label: string;
  sort: number;
  collapsed: boolean;
  /** the feeling this section carries, in the writer's own words */
  feeling: string;
  /** 0..1 intensity for the feeling arc */
  intensity: number | null;
  bars: ChordBar[];
  melody: Note[];
}

export interface SectionWithLines extends Section {
  lines: Line[];
}

export interface SongDoc {
  song: Song;
  sections: SectionWithLines[];
}

export interface Recording {
  id: string;
  songId: string | null;
  sectionId: string | null;
  lineId: string | null;
  title: string;
  /** storage key understood by audio/storage (a file name, not a full URI) */
  file: string;
  mime: string;
  durationMs: number;
  bpm: number | null;
  key: string | null;
  transcript: string;
  takeNo: number;
  starred: boolean;
  createdAt: number;
  /** analysis state: 'pending' | 'done' | 'failed' */
  analysis: 'pending' | 'done' | 'failed';
}

export type IdeaKind = 'text' | 'audio' | 'chords';

export interface Idea {
  id: string;
  kind: IdeaKind;
  /** a line of lyric, a note, or a chord loop like "Am F C G" */
  text: string;
  recordingId: string | null;
  createdAt: number;
  /** set when the idea has been moved into a song */
  usedInSongId: string | null;
}

export interface Folder {
  id: string;
  name: string;
  sort: number;
}

export interface Scrap {
  id: string;
  songId: string | null;
  songTitle: string;
  sectionLabel: string;
  text: string;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  songId: string;
  label: string;
  createdAt: number;
  /** auto snapshots are taken before restores and periodically; manual ones are named */
  auto: boolean;
}

export interface SnapshotWithData extends Snapshot {
  data: SongDoc;
}

/** Display name for a section, auto-numbering repeated kinds: "Verse 2", "Chorus". */
export function sectionDisplayNames(sections: Pick<Section, 'kind' | 'label'>[]): string[] {
  const totals = new Map<SectionKind, number>();
  for (const s of sections) totals.set(s.kind, (totals.get(s.kind) ?? 0) + 1);
  const seen = new Map<SectionKind, number>();
  return sections.map((s) => {
    const n = (seen.get(s.kind) ?? 0) + 1;
    seen.set(s.kind, n);
    if (s.label.trim()) return s.label.trim();
    const base = SECTION_KIND_NAMES[s.kind];
    // choruses usually repeat identically; only number kinds that typically differ
    const numbered = (totals.get(s.kind) ?? 0) > 1 && s.kind !== 'chorus' && s.kind !== 'post';
    return numbered ? `${base} ${n}` : base;
  });
}

/** The section a given section should be compared with: the previous one of the same kind. */
export function parallelSectionIndex(sections: Pick<Section, 'kind'>[], index: number): number | null {
  const kind = sections[index].kind;
  if (kind === 'custom') return null;
  for (let i = index - 1; i >= 0; i--) if (sections[i].kind === kind) return i;
  return null;
}

export function songPlainText(doc: SongDoc, withHeaders = true): string {
  const names = sectionDisplayNames(doc.sections);
  const parts: string[] = [];
  doc.sections.forEach((s, i) => {
    const body = s.lines.map((l) => l.text).join('\n').replace(/\s+$/, '');
    if (!body && !withHeaders) return;
    parts.push((withHeaders ? `[${names[i]}]\n` : '') + body);
  });
  return parts.join('\n\n');
}
