/** Opens the on-device database (expo-sqlite) once and migrates it. */
import * as SQLite from 'expo-sqlite';
import { createSerialDb, type Db, type SqlParam } from './driver';
import { migrate } from './schema';

let dbPromise: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const native = await SQLite.openDatabaseAsync('stanza.db');
  // WAL: crash-safe and lets reads proceed during writes
  await native.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const db = createSerialDb({
    exec: (sql) => native.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => void (await native.runAsync(sql, params)),
    all: (sql, params: SqlParam[] = []) => native.getAllAsync(sql, params),
    first: (sql, params: SqlParam[] = []) => native.getFirstAsync(sql, params),
  });
  await migrate(db);
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = open().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}
