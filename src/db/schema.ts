import type { Db } from './driver';

/**
 * Migrations run in order, once each, tracked with PRAGMA user_version.
 * Never edit a shipped migration; add a new one.
 */
export const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE songs (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'idea',
    pinned INTEGER NOT NULL DEFAULT 0,
    song_key TEXT,
    bpm REAL NOT NULL DEFAULT 90,
    time_sig TEXT NOT NULL DEFAULT '4/4',
    capo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    opened_at INTEGER NOT NULL,
    deleted_at INTEGER,
    search_text TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX songs_updated ON songs(updated_at);
  CREATE TABLE song_tags (
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (song_id, tag)
  );
  CREATE TABLE sections (
    id TEXT PRIMARY KEY NOT NULL,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL,
    collapsed INTEGER NOT NULL DEFAULT 0,
    feeling TEXT NOT NULL DEFAULT '',
    intensity REAL,
    bars TEXT NOT NULL DEFAULT '[]',
    melody TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX sections_song ON sections(song_id, sort);
  CREATE TABLE lines (
    id TEXT PRIMARY KEY NOT NULL,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    locked INTEGER NOT NULL DEFAULT 0,
    alts TEXT NOT NULL DEFAULT '[]',
    chords TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX lines_section ON lines(section_id, sort);
  CREATE TABLE recordings (
    id TEXT PRIMARY KEY NOT NULL,
    song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
    section_id TEXT,
    line_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    file TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'audio/mp4',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    bpm REAL,
    rec_key TEXT,
    transcript TEXT NOT NULL DEFAULT '',
    take_no INTEGER NOT NULL DEFAULT 1,
    starred INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    analysis TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE INDEX recordings_song ON recordings(song_id, created_at);
  CREATE TABLE ideas (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    recording_id TEXT REFERENCES recordings(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    used_in_song_id TEXT
  );
  CREATE TABLE scraps (
    id TEXT PRIMARY KEY NOT NULL,
    song_id TEXT,
    song_title TEXT NOT NULL DEFAULT '',
    section_label TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX scraps_created ON scraps(created_at);
  CREATE TABLE snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    auto INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX snapshots_song ON snapshots(song_id, created_at);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE blobs (
    name TEXT PRIMARY KEY NOT NULL,
    mime TEXT NOT NULL,
    data BLOB NOT NULL
  );
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON');
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.tx(async (d) => {
      await d.exec(MIGRATIONS[v]);
      await d.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
