/**
 * A tiny SQL driver interface so the repository runs on expo-sqlite in the app
 * and on Node's built-in SQLite in tests. All access is serialised through one
 * queue so a transaction never interleaves with other statements.
 */
export type SqlParam = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  first<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T | null>;
}

export interface Db extends SqlDriver {
  /** Run `fn` inside a transaction with exclusive access. */
  tx<T>(fn: (d: SqlDriver) => Promise<T>): Promise<T>;
}

export function createSerialDb(raw: SqlDriver): Db {
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const p = chain.then(job, job);
    chain = p.catch(() => undefined);
    return p;
  };
  return {
    exec: (sql) => enqueue(() => raw.exec(sql)),
    run: (sql, params) => enqueue(() => raw.run(sql, params)),
    all: (sql, params) => enqueue(() => raw.all(sql, params)),
    first: (sql, params) => enqueue(() => raw.first(sql, params)),
    tx: (fn) =>
      enqueue(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(raw);
          await raw.exec('COMMIT');
          return result;
        } catch (e) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // already rolled back
          }
          throw e;
        }
      }),
  };
}
