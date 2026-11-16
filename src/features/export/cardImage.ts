/** Phone: turn the on-screen card (a react-native-svg view) into PNG bytes. */
import type { CardLayout } from '../../core/export/lyricCard';

export interface SvgHandle {
  toDataURL?: (cb: (base64: string) => void, options?: { width?: number; height?: number }) => void;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/png;base64,/, '').replace(/\s+/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((len * 3) / 4 - pad);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const n = (lookup[clean.charCodeAt(i)] << 18) | (lookup[clean.charCodeAt(i + 1)] << 12) | (lookup[clean.charCodeAt(i + 2)] << 6) | lookup[clean.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function cardToPng(layout: CardLayout, handle: { current: SvgHandle | null }): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const svg = handle.current;
    if (!svg?.toDataURL) return reject(new Error('The picture is not ready yet.'));
    try {
      svg.toDataURL((b64) => resolve(base64ToBytes(b64)), { width: layout.width, height: layout.height });
    } catch (e) {
      reject(e);
    }
  });
}
