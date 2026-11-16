/** Generates WAV files that Chromium can play as a fake microphone. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SR = 44100;
const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function wav(samples) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}

/** A hummed phrase: [midi, seconds] pairs with short breaths between, voice-like harmonics and vibrato. */
function hum(notes, gap = 0.06) {
  const out = [];
  for (const [m, dur] of notes) {
    const n = Math.floor(SR * dur);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const f = freq(m) * (1 + 0.004 * Math.sin((2 * Math.PI * 5.5 * i) / SR));
      ph += (2 * Math.PI * f) / SR;
      const env = Math.min(1, i / 600, (n - i) / 600);
      out.push(env * (0.35 * Math.sin(ph) + 0.15 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph)));
    }
    for (let i = 0; i < SR * gap; i++) out.push(0);
  }
  return out;
}

/** A sustained, slightly decaying chord with harmonics (like a strum letting ring). */
function chord(midis, dur) {
  const n = Math.floor(SR * dur);
  const out = new Array(n).fill(0);
  for (const m of midis) for (let h = 1; h <= 5; h++) for (let i = 0; i < n; i++) out[i] += (0.18 / h / midis.length) * 3 * Math.sin((2 * Math.PI * freq(m) * h * i) / SR) * Math.exp(-i / SR / 3);
  return out;
}

function write(name, samples) {
  const p = path.join(os.tmpdir(), `stanza-${name}.wav`);
  fs.writeFileSync(p, wav(samples));
  return p;
}

module.exports = {
  // C4 E4 G4 E4 at ~120 bpm (quarter notes), then silence, repeating
  humWav: () => write('hum', [...hum([[60, 0.44], [64, 0.44], [67, 0.94], [64, 0.44]]), ...new Array(SR * 2).fill(0)]),
  // a G major chord ringing, with a low G in the bass
  chordWav: () => write('chord', chord([43, 47, 50, 55, 59, 67], 4)),
};
