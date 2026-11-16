/** Browsers only offer cloud speech recognition, which would break the offline promise. */
export type TranscribeResult = { ok: true; text: string } | { ok: false; reason: string };
export const transcriptionAvailable = () => false;
export async function transcribeTake(): Promise<TranscribeResult> {
  return { ok: false, reason: 'Offline transcription runs on iOS and Android only.' };
}
