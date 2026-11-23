import { songPlainText, type SongDoc } from '../../core/model';
import { chordChartHtml, lyricSheetHtml, safeFileName, toChordPro, toMidi, toPlainText, type ExportOptions } from '../../core/export/formats';
import { chordSheetText } from '../../core/export/chordSheet';
import { handoffSummary } from '../../core/export/handoff';
import { useCollab } from '../../collab/collab';
import { buildProjectZip, extForMime, readProjectZip } from '../../core/export/projectZip';
import { readAudio, writeAudio } from '../../audio/storage';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { copyToClipboard } from '../../platform/clipboard';
import { pickFile, shareFile, sharePdf } from '../../platform/share';
import { flushSaves } from '../../store/song';
import { askText, toast } from '../../ui/Dialogs';

export type ExportKind = 'txt' | 'chordsheet' | 'pdf-lyrics' | 'pdf-chords' | 'chordpro' | 'midi' | 'zip' | 'handoff';

/** The kinds that are plain text, so they can be copied as well as shared as a file. */
export type CopyKind = 'txt' | 'lyrics' | 'words' | 'chordsheet' | 'chordpro' | 'handoff';

/** The text of a plain-text export. 'txt' is the .txt file (title and [Verse] labels); 'lyrics' is the labelled words; 'words' is only the words, sections separated by a blank line. */
export async function exportText(doc: SongDoc, kind: CopyKind, opts: ExportOptions = {}): Promise<string> {
  switch (kind) {
    case 'txt':
      return toPlainText(doc);
    case 'lyrics':
      return songPlainText(doc, true) + '\n';
    case 'words':
      return songPlainText(doc, false) + '\n';
    case 'chordsheet':
      return chordSheetText(doc, { transpose: opts.transpose, roman: opts.roman });
    case 'chordpro':
      return toChordPro(doc, opts);
    case 'handoff': {
      const takes = (await repo.listRecordings(await getDb(), doc.song.id)).length;
      const comments = useCollab.getState().comments.filter((c) => !c.resolved).map((c) => `${c.author}: ${c.text}`);
      return handoffSummary({ doc, takes, comments, includeLyrics: opts.handoffLyrics });
    }
  }
}

/** Copy a plain-text export to the clipboard. Returns the text and whether it reached the clipboard. */
export async function copyExport(doc: SongDoc, kind: CopyKind, opts: ExportOptions = {}): Promise<{ text: string; copied: boolean }> {
  await flushSaves();
  const text = await exportText(doc, kind, opts);
  return { text, copied: await copyToClipboard(text) };
}

/** Copy text and tell the person; if the clipboard is blocked, show the text so it can be selected by hand. */
export async function copyWithToast(text: string, what = 'Copied'): Promise<void> {
  if (await copyToClipboard(text)) return toast(`${what}. Paste it anywhere.`);
  await askText('Select and copy this', text, { ok: 'Done', multiline: true });
}

export async function exportSong(doc: SongDoc, kind: ExportKind, opts: ExportOptions = {}): Promise<void> {
  await flushSaves();
  const base = safeFileName(doc.song.title || 'Untitled');
  switch (kind) {
    case 'txt':
      return shareFile(`${base}.txt`, 'text/plain', await exportText(doc, 'txt'));
    case 'chordsheet':
      return shareFile(`${base} - chord sheet.txt`, 'text/plain', await exportText(doc, 'chordsheet', opts));
    case 'pdf-lyrics':
      return sharePdf(lyricSheetHtml(doc), `${base}.pdf`);
    case 'pdf-chords':
      return sharePdf(chordChartHtml(doc, opts), `${base} - chords.pdf`);
    case 'chordpro':
      return shareFile(`${base}.cho`, 'text/plain', await exportText(doc, 'chordpro', opts));
    case 'midi':
      return shareFile(`${base}.mid`, 'audio/midi', toMidi(doc, opts));
    case 'handoff':
      return shareFile(`${base} - hand-off.txt`, 'text/plain', await exportText(doc, 'handoff', opts));
    case 'zip': {
      const db = await getDb();
      const recs = await repo.listRecordings(db, doc.song.id);
      const takes = [];
      for (const rec of recs) takes.push({ rec, bytes: await readAudio(rec.file) });
      return shareFile(`${base}.stanza.zip`, 'application/zip', buildProjectZip(doc, takes));
    }
  }
}

export async function exportTake(recordingId: string): Promise<void> {
  const db = await getDb();
  const rec = await repo.getRecording(db, recordingId);
  if (!rec) return;
  const bytes = await readAudio(rec.file);
  if (!bytes) throw new Error('Audio file missing');
  await shareFile(`${safeFileName(rec.title)}.${extForMime(rec.mime)}`, rec.mime, bytes);
}

/** Import a .stanza.zip as a new song (with its takes). Returns the new song id. */
export async function importProject(): Promise<string | null> {
  const picked = await pickFile(['application/zip', 'application/octet-stream', '*/*']);
  if (!picked) return null;
  const { bundle, audio } = readProjectZip(picked.bytes);
  const db = await getDb();
  const doc = await repo.importSongDoc(db, bundle.doc);
  // map old section/line ids to new by position
  const secMap = new Map<string, string>();
  const lineMap = new Map<string, string>();
  bundle.doc.sections.forEach((s, i) => {
    secMap.set(s.id, doc.sections[i].id);
    s.lines.forEach((l, j) => lineMap.set(l.id, doc.sections[i].lines[j].id));
  });
  for (const r of bundle.recordings) {
    const bytes = audio.get(r.zipPath);
    if (!bytes) continue;
    const file = await writeAudio(bytes, extForMime(r.mime));
    const rec = await repo.addRecording(db, {
      songId: doc.song.id,
      sectionId: r.sectionId ? (secMap.get(r.sectionId) ?? null) : null,
      lineId: r.lineId ? (lineMap.get(r.lineId) ?? null) : null,
      title: r.title,
      file,
      mime: r.mime,
      durationMs: r.durationMs,
    });
    await repo.updateRecording(db, rec.id, { bpm: r.bpm, key: r.key, transcript: r.transcript, starred: r.starred, analysis: 'done' });
  }
  return doc.song.id;
}
