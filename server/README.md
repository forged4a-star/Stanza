# Stanza server (optional)

The app is offline-first and needs no server. Run this only if you want
**backup**, **sync between devices** and **sharing a song by link for live
co-writing with comments**.

```bash
STANZA_TOKEN=$(openssl rand -hex 24) PORT=8787 PUBLIC_URL=https://songs.example.com node server/server.ts
```

- Requires Node 22.18+ (runs the TypeScript directly) and the `ws` package
  (`npm install` in the repo root installs it).
- Data is one SQLite file (`STANZA_DB`, default `stanza-server.db`).
- Put it behind HTTPS (any reverse proxy). `PUBLIC_URL` is used in share links.
- In the app: Settings → Backup, sync and co-writing → server address + the
  `STANZA_TOKEN` value.

## What it does

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /sync` | Bearer token | push changed songs, pull newer ones (cursor-based) |
| `PUT/GET/HEAD /blobs/:name` | Bearer token | audio takes |
| `POST /rooms` | Bearer token | share a song: returns `/join/<room>?k=<key>` |
| `GET /rooms/:id?k=` | room key | current shared document + comments |
| `WS /rooms/:id/ws?k=&name=` | room key | live edits (ops), comments, presence |
| `GET /join/:id?k=` | — | landing page that opens the app |

Conflicts never lose work: when a song changed on two devices, the newer copy
wins and the other is saved on that device as a version ("Before sync").
Co-writing ops are applied by the server in one order and relayed; each
message carries a document hash so a client that drifted re-fetches.

The token model is single-owner (one token per server). Anyone holding a share
link can read, edit and comment on that one song.
