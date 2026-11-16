/**
 * Full project ZIP: everything needed to rebuild a song elsewhere, plus the
 * human-readable exports so the archive is useful without the app.
 *
 *   song.json          the full song document + recording metadata
 *   lyrics.txt         plain text
 *   song.chordpro      ChordPro
 *   song.mid           chords + melody
 *   audio/<n>.<ext>    every take
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Recording, SongDoc } from '../model';
import { safeFileName, toChordPro, toMidi, toPlainText } from './formats';

export interface ProjectBundle {
  format: 'stanza-project';
  version: 1;
  doc: SongDoc;
  recordings: (Recording & { zipPath: string })[];
}

export const extForMime = (mime: string) =>
  mime.includes('webm') ? 'webm' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : mime.includes('ogg') ? 'ogg' : 'm4a';

export function buildProjectZip(doc: SongDoc, takes: { rec: Recording; bytes: Uint8Array | null }[]): Uint8Array {
  const files: Zippable = {};
  const used = new Set<string>();
  const recs: ProjectBundle['recordings'] = [];
  for (const { rec, bytes } of takes) {
    if (!bytes) continue;
    let base = safeFileName(rec.title || 'take');
    let name = `audio/${base}.${extForMime(rec.mime)}`;
    for (let i = 2; used.has(name); i++) name = `audio/${base} (${i}).${extForMime(rec.mime)}`;
    used.add(name);
    // audio is already compressed: store, don't deflate
    files[name] = [bytes, { level: 0 }];
    recs.push({ ...rec, zipPath: name });
  }
  const bundle: ProjectBundle = { format: 'stanza-project', version: 1, doc, recordings: recs };
  files['song.json'] = strToU8(JSON.stringify(bundle, null, 1));
  files['lyrics.txt'] = strToU8(toPlainText(doc));
  files['song.chordpro'] = strToU8(toChordPro(doc));
  files['song.mid'] = toMidi(doc);
  return zipSync(files, { level: 6 });
}

export function readProjectZip(zip: Uint8Array): { bundle: ProjectBundle; audio: Map<string, Uint8Array> } {
  const files = unzipSync(zip);
  const json = files['song.json'];
  if (!json) throw new Error('Not a Stanza project: song.json is missing.');
  const bundle = JSON.parse(strFromU8(json)) as ProjectBundle;
  if (bundle.format !== 'stanza-project') throw new Error('Not a Stanza project.');
  const audio = new Map<string, Uint8Array>();
  for (const r of bundle.recordings) if (files[r.zipPath]) audio.set(r.zipPath, files[r.zipPath]);
  return { bundle, audio };
}
