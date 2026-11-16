import { expect, it } from 'vitest';
import { decodeWav, encodeWav } from './wav';

it('round-trips 16-bit WAV', () => {
  const x = new Float32Array([0, 0.5, -0.5, 0.999, -1]);
  const { samples, sampleRate } = decodeWav(encodeWav(x, 16000));
  expect(sampleRate).toBe(16000);
  for (let i = 0; i < x.length; i++) expect(samples[i]).toBeCloseTo(x[i], 3);
});
