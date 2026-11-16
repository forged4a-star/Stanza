/**
 * Transparent soft limiter curve: identical to the input up to `knee`, then
 * rolls smoothly toward ±1 instead of hard-clipping at the speaker.
 */
export function softClipCurve(size = 2048, knee = 0.8): Float32Array {
  const c = new Float32Array(size);
  const room = 1 - knee;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = a <= knee ? x : Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
  }
  return c;
}
