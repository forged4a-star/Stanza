/**
 * Live co-writing for a shared song: one WebSocket per open shared song.
 * Local edits are sent as ops; remote ops are applied to the song and saved.
 * If the document ever drifts from the server's (hash mismatch), it re-fetches.
 * Offline, edits stay local and the song simply re-joins later.
 */
import { create } from 'zustand';
import { hashDoc, type ClientMsg, type Comment, type Op, type Peer, type ServerMsg } from '../core/collab/ops';
import { newId } from '../core/util/id';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { setCollabEmitter, useSong } from '../store/song';
import { loadSyncConfig } from '../sync/runner';

export interface RoomLink {
  server: string;
  roomId: string;
  key: string;
}

interface CollabStore {
  songId: string | null;
  room: RoomLink | null;
  status: 'off' | 'connecting' | 'live' | 'offline';
  peers: Peer[];
  you: string | null;
  comments: Comment[];
}

export const useCollab = create<CollabStore>(() => ({ songId: null, room: null, status: 'off', peers: [], you: null, comments: [] }));

let ws: WebSocket | null = null;
let pending = 0;
let retry: ReturnType<typeof setTimeout> | null = null;

export async function roomFor(songId: string): Promise<RoomLink | null> {
  const rooms = await repo.getSetting<Record<string, RoomLink>>(await getDb(), 'rooms', {});
  return rooms[songId] ?? null;
}

async function saveRoom(songId: string, link: RoomLink | null) {
  const db = await getDb();
  const rooms = await repo.getSetting<Record<string, RoomLink>>(db, 'rooms', {});
  if (link) rooms[songId] = link;
  else delete rooms[songId];
  await repo.setSetting(db, 'rooms', rooms);
}

const send = (m: ClientMsg) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
};

async function resyncFromServer() {
  const { room, songId } = useCollab.getState();
  if (!room || !songId) return;
  const r = await fetch(`${room.server}/rooms/${room.roomId}?k=${room.key}`);
  if (!r.ok) return;
  const body = (await r.json()) as { doc: import('../core/model').SongDoc };
  const db = await getDb();
  await repo.replaceSongDoc(db, { ...body.doc, song: { ...body.doc.song, id: songId } }, Date.now());
  await useSong.getState().reload();
}

/** Connect the open song to its room (if it has one). */
export async function connectSong(songId: string) {
  disconnect();
  const room = await roomFor(songId);
  if (!room) return;
  const cfg = await loadSyncConfig();
  useCollab.setState({ songId, room, status: 'connecting', peers: [], comments: [] });
  const url = `${room.server.replace(/^http/, 'ws')}/rooms/${room.roomId}/ws?k=${encodeURIComponent(room.key)}&name=${encodeURIComponent(cfg.name || 'Co-writer')}`;
  const sock = new WebSocket(url);
  ws = sock;
  pending = 0;
  sock.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data)) as ServerMsg;
    const st = useCollab.getState();
    switch (m.type) {
      case 'hello': {
        useCollab.setState({ status: 'live', you: m.you, peers: m.peers, comments: m.comments });
        const local = useSong.getState().doc;
        // the server's copy is the shared truth when we (re)join
        if (local && hashDoc(local) !== hashDoc({ ...m.doc, song: { ...m.doc.song, id: local.song.id } })) void resyncFromServer();
        break;
      }
      case 'op':
        if (m.author === st.you) pending = Math.max(0, pending - 1);
        else useSong.getState().applyRemoteOp(m.op);
        if (pending === 0) {
          const local = useSong.getState().doc;
          if (local && hashDoc(local) !== m.hash) void resyncFromServer();
        }
        break;
      case 'comment':
        useCollab.setState({ comments: [...st.comments.filter((c) => c.id !== m.comment.id), m.comment] });
        break;
      case 'resolve':
        useCollab.setState({ comments: st.comments.map((c) => (c.id === m.commentId ? { ...c, resolved: m.resolved } : c)) });
        break;
      case 'presence':
        useCollab.setState({ peers: m.peers });
        break;
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    useCollab.setState({ status: 'offline' });
    retry = setTimeout(() => {
      if (useSong.getState().doc?.song.id === songId) void connectSong(songId);
    }, 5000);
  };
  setCollabEmitter((op: Op) => {
    if (useSong.getState().doc?.song.id !== songId) return;
    pending++;
    send({ type: 'op', op, clientOpId: newId() });
  });
}

export function disconnect() {
  if (retry) clearTimeout(retry);
  retry = null;
  setCollabEmitter(null);
  const s = ws;
  ws = null;
  s?.close();
  useCollab.setState({ songId: null, room: null, status: 'off', peers: [], comments: [], you: null });
}

export async function shareSong(): Promise<string> {
  const cfg = await loadSyncConfig();
  if (!cfg.url || !cfg.token) throw new Error('Set up a Stanza server in Settings → Backup & sync first.');
  const doc = useSong.getState().doc!;
  const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/rooms`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ doc }) });
  if (!res.ok) throw new Error(`Could not create a share link (${res.status})`);
  const { roomId, key, link } = (await res.json()) as { roomId: string; key: string; link: string };
  await saveRoom(doc.song.id, { server: cfg.url.replace(/\/+$/, ''), roomId, key });
  await connectSong(doc.song.id);
  return link;
}

export async function stopSharing() {
  const id = useCollab.getState().songId;
  disconnect();
  if (id) await saveRoom(id, null);
}

/** Join from a link: fetch the song, store it locally (same ids as the room), return its id. */
export async function joinRoom(server: string, roomId: string, key: string): Promise<string> {
  const base = server.replace(/\/+$/, '');
  const res = await fetch(`${base}/rooms/${roomId}?k=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error('This share link is not valid any more.');
  const { doc } = (await res.json()) as { doc: import('../core/model').SongDoc };
  const db = await getDb();
  const exists = await repo.loadSong(db, doc.song.id);
  if (!exists) await repo.replaceSongDoc(db, doc, Date.now());
  await saveRoom(doc.song.id, { server: base, roomId, key });
  return doc.song.id;
}

export function addComment(text: string, lineId: string | null) {
  const c: Comment = { id: newId(), lineId, author: '', text, createdAt: Date.now(), resolved: false };
  send({ type: 'comment', comment: c });
}

export function resolveComment(id: string, resolved: boolean) {
  send({ type: 'resolve', commentId: id, resolved });
}

export function sendPresence(lineId: string | null) {
  send({ type: 'presence', lineId });
}
