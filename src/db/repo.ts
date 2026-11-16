/**
 * All persistence. Every function takes a driver so it can run standalone or
 * inside a transaction. Nothing here knows about React.
 */
import {
  type ChordBar,
  type Folder,
  type Idea,
  type IdeaKind,
  type Line,
  type LineChord,
  type Note,
  type Recording,
  type Scrap,
  type Section,
  type SectionKind,
  type SectionWithLines,
  type Snapshot,
  type SnapshotWithData,
  type Song,
  type SongDoc,
  type SongStatus,
  sectionDisplayNames,
} from '../core/model';
import { newId } from '../core/util/id';
import type { Db, SqlDriver, SqlParam } from './driver';

type Row = Record<string, any>;

const parseJson = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

// ------------------------------------------------------------------ mapping

function songFromRow(r: Row, tags: string[] = []): Song {
  const [a, b] = String(r.time_sig ?? '4/4').split('/').map(Number);
  return {
    id: r.id,
    title: r.title,
    folderId: r.folder_id ?? null,
    status: r.status as SongStatus,
    pinned: !!r.pinned,
    tags,
    key: r.song_key ?? null,
    bpm: Number(r.bpm),
    timeSig: [a || 4, b || 4],
    capo: Number(r.capo) || 0,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    openedAt: Number(r.opened_at),
    deletedAt: r.deleted_at == null ? null : Number(r.deleted_at),
  };
}

function sectionFromRow(r: Row): Section {
  return {
    id: r.id,
    songId: r.song_id,
    kind: r.kind as SectionKind,
    label: r.label,
    sort: Number(r.sort),
    collapsed: !!r.collapsed,
    feeling: r.feeling,
    intensity: r.intensity == null ? null : Number(r.intensity),
    bars: parseJson<ChordBar[]>(r.bars, []),
    melody: parseJson<Note[]>(r.melody, []),
  };
}

function lineFromRow(r: Row): Line {
  return {
    id: r.id,
    sectionId: r.section_id,
    sort: Number(r.sort),
    text: r.text,
    locked: !!r.locked,
    alts: parseJson<string[]>(r.alts, []),
    chords: parseJson<LineChord[]>(r.chords, []),
  };
}

function recordingFromRow(r: Row): Recording {
  return {
    id: r.id,
    songId: r.song_id ?? null,
    sectionId: r.section_id ?? null,
    lineId: r.line_id ?? null,
    title: r.title,
    file: r.file,
    mime: r.mime,
    durationMs: Number(r.duration_ms),
    bpm: r.bpm == null ? null : Number(r.bpm),
    key: r.rec_key ?? null,
    transcript: r.transcript,
    takeNo: Number(r.take_no),
    starred: !!r.starred,
    createdAt: Number(r.created_at),
    analysis: r.analysis,
  };
}

const ideaFromRow = (r: Row): Idea => ({
  id: r.id,
  kind: r.kind as IdeaKind,
  text: r.text,
  recordingId: r.recording_id ?? null,
  createdAt: Number(r.created_at),
  usedInSongId: r.used_in_song_id ?? null,
});

// ------------------------------------------------------------------ songs

export interface NewSongOptions {
  title?: string;
  folderId?: string | null;
  /** initial sections; default: one empty verse */
  sections?: { kind: SectionKind; label?: string; lines: string[] }[];
}

export async function createSong(db: Db, opts: NewSongOptions = {}): Promise<SongDoc> {
  const now = Date.now();
  const id = newId();
  const sections = opts.sections ?? [{ kind: 'verse' as SectionKind, lines: [''] }];
  await db.tx(async (d) => {
    await d.run(
      `INSERT INTO songs (id, title, folder_id, status, created_at, updated_at, opened_at) VALUES (?, ?, ?, 'idea', ?, ?, ?)`,
      [id, opts.title ?? '', opts.folderId ?? null, now, now, now]
    );
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const sid = newId();
      await d.run(`INSERT INTO sections (id, song_id, kind, label, sort) VALUES (?, ?, ?, ?, ?)`, [sid, id, s.kind, s.label ?? '', i]);
      const lines = s.lines.length ? s.lines : [''];
      for (let j = 0; j < lines.length; j++) {
        await d.run(`INSERT INTO lines (id, section_id, sort, text) VALUES (?, ?, ?, ?)`, [newId(), sid, j, lines[j]]);
      }
    }
    await refreshSearchText(d, id);
  });
  return (await loadSong(db, id))!;
}

export async function loadSong(d: SqlDriver, id: string): Promise<SongDoc | null> {
  const r = await d.first<Row>(`SELECT * FROM songs WHERE id = ?`, [id]);
  if (!r) return null;
  const tags = (await d.all<Row>(`SELECT tag FROM song_tags WHERE song_id = ? ORDER BY tag`, [id])).map((t) => t.tag as string);
  const sections = (await d.all<Row>(`SELECT * FROM sections WHERE song_id = ? ORDER BY sort`, [id])).map(sectionFromRow);
  const lines = (
    await d.all<Row>(
      `SELECT l.* FROM lines l JOIN sections s ON s.id = l.section_id WHERE s.song_id = ? ORDER BY l.sort`,
      [id]
    )
  ).map(lineFromRow);
  const bySection = new Map<string, Line[]>();
  for (const l of lines) {
    if (!bySection.has(l.sectionId)) bySection.set(l.sectionId, []);
    bySection.get(l.sectionId)!.push(l);
  }
  return {
    song: songFromRow(r, tags),
    sections: sections.map((s) => ({ ...s, lines: bySection.get(s.id) ?? [] })),
  };
}

export type SongPatch = Partial<Pick<Song, 'title' | 'folderId' | 'status' | 'pinned' | 'key' | 'bpm' | 'timeSig' | 'capo' | 'openedAt'>>;

export async function updateSong(d: SqlDriver, id: string, patch: SongPatch): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  const col = (c: string, v: SqlParam) => {
    sets.push(`${c} = ?`);
    params.push(v);
  };
  if (patch.title !== undefined) col('title', patch.title);
  if (patch.folderId !== undefined) col('folder_id', patch.folderId);
  if (patch.status !== undefined) col('status', patch.status);
  if (patch.pinned !== undefined) col('pinned', patch.pinned ? 1 : 0);
  if (patch.key !== undefined) col('song_key', patch.key);
  if (patch.bpm !== undefined) col('bpm', patch.bpm);
  if (patch.timeSig !== undefined) col('time_sig', patch.timeSig.join('/'));
  if (patch.capo !== undefined) col('capo', patch.capo);
  if (patch.openedAt !== undefined) col('opened_at', patch.openedAt);
  if (!sets.length) return;
  // opening a song is not an edit
  if (Object.keys(patch).some((k) => k !== 'openedAt')) col('updated_at', Date.now());
  params.push(id);
  await d.run(`UPDATE songs SET ${sets.join(', ')} WHERE id = ?`, params);
  if (patch.title !== undefined) await refreshSearchText(d, id);
}

export async function setSongTags(d: SqlDriver, id: string, tags: string[]): Promise<void> {
  const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  await d.run(`DELETE FROM song_tags WHERE song_id = ?`, [id]);
  for (const t of clean) await d.run(`INSERT INTO song_tags (song_id, tag) VALUES (?, ?)`, [id, t]);
  await touchSong(d, id);
}

export async function touchSong(d: SqlDriver, id: string): Promise<void> {
  await d.run(`UPDATE songs SET updated_at = ? WHERE id = ?`, [Date.now(), id]);
}

/** Lowercased title + lyrics + recording titles/transcripts, used for full-text search. */
export async function refreshSearchText(d: SqlDriver, songId: string): Promise<void> {
  const song = await d.first<Row>(`SELECT title FROM songs WHERE id = ?`, [songId]);
  if (!song) return;
  const lines = await d.all<Row>(
    `SELECT l.text, l.alts FROM lines l JOIN sections s ON s.id = l.section_id WHERE s.song_id = ? ORDER BY s.sort, l.sort`,
    [songId]
  );
  const recs = await d.all<Row>(`SELECT title, transcript FROM recordings WHERE song_id = ?`, [songId]);
  const sections = await d.all<Row>(`SELECT feeling FROM sections WHERE song_id = ?`, [songId]);
  const text = [
    song.title,
    ...lines.map((l) => l.text),
    ...lines.flatMap((l) => parseJson<string[]>(l.alts, [])),
    ...recs.flatMap((r) => [r.title, r.transcript]),
    ...sections.map((s) => s.feeling),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  await d.run(`UPDATE songs SET search_text = ? WHERE id = ?`, [text, songId]);
}

export async function trashSong(d: SqlDriver, id: string): Promise<void> {
  await d.run(`UPDATE songs SET deleted_at = ? WHERE id = ?`, [Date.now(), id]);
}

export async function restoreSong(d: SqlDriver, id: string): Promise<void> {
  await d.run(`UPDATE songs SET deleted_at = NULL WHERE id = ?`, [id]);
}

/** Permanently delete. Returns the audio files that are no longer referenced, for the caller to remove. */
export async function purgeSong(db: Db, id: string): Promise<string[]> {
  return db.tx(async (d) => {
    const files = (await d.all<Row>(`SELECT file FROM recordings WHERE song_id = ?`, [id])).map((r) => r.file as string);
    await d.run(`DELETE FROM recordings WHERE song_id = ?`, [id]);
    await d.run(`DELETE FROM songs WHERE id = ?`, [id]);
    return files;
  });
}

export async function duplicateSong(db: Db, id: string): Promise<SongDoc | null> {
  const doc = await loadSong(db, id);
  if (!doc) return null;
  const copy = await importSongDoc(db, { ...doc, song: { ...doc.song, title: (doc.song.title || 'Untitled') + ' (copy)' } });
  return copy;
}

export interface SongListItem {
  id: string;
  title: string;
  status: SongStatus;
  pinned: boolean;
  folderId: string | null;
  updatedAt: number;
  openedAt: number;
  tags: string[];
  /** first non-empty lyric line */
  preview: string;
  /** for search results: the matching line */
  match: string | null;
  deletedAt: number | null;
  /** how finished it is: counts for the progress ring */
  progress: { lines: number; chordSections: number; melodySections: number; takes: number };
}

export interface SongQuery {
  folderId?: string | null | 'all';
  status?: SongStatus | null;
  tag?: string | null;
  query?: string;
  trash?: boolean;
  sort?: 'updated' | 'title' | 'opened';
}

export async function listSongs(d: SqlDriver, q: SongQuery = {}): Promise<SongListItem[]> {
  const where: string[] = [q.trash ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
  const params: SqlParam[] = [];
  if (q.folderId !== undefined && q.folderId !== 'all') {
    if (q.folderId === null) where.push('folder_id IS NULL');
    else {
      where.push('folder_id = ?');
      params.push(q.folderId);
    }
  }
  if (q.status) {
    where.push('status = ?');
    params.push(q.status);
  }
  if (q.tag) {
    where.push('id IN (SELECT song_id FROM song_tags WHERE tag = ?)');
    params.push(q.tag);
  }
  const terms = (q.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  for (const t of terms) {
    where.push(`instr(search_text, ?) > 0`);
    params.push(t);
  }
  const order = q.sort === 'title' ? 'pinned DESC, title COLLATE NOCASE' : q.sort === 'opened' ? 'pinned DESC, opened_at DESC, rowid DESC' : 'pinned DESC, updated_at DESC, rowid DESC';
  const rows = await d.all<Row>(
    `SELECT id, title, status, pinned, folder_id, updated_at, opened_at, deleted_at, search_text,
       (SELECT group_concat(tag, ',') FROM song_tags WHERE song_id = songs.id) AS tags,
       (SELECT l.text FROM lines l JOIN sections s ON s.id = l.section_id WHERE s.song_id = songs.id AND trim(l.text) != '' ORDER BY s.sort, l.sort LIMIT 1) AS preview,
       (SELECT COUNT(*) FROM lines l JOIN sections s ON s.id = l.section_id WHERE s.song_id = songs.id AND trim(l.text) != '') AS n_lines,
       (SELECT COUNT(*) FROM sections s WHERE s.song_id = songs.id AND (s.bars != '[]' OR EXISTS (SELECT 1 FROM lines l WHERE l.section_id = s.id AND l.chords != '[]'))) AS n_chords,
       (SELECT COUNT(*) FROM sections s WHERE s.song_id = songs.id AND s.melody != '[]') AS n_melody,
       (SELECT COUNT(*) FROM recordings r WHERE r.song_id = songs.id) AS n_takes
     FROM songs WHERE ${where.join(' AND ')} ORDER BY ${order}`,
    params
  );
  return rows.map((r) => {
    let match: string | null = null;
    if (terms.length) {
      const lines = String(r.search_text).split('\n');
      match = lines.find((l) => terms.every((t) => l.includes(t))) ?? lines.find((l) => l.includes(terms[0])) ?? null;
    }
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      pinned: !!r.pinned,
      folderId: r.folder_id ?? null,
      updatedAt: Number(r.updated_at),
      openedAt: Number(r.opened_at),
      deletedAt: r.deleted_at == null ? null : Number(r.deleted_at),
      tags: r.tags ? String(r.tags).split(',') : [],
      preview: r.preview ?? '',
      match,
      progress: { lines: Number(r.n_lines ?? 0), chordSections: Number(r.n_chords ?? 0), melodySections: Number(r.n_melody ?? 0), takes: Number(r.n_takes ?? 0) },
    };
  });
}

export async function lastOpenedSongId(d: SqlDriver): Promise<string | null> {
  const r = await d.first<Row>(`SELECT id FROM songs WHERE deleted_at IS NULL ORDER BY opened_at DESC LIMIT 1`);
  return r ? (r.id as string) : null;
}

export async function allTags(d: SqlDriver): Promise<{ tag: string; count: number }[]> {
  const rows = await d.all<Row>(
    `SELECT tag, count(*) AS n FROM song_tags JOIN songs ON songs.id = song_tags.song_id WHERE songs.deleted_at IS NULL GROUP BY tag ORDER BY tag`
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.n) }));
}

// ------------------------------------------------------------------ folders

export async function listFolders(d: SqlDriver): Promise<Folder[]> {
  return (await d.all<Row>(`SELECT * FROM folders ORDER BY sort, name`)).map((r) => ({ id: r.id, name: r.name, sort: Number(r.sort) }));
}

export async function createFolder(d: SqlDriver, name: string): Promise<Folder> {
  const id = newId();
  const max = await d.first<Row>(`SELECT coalesce(max(sort), -1) AS m FROM folders`);
  const sort = Number(max?.m ?? -1) + 1;
  await d.run(`INSERT INTO folders (id, name, sort) VALUES (?, ?, ?)`, [id, name.trim() || 'Folder', sort]);
  return { id, name, sort };
}

export async function renameFolder(d: SqlDriver, id: string, name: string): Promise<void> {
  await d.run(`UPDATE folders SET name = ? WHERE id = ?`, [name.trim() || 'Folder', id]);
}

export async function deleteFolder(d: SqlDriver, id: string): Promise<void> {
  // songs fall back to "no folder" via ON DELETE SET NULL
  await d.run(`UPDATE songs SET folder_id = NULL WHERE folder_id = ?`, [id]);
  await d.run(`DELETE FROM folders WHERE id = ?`, [id]);
}

// ------------------------------------------------------------------ sections

export interface NewSection {
  id?: string;
  kind: SectionKind;
  label?: string;
  lines?: { id?: string; text: string; locked?: boolean; alts?: string[]; chords?: LineChord[] }[];
  bars?: ChordBar[];
  melody?: Note[];
  feeling?: string;
  intensity?: number | null;
  collapsed?: boolean;
}

/** Insert a section at `index` (sections at or after it shift down). Returns the new section. */
export async function insertSection(d: SqlDriver, songId: string, index: number, s: NewSection): Promise<SectionWithLines> {
  const id = s.id ?? newId();
  await d.run(`UPDATE sections SET sort = sort + 1 WHERE song_id = ? AND sort >= ?`, [songId, index]);
  await d.run(
    `INSERT INTO sections (id, song_id, kind, label, sort, collapsed, feeling, intensity, bars, melody) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, songId, s.kind, s.label ?? '', index, s.collapsed ? 1 : 0, s.feeling ?? '', s.intensity ?? null, JSON.stringify(s.bars ?? []), JSON.stringify(s.melody ?? [])]
  );
  const lines: Line[] = [];
  const src = s.lines && s.lines.length ? s.lines : [{ text: '' }];
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    const line: Line = { id: l.id ?? newId(), sectionId: id, sort: i, text: l.text, locked: !!l.locked, alts: l.alts ?? [], chords: l.chords ?? [] };
    await insertLineRow(d, line);
    lines.push(line);
  }
  return {
    id,
    songId,
    kind: s.kind,
    label: s.label ?? '',
    sort: index,
    collapsed: !!s.collapsed,
    feeling: s.feeling ?? '',
    intensity: s.intensity ?? null,
    bars: s.bars ?? [],
    melody: s.melody ?? [],
    lines,
  };
}

export type SectionPatch = Partial<Pick<Section, 'kind' | 'label' | 'collapsed' | 'feeling' | 'intensity' | 'bars' | 'melody'>>;

export async function updateSection(d: SqlDriver, id: string, patch: SectionPatch): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.kind !== undefined) (sets.push('kind = ?'), params.push(patch.kind));
  if (patch.label !== undefined) (sets.push('label = ?'), params.push(patch.label));
  if (patch.collapsed !== undefined) (sets.push('collapsed = ?'), params.push(patch.collapsed ? 1 : 0));
  if (patch.feeling !== undefined) (sets.push('feeling = ?'), params.push(patch.feeling));
  if (patch.intensity !== undefined) (sets.push('intensity = ?'), params.push(patch.intensity));
  if (patch.bars !== undefined) (sets.push('bars = ?'), params.push(JSON.stringify(patch.bars)));
  if (patch.melody !== undefined) (sets.push('melody = ?'), params.push(JSON.stringify(patch.melody)));
  if (!sets.length) return;
  params.push(id);
  await d.run(`UPDATE sections SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** Delete a section; its non-empty lines go to the scrapyard. */
export async function deleteSection(d: SqlDriver, id: string): Promise<void> {
  const sec = await d.first<Row>(`SELECT * FROM sections WHERE id = ?`, [id]);
  if (!sec) return;
  const lines = await d.all<Row>(`SELECT text, alts FROM lines WHERE section_id = ? ORDER BY sort`, [id]);
  const label = await sectionLabel(d, sec.song_id, id);
  for (const l of lines) {
    for (const t of [l.text as string, ...parseJson<string[]>(l.alts, [])]) await addScrap(d, sec.song_id, t, label);
  }
  await d.run(`DELETE FROM sections WHERE id = ?`, [id]);
  await d.run(`UPDATE sections SET sort = sort - 1 WHERE song_id = ? AND sort > ?`, [sec.song_id, sec.sort]);
}

export async function reorderSections(d: SqlDriver, songId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) await d.run(`UPDATE sections SET sort = ? WHERE id = ? AND song_id = ?`, [i, ids[i], songId]);
}

async function sectionLabel(d: SqlDriver, songId: string, sectionId: string): Promise<string> {
  const rows = await d.all<Row>(`SELECT id, kind, label FROM sections WHERE song_id = ? ORDER BY sort`, [songId]);
  const names = sectionDisplayNames(rows.map((r) => ({ kind: r.kind, label: r.label })));
  const i = rows.findIndex((r) => r.id === sectionId);
  return i >= 0 ? names[i] : '';
}

// ------------------------------------------------------------------ lines

async function insertLineRow(d: SqlDriver, l: Line): Promise<void> {
  await d.run(`INSERT INTO lines (id, section_id, sort, text, locked, alts, chords) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    l.id,
    l.sectionId,
    l.sort,
    l.text,
    l.locked ? 1 : 0,
    JSON.stringify(l.alts),
    JSON.stringify(l.chords),
  ]);
}

/** Insert a line at `index` within its section. */
export async function insertLine(d: SqlDriver, line: Line): Promise<void> {
  await d.run(`UPDATE lines SET sort = sort + 1 WHERE section_id = ? AND sort >= ?`, [line.sectionId, line.sort]);
  await insertLineRow(d, line);
}

export type LinePatch = Partial<Pick<Line, 'text' | 'locked' | 'alts' | 'chords'>>;

export async function updateLine(d: SqlDriver, id: string, patch: LinePatch): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.text !== undefined) (sets.push('text = ?'), params.push(patch.text));
  if (patch.locked !== undefined) (sets.push('locked = ?'), params.push(patch.locked ? 1 : 0));
  if (patch.alts !== undefined) (sets.push('alts = ?'), params.push(JSON.stringify(patch.alts)));
  if (patch.chords !== undefined) (sets.push('chords = ?'), params.push(JSON.stringify(patch.chords)));
  if (!sets.length) return;
  params.push(id);
  await d.run(`UPDATE lines SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** Delete a line; if it had words, they go to the scrapyard. */
export async function deleteLine(d: SqlDriver, id: string, scrap = true): Promise<void> {
  const l = await d.first<Row>(
    `SELECT l.*, s.song_id FROM lines l JOIN sections s ON s.id = l.section_id WHERE l.id = ?`,
    [id]
  );
  if (!l) return;
  if (scrap) {
    const label = await sectionLabel(d, l.song_id, l.section_id);
    for (const t of [l.text as string, ...parseJson<string[]>(l.alts, [])]) await addScrap(d, l.song_id, t, label);
  }
  await d.run(`DELETE FROM lines WHERE id = ?`, [id]);
  await d.run(`UPDATE lines SET sort = sort - 1 WHERE section_id = ? AND sort > ?`, [l.section_id, l.sort]);
}

/** Set the order (and section membership) of lines. */
export async function placeLines(d: SqlDriver, sectionId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) await d.run(`UPDATE lines SET section_id = ?, sort = ? WHERE id = ?`, [sectionId, i, ids[i]]);
}

// ------------------------------------------------------------------ scrapyard

export async function addScrap(d: SqlDriver, songId: string | null, text: string, sectionLabel = ''): Promise<void> {
  const t = text.trim();
  if (!t) return;
  let title = '';
  if (songId) {
    const s = await d.first<Row>(`SELECT title FROM songs WHERE id = ?`, [songId]);
    title = (s?.title as string) ?? '';
  }
  // don't pile up exact duplicates from the same song
  const dup = await d.first<Row>(`SELECT id FROM scraps WHERE text = ? AND coalesce(song_id, '') = ?`, [t, songId ?? '']);
  if (dup) {
    await d.run(`UPDATE scraps SET created_at = ? WHERE id = ?`, [Date.now(), dup.id]);
    return;
  }
  await d.run(`INSERT INTO scraps (id, song_id, song_title, section_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [
    newId(),
    songId,
    title,
    sectionLabel,
    t,
    Date.now(),
  ]);
}

export async function listScraps(d: SqlDriver, query = '', limit = 500): Promise<Scrap[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const where = terms.map(() => `instr(lower(text || ' ' || song_title), ?) > 0`);
  const rows = await d.all<Row>(
    `SELECT * FROM scraps ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${Math.floor(limit)}`,
    terms
  );
  return rows.map((r) => ({
    id: r.id,
    songId: r.song_id ?? null,
    songTitle: r.song_title,
    sectionLabel: r.section_label,
    text: r.text,
    createdAt: Number(r.created_at),
  }));
}

export async function deleteScrap(d: SqlDriver, id: string): Promise<void> {
  await d.run(`DELETE FROM scraps WHERE id = ?`, [id]);
}

// ------------------------------------------------------------------ snapshots

export async function createSnapshot(db: Db, songId: string, label = '', auto = false): Promise<Snapshot | null> {
  return db.tx(async (d) => {
    const doc = await loadSong(d, songId);
    if (!doc) return null;
    const data = JSON.stringify(doc);
    // skip an auto snapshot identical to the latest one
    const latest = await d.first<Row>(`SELECT data FROM snapshots WHERE song_id = ? ORDER BY created_at DESC LIMIT 1`, [songId]);
    if (auto && latest && sameContent(parseJson<SongDoc | null>(latest.data, null), doc)) return null;
    const snap: Snapshot = { id: newId(), songId, label, auto, createdAt: Date.now() };
    await d.run(`INSERT INTO snapshots (id, song_id, label, auto, created_at, data) VALUES (?, ?, ?, ?, ?, ?)`, [
      snap.id,
      songId,
      label,
      auto ? 1 : 0,
      snap.createdAt,
      data,
    ]);
    // keep the newest 60 automatic snapshots per song; named ones are kept forever
    await d.run(
      `DELETE FROM snapshots WHERE song_id = ? AND auto = 1 AND id NOT IN (SELECT id FROM snapshots WHERE song_id = ? AND auto = 1 ORDER BY created_at DESC LIMIT 60)`,
      [songId, songId]
    );
    return snap;
  });
}

/** Content equality ignoring ids and timestamps. */
export function sameContent(a: SongDoc | null, b: SongDoc | null): boolean {
  if (!a || !b) return false;
  const strip = (doc: SongDoc) =>
    JSON.stringify({
      t: doc.song.title,
      k: doc.song.key,
      s: doc.sections.map((s) => [s.kind, s.label, s.bars, s.melody.map((n) => [n.pitch, n.start, n.length]), s.feeling, s.lines.map((l) => [l.text, l.alts, l.chords, l.locked])]),
    });
  return strip(a) === strip(b);
}

export async function listSnapshots(d: SqlDriver, songId: string): Promise<Snapshot[]> {
  const rows = await d.all<Row>(`SELECT id, song_id, label, auto, created_at FROM snapshots WHERE song_id = ? ORDER BY created_at DESC`, [songId]);
  return rows.map((r) => ({ id: r.id, songId: r.song_id, label: r.label, auto: !!r.auto, createdAt: Number(r.created_at) }));
}

export async function getSnapshot(d: SqlDriver, id: string): Promise<SnapshotWithData | null> {
  const r = await d.first<Row>(`SELECT * FROM snapshots WHERE id = ?`, [id]);
  if (!r) return null;
  return { id: r.id, songId: r.song_id, label: r.label, auto: !!r.auto, createdAt: Number(r.created_at), data: JSON.parse(r.data) };
}

export async function renameSnapshot(d: SqlDriver, id: string, label: string): Promise<void> {
  await d.run(`UPDATE snapshots SET label = ?, auto = 0 WHERE id = ?`, [label, id]);
}

export async function deleteSnapshot(d: SqlDriver, id: string): Promise<void> {
  await d.run(`DELETE FROM snapshots WHERE id = ?`, [id]);
}

/**
 * Restore a snapshot's lyrics, sections and song settings into the song.
 * The current state is saved as an automatic snapshot first, so a restore can
 * always be undone. Recordings are untouched.
 */
export async function restoreSnapshot(db: Db, snapshotId: string): Promise<SongDoc | null> {
  const snap = await getSnapshot(db, snapshotId);
  if (!snap) return null;
  await createSnapshot(db, snap.songId, 'Before restore', true);
  await db.tx(async (d) => {
    const doc = snap.data;
    await d.run(`DELETE FROM sections WHERE song_id = ?`, [snap.songId]);
    for (let i = 0; i < doc.sections.length; i++) {
      const s = doc.sections[i];
      await insertSection(d, snap.songId, i, {
        id: s.id,
        kind: s.kind,
        label: s.label,
        collapsed: s.collapsed,
        feeling: s.feeling,
        intensity: s.intensity,
        bars: s.bars,
        melody: s.melody,
        lines: s.lines.map((l) => ({ id: l.id, text: l.text, locked: l.locked, alts: l.alts, chords: l.chords })),
      });
    }
    await updateSong(d, snap.songId, {
      title: doc.song.title,
      key: doc.song.key,
      bpm: doc.song.bpm,
      timeSig: doc.song.timeSig,
      capo: doc.song.capo,
    });
    await refreshSearchText(d, snap.songId);
  });
  return loadSong(db, snap.songId);
}

// ------------------------------------------------------------------ import a whole doc

/** Insert a song document as a brand-new song (new ids). Used by duplicate and ZIP import. */
export async function importSongDoc(db: Db, doc: SongDoc, opts: { keepIds?: boolean } = {}): Promise<SongDoc> {
  const songId = opts.keepIds ? doc.song.id : newId();
  const now = Date.now();
  const lineIdMap = new Map<string, string>();
  await db.tx(async (d) => {
    await d.run(
      `INSERT INTO songs (id, title, folder_id, status, pinned, song_key, bpm, time_sig, capo, created_at, updated_at, opened_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        songId,
        doc.song.title,
        doc.song.status,
        doc.song.pinned ? 1 : 0,
        doc.song.key,
        doc.song.bpm,
        doc.song.timeSig.join('/'),
        doc.song.capo,
        opts.keepIds ? doc.song.createdAt : now,
        now,
        now,
      ]
    );
    for (const t of doc.song.tags) await d.run(`INSERT OR IGNORE INTO song_tags (song_id, tag) VALUES (?, ?)`, [songId, t]);
    for (let i = 0; i < doc.sections.length; i++) {
      const s = doc.sections[i];
      const lines = s.lines.map((l) => {
        const nid = opts.keepIds ? l.id : newId();
        lineIdMap.set(l.id, nid);
        return { id: nid, text: l.text, locked: l.locked, alts: l.alts, chords: l.chords };
      });
      await insertSection(d, songId, i, {
        id: opts.keepIds ? s.id : undefined,
        kind: s.kind,
        label: s.label,
        collapsed: s.collapsed,
        feeling: s.feeling,
        intensity: s.intensity,
        bars: s.bars,
        melody: s.melody.map((n) => ({ ...n, lineId: n.lineId ? (lineIdMap.get(n.lineId) ?? null) : null })),
        lines,
      });
    }
    await refreshSearchText(d, songId);
  });
  return (await loadSong(db, songId))!;
}

// ------------------------------------------------------------------ recordings

export interface NewRecording {
  songId: string | null;
  sectionId?: string | null;
  lineId?: string | null;
  title: string;
  file: string;
  mime: string;
  durationMs: number;
}

export async function addRecording(db: Db, r: NewRecording): Promise<Recording> {
  return db.tx(async (d) => {
    const prev = await d.first<Row>(
      `SELECT coalesce(max(take_no), 0) AS n FROM recordings WHERE coalesce(song_id,'') = ? AND coalesce(section_id,'') = ? AND coalesce(line_id,'') = ?`,
      [r.songId ?? '', r.sectionId ?? '', r.lineId ?? '']
    );
    const rec: Recording = {
      id: newId(),
      songId: r.songId,
      sectionId: r.sectionId ?? null,
      lineId: r.lineId ?? null,
      title: r.title,
      file: r.file,
      mime: r.mime,
      durationMs: Math.round(r.durationMs),
      bpm: null,
      key: null,
      transcript: '',
      takeNo: Number(prev?.n ?? 0) + 1,
      starred: false,
      createdAt: Date.now(),
      analysis: 'pending',
    };
    await d.run(
      `INSERT INTO recordings (id, song_id, section_id, line_id, title, file, mime, duration_ms, take_no, created_at, analysis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [rec.id, rec.songId, rec.sectionId, rec.lineId, rec.title, rec.file, rec.mime, rec.durationMs, rec.takeNo, rec.createdAt]
    );
    if (rec.songId) await touchSong(d, rec.songId);
    return rec;
  });
}

export type RecordingPatch = Partial<Pick<Recording, 'title' | 'bpm' | 'key' | 'transcript' | 'starred' | 'analysis' | 'songId' | 'sectionId' | 'lineId' | 'durationMs'>>;

export async function updateRecording(d: SqlDriver, id: string, patch: RecordingPatch): Promise<void> {
  const map: Record<string, string> = {
    title: 'title',
    bpm: 'bpm',
    key: 'rec_key',
    transcript: 'transcript',
    starred: 'starred',
    analysis: 'analysis',
    songId: 'song_id',
    sectionId: 'section_id',
    lineId: 'line_id',
    durationMs: 'duration_ms',
  };
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !map[k]) continue;
    sets.push(`${map[k]} = ?`);
    params.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqlParam));
  }
  if (!sets.length) return;
  params.push(id);
  await d.run(`UPDATE recordings SET ${sets.join(', ')} WHERE id = ?`, params);
  if (patch.transcript !== undefined || patch.title !== undefined) {
    const r = await d.first<Row>(`SELECT song_id FROM recordings WHERE id = ?`, [id]);
    if (r?.song_id) await refreshSearchText(d, r.song_id);
  }
}

export async function getRecording(d: SqlDriver, id: string): Promise<Recording | null> {
  const r = await d.first<Row>(`SELECT * FROM recordings WHERE id = ?`, [id]);
  return r ? recordingFromRow(r) : null;
}

export async function listRecordings(d: SqlDriver, songId: string): Promise<Recording[]> {
  return (await d.all<Row>(`SELECT * FROM recordings WHERE song_id = ? ORDER BY created_at DESC`, [songId])).map(recordingFromRow);
}

export async function listAllRecordings(d: SqlDriver): Promise<Recording[]> {
  return (await d.all<Row>(`SELECT * FROM recordings ORDER BY created_at DESC`)).map(recordingFromRow);
}

export async function pendingRecordings(d: SqlDriver): Promise<Recording[]> {
  return (await d.all<Row>(`SELECT * FROM recordings WHERE analysis = 'pending' ORDER BY created_at`)).map(recordingFromRow);
}

/** Delete a recording row; returns its file so the caller can remove the audio. */
export async function deleteRecording(d: SqlDriver, id: string): Promise<string | null> {
  const r = await d.first<Row>(`SELECT file FROM recordings WHERE id = ?`, [id]);
  if (!r) return null;
  await d.run(`DELETE FROM ideas WHERE recording_id = ?`, [id]);
  await d.run(`DELETE FROM recordings WHERE id = ?`, [id]);
  return r.file as string;
}

// ------------------------------------------------------------------ inbox

export async function addIdea(d: SqlDriver, kind: IdeaKind, text: string, recordingId: string | null = null): Promise<Idea> {
  const idea: Idea = { id: newId(), kind, text, recordingId, createdAt: Date.now(), usedInSongId: null };
  await d.run(`INSERT INTO ideas (id, kind, text, recording_id, created_at) VALUES (?, ?, ?, ?, ?)`, [idea.id, kind, text, recordingId, idea.createdAt]);
  return idea;
}

export async function listIdeas(d: SqlDriver, includeUsed = false): Promise<(Idea & { recording: Recording | null })[]> {
  const rows = await d.all<Row>(
    `SELECT i.*, r.id AS r_id FROM ideas i LEFT JOIN recordings r ON r.id = i.recording_id ${includeUsed ? '' : 'WHERE i.used_in_song_id IS NULL'} ORDER BY i.created_at DESC`
  );
  const out: (Idea & { recording: Recording | null })[] = [];
  for (const r of rows) out.push({ ...ideaFromRow(r), recording: r.r_id ? await getRecording(d, r.r_id) : null });
  return out;
}

export async function updateIdea(d: SqlDriver, id: string, text: string): Promise<void> {
  await d.run(`UPDATE ideas SET text = ? WHERE id = ?`, [text, id]);
}

export async function deleteIdea(d: SqlDriver, id: string): Promise<string | null> {
  const r = await d.first<Row>(`SELECT recording_id FROM ideas WHERE id = ?`, [id]);
  await d.run(`DELETE FROM ideas WHERE id = ?`, [id]);
  if (r?.recording_id) {
    const used = await d.first<Row>(`SELECT song_id FROM recordings WHERE id = ?`, [r.recording_id]);
    if (used && !used.song_id) return deleteRecording(d, r.recording_id as string);
  }
  return null;
}

/**
 * Move an inbox idea into a song: text becomes lines (appended to the section),
 * audio becomes a take on the song/section, a chord loop becomes chord bars.
 * The idea stays in the inbox history, marked as used.
 */
export async function useIdea(db: Db, ideaId: string, songId: string, sectionId: string | null, lineIndex: number | null = null): Promise<void> {
  await db.tx(async (d) => {
    const r = await d.first<Row>(`SELECT * FROM ideas WHERE id = ?`, [ideaId]);
    if (!r) return;
    const idea = ideaFromRow(r);
    let secId = sectionId;
    if (!secId) {
      const last = await d.first<Row>(`SELECT id FROM sections WHERE song_id = ? ORDER BY sort DESC LIMIT 1`, [songId]);
      secId = last ? (last.id as string) : (await insertSection(d, songId, 0, { kind: 'verse' })).id;
    }
    if (idea.kind === 'text' && idea.text.trim()) {
      const existing = await d.all<Row>(`SELECT id, text FROM lines WHERE section_id = ? ORDER BY sort`, [secId]);
      const texts = idea.text.split('\n').filter((t) => t.trim());
      let at = lineIndex ?? existing.length;
      // fill a trailing blank line instead of leaving a gap
      if (lineIndex == null && existing.length && !String(existing[existing.length - 1].text).trim()) {
        await updateLine(d, existing[existing.length - 1].id, { text: texts.shift() ?? '' });
        at = existing.length;
      }
      for (const t of texts) {
        await insertLine(d, { id: newId(), sectionId: secId, sort: at++, text: t, locked: false, alts: [], chords: [] });
      }
    }
    if (idea.kind === 'chords' && idea.text.trim()) {
      const sec = await d.first<Row>(`SELECT bars FROM sections WHERE id = ?`, [secId]);
      const bars = parseJson<ChordBar[]>(sec?.bars, []);
      for (const c of idea.text.split(/[\s|,]+/).filter(Boolean)) bars.push({ chords: [c] });
      await updateSection(d, secId, { bars });
    }
    if (idea.recordingId) {
      await d.run(`UPDATE recordings SET song_id = ?, section_id = ? WHERE id = ?`, [songId, secId, idea.recordingId]);
    }
    await d.run(`UPDATE ideas SET used_in_song_id = ? WHERE id = ?`, [songId, ideaId]);
    await touchSong(d, songId);
    await refreshSearchText(d, songId);
  });
}

// ------------------------------------------------------------------ settings

export async function getSetting<T>(d: SqlDriver, key: string, fallback: T): Promise<T> {
  const r = await d.first<Row>(`SELECT value FROM settings WHERE key = ?`, [key]);
  return r ? parseJson<T>(r.value, fallback) : fallback;
}

export async function setSetting(d: SqlDriver, key: string, value: unknown): Promise<void> {
  await d.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, JSON.stringify(value)]);
}

// ------------------------------------------------------------------ backup

export interface LibraryDump {
  version: 1;
  exportedAt: number;
  folders: Folder[];
  songs: SongDoc[];
  recordings: Recording[];
  ideas: Idea[];
  scraps: Scrap[];
}

export async function dumpLibrary(d: SqlDriver): Promise<LibraryDump> {
  const ids = (await d.all<Row>(`SELECT id FROM songs WHERE deleted_at IS NULL ORDER BY created_at`)).map((r) => r.id as string);
  const songs: SongDoc[] = [];
  for (const id of ids) songs.push((await loadSong(d, id))!);
  return {
    version: 1,
    exportedAt: Date.now(),
    folders: await listFolders(d),
    songs,
    recordings: await listAllRecordings(d),
    ideas: (await d.all<Row>(`SELECT * FROM ideas ORDER BY created_at`)).map(ideaFromRow),
    scraps: await listScraps(d, '', 100000),
  };
}

// ------------------------------------------------------------------ sync helpers

/**
 * Make the local song identical to `doc` (same ids), creating it if needed.
 * Recordings are untouched. `updatedAt` is set to the given time so the
 * change isn't pushed straight back.
 */
export async function replaceSongDoc(db: Db, doc: SongDoc, updatedAt: number, deletedAt: number | null = null): Promise<void> {
  await db.tx(async (d) => {
    const exists = await d.first<Row>(`SELECT id FROM songs WHERE id = ?`, [doc.song.id]);
    if (!exists) {
      await d.run(`INSERT INTO songs (id, title, status, created_at, updated_at, opened_at) VALUES (?, ?, ?, ?, ?, ?)`, [
        doc.song.id,
        doc.song.title,
        doc.song.status,
        doc.song.createdAt || updatedAt,
        updatedAt,
        0,
      ]);
    }
    await d.run(
      `UPDATE songs SET title = ?, status = ?, pinned = ?, song_key = ?, bpm = ?, time_sig = ?, capo = ?, deleted_at = ? WHERE id = ?`,
      [doc.song.title, doc.song.status, doc.song.pinned ? 1 : 0, doc.song.key, doc.song.bpm, doc.song.timeSig.join('/'), doc.song.capo, deletedAt, doc.song.id]
    );
    await d.run(`DELETE FROM song_tags WHERE song_id = ?`, [doc.song.id]);
    for (const t of doc.song.tags) await d.run(`INSERT OR IGNORE INTO song_tags (song_id, tag) VALUES (?, ?)`, [doc.song.id, t]);
    await d.run(`DELETE FROM sections WHERE song_id = ?`, [doc.song.id]);
    for (let i = 0; i < doc.sections.length; i++) {
      const s = doc.sections[i];
      await insertSection(d, doc.song.id, i, {
        id: s.id,
        kind: s.kind,
        label: s.label,
        collapsed: s.collapsed,
        feeling: s.feeling,
        intensity: s.intensity,
        bars: s.bars,
        melody: s.melody,
        lines: s.lines.map((l) => ({ id: l.id, text: l.text, locked: l.locked, alts: l.alts, chords: l.chords })),
      });
    }
    await refreshSearchText(d, doc.song.id);
    await d.run(`UPDATE songs SET updated_at = ? WHERE id = ?`, [updatedAt, doc.song.id]);
  });
}

/** Insert a recording row as-is (from sync), ignoring it if it already exists. */
export async function upsertRecording(d: SqlDriver, r: Recording): Promise<boolean> {
  const exists = await d.first<Row>(`SELECT id FROM recordings WHERE id = ?`, [r.id]);
  if (exists) return false;
  await d.run(
    `INSERT INTO recordings (id, song_id, section_id, line_id, title, file, mime, duration_ms, bpm, rec_key, transcript, take_no, starred, created_at, analysis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.id, r.songId, r.sectionId, r.lineId, r.title, r.file, r.mime, r.durationMs, r.bpm, r.key, r.transcript, r.takeNo, r.starred ? 1 : 0, r.createdAt, r.analysis === 'pending' ? 'done' : r.analysis]
  );
  return true;
}

export async function songsChangedSince(d: SqlDriver, since: number): Promise<{ id: string; updatedAt: number; deletedAt: number | null }[]> {
  const rows = await d.all<Row>(`SELECT id, updated_at, deleted_at FROM songs WHERE updated_at > ? OR coalesce(deleted_at, 0) > ?`, [since, since]);
  return rows.map((r) => ({ id: r.id, updatedAt: Math.max(Number(r.updated_at), Number(r.deleted_at ?? 0)), deletedAt: r.deleted_at == null ? null : Number(r.deleted_at) }));
}
