/** Writing stats, kept on this device: minutes written and lines written per day. */
import { AppState } from 'react-native';
import { create } from 'zustand';
import { addEdit, addWritten, prune, type Tracker, type WritingLog } from '../core/stats/writing';
import { getDb } from '../db/client';
import * as repo from '../db/repo';

interface WritingState {
  log: WritingLog;
  tracker: Tracker;
  loaded: boolean;
  load: () => Promise<void>;
  /** call on every edit to a song */
  edit: () => void;
  /** call when a line goes from empty to having words */
  written: (n?: number) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useWriting = create<WritingState>((set, get) => {
  const persist = async () => {
    try {
      await repo.setSetting(await getDb(), 'writingLog', prune(get().log));
    } catch {
      /* stats are a nicety; never get in the way of writing */
    }
  };
  const save = () => {
    if (timer) clearTimeout(timer);
    // a few seconds after the last change, so typing is never slowed down
    timer = setTimeout(() => {
      timer = null;
      void persist();
    }, 4000);
  };
  // leaving the app should not lose the last few seconds
  AppState.addEventListener('change', (s) => {
    if (s !== 'active' && timer) {
      clearTimeout(timer);
      timer = null;
      void persist();
    }
  });
  return {
    log: {},
    tracker: { lastEditAt: null },
    loaded: false,
    load: async () => {
      if (get().loaded) return;
      const saved = await repo.getSetting<WritingLog>(await getDb(), 'writingLog', {});
      // anything counted before the load finished is kept
      const mem = get().log;
      const merged: WritingLog = { ...saved };
      for (const [k, v] of Object.entries(mem)) merged[k] = { ms: (merged[k]?.ms ?? 0) + v.ms, written: (merged[k]?.written ?? 0) + v.written };
      set({ log: merged, loaded: true });
    },
    edit: () => {
      const r = addEdit(get().log, get().tracker, Date.now());
      set({ log: r.log, tracker: r.tracker });
      save();
    },
    written: (n = 1) => {
      set({ log: addWritten(get().log, Date.now(), n) });
      save();
    },
  };
});
