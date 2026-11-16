/** Web: downloads instead of a share sheet; PDFs go through the browser's print dialog ("Save as PDF"). */
import * as DocumentPicker from 'expo-document-picker';

export async function shareFile(name: string, mime: string, content: Uint8Array | string): Promise<void> {
  const blob = new Blob([content as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function sharePdf(html: string, _name: string): Promise<void> {
  const w = window.open('', '_blank');
  if (!w) {
    // pop-up blocked: fall back to downloading the printable HTML
    await shareFile(_name.replace(/\.pdf$/, '.html'), 'text/html', html);
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

export async function pickFile(types: string[]): Promise<{ name: string; bytes: Uint8Array } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const buf = await (a.file ? a.file.arrayBuffer() : fetch(a.uri).then((r) => r.arrayBuffer()));
  return { name: a.name, bytes: new Uint8Array(buf) };
}
