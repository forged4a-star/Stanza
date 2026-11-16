/**
 * Read lyrics from a screenshot or photo, on the device (Google ML Kit with the
 * model bundled in the app, so it works offline). The native module is loaded
 * lazily and every failure becomes a plain message, so a problem here can never
 * take the rest of the app down.
 */
import * as DocumentPicker from 'expo-document-picker';
import { ocrToText, type OcrLine } from '../../core/lyrics/ocrLayout';

export type OcrResult = { ok: true; text: string } | { ok: false; reason: string; cancelled?: boolean };

export const ocrAvailable = () => true;

export async function lyricsFromImage(): Promise<OcrResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return { ok: false, reason: 'cancelled', cancelled: true };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-ml-kit/text-recognition');
    const TextRecognition = mod.default ?? mod;
    const result = await TextRecognition.recognize(picked.assets[0].uri);
    const lines: OcrLine[] = (result.blocks ?? []).flatMap((b: { lines: OcrLine[] }) => b.lines.map((l) => ({ text: l.text, frame: l.frame })));
    const text = ocrToText(lines);
    if (!text.trim()) return { ok: false, reason: 'No text found in that image.' };
    return { ok: true, text };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return { ok: false, reason: /linked|rebuilt/i.test(msg) ? 'Text recognition is not part of this build.' : `Could not read the image: ${msg}` };
  }
}
