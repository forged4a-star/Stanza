/** Runs sync in the app: settings, status, automatic runs. */
import { AppState } from 'react-native';
import { create } from 'zustand';
import { hasAudio, readAudio, writeAudioNamed } from '../audio/storage';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { flushSaves, useSong } from '../store/song';
import { syncOnce, type SyncState } from './sync';

export interface SyncConfig extends SyncState {
  enabled: boolean;
  /** your name, shown to co-writers */
  name: string;
}

interface SyncStore {
  config: SyncConfig;
  status: 'idle' | 'syncing' | 'ok' | 'error' | 'offline';
  message: string;
  loaded: boolean;
}

const DEFAULT: SyncConfig = { url: '', token: '', cursor: 0, lastSyncAt: 0, enabled: false, name: '' };
export const useSync = create<SyncStore>(() => ({ config: DEFAULT, status: 'idle', message: '', loaded: false }));

export async function loadSyncConfig(): Promise<SyncConfig> {
  if (!useSync.getState().loaded) {
    const c = await repo.getSetting<SyncConfig>(await getDb(), 'sync', DEFAULT);
    useSync.setState({ config: { ...DEFAULT, ...c }, loaded: true });
  }
  return useSync.getState().config;
}

export async function saveSyncConfig(patch: Partial<SyncConfig>) {
  const config = { ...(await loadSyncConfig()), ...patch };
  // a different server starts from scratch
  if (patch.url !== undefined && patch.url !== useSync.getState().config.url) Object.assign(config, { cursor: 0, lastSyncAt: 0 });
  useSync.setState({ config });
  await repo.setSetting(await getDb(), 'sync', config);
}

let running: Promise<void> | null = null;

export function runSync(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const cfg = await loadSyncConfig();
    if (!cfg.url || !cfg.token) return;
    useSync.setState({ status: 'syncing', message: '' });
    try {
      await flushSaves();
      const db = await getDb();
      const r = await syncOnce(db, cfg, { read: readAudio, write: writeAudioNamed, has: hasAudio });
      await saveSyncConfig({ cursor: r.state.cursor, lastSyncAt: r.state.lastSyncAt });
      const bits = [`${r.pushed} sent`, `${r.pulled} received`];
      if (r.uploaded || r.downloaded) bits.push(`${r.uploaded + r.downloaded} takes`);
      if (r.conflicts) bits.push(`${r.conflicts} kept as versions`);
      useSync.setState({ status: 'ok', message: bits.join(' · ') });
      const open = useSong.getState().doc;
      if (open && r.pulled) await useSong.getState().reload();
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      const offline = /network|fetch|failed to fetch|timed out/i.test(msg);
      useSync.setState({ status: offline ? 'offline' : 'error', message: offline ? 'Offline — will try again later.' : msg });
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Sync on start, when the app goes to the background, and every 5 minutes. */
export async function startAutoSync() {
  const cfg = await loadSyncConfig();
  if (timer) clearInterval(timer);
  timer = null;
  if (!cfg.enabled || !cfg.url) return;
  void runSync();
  timer = setInterval(() => void runSync(), 5 * 60 * 1000);
}

AppState.addEventListener?.('change', (s) => {
  if (s !== 'active' && useSync.getState().config.enabled) void runSync();
});
