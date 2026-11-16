/**
 * Stanza sync + co-writing server (optional; the app works fully without it).
 *
 *   STANZA_TOKEN=secret PORT=8787 node server/server.ts
 *
 * - Backup/sync: POST /sync (songs), PUT/GET /blobs/:name (audio). Bearer token.
 * - Co-writing: POST /rooms (owner, bearer token) creates a share link;
 *   anyone with the link (room id + key) can GET the song and join the
 *   WebSocket at /rooms/:id/ws to edit live and leave comments.
 *
 * Storage: one SQLite file (node:sqlite). Plain HTTP; put it behind TLS.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, type WebSocket } from 'ws';
import { applyOp, hashDoc, type ClientMsg, type Comment, type Peer, type ServerMsg } from '../src/core/collab/ops.ts';
import type { SongDoc } from '../src/core/model.ts';

export interface ServerOptions {
  port?: number;
  token: string;
  dbPath?: string;
  /** public base URL used in share links */
  publicUrl?: string;
}

export function startServer(opts: ServerOptions) {
  const db = new DatabaseSync(opts.dbPath ?? ':memory:');
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, seq INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS blobs (name TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, key TEXT NOT NULL, data TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, room TEXT NOT NULL, line_id TEXT, author TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', 0);
  `);
  const nextSeq = () => {
    db.prepare(`UPDATE meta SET v = v + 1 WHERE k = 'seq'`).run();
    return Number((db.prepare(`SELECT v FROM meta WHERE k = 'seq'`).get() as { v: number }).v);
  };

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: http.IncomingMessage, limit = 50 * 1024 * 1024) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > limit) {
          reject(new Error('too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  const authed = (req: http.IncomingMessage) => req.headers.authorization === `Bearer ${opts.token}`;
  const roomOk = (id: string, key: string | null) => {
    const r = db.prepare(`SELECT key FROM rooms WHERE id = ?`).get(id) as { key: string } | undefined;
    return !!r && !!key && r.key === key;
  };

  // ---------------------------------------------------------------- live rooms
  interface Live {
    doc: SongDoc;
    seq: number;
    clients: Map<WebSocket, Peer>;
    dirty: boolean;
  }
  const live = new Map<string, Live>();
  const getLive = (id: string): Live => {
    let r = live.get(id);
    if (!r) {
      const row = db.prepare(`SELECT data, seq FROM rooms WHERE id = ?`).get(id) as { data: string; seq: number };
      r = { doc: JSON.parse(row.data), seq: Number(row.seq), clients: new Map(), dirty: false };
      live.set(id, r);
    }
    return r;
  };
  const persistRoom = (id: string) => {
    const r = live.get(id);
    if (!r || !r.dirty) return;
    db.prepare(`UPDATE rooms SET data = ?, seq = ? WHERE id = ?`).run(JSON.stringify(r.doc), r.seq, id);
    r.dirty = false;
  };
  const flushTimer = setInterval(() => {
    for (const id of live.keys()) persistRoom(id);
  }, 1000);
  const roomComments = (id: string): Comment[] =>
    (db.prepare(`SELECT * FROM comments WHERE room = ? ORDER BY created_at`).all(id) as Record<string, unknown>[]).map((c) => ({
      id: String(c.id),
      lineId: (c.line_id as string) ?? null,
      author: String(c.author),
      text: String(c.text),
      createdAt: Number(c.created_at),
      resolved: !!c.resolved,
    }));
  const broadcast = (r: Live, msg: ServerMsg) => {
    const s = JSON.stringify(msg);
    for (const ws of r.clients.keys()) if (ws.readyState === 1) ws.send(s);
  };

  // ---------------------------------------------------------------- http
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, HEAD' });
        return res.end();
      }
      if (url.pathname === '/health') return json(res, 200, { ok: true });

      // share link landing page: opens the app
      if (parts[0] === 'join' && parts[1]) {
        const app = `stanza://join/${encodeURIComponent(parts[1])}?k=${encodeURIComponent(url.searchParams.get('k') ?? '')}&s=${encodeURIComponent(opts.publicUrl ?? `http://${req.headers.host}`)}`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`<!doctype html><meta name=viewport content="width=device-width"><title>Join song</title><body style="font-family:sans-serif;padding:24px"><h2>You're invited to co-write a song</h2><p><a href="${app}">Open in Stanza</a></p></body>`);
      }

      if (parts[0] === 'sync' && req.method === 'POST') {
        if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
        const body = JSON.parse((await readBody(req)).toString('utf8')) as { cursor: number; push: { id: string; updatedAt: number; deleted: boolean; doc: unknown }[] };
        const accepted = new Set<string>();
        const conflicts: string[] = [];
        for (const p of body.push ?? []) {
          const cur = db.prepare(`SELECT updated_at FROM songs WHERE id = ?`).get(p.id) as { updated_at: number } | undefined;
          if (cur && Number(cur.updated_at) > p.updatedAt) {
            conflicts.push(p.id);
            continue;
          }
          db.prepare(`INSERT INTO songs (id, updated_at, deleted, data, seq) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq`).run(
            p.id,
            p.updatedAt,
            p.deleted ? 1 : 0,
            JSON.stringify(p.doc),
            nextSeq()
          );
          accepted.add(p.id);
        }
        const rows = db.prepare(`SELECT id, updated_at, deleted, data, seq FROM songs WHERE seq > ? ORDER BY seq`).all(body.cursor ?? 0) as Record<string, unknown>[];
        const pull = rows
          .filter((r) => !accepted.has(String(r.id)))
          .map((r) => ({ id: String(r.id), updatedAt: Number(r.updated_at), deleted: !!r.deleted, doc: JSON.parse(String(r.data)) }));
        // conflicts: always send the server's newer copy back
        for (const id of conflicts) {
          if (pull.some((p) => p.id === id)) continue;
          const r = db.prepare(`SELECT id, updated_at, deleted, data FROM songs WHERE id = ?`).get(id) as Record<string, unknown>;
          pull.push({ id, updatedAt: Number(r.updated_at), deleted: !!r.deleted, doc: JSON.parse(String(r.data)) });
        }
        const cursor = Number((db.prepare(`SELECT v FROM meta WHERE k = 'seq'`).get() as { v: number }).v);
        return json(res, 200, { cursor, pull, conflicts });
      }

      if (parts[0] === 'blobs' && parts[1]) {
        if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
        const name = decodeURIComponent(parts[1]);
        if (req.method === 'PUT') {
          const data = await readBody(req);
          db.prepare(`INSERT OR REPLACE INTO blobs (name, mime, data) VALUES (?, ?, ?)`).run(name, String(req.headers['content-type'] ?? 'application/octet-stream'), data);
          return json(res, 200, { ok: true });
        }
        const row = db.prepare(`SELECT mime, data FROM blobs WHERE name = ?`).get(name) as { mime: string; data: Uint8Array } | undefined;
        if (!row) return json(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': row.mime, 'Access-Control-Allow-Origin': '*' });
        return res.end(req.method === 'HEAD' ? undefined : Buffer.from(row.data));
      }

      if (parts[0] === 'rooms' && req.method === 'POST' && !parts[1]) {
        if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
        const { doc } = JSON.parse((await readBody(req)).toString('utf8')) as { doc: SongDoc };
        const id = randomBytes(6).toString('hex');
        const key = randomBytes(12).toString('hex');
        db.prepare(`INSERT INTO rooms (id, key, data, seq, created_at) VALUES (?, ?, ?, 0, ?)`).run(id, key, JSON.stringify(doc), Date.now());
        const base = opts.publicUrl ?? `http://${req.headers.host}`;
        return json(res, 200, { roomId: id, key, link: `${base}/join/${id}?k=${key}` });
      }
      if (parts[0] === 'rooms' && parts[1] && req.method === 'GET' && !parts[2]) {
        if (!roomOk(parts[1], url.searchParams.get('k'))) return json(res, 404, { error: 'not found' });
        const r = getLive(parts[1]);
        return json(res, 200, { doc: r.doc, seq: r.seq, hash: hashDoc(r.doc), comments: roomComments(parts[1]) });
      }
      json(res, 404, { error: 'not found' });
    } catch (e) {
      json(res, 400, { error: String((e as Error).message ?? e) });
    }
  });

  // ---------------------------------------------------------------- websocket
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'rooms' || parts[2] !== 'ws' || !roomOk(parts[1], url.searchParams.get('k'))) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const roomId = parts[1];
      const r = getLive(roomId);
      const peer: Peer = { id: randomBytes(4).toString('hex'), name: (url.searchParams.get('name') ?? 'Guest').slice(0, 40), lineId: null };
      r.clients.set(ws, peer);
      const send = (m: ServerMsg) => ws.send(JSON.stringify(m));
      send({ type: 'hello', doc: r.doc, seq: r.seq, comments: roomComments(roomId), peers: [...r.clients.values()], you: peer.id });
      broadcast(r, { type: 'presence', peers: [...r.clients.values()] });
      ws.on('message', (raw) => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.type === 'op') {
          r.doc = applyOp(r.doc, msg.op);
          r.seq++;
          r.dirty = true;
          broadcast(r, { type: 'op', op: msg.op, seq: r.seq, author: peer.id, clientOpId: msg.clientOpId, hash: hashDoc(r.doc) });
        } else if (msg.type === 'comment') {
          const c = { ...msg.comment, author: peer.name, createdAt: Date.now(), resolved: false };
          db.prepare(`INSERT OR REPLACE INTO comments (id, room, line_id, author, text, created_at, resolved) VALUES (?, ?, ?, ?, ?, ?, 0)`).run(c.id, roomId, c.lineId, c.author, c.text.slice(0, 2000), c.createdAt);
          broadcast(r, { type: 'comment', comment: c });
        } else if (msg.type === 'resolve') {
          db.prepare(`UPDATE comments SET resolved = ? WHERE id = ? AND room = ?`).run(msg.resolved ? 1 : 0, msg.commentId, roomId);
          broadcast(r, { type: 'resolve', commentId: msg.commentId, resolved: msg.resolved });
        } else if (msg.type === 'presence') {
          peer.lineId = msg.lineId;
          broadcast(r, { type: 'presence', peers: [...r.clients.values()] });
        }
      });
      ws.on('close', () => {
        r.clients.delete(ws);
        broadcast(r, { type: 'presence', peers: [...r.clients.values()] });
        persistRoom(roomId);
      });
    });
  });

  const ready = new Promise<number>((resolve) => server.listen(opts.port ?? 0, () => resolve((server.address() as { port: number }).port)));
  return {
    ready,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(flushTimer);
        for (const id of live.keys()) persistRoom(id);
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}

// run directly: node server/server.ts
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const token = process.env.STANZA_TOKEN;
  if (!token) {
    console.error('Set STANZA_TOKEN to a long random secret.');
    process.exit(1);
  }
  const s = startServer({ token, port: Number(process.env.PORT ?? 8787), dbPath: process.env.STANZA_DB ?? 'stanza-server.db', publicUrl: process.env.PUBLIC_URL });
  s.ready.then((p) => console.log(`Stanza server on :${p}`));
}
