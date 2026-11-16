/** Hand finished files to the OS share sheet (save to Files, AirDrop, mail …). */
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

function tempFile(name: string): File {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  return f;
}

export async function shareFile(name: string, mime: string, content: Uint8Array | string): Promise<void> {
  const f = tempFile(name);
  f.writeSync(content);
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: name });
}

export async function sharePdf(html: string, name: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  // give the PDF a meaningful name
  const src = new File(uri);
  const dest = tempFile(name);
  dest.delete();
  src.moveSync(dest);
  await Sharing.shareAsync(dest.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
}

export async function pickFile(types: string[]): Promise<{ name: string; bytes: Uint8Array } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { name: a.name, bytes: await new File(a.uri).bytes() };
}
