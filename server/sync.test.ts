import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { applyOp, hashDoc, type ServerMsg } from '../src/core/collab/ops';
import * as repo from '../src/db/repo';
import { syncOnce, type BlobStore, type SyncState } from '../src/sync/sync';
import { openTestDb } from '../src/test/nodeDb';
import { startServer } from './server';

let srv: ReturnType<typeof startServer>;
let base = '';
beforeAll(async () => {
  srv = startServer({ token: 'secret' });
  base = `http://127.0.0.1:${await srv.ready}`;
});
afterAll(() => srv.close());

const memBlobs = (): BlobStore & { files: Map<string, Uint8Array> } => {
  const files = new Map<string, Uint8Array>();
  return { files, read: async (n) => files.get(n) ?? null, write: async (n, b) => void files.set(n, b), has: async (n) => files.has(n) };
};

describe('backup and sync', () => {
  it('syncs songs and takes between two devices, and never loses a conflicting edit', async () => {
    const a = await openTestDb();
    const b = await openTestDb();
    const blobsA = memBlobs();
    const blobsB = memBlobs();
    let sa: SyncState = { url: base, token: 'secret', cursor: 0, lastSyncAt: 0 };
    let sb: SyncState = { ...sa };

    const doc = await repo.createSong(a, { title: 'Shared', sections: [{ kind: 'verse', lines: ['first line'] }] });
    const rec = await repo.addRecording(a, { songId: doc.song.id, title: 'take', file: 'take1.m4a', mime: 'audio/mp4', durationMs: 1000 });
    blobsA.files.set(rec.file, new Uint8Array([1, 2, 3]));
    let r = await syncOnce(a, sa, blobsA);
    sa = r.state;
    expect([r.pushed, r.uploaded]).toEqual([1, 1]);

    r = await syncOnce(b, sb, blobsB);
    sb = r.state;
    expect([r.pulled, r.downloaded]).toEqual([1, 1]);
    const onB = (await repo.loadSong(b, doc.song.id))!;
    expect(onB.sections[0].lines[0].text).toBe('first line');
    expect([...blobsB.files.get('take1.m4a')!]).toEqual([1, 2, 3]);
    expect((await repo.listRecordings(b, doc.song.id)).length).toBe(1);

    // nothing changed: nothing moves
    r = await syncOnce(a, sa, blobsA);
    sa = r.state;
    expect([r.pushed, r.pulled]).toEqual([0, 0]);

    // both edit the same song; B syncs last but edited first → A's newer edit wins, B's kept as a version
    await new Promise((res) => setTimeout(res, 5));
    await repo.updateLine(b, onB.sections[0].lines[0].id, { text: 'edited on B' });
    await repo.touchSong(b, doc.song.id);
    await new Promise((res) => setTimeout(res, 5));
    await repo.updateLine(a, doc.sections[0].lines[0].id, { text: 'edited on A' });
    await repo.touchSong(a, doc.song.id);
    r = await syncOnce(a, sa, blobsA);
    sa = r.state;
    r = await syncOnce(b, sb, blobsB);
    sb = r.state;
    expect(r.conflicts).toBe(1);
    expect((await repo.loadSong(b, doc.song.id))!.sections[0].lines[0].text).toBe('edited on A');
    const snaps = await repo.listSnapshots(b, doc.song.id);
    const kept = await repo.getSnapshot(b, snaps.find((s) => s.label.startsWith('Before sync'))!.id);
    expect(kept!.data.sections[0].lines[0].text).toBe('edited on B');

    // trash travels too
    await repo.trashSong(a, doc.song.id);
    sa = (await syncOnce(a, sa, blobsA)).state;
    sb = (await syncOnce(b, sb, blobsB)).state;
    expect((await repo.loadSong(b, doc.song.id))!.song.deletedAt).not.toBeNull();
  });

  it('rejects a wrong key', async () => {
    const a = await openTestDb();
    await expect(syncOnce(a, { url: base, token: 'nope', cursor: 0, lastSyncAt: 0 }, null)).rejects.toThrow(/rejected/);
  });
});

describe('co-writing rooms', () => {
  const connect = (url: string) =>
    new Promise<{ ws: WebSocket; msgs: ServerMsg[]; next: (type: string) => Promise<ServerMsg> }>((resolve) => {
      const ws = new WebSocket(url);
      const msgs: ServerMsg[] = [];
      const waiters: { type: string; fn: (m: ServerMsg) => void }[] = [];
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw)) as ServerMsg;
        const w = waiters.findIndex((x) => x.type === m.type);
        if (w >= 0) waiters.splice(w, 1)[0].fn(m);
        else msgs.push(m);
      });
      const next = (type: string) =>
        new Promise<ServerMsg>((res) => {
          const i = msgs.findIndex((m) => m.type === type);
          if (i >= 0) res(msgs.splice(i, 1)[0]);
          else waiters.push({ type, fn: res });
        });
      ws.on('open', () => resolve({ ws, msgs, next }));
    });

  it('relays ops and comments live, converging on the same document', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'Room', sections: [{ kind: 'verse', lines: ['hello'] }] });
    const created = await (await fetch(`${base}/rooms`, { method: 'POST', headers: { Authorization: 'Bearer secret' }, body: JSON.stringify({ doc }) })).json();
    expect(created.link).toMatch(/\/join\//);
    const bad = await fetch(`${base}/rooms/${created.roomId}?k=wrong`);
    expect(bad.status).toBe(404);
    const wsUrl = `${base.replace('http', 'ws')}/rooms/${created.roomId}/ws?k=${created.key}`;
    const alice = await connect(wsUrl + '&name=Alice');
    const bob = await connect(wsUrl + '&name=Bob');
    const helloA = (await alice.next('hello')) as Extract<ServerMsg, { type: 'hello' }>;
    const helloB = (await bob.next('hello')) as Extract<ServerMsg, { type: 'hello' }>;
    let docA = helloA.doc;
    let docB = helloB.doc;
    const lineId = doc.sections[0].lines[0].id;
    const ops = [
      { t: 'lineText', lineId, text: 'hello there' },
      { t: 'insertLine', sectionId: doc.sections[0].id, afterLineId: lineId, line: { id: 'L2', text: 'second line', locked: false, alts: [], chords: [] } },
      { t: 'songMeta', patch: { title: 'Room (live)' } },
    ] as const;
    // Alice sends; both apply what the server relays
    for (const op of ops) alice.ws.send(JSON.stringify({ type: 'op', op, clientOpId: 'x' }));
    for (let i = 0; i < ops.length; i++) {
      const ma = (await alice.next('op')) as Extract<ServerMsg, { type: 'op' }>;
      const mb = (await bob.next('op')) as Extract<ServerMsg, { type: 'op' }>;
      docA = applyOp(docA, ma.op);
      docB = applyOp(docB, mb.op);
      expect(hashDoc(docB)).toBe(mb.hash);
    }
    expect(docB.sections[0].lines.map((l) => l.text)).toEqual(['hello there', 'second line']);
    expect(docB.song.title).toBe('Room (live)');
    bob.ws.send(JSON.stringify({ type: 'comment', comment: { id: 'c1', lineId: 'L2', author: '', text: 'love this line', createdAt: 0, resolved: false } }));
    const ca = (await alice.next('comment')) as Extract<ServerMsg, { type: 'comment' }>;
    expect(ca.comment.author).toBe('Bob');
    // a late joiner gets the current document and comments
    const r = await (await fetch(`${base}/rooms/${created.roomId}?k=${created.key}`)).json();
    expect(r.hash).toBe(hashDoc(docA));
    expect(r.comments).toHaveLength(1);
    alice.ws.close();
    bob.ws.close();
  });
});
