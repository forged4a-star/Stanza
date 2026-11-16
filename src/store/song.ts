/**
 * The open song. Every edit updates memory first (so typing never waits on
 * disk) and is pushed to the autosave queue in the same tick.
 */
import { AppState } from 'react-native';
import { create } from 'zustand';
import {
  type ChordBar,
  type Line,
  type LineChord,
  type Note,
  type Recording,
  type SectionKind,
  type SectionWithLines,
  type SongDoc,
  sectionDisplayNames,
} from '../core/model';
import { newId } from '../core/util/id';
import { keyName, keyPrefersFlats, parseKey, transposeChord } from '../core/music/theory';
import { getDb } from '../db/client';
import type { Db } from '../db/driver';
import * as repo from '../db/repo';
import { SaveQueue, type SaveState } from '../db/saveQueue';

let queue: SaveQueue | null = null;
let dbRef: Db | null = null;

async function ensureQueue(): Promise<SaveQueue> {
  if (queue) return queue;
  dbRef = await getDb();
  queue = new SaveQueue(dbRef);
  queue.afterBatch = async (d, songIds) => {
    for (const id of songIds) {
      await repo.touchSong(d, id);
      await repo.refreshSearchText(d, id);
    }
  };
  queue.onState((s) => useSong.setState({ saveState: s }));
  return queue;
}

/** Flush pending writes (called when the app backgrounds and before navigation). */
export async function flushSaves(): Promise<void> {
  if (queue) await queue.flush();
}

AppState.addEventListener?.('change', (s) => {
  if (s !== 'active') {
    void flushSaves();
    const id = useSong.getState().doc?.song.id;
    if (id) void flushSaves().then(async () => repo.createSnapshot(await getDb(), id, '', true));
  }
});

export interface FocusRequest {
  lineId: string;
  /** caret position; -1 = end */
  caret: number;
  /** bumps so the same request can be re-issued */
  nonce: number;
}

interface SongStore {
  doc: SongDoc | null;
  recordings: Recording[];
  saveState: SaveState;
  focus: FocusRequest | null;
  /** id of the line being edited (for line-scoped tools) */
  activeLineId: string | null;
  loading: boolean;

  open: (id: string) => Promise<void>;
  close: () => Promise<void>;
  reload: () => Promise<void>;
  reloadRecordings: () => Promise<void>;

  setTitle: (title: string) => void;
  setMeta: (patch: repo.SongPatch) => void;
  setTags: (tags: string[]) => void;

  setLineText: (lineId: string, text: string) => void;
  insertLineAfter: (lineId: string, text?: string, focus?: boolean) => string | null;
  appendLine: (sectionId: string, text?: string) => string;
  removeLine: (lineId: string, focusPrev?: boolean) => void;
  mergeWithPrevious: (lineId: string) => void;
  toggleLock: (lineId: string) => void;
  stashAlternate: (lineId: string) => void;
  cycleAlternate: (lineId: string, dir?: 1 | -1) => void;
  pickAlternate: (lineId: string, index: number) => void;
  deleteAlternate: (lineId: string, index: number) => void;
  setLineChords: (lineId: string, chords: LineChord[]) => void;

  addSection: (kind: SectionKind, atIndex?: number, lines?: string[]) => string;
  duplicateSection: (sectionId: string) => void;
  deleteSection: (sectionId: string) => void;
  moveSection: (from: number, to: number) => void;
  updateSection: (sectionId: string, patch: repo.SectionPatch) => void;
  setBars: (sectionId: string, bars: ChordBar[]) => void;
  setMelody: (sectionId: string, melody: Note[]) => void;

  /** move every chord (bars, lyric chords, key) by semitones */
  transposeSong: (semitones: number) => void;
  requestFocus: (lineId: string, caret?: number) => void;
  setActiveLine: (lineId: string | null) => void;
}

/** Find a line and its position. */
export function findLine(doc: SongDoc, lineId: string): { s: number; l: number; line: Line; section: SectionWithLines } | null {
  for (let s = 0; s < doc.sections.length; s++) {
    const l = doc.sections[s].lines.findIndex((x) => x.id === lineId);
    if (l >= 0) return { s, l, line: doc.sections[s].lines[l], section: doc.sections[s] };
  }
  return null;
}

let focusNonce = 0;

export const useSong = create<SongStore>((set, get) => {
  const songId = () => get().doc!.song.id;
  const push = (op: (d: import('../db/driver').SqlDriver) => Promise<void>, key: string | null = null) => {
    const id = get().doc?.song.id ?? null;
    void ensureQueue().then((q) => q.push(op, key, id));
  };
  /** Immutable update of one section (and its lines). */
  const patchSection = (sectionId: string, fn: (s: SectionWithLines) => SectionWithLines) => {
    const doc = get().doc;
    if (!doc) return;
    set({ doc: { ...doc, sections: doc.sections.map((s) => (s.id === sectionId ? fn(s) : s)) } });
  };
  const patchLine = (lineId: string, fn: (l: Line) => Line) => {
    const doc = get().doc;
    if (!doc) return;
    const at = findLine(doc, lineId);
    if (!at) return;
    patchSection(at.section.id, (s) => ({ ...s, lines: s.lines.map((l) => (l.id === lineId ? fn(l) : l)) }));
  };
  const reindex = (lines: Line[]) => lines.map((l, i) => (l.sort === i ? l : { ...l, sort: i }));
  const scrapLabel = (sectionId: string) => {
    const doc = get().doc!;
    const names = sectionDisplayNames(doc.sections);
    return names[doc.sections.findIndex((s) => s.id === sectionId)] ?? '';
  };

  return {
    doc: null,
    recordings: [],
    saveState: 'saved',
    focus: null,
    activeLineId: null,
    loading: false,

    open: async (id) => {
      if (get().doc?.song.id === id) return;
      await get().close();
      set({ loading: true });
      await ensureQueue();
      const db = dbRef!;
      const doc = await repo.loadSong(db, id);
      if (!doc) {
        set({ loading: false });
        throw new Error('Song not found');
      }
      await repo.updateSong(db, id, { openedAt: Date.now() });
      await repo.setSetting(db, 'lastSong', id);
      set({ doc, loading: false, focus: null, activeLineId: null });
      void get().reloadRecordings();
      // a checkpoint of the song as it was when opened (skipped if unchanged)
      void repo.createSnapshot(db, id, '', true);
    },

    close: async () => {
      await flushSaves();
      set({ doc: null, recordings: [], focus: null, activeLineId: null });
    },

    reload: async () => {
      const doc = get().doc;
      if (!doc) return;
      await flushSaves();
      const fresh = await repo.loadSong(dbRef!, doc.song.id);
      if (fresh) set({ doc: fresh });
      await get().reloadRecordings();
    },

    reloadRecordings: async () => {
      const doc = get().doc;
      if (!doc) return;
      await ensureQueue();
      set({ recordings: await repo.listRecordings(dbRef!, doc.song.id) });
    },

    setTitle: (title) => {
      const doc = get().doc;
      if (!doc) return;
      set({ doc: { ...doc, song: { ...doc.song, title } } });
      const id = doc.song.id;
      push((d) => repo.updateSong(d, id, { title }), 'title:' + id);
    },

    setMeta: (patch) => {
      const doc = get().doc;
      if (!doc) return;
      set({ doc: { ...doc, song: { ...doc.song, ...patch } } });
      const id = doc.song.id;
      push((d) => repo.updateSong(d, id, patch));
    },

    setTags: (tags) => {
      const doc = get().doc;
      if (!doc) return;
      set({ doc: { ...doc, song: { ...doc.song, tags } } });
      const id = doc.song.id;
      push((d) => repo.setSongTags(d, id, tags), 'tags:' + id);
    },

    setLineText: (lineId, text) => {
      const doc = get().doc;
      if (!doc) return;
      const at = findLine(doc, lineId);
      if (!at || at.line.locked) return;
      if (!text.includes('\n')) {
        patchLine(lineId, (l) => ({ ...l, text }));
        push((d) => repo.updateLine(d, lineId, { text }), 'line:' + lineId);
        return;
      }
      // Enter or a multi-line paste: split into several lines
      const parts = text.replace(/\r\n?/g, '\n').split('\n');
      const first = parts.shift()!;
      patchLine(lineId, (l) => ({ ...l, text: first }));
      push((d) => repo.updateLine(d, lineId, { text: first }), 'line:' + lineId);
      let after = lineId;
      for (const p of parts) after = get().insertLineAfter(after, p, false)!;
      get().requestFocus(after, parts.length === 1 ? 0 : -1);
    },

    insertLineAfter: (lineId, text = '', focus = true) => {
      const doc = get().doc;
      if (!doc) return null;
      const at = findLine(doc, lineId);
      if (!at) return null;
      const line: Line = { id: newId(), sectionId: at.section.id, sort: at.l + 1, text, locked: false, alts: [], chords: [] };
      patchSection(at.section.id, (s) => {
        const lines = [...s.lines];
        lines.splice(at.l + 1, 0, line);
        return { ...s, lines: reindex(lines) };
      });
      push((d) => repo.insertLine(d, line));
      if (focus) get().requestFocus(line.id, 0);
      return line.id;
    },

    appendLine: (sectionId, text = '') => {
      const doc = get().doc!;
      const sec = doc.sections.find((s) => s.id === sectionId)!;
      const line: Line = { id: newId(), sectionId, sort: sec.lines.length, text, locked: false, alts: [], chords: [] };
      patchSection(sectionId, (s) => ({ ...s, lines: [...s.lines, line] }));
      push((d) => repo.insertLine(d, line));
      get().requestFocus(line.id, -1);
      return line.id;
    },

    removeLine: (lineId, focusPrev = true) => {
      const doc = get().doc;
      if (!doc) return;
      const at = findLine(doc, lineId);
      if (!at || at.line.locked) return;
      // keep at least one line per section
      if (at.section.lines.length === 1) {
        if (at.line.text) get().setLineText(lineId, '');
        return;
      }
      patchSection(at.section.id, (s) => ({ ...s, lines: reindex(s.lines.filter((l) => l.id !== lineId)) }));
      push((d) => repo.deleteLine(d, lineId));
      if (focusPrev) {
        const prev = at.section.lines[at.l - 1] ?? at.section.lines[at.l + 1];
        if (prev) get().requestFocus(prev.id, -1);
      }
    },

    mergeWithPrevious: (lineId) => {
      const doc = get().doc;
      if (!doc) return;
      const at = findLine(doc, lineId);
      if (!at || at.l === 0) return;
      const prev = at.section.lines[at.l - 1];
      if (prev.locked || at.line.locked) return;
      const caret = prev.text.length;
      const joined = prev.text + (prev.text && at.line.text && !/\s$/.test(prev.text) ? ' ' : '') + at.line.text;
      patchLine(prev.id, (l) => ({ ...l, text: joined }));
      push((d) => repo.updateLine(d, prev.id, { text: joined }), 'line:' + prev.id);
      // the words moved up, so nothing goes to the scrapyard
      patchSection(at.section.id, (s) => ({ ...s, lines: reindex(s.lines.filter((l) => l.id !== lineId)) }));
      push((d) => repo.deleteLine(d, lineId, false));
      get().requestFocus(prev.id, caret);
    },

    toggleLock: (lineId) => {
      let locked = false;
      patchLine(lineId, (l) => ((locked = !l.locked), { ...l, locked }));
      push((d) => repo.updateLine(d, lineId, { locked }));
    },

    stashAlternate: (lineId) => {
      const at = findLine(get().doc!, lineId);
      if (!at || !at.line.text.trim() || at.line.locked) return;
      if (at.line.alts.includes(at.line.text)) return;
      const alts = [...at.line.alts, at.line.text];
      patchLine(lineId, (l) => ({ ...l, alts }));
      push((d) => repo.updateLine(d, lineId, { alts }), 'alts:' + lineId);
    },

    cycleAlternate: (lineId, dir = 1) => {
      const at = findLine(get().doc!, lineId);
      if (!at || !at.line.alts.length || at.line.locked) return;
      // the live text and the stash form a ring
      const ring = [at.line.text, ...at.line.alts];
      const next = dir === 1 ? [...ring.slice(1), ring[0]] : [ring[ring.length - 1], ...ring.slice(0, -1)];
      const [text, ...alts] = next;
      patchLine(lineId, (l) => ({ ...l, text, alts }));
      push((d) => repo.updateLine(d, lineId, { text, alts }), 'alts:' + lineId);
    },

    pickAlternate: (lineId, index) => {
      const at = findLine(get().doc!, lineId);
      if (!at || at.line.locked) return;
      const alts = [...at.line.alts];
      const [picked] = alts.splice(index, 1, at.line.text);
      if (picked === undefined) return;
      patchLine(lineId, (l) => ({ ...l, text: picked, alts }));
      push((d) => repo.updateLine(d, lineId, { text: picked, alts }), 'alts:' + lineId);
    },

    deleteAlternate: (lineId, index) => {
      const at = findLine(get().doc!, lineId);
      if (!at) return;
      const alts = [...at.line.alts];
      const [gone] = alts.splice(index, 1);
      patchLine(lineId, (l) => ({ ...l, alts }));
      const id = songId();
      const label = scrapLabel(at.section.id);
      push(async (d) => {
        await repo.updateLine(d, lineId, { alts });
        if (gone) await repo.addScrap(d, id, gone, label);
      });
    },

    setLineChords: (lineId, chords) => {
      patchLine(lineId, (l) => ({ ...l, chords }));
      push((d) => repo.updateLine(d, lineId, { chords }), 'chords:' + lineId);
    },

    addSection: (kind, atIndex, lines = ['']) => {
      const doc = get().doc!;
      const index = atIndex ?? doc.sections.length;
      const id = newId();
      const sec: SectionWithLines = {
        id,
        songId: doc.song.id,
        kind,
        label: '',
        sort: index,
        collapsed: false,
        feeling: '',
        intensity: null,
        bars: [],
        melody: [],
        lines: lines.map((text, i) => ({ id: newId(), sectionId: id, sort: i, text, locked: false, alts: [], chords: [] })),
      };
      const sections = [...doc.sections];
      sections.splice(index, 0, sec);
      set({ doc: { ...doc, sections: sections.map((s, i) => ({ ...s, sort: i })) } });
      const sid = doc.song.id;
      push((d) => repo.insertSection(d, sid, index, { id, kind, lines: sec.lines.map((l) => ({ id: l.id, text: l.text })) }).then(() => undefined));
      get().requestFocus(sec.lines[sec.lines.length - 1].id, -1);
      return id;
    },

    duplicateSection: (sectionId) => {
      const doc = get().doc!;
      const i = doc.sections.findIndex((s) => s.id === sectionId);
      if (i < 0) return;
      const src = doc.sections[i];
      const id = newId();
      const copy: SectionWithLines = {
        ...src,
        id,
        sort: i + 1,
        collapsed: false,
        melody: src.melody.map((n) => ({ ...n, id: newId(), lineId: null, syl: null })),
        lines: src.lines.map((l) => ({ ...l, id: newId(), sectionId: id, locked: false })),
      };
      const sections = [...doc.sections];
      sections.splice(i + 1, 0, copy);
      set({ doc: { ...doc, sections: sections.map((s, k) => ({ ...s, sort: k })) } });
      const sid = doc.song.id;
      push((d) =>
        repo
          .insertSection(d, sid, i + 1, {
            id,
            kind: copy.kind,
            label: copy.label,
            feeling: copy.feeling,
            intensity: copy.intensity,
            bars: copy.bars,
            melody: copy.melody,
            lines: copy.lines.map((l) => ({ id: l.id, text: l.text, alts: l.alts, chords: l.chords })),
          })
          .then(() => undefined)
      );
    },

    deleteSection: (sectionId) => {
      const doc = get().doc!;
      if (doc.sections.length <= 1) {
        // never leave a song with no place to type: clear instead
        const only = doc.sections[0];
        const keep: Line = { id: newId(), sectionId: only.id, sort: 0, text: '', locked: false, alts: [], chords: [] };
        set({ doc: { ...doc, sections: [{ ...only, lines: [keep], bars: [], melody: [] }] } });
        push(async (d) => {
          for (const l of only.lines) await repo.deleteLine(d, l.id);
          await repo.insertLine(d, keep);
          await repo.updateSection(d, only.id, { bars: [], melody: [] });
        });
        return;
      }
      set({ doc: { ...doc, sections: doc.sections.filter((s) => s.id !== sectionId).map((s, i) => ({ ...s, sort: i })) } });
      push((d) => repo.deleteSection(d, sectionId));
    },

    moveSection: (from, to) => {
      const doc = get().doc!;
      if (from === to || to < 0 || to >= doc.sections.length) return;
      const sections = [...doc.sections];
      const [m] = sections.splice(from, 1);
      sections.splice(to, 0, m);
      set({ doc: { ...doc, sections: sections.map((s, i) => ({ ...s, sort: i })) } });
      const ids = sections.map((s) => s.id);
      const sid = doc.song.id;
      push((d) => repo.reorderSections(d, sid, ids), 'order:' + sid);
    },

    updateSection: (sectionId, patch) => {
      patchSection(sectionId, (s) => ({ ...s, ...patch }));
      push((d) => repo.updateSection(d, sectionId, patch), 'sec:' + sectionId + ':' + Object.keys(patch).sort().join(','));
    },

    setBars: (sectionId, bars) => get().updateSection(sectionId, { bars }),
    setMelody: (sectionId, melody) => get().updateSection(sectionId, { melody }),

    transposeSong: (semi) => {
      const doc = get().doc;
      if (!doc || !semi) return;
      const key = parseKey(doc.song.key);
      const newKey = key ? { tonic: (key.tonic + semi + 120) % 12, mode: key.mode } : null;
      const flats = newKey ? keyPrefersFlats(newKey) : undefined;
      const tr = (c: string) => (flats === undefined ? transposeChord(c, semi) : transposeChord(c, semi, flats));
      for (const s of doc.sections) {
        if (s.bars.length) get().setBars(s.id, s.bars.map((b) => ({ chords: b.chords.map(tr) })));
        if (s.melody.length) get().setMelody(s.id, s.melody.map((n) => ({ ...n, pitch: n.pitch + semi })));
        for (const l of s.lines) if (l.chords.length) get().setLineChords(l.id, l.chords.map((c) => ({ ...c, chord: tr(c.chord) })));
      }
      if (newKey) get().setMeta({ key: keyName(newKey) });
    },

    requestFocus: (lineId, caret = -1) => set({ focus: { lineId, caret, nonce: ++focusNonce } }),
    setActiveLine: (lineId) => set({ activeLineId: lineId }),
  };
});

/** Database handle for screens that need direct queries. */
export async function db(): Promise<Db> {
  await ensureQueue();
  return dbRef!;
}
