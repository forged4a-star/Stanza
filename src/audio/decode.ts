/** Decode a stored take to mono PCM (via react-native-audio-api; WebAudio on web). */
import { decodeAudioData } from 'react-native-audio-api';
import { readAudio } from './storage';

export interface Pcm {
  samples: Float32Array;
  sampleRate: number;
}

export async function decodeStored(name: string, sampleRate?: number): Promise<Pcm> {
  const bytes = await readAudio(name);
  if (!bytes) throw new Error('Audio file is missing');
  return decodeBytes(bytes, sampleRate);
}

export async function decodeBytes(bytes: Uint8Array, sampleRate?: number): Promise<Pcm> {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const buf = await decodeAudioData(ab, sampleRate);
  const ch = buf.numberOfChannels;
  const out = new Float32Array(buf.length);
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / ch;
  }
  return { samples: out, sampleRate: buf.sampleRate };
}
