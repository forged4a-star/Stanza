/**
 * Autosave. The editor changes its in-memory state instantly and pushes a
 * write here on every keystroke. Writes run strictly in order, in batches
 * (one transaction per batch). A keystroke arriving while a batch is in
 * flight is queued, and repeated writes to the same thing (the same line's
 * text) are merged so typing never builds a backlog.
 *
 * If a batch fails it is retried with backoff; nothing is dropped.
 */
import type { Db, SqlDriver } from './driver';

export type WriteOp = (d: SqlDriver) => Promise<void>;

interface Pending {
  key: string | null;
  op: WriteOp;
}

export type SaveState = 'saved' | 'saving' | 'error';

export class SaveQueue {
  private pending: Pending[] = [];
  private running: Promise<void> | null = null;
  private listeners = new Set<(s: SaveState) => void>();
  private state: SaveState = 'saved';
  private retryDelay = 0;
  /** called once per batch (inside the transaction) with the song ids touched */
  afterBatch: ((d: SqlDriver, songIds: Set<string>) => Promise<void>) | null = null;
  private touched = new Set<string>();

  constructor(private readonly db: Db) {}

  /**
   * Queue a write. With a `key`, a not-yet-started write with the same key is
   * replaced in place (keeping its position, so order is preserved).
   */
  push(op: WriteOp, key: string | null = null, songId: string | null = null): void {
    if (songId) this.touched.add(songId);
    if (key !== null) {
      const existing = this.pending.find((p) => p.key === key);
      if (existing) {
        existing.op = op;
        this.kick();
        return;
      }
    }
    this.pending.push({ key, op });
    this.kick();
  }

  get size(): number {
    return this.pending.length;
  }

  /** Resolves once everything queued so far is on disk. */
  async flush(): Promise<void> {
    while (this.pending.length || this.running) {
      if (this.running) await this.running.catch(() => undefined);
      else this.kick();
    }
  }

  onState(fn: (s: SaveState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private setState(s: SaveState) {
    if (s === this.state) return;
    this.state = s;
    for (const l of this.listeners) l(s);
  }

  private kick() {
    if (this.running || !this.pending.length) return;
    this.setState('saving');
    this.running = this.runBatch().finally(() => {
      this.running = null;
      if (this.pending.length) {
        if (this.retryDelay) setTimeout(() => this.kick(), this.retryDelay);
        else this.kick();
      } else if (this.state !== 'error') this.setState('saved');
    });
  }

  private async runBatch(): Promise<void> {
    const batch = this.pending;
    const touched = this.touched;
    this.pending = [];
    this.touched = new Set();
    try {
      await this.db.tx(async (d) => {
        for (const p of batch) await p.op(d);
        if (this.afterBatch && touched.size) await this.afterBatch(d, touched);
      });
      this.retryDelay = 0;
      if (this.state === 'error') this.setState('saving');
    } catch (e) {
      // put the batch back in front, merging with anything queued meanwhile
      const merged = [...batch];
      for (const p of this.pending) {
        const same = p.key !== null ? merged.find((m) => m.key === p.key) : undefined;
        if (same) same.op = p.op;
        else merged.push(p);
      }
      this.pending = merged;
      for (const s of touched) this.touched.add(s);
      this.retryDelay = Math.min(5000, (this.retryDelay || 100) * 2);
      this.setState('error');
      console.warn('Autosave failed, will retry', e);
    }
  }
}
