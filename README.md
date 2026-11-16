# Stanza — a songwriting app

Offline-first songwriting for Android (and web), built with React Native +
Expo (SDK 58) and TypeScript. One song holds lyrics, chords, melody and voice
recordings together; the lyric page is home and every tool opens as a sheet
over it. Everything is stored on the device (SQLite) and saved on every
keystroke.

See **[docs/STATUS.md](docs/STATUS.md)** for what works, what's stubbed and
what couldn't be built, phase by phase.

## Run it

```bash
npm install
npx expo start --web            # quickest look, in the browser
npx expo run:android            # development build on a device/emulator (needs the Android SDK)
```

Native modules (audio engine, speech recognition, widget) need a development
build; Expo Go is not enough.

## Test it

```bash
npm run check   # typecheck + 77 unit tests (phonetics, rhyme, DSP, theory, DB, export, sync server…)
npm run e2e     # builds the web app and drives it in Chromium: 57 end-to-end checks
```

The e2e suites use Chromium's fake microphone fed with generated audio
(a hummed phrase, a strummed chord) to test capture, hum-to-MIDI and chord
detection end to end, and a real local server with two browser "devices" for
sync and co-writing.

## Layout

| Path | What |
|---|---|
| `src/app/` | screens (Expo Router): lyric page, library, inbox, scrapyard, settings, performance, record/join links |
| `src/features/` | the sheets and editors: lyric lines, capture, takes, versions, words, sound, chords, melody, shape |
| `src/core/` | pure logic, no React: phonetics, rhyme analysis, DSP, music theory, exports, collaboration ops |
| `src/db/` | SQLite schema, repository, autosave queue |
| `src/audio/` | recording storage, decoding, synth engine, mic input, transcription |
| `src/data/` | bundled CMU Pronouncing Dictionary + WordNet (rebuilt by `npm run build:data`) |
| `server/` | optional sync + co-writing server |
| `targets/` | iOS widget extension (kept, not pursued for now) |
| `e2e/` | browser end-to-end suites |

Data: CMU Pronouncing Dictionary (BSD-style licence), Princeton WordNet 3.1
(WordNet licence), SUBTLEX word frequencies (ranking only).
