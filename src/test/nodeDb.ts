/** Test-only driver over Node's built-in SQLite (node:sqlite). */
import { DatabaseSync } from 'node:sqlite';
import { createSerialDb, type Db, type SqlParam } from '../db/driver';
import { migrate } from '../db/schema';

export async function openTestDb(): Promise<Db & { raw: DatabaseSync }> {
  const raw = new DatabaseSync(':memory:');
  const db = createSerialDb({
    exec: async (sql) => void raw.exec(sql),
    run: async (sql, params: SqlParam[] = []) => void raw.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: SqlParam[] = []) => raw.prepare(sql).all(...params) as T[],
    first: async <T,>(sql: string, params: SqlParam[] = []) => (raw.prepare(sql).get(...params) as T) ?? null,
  });
  await migrate(db);
  return Object.assign(db, { raw });
}
