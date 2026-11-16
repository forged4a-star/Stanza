import type { SongDoc } from '../../core/model';
import { chordChartHtml, lyricSheetHtml, safeFileName, toChordPro, toMidi, toPlainText, type ExportOptions } from '../../core/export/formats';
import { chordSheetText } from '../../core/export/chordSheet';
import { buildProjectZip, extForMime, readProjectZip } from '../../core/export/projectZip';
import { readAudio, writeAudio } from '../../audio/storage';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { pickFile, shareFile, sharePdf } from '../../platform/share';
import { flushSaves } from '../../store/song';

export type ExportKind = 'txt' | 'chordsheet' | 'pdf-lyrics' | 'pdf-chords' | 'chordpro' | 'midi' | 'zip';

export async function exportSong(doc: SongDoc, kind: ExportKind, opts: ExportOptions = {}): Promise<void> {
  await flushSaves();
  const base = safeFileName(doc.song.title || 'Untitled');
  switch (kind) {
    case 'txt':
      return shareFile(`${base}.txt`, 'text/plain', toPlainText(doc));
    case 'chordsheet':
      return shareFile(`${base} - chord sheet.txt`, 'text/plain', chordSheetText(doc, { transpose: opts.transpose, roman: opts.roman }));
    case 'pdf-lyrics':
      return sharePdf(lyricSheetHtml(doc), `${base}.pdf`);
    case 'pdf-chords':
      return sharePdf(chordChartHtml(doc, opts), `${base} - chords.pdf`);
    case 'chordpro':
      return shareFile(`${base}.cho`, 'text/plain', toChordPro(doc, opts));
    case 'midi':
      return shareFile(`${base}.mid`, 'audio/midi', toMidi(doc, opts));
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
