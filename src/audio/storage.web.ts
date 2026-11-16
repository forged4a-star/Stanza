/**
 * Audio file storage on web: bytes live in the SQLite database (blobs table),
 * which expo-sqlite persists in the browser's origin-private file system.
 */
import { newId } from '../core/util/id';
import { getDb } from '../db/client';

const urls = new Map<string, string>();
const mimeFor = (ext: string) => (ext === 'webm' ? 'audio/webm' : ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : 'audio/mp4');

export async function writeAudio(bytes: Uint8Array, ext: string): Promise<string> {
  const name = `${newId()}.${ext}`;
  const db = await getDb();
  await db.run(`INSERT INTO blobs (name, mime, data) VALUES (?, ?, ?)`, [name, mimeFor(ext), bytes]);
  return name;
}

export async function adoptRecording(uri: string, fallbackExt = 'webm'): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : blob.type.includes('wav') ? 'wav' : fallbackExt;
  return writeAudio(new Uint8Array(await blob.arrayBuffer()), ext);
}

export async function readAudio(name: string): Promise<Uint8Array | null> {
  const db = await getDb();
  const r = await db.first<{ data: Uint8Array }>(`SELECT data FROM blobs WHERE name = ?`, [name]);
  return r ? new Uint8Array(r.data) : null;
}

export async function playableUri(name: string): Promise<string> {
  const cached = urls.get(name);
  if (cached) return cached;
  const bytes = await readAudio(name);
  if (!bytes) throw new Error('Audio not found');
  const ext = name.split('.').pop() ?? 'webm';
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFor(ext) }));
  urls.set(name, url);
  return url;
}

export async function deleteAudio(name: string): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM blobs WHERE name = ?`, [name]);
  const u = urls.get(name);
  if (u) URL.revokeObjectURL(u);
  urls.delete(name);
}

export async function writeTemp(name: string, bytes: Uint8Array | string): Promise<string> {
  const blob = new Blob([bytes as BlobPart]);
  return URL.createObjectURL(blob);
}
