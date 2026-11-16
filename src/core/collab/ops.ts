/**
 * Co-writing operations. Each op is small and id-based; the server applies
 * them in one order and relays them, every client applies them the same way,
 * and a document hash lets a client notice drift and re-fetch.
 *
 * This file has no runtime imports so the Node server can load it as-is.
 */
import type { ChordBar, LineChord, Note, SectionKind, SongDoc } from '../model';

export interface LinePayload {
  id: string;
  text: string;
  locked: boolean;
  alts: string[];
  chords: LineChord[];
}

export interface SectionPayload {
  id: string;
  kind: SectionKind;
  label: string;
  feeling: string;
  intensity: number | null;
  bars: ChordBar[];
  melody: Note[];
  lines: LinePayload[];
}

export type Op =
  | { t: 'lineText'; lineId: string; text: string }
  | { t: 'lineMeta'; lineId: string; patch: Partial<Pick<LinePayload, 'locked' | 'alts' | 'chords'>> }
  | { t: 'insertLine'; sectionId: string; afterLineId: string | null; line: LinePayload }
  | { t: 'deleteLine'; lineId: string }
  | { t: 'insertSection'; afterSectionId: string | null; section: SectionPayload }
  | { t: 'deleteSection'; sectionId: string }
  | { t: 'moveSection'; sectionId: string; toIndex: number }
  | { t: 'sectionMeta'; sectionId: string; patch: Partial<Pick<SectionPayload, 'kind' | 'label' | 'feeling' | 'intensity' | 'bars' | 'melody'>> }
  | { t: 'songMeta'; patch: Partial<{ title: string; key: string | null; bpm: number; timeSig: [number, number]; capo: number }> };

/** Apply an op to a song document, returning a new document (unknown ids are ignored). */
export function applyOp(doc: SongDoc, op: Op): SongDoc {
  const sections = doc.sections;
  const mapLines = (fn: (lines: SongDoc['sections'][0]['lines'], sectionId: string) => SongDoc['sections'][0]['lines']) =>
    sections.map((s) => {
      const lines = fn(s.lines, s.id);
      return lines === s.lines ? s : { ...s, lines: lines.map((l, i) => (l.sort === i ? l : { ...l, sort: i })) };
    });
  switch (op.t) {
    case 'lineText':
      return { ...doc, sections: mapLines((ls) => (ls.some((l) => l.id === op.lineId) ? ls.map((l) => (l.id === op.lineId ? { ...l, text: op.text } : l)) : ls)) };
    case 'lineMeta':
      return { ...doc, sections: mapLines((ls) => (ls.some((l) => l.id === op.lineId) ? ls.map((l) => (l.id === op.lineId ? { ...l, ...op.patch } : l)) : ls)) };
    case 'insertLine':
      return {
        ...doc,
        sections: mapLines((ls, sid) => {
          if (sid !== op.sectionId || ls.some((l) => l.id === op.line.id)) return ls;
          const at = op.afterLineId ? ls.findIndex((l) => l.id === op.afterLineId) + 1 : 0;
          const next = [...ls];
          next.splice(at <= 0 && op.afterLineId ? ls.length : at, 0, { ...op.line, sectionId: sid, sort: 0 });
          return next;
        }),
      };
    case 'deleteLine':
      return { ...doc, sections: mapLines((ls) => (ls.some((l) => l.id === op.lineId) && ls.length > 1 ? ls.filter((l) => l.id !== op.lineId) : ls)) };
    case 'insertSection': {
      if (sections.some((s) => s.id === op.section.id)) return doc;
      const at = op.afterSectionId ? sections.findIndex((s) => s.id === op.afterSectionId) + 1 : 0;
      const s = op.section;
      const sec = {
        ...s,
        songId: doc.song.id,
        sort: 0,
        collapsed: false,
        lines: s.lines.map((l, i) => ({ ...l, sectionId: s.id, sort: i })),
      };
      const next = [...sections];
      next.splice(at <= 0 && op.afterSectionId ? sections.length : at, 0, sec);
      return { ...doc, sections: next.map((x, i) => ({ ...x, sort: i })) };
    }
    case 'deleteSection':
      if (sections.length <= 1) return doc;
      return { ...doc, sections: sections.filter((s) => s.id !== op.sectionId).map((x, i) => ({ ...x, sort: i })) };
    case 'moveSection': {
      const from = sections.findIndex((s) => s.id === op.sectionId);
      if (from < 0) return doc;
      const next = [...sections];
      const [m] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, op.toIndex)), 0, m);
      return { ...doc, sections: next.map((x, i) => ({ ...x, sort: i })) };
    }
    case 'sectionMeta':
      return { ...doc, sections: sections.map((s) => (s.id === op.sectionId ? { ...s, ...op.patch } : s)) };
    case 'songMeta':
      return { ...doc, song: { ...doc.song, ...op.patch } };
  }
}

/** A short hash of everything co-writers share (structure, words, chords, melody, title). */
export function hashDoc(doc: SongDoc): string {
  const s = JSON.stringify([
    doc.song.title,
    doc.song.key,
    doc.song.bpm,
    doc.sections.map((x) => [x.id, x.kind, x.label, x.feeling, x.bars, x.melody.map((n) => [n.pitch, n.start, n.length]), x.lines.map((l) => [l.id, l.text, l.chords, l.locked])]),
  ]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface Comment {
  id: string;
  lineId: string | null;
  author: string;
  text: string;
  createdAt: number;
  resolved: boolean;
}

/** Messages on the room socket. */
export type ClientMsg =
  | { type: 'op'; op: Op; clientOpId: string }
  | { type: 'comment'; comment: Comment }
  | { type: 'resolve'; commentId: string; resolved: boolean }
  | { type: 'presence'; lineId: string | null };

export type ServerMsg =
  | { type: 'hello'; doc: SongDoc; seq: number; comments: Comment[]; peers: Peer[]; you: string }
  | { type: 'op'; op: Op; seq: number; author: string; clientOpId: string; hash: string }
  | { type: 'comment'; comment: Comment }
  | { type: 'resolve'; commentId: string; resolved: boolean }
  | { type: 'presence'; peers: Peer[] };

export interface Peer {
  id: string;
  name: string;
  lineId: string | null;
}
