/**
 * Audio file storage (iOS/Android): takes live in <documents>/audio, which the
 * OS never purges. The database stores only the file name.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { newId } from '../core/util/id';

function dir(): Directory {
  const d = new Directory(Paths.document, 'audio');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

const extOf = (uri: string, fallback: string) => {
  const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(uri);
  return m ? m[1].toLowerCase() : fallback;
};

/** Move a freshly recorded file into permanent storage. Returns its stored name. */
export async function adoptRecording(uri: string, fallbackExt = 'm4a'): Promise<string> {
  const name = `${newId()}.${extOf(uri, fallbackExt)}`;
  const src = new File(uri);
  const dest = new File(dir(), name);
  try {
    src.moveSync(dest);
  } catch {
    src.copySync(dest);
  }
  return name;
}

export async function writeAudio(bytes: Uint8Array, ext: string): Promise<string> {
  const name = `${newId()}.${ext}`;
  const f = new File(dir(), name);
  f.create({ overwrite: true });
  f.writeSync(bytes);
  return name;
}

export async function playableUri(name: string): Promise<string> {
  return new File(dir(), name).uri;
}

export async function readAudio(name: string): Promise<Uint8Array | null> {
  const f = new File(dir(), name);
  if (!f.exists) return null;
  return f.bytes();
}

export async function deleteAudio(name: string): Promise<void> {
  const f = new File(dir(), name);
  if (f.exists) f.delete();
}

/** Write a temporary file and return its URI (for the speech recogniser, sharing). */
export async function writeTemp(name: string, bytes: Uint8Array | string): Promise<string> {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.writeSync(bytes);
  return f.uri;
}
