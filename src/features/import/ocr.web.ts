/** No on-device text recognition in the browser. */
export type OcrResult = { ok: true; text: string } | { ok: false; reason: string; cancelled?: boolean };
export const ocrAvailable = () => false;
export async function lyricsFromImage(): Promise<OcrResult> {
  return { ok: false, reason: 'Reading screenshots works in the Android app.' };
}
