/**
 * Optional backup & sync with a Stanza server. Offline-first: the device is
 * always the source of truth for editing; sync runs when a server is set up
 * and reachable, and never discards work: if both sides changed a song, the
 * local version is saved as a snapshot before the newer copy is taken.
 */
import type { Recording, SongDoc } from '../core/model';
import type { Db } from '../db/driver';
import * as repo from '../db/repo';

export interface SyncState {
  url: string;
  token: string;
  cursor: number;
  lastSyncAt: number;
}

export interface BlobStore {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  has(name: string): Promise<boolean>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  uploaded: number;
  downloaded: number;
  state: SyncState;
}

type Wire = { id: string; updatedAt: number; deleted: boolean; doc: SongDoc & { recordings?: Recording[] } };

export async function syncOnce(db: Db, state: SyncState, blobs: BlobStore | null, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  const base = state.url.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' };
  const started = Date.now();

  // ------------------------------------------------------------ push
  const changed = await repo.songsChangedSince(db, state.lastSyncAt);
  const push: Wire[] = [];
  for (const c of changed) {
    const doc = await repo.loadSong(db, c.id);
    if (!doc) continue;
    push.push({ id: c.id, updatedAt: c.updatedAt, deleted: c.deletedAt !== null, doc: { ...doc, recordings: await repo.listRecordings(db, c.id) } });
  }
  const res = await fetchImpl(`${base}/sync`, { method: 'POST', headers, body: JSON.stringify({ cursor: state.cursor, push }) });
  if (!res.ok) throw new Error(res.status === 401 ? 'The server rejected the sync key.' : `Sync failed (${res.status})`);
  const body = (await res.json()) as { cursor: number; pull: Wire[]; conflicts: string[] };

  // ------------------------------------------------------------ audio up
  let uploaded = 0;
  if (blobs) {
    for (const p of push) {
      for (const r of p.doc.recordings ?? []) {
        const head = await fetchImpl(`${base}/blobs/${encodeURIComponent(r.file)}`, { method: 'HEAD', headers });
        if (head.ok) continue;
        const bytes = await blobs.read(r.file);
        if (!bytes) continue;
        await fetchImpl(`${base}/blobs/${encodeURIComponent(r.file)}`, { method: 'PUT', headers: { ...headers, 'Content-Type': r.mime }, body: bytes as BodyInit });
        uploaded++;
      }
    }
  }

  // ------------------------------------------------------------ pull
  let pulled = 0;
  let downloaded = 0;
  for (const w of body.pull) {
    const local = await repo.loadSong(db, w.id);
    const localRow = changed.find((c) => c.id === w.id);
    const { recordings, ...remoteDoc } = w.doc;
    if (local && localRow && !repo.sameContent(local, remoteDoc)) {
      // both sides changed: keep ours as a version before taking theirs
      await repo.createSnapshot(db, w.id, 'Before sync (your version)');
    }
    if (!local || !repo.sameContent(local, remoteDoc) || (local.song.deletedAt !== null) !== w.deleted) {
      await repo.replaceSongDoc(db, remoteDoc, w.updatedAt, w.deleted ? w.updatedAt : null);
      pulled++;
    }
    for (const r of recordings ?? []) {
      const added = await repo.upsertRecording(db, r);
      if (added && blobs && !(await blobs.has(r.file))) {
        const b = await fetchImpl(`${base}/blobs/${encodeURIComponent(r.file)}`, { headers });
        if (b.ok) {
          await blobs.write(r.file, new Uint8Array(await b.arrayBuffer()));
          downloaded++;
        }
      }
    }
  }
  return {
    pushed: push.length,
    pulled,
    conflicts: body.conflicts.length,
    uploaded,
    downloaded,
    state: { ...state, cursor: body.cursor, lastSyncAt: started },
  };
}
