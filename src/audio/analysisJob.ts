/**
 * Background work after a take is saved: decode it, detect tempo and key,
 * transcribe it on-device, and give it a useful title. Runs one take at a
 * time; failures are recorded, never thrown at the user.
 */
import { analyzeTake } from '../core/dsp/analyze';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { decodeStored } from './decode';
import { transcribeTake } from './transcribe';
import { getSettings } from '../store/settings';

type Listener = (recordingId: string) => void;
const listeners = new Set<Listener>();
export const onRecordingAnalyzed = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

let running = false;

/** Titles look like "Chorus take 2 · 94 bpm · A minor" or "Idea · Tue 21:14". */
export function autoTitle(base: string, bpm: number | null, key: string | null): string {
  return [base, bpm ? `${bpm} bpm` : null, key].filter(Boolean).join(' · ');
}

export async function processPendingRecordings(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const db = await getDb();
    for (;;) {
      const [rec] = await repo.pendingRecordings(db);
      if (!rec) break;
      try {
        const pcm = await decodeStored(rec.file);
        const a = analyzeTake(pcm.samples, pcm.sampleRate);
        const patch: repo.RecordingPatch = { bpm: a.bpm, key: a.key, durationMs: a.durationMs || rec.durationMs, analysis: 'done' };
        // only extend titles we generated (generated base titles never contain " · ")
        if (!rec.title.includes(' · ')) patch.title = autoTitle(rec.title, a.bpm, a.key);
        await repo.updateRecording(db, rec.id, patch);
        if ((await getSettings()).transcribe) {
          const t = await transcribeTake(rec.file);
          if (t.ok && t.text) await repo.updateRecording(db, rec.id, { transcript: t.text });
        }
      } catch (e) {
        console.warn('Take analysis failed', e);
        await repo.updateRecording(db, rec.id, { analysis: 'failed' });
      }
      listeners.forEach((l) => l(rec.id));
    }
  } finally {
    running = false;
  }
}
