# Stanza — build status

Target platforms for now: **Android and web**. iOS code that already exists
(the WidgetKit extension in `targets/record-widget`) is kept but not pursued.

How this was verified: unit tests run with `npm test` (Vitest, Node). The app is
exercised end to end in Chromium against the web build (`e2e/*.e2e.cjs`,
Playwright). iOS and Android native projects are generated with
`expo prebuild`, but **no native binary was compiled or run**: this
environment has no macOS/Xcode and cannot download the Android SDK. Anything
that only exists natively is marked *not run on a device*.

## Phase 1 — data model, lyric editor, capture, library, export

### Works (tested)
- **Data model / storage**: SQLite (expo-sqlite; WAL) with migrations; songs,
  sections, lines, recordings, inbox ideas, scrapyard, snapshots, folders, tags,
  settings. Repository tested against a real SQLite (Node's `node:sqlite`).
- **Autosave on every keystroke**: edits update memory instantly and go to an
  ordered write queue (one transaction per batch, rapid edits to the same line
  merged, failed batches retried with backoff, flushed when the app
  backgrounds). Tested, including failure/retry; e2e confirms text survives a
  reload.
- **Never lose work**: deleted lines/sections/alternates go to the Scrapyard;
  songs go to Trash (restore / delete forever); automatic snapshots on open and
  when the app backgrounds; restoring a version snapshots the current state
  first.
- **Lyric editor**: section blocks (verse, pre, chorus, post, bridge, intro,
  outro, custom; rename, change type), auto-numbered names, add/duplicate/
  delete/collapse, drag to reorder (Arrange sheet), Enter splits lines,
  Backspace at line start merges/removes, multi-line paste splits.
- **Syllable counts** per line in the margin; amber flag when a line differs
  from the matching line of the previous section of the same type.
- **Compare view**: any two sections side by side with counts and stress.
- **Stress pattern** display (dots under each syllable).
- **Alternates**: swipe left keeps the current wording as a version, swipe
  right flips through versions; line sheet lists/switches/deletes them.
- **Lock line**.
- **Scrapyard**: every cut line, searchable across all songs; send back to a
  song or to the Inbox.
- **Version snapshots** with line + word-level visual diff and restore.
- **Capture**: one-tap record from the lyric page (attaches to the section
  you're in), per-section mic, per-line takes from the line sheet, long-press
  for a loose idea → Inbox. Multiple numbered takes per target. Takes are
  decoded and analysed for **BPM and key** and **auto-titled** ("Verse take 1 ·
  120 bpm · G major"); play/rename/star/transcript/share/delete. Verified in
  Chromium with a fake microphone.
- **Inbox**: lines, chord loops and hums; drag an idea from the Inbox sheet onto
  a section (or tap Add), or send it to a new/existing song.
- **Library**: folders, tags, pins, status (idea/draft/finished), sort by
  recent, full-text search across titles, lyrics, alternates, feelings and
  transcripts (shows the matching line), trash.
- **Export**: TXT, PDF lyric sheet, PDF chord chart (transpose, Roman numerals),
  ChordPro, MIDI (chords + melody), single takes, full project ZIP (+ import).
  Formats are unit-tested (MIDI is re-read and checked note by note); TXT and
  ZIP downloads verified in the browser. JSON backup of the whole library.
- **Performance mode**: teleprompter that scrolls one line per bar at the
  song's tempo (faster/slower), text size, screen kept awake, chord chart view.
- **Design**: light/dark/system themes, calm palette, 48pt tap targets, tools
  at the bottom within thumb reach, everything else in sheets.

### Written but not run on a device
- **Home-screen widget** (Android: react-native-android-widget, JS-rendered;
  iOS: WidgetKit extension in `targets/record-widget`), **lock-screen widget**
  (iOS accessory families, Android keyguard category) and an **iOS 18 Control**
  (Lock Screen / Control Center button), plus an **app-icon quick action**. All
  open `stanza://record`, which is implemented and tested on web. The native
  projects generate correctly with `expo prebuild`; the Swift and the widget
  have not been compiled. Set `ios.appleTeamId` in app.json before building.
- **Transcription**: on-device speech recognition (`expo-speech-recognition`,
  `requiresOnDeviceRecognition`), fed a 16 kHz WAV decoded from the take. iOS
  and Android 13+ only. Browsers only offer cloud recognition, so it is off on
  web.
- **Audio decoding on device** uses react-native-audio-api (needs a development
  build, not Expo Go).

### Stubbed / limitations
- "Let AI write lyrics" is a setting only: no generative model ships, so
  nothing writes lyrics either way.
- Search uses substring matching over a maintained search column instead of
  SQLite FTS (FTS isn't in expo-sqlite's web build); fine for personal
  libraries of thousands of songs.
- BPM/key detection is heuristic (spectral-flux tempo, Krumhansl key
  profiles); tested on synthetic audio, not yet on real voice memos.

### Unable to build here
- Native Android binary (the Android SDK download host is blocked in this
  environment), so nothing has run on an Android device yet.

## Phase 2 — sound analysis and reference tools

### Works (tested)
- **Pronunciation**: CMU Pronouncing Dictionary bundled (126k words), plus a
  rule-based phonemiser for unknown words (slang, coinages): derives
  inflections/compounds from known words first ("runnin'", "heartbreakingly",
  "unfriended"), then letter-to-sound rules. On the 23k most common words the
  rule-based fallback alone gets the syllable count exactly right 92.5% of the
  time and within one 99.8%.
- **Highlight modes**, each toggleable and per syllable (not per word): perfect
  rhyme, slant rhyme (feature-based vowel and consonant similarity), multi-
  syllabic rhyme, assonance, consonance, alliteration. Rhymes share a colour
  per family across the song.
- **Settings**: sensitivity slider (strict ↔ loose), line endings only vs
  internal rhymes, three palettes including a colour-blind-safe set
  (Okabe–Ito).
- **Rhyme scheme letters** (ABAB…) in the margin, restarting per section.
- **Counts panel**: rhyme families with member counts, count of every phoneme
  (whole song or one section), vowel-sound heatmap (sections × vowels),
  most-repeated words.
- **Word tools** (long-press any word, the Words button for the word at the
  cursor, or "Look up a word" in the line menu): perfect / near / multi-
  syllabic rhymes, similar words (WordNet thesaurus), definitions with
  opposites, related words (broader/narrower/see-also); filter by syllable
  count and stress pattern; pronunciation shown in IPA. Choosing a word offers
  to swap it into the line it came from, look it up, or save it to the Inbox.
  Names and contractions are filtered out of rhyme lists.
- Lookups take ~2–90 ms on a laptop; analysis of a 120-line song with every
  mode on takes ~50 ms (runs deferred so typing never waits).

### Stubbed / limitations
- Stress for one-syllable words is guessed from word class (function words
  weak, content words strong); the dictionary has no sentence stress.
- Slant/near rhyme quality is heuristic; tuned on test cases, not on a corpus.
