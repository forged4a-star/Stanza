/**
 * On-device transcription of a take (no network). iOS uses SFSpeechRecognizer
 * with requiresOnDeviceRecognition; Android 13+ uses the on-device service.
 * The take is decoded and handed over as 16 kHz mono WAV, which both accept.
 */
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, AudioEncodingAndroid } from 'expo-speech-recognition';
import { resample } from '../core/dsp/fft';
import { decodeStored } from './decode';
import { encodeWav } from './wav';
import { writeTemp } from './storage';

export type TranscribeResult = { ok: true; text: string } | { ok: false; reason: string };

export function transcriptionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable() && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

export async function transcribeTake(file: string, locale = 'en-US'): Promise<TranscribeResult> {
  if (!transcriptionAvailable()) return { ok: false, reason: 'On-device speech recognition is not available on this device.' };
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'Speech recognition permission was not granted.' };
  const pcm = await decodeStored(file);
  const wav = encodeWav(resample(pcm.samples, pcm.sampleRate, 16000), 16000);
  const uri = await writeTemp('transcribe.wav', wav);
  return new Promise<TranscribeResult>((resolve) => {
    const finals: string[] = [];
    let latest = '';
    const subs = [
      ExpoSpeechRecognitionModule.addListener('result', (e) => {
        const t = e.results[0]?.transcript ?? '';
        if (e.isFinal) {
          if (t) finals.push(t);
          latest = '';
        } else latest = t;
      }),
      ExpoSpeechRecognitionModule.addListener('error', (e) => {
        if (e.error === 'no-speech') finish({ ok: true, text: '' });
        else finish({ ok: false, reason: e.message || e.error });
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => finish({ ok: true, text: [...finals, latest].filter(Boolean).join(' ').trim() })),
    ];
    let done = false;
    const timer = setTimeout(() => {
      ExpoSpeechRecognitionModule.abort();
      finish({ ok: true, text: [...finals, latest].filter(Boolean).join(' ').trim() });
    }, Math.max(20000, (pcm.samples.length / pcm.sampleRate) * 3000));
    function finish(r: TranscribeResult) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      resolve(r);
    }
    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: false,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      audioSource: Platform.OS === 'android' ? { uri, audioChannels: 1, audioEncoding: AudioEncodingAndroid.ENCODING_PCM_16BIT, sampleRate: 16000 } : { uri },
    });
  });
}
