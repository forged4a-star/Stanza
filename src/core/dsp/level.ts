/** Loudness helpers for comparing two takes fairly (the louder one always sounds better). */

export function rmsOf(samples: Float32Array): number {
  if (!samples.length) return 0;
  let e = 0;
  for (let i = 0; i < samples.length; i++) e += samples[i] * samples[i];
  return Math.sqrt(e / samples.length);
}

/** RMS counting only the parts that are not near-silent, so a long quiet tail does not skew it. */
export function activeRms(samples: Float32Array, sampleRate: number): number {
  const win = Math.max(1, Math.floor(sampleRate * 0.05));
  const blocks: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) blocks.push(rmsOf(samples.subarray(i, i + win)));
  if (!blocks.length) return rmsOf(samples);
  const peak = Math.max(...blocks);
  const gate = peak * 0.1;
  const loud = blocks.filter((b) => b >= gate && b > 1e-5);
  if (!loud.length) return 0;
  return Math.sqrt(loud.reduce((n, b) => n + b * b, 0) / loud.length);
}

/**
 * Player volumes (0..1) that make two takes sound equally loud: the louder one
 * is turned down to meet the quieter one, never above 1.
 */
export function matchLevels(rmsA: number, rmsB: number): [number, number] {
  if (!(rmsA > 1e-5) || !(rmsB > 1e-5)) return [1, 1];
  const ratio = rmsA / rmsB;
  // keep the quieter one at full volume
  return ratio > 1 ? [1 / ratio, 1] : [1, ratio];
}

export const toDb = (ratio: number) => 20 * Math.log10(Math.max(1e-9, ratio));
