/**
 * Live microphone frames (Android/iOS) via react-native-audio-api's recorder
 * callback. Used by the chord detector and hum-to-MIDI.
 */
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { AudioRecorder } from 'react-native-audio-api';

export type FrameHandler = (samples: Float32Array, sampleRate: number) => void;

export async function startMic(onFrame: FrameHandler, sampleRate = 22050): Promise<() => void> {
  const perm = await requestRecordingPermissionsAsync();
  if (!perm.granted) throw new Error('Microphone permission was not granted.');
  const rec = new AudioRecorder();
  rec.onAudioReady({ sampleRate, bufferLength: 2048, channelCount: 1 }, (e) => {
    onFrame(new Float32Array(e.buffer.getChannelData(0)), e.buffer.sampleRate);
  });
  const res = await rec.start();
  if (res.status !== 'success') throw new Error('Could not start the microphone.');
  return () => {
    rec.clearOnAudioReady();
    void rec.stop();
  };
}
