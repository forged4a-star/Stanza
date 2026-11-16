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

## Phase 3 — chords, player, circle of fifths, suggestions

### Works (tested)
- **Chord blocks per section** on a bar grid (4 bars per row, 1–4 chords per
  bar; tap to change, long-press a bar to split/duplicate/delete, + to add).
- **Chords above specific syllables** ("Place chords over lyrics" shows a tap
  target over each syllable; lines that have chords always show them).
- **Chord picker**: in-key chords, "what comes next" ideas, any root × 20
  qualities (7ths, 9ths, 11ths, 13ths, sus, add, dim, aug, power, 6/9 …),
  slash bass; plays every choice; live guitar + piano diagram.
- **Player**: plays a section or the whole song (chords + melody once Phase 4
  adds it), loop, tempo ±, **tap tempo**, **metronome**, time signature,
  sounds **piano / acoustic strum / electric / pad** (synthesised, no samples),
  patterns: whole bar, on the beat, two strums, two arpeggios, bass + chord.
  Look-ahead scheduling on the audio clock; the playhead lights the sounding
  bar. Each section has its own loop button.
- **Guitar and piano voicing diagrams**: guitar shapes are searched and scored
  for playability (open shapes first: C x32010, G 320003, D/F# 200232, F
  133211, Bm x24432 …), any **capo**; piano keyboard highlighting.
- **Transpose** the whole song (bars, lyric chords, melody, key), **Roman
  numeral view** (with inversion figures ⁶, ⁶₄, ⁶₅, ⁴₃, ⁴₂), slash chords.
- **Circle of fifths**: outer ring majors, inner ring relative minors; the
  key's diatonic chords light up with numerals (vii° in the centre); tap to
  hear, long-press (or Add) to append to the section; set the song key.
- **Next-chord suggestions** ranked by how common the move is (corpus-style
  transition weights), labelled tension / release / lift / darken, with
  toggles for **borrowed chords**, **secondary dominants** and **pivot chords**
  for key changes (to the dominant, subdominant, relative and up-a-step keys).
- **Library** of 19 classic progressions and cadences, transposed to the
  song's key; tap to hear, + to add.
- **Chord detector**: listens to the mic, names the chord (incl. slash chords)
  with alternatives; suppresses overtones. Unit-tested on synthetic chords;
  the mic path runs in the browser.
- ChordPro / PDF chord chart / MIDI export include all of this.

### Not run on a device
- Audio output and mic input on Android go through react-native-audio-api
  (needs a development build). Verified on web only.

### Limitations
- Synth sounds are simple physical/additive models, not sampled instruments.
- The chord detector is tuned on synthetic audio; real guitars in noisy rooms
  will be less reliable (alternatives are shown to pick from).

## Phase 4 — piano roll, hum-to-MIDI, prosody and singability

### Works (tested)
- **Mini piano roll per section** (section menu → Melody): two octaves around
  your range, sixteenth-note grid, bar lines, octave shift. Tap to add, tap to
  select, drag the selected note to move it, up/down/shorter/longer/delete.
- **Scale lock on by default** (snaps taps, drags and up/down steps to the
  song's key; out-of-key rows are shaded).
- **Chord tones tinted** under each chord of the section's bar grid.
- **Plays over the section's chords** (and the whole-song player includes all
  melodies).
- **Hum-to-MIDI**: hum into the mic, stop, and the take is pitch-tracked
  (YIN), segmented into notes, quantised to the tempo grid and scale-locked.
  Verified end to end in Chromium with a generated hummed phrase played as the
  microphone (C4 E4 G4 E4 → C4 E4 G4 E4).
- **Notes linked to lyric syllables**: new notes take the next syllable in
  order; "link in order" re-links a whole section; any note can be pointed at a
  specific syllable or left free (melisma). Notes show their syllable; links
  follow the line, so edits to the words show up on the notes.
- **Vocal range guard**: set your range by hand or "find it by singing"; notes
  outside it turn red and are listed.
- **Prosody check**: stressed syllables on weak metric positions (off-beats,
  sixteenths, with 4/4, 3/4, 6/8, 12/8 weights), and weak syllables hogging a
  strong beat before a stressed one.
- **Singability check**: long notes on closed vowels (ee, ih, oo, uh, er),
  worse when high in your range; consonant pile-ups between syllables that
  don't fit the time available at the song's tempo.
- Checks are listed in Sound → Checks; tapping one opens the roll on that note.
- The chord detector now also passes an end-to-end test with a generated
  G-major chord played as the microphone.

### Limitations
- Links are by position (line + syllable number). Inserting a word early in a
  line shifts later links by one; "link in order" fixes a section in one tap.
- One melody line per section (monophonic), as is natural for a vocal line.

## Phase 5 — feeling map, contrast meter, sync, collaboration

### Works (tested)
- **Feeling map**: name each section's feeling in your own words and set its
  intensity; drawn as an arc across the song (Song sheet → Song shape, or the
  section menu). The feeling also shows under the section name.
- **Contrast meter**: compares any two sections (default verse vs chorus) on
  melodic range, register, line length, chord rate and rhythm density, with a
  plain-language verdict.
- **Cliché and repetition flags** (off by default): ~60 well-worn phrases,
  tired rhyme pairs (fire/desire …), and content words leaned on 3+ times
  outside the chorus; dotted underline in the lyric and a list in Checks.
- **AI rules**: nothing in the app writes or completes lyrics. "Questions"
  (Song shape) asks about your own words (abstract words, unclear pronouns,
  missing senses, the section's job, the feeling you named). The "Let AI write
  lyrics" setting exists, is off, and has no effect because no lyric model
  ships.
- **Backup and sync** (optional): a small server (`server/`, Node + SQLite).
  Songs, trash state and audio takes sync between devices; when both sides
  changed a song the newer wins and the other version is saved as a snapshot.
  Manual "Sync now" and automatic sync (start, every 5 min, on background).
  Verified with two browser "devices" and in unit tests against the server.
- **Co-writing by link** (built last): share a song → link; anyone with it
  joins, sees who's here, edits live (lines, sections, chords, melody, title),
  and leaves comments on lines (resolve/reopen). Edits are id-based ops
  relayed by the server in one order, with a document hash so a client that
  drifts re-fetches. Offline, edits stay local and the song re-joins later.
  Verified with two browser contexts typing into the same song.

### Limitations
- Co-writing needs the server to be reachable (it's the one networked
  feature); the rest of the app is unaffected when offline.
- Concurrent edits to the *same line* are last-writer-wins per line; there is
  no character-level merge. Restoring an old version while a song is shared is
  not sent to co-writers.
- Server auth is a single owner token; share links are capability links.

## Overall: unable to build or verify here
- **No native build was run.** The Android SDK cannot be downloaded in this
  environment, so nothing has run on an Android device. Native-only paths —
  recording on device, react-native-audio-api audio/mic, on-device
  transcription, the home/lock-screen widget, app-icon quick action — are
  written and their native projects generate (`expo prebuild`) but are
  untested. Everything else was exercised on web.
- iOS: deliberately set aside for now (WidgetKit extension code is in
  `targets/` but not built).

## Round 2 — fixes from the first run on a phone

- **Editing**: a section is now one text box while you edit it (Enter adds
  exactly one line, holding Backspace runs across line breaks, selection and
  paste span lines). Lines keep their alternates, chords and locks; a locked
  line refuses edits. Verified in the browser and against SQLite.
- **Keyboard**: the page tracks the keyboard and scrolls the caret's line
  above it; the toolbar rides on top of the keyboard. *Android behaviour not
  yet confirmed on a device.*
- **Chord audio**: output had no headroom (a six-string chord summed to several
  times full scale) and re-struck notes stacked. Now: lower master level, soft
  limiter, a re-struck pitch replaces the old one, sounds rendered before
  playback starts. Levels checked offline; *not yet confirmed on a device.*
- **Piano roll touch**: bigger cells; drag a note to move it (snaps, with
  haptics), drag its right end to resize, tap to select.
- **Iambic feet** highlight mode (weak–strong pairs shaded foot by foot).
- **Import lyrics** (Library → Import → Paste lyrics, or Song menu): sections
  from headings, blank lines and repeats (a repeated block is a chorus),
  chord lines kept over their syllables, double-spaced notes-app pastes
  handled; confirmation screen to fix labels before saving. Rule-based, not a
  model. Screenshot import is not built.
- **AI lyric co-writer**: not built yet (needs a decision on the model).

## Round 3 — chord audio on phones

- **Timing**: notes are placed on the audio clock (`currentTime`) when a loop
  is queued. Two loops are always queued ahead; a 500 ms timer only tops that
  up. Bar highlights are timers too, but they only move the display, never the
  sound.
- **One AudioContext** for the app. Each (instrument, pitch) is rendered once,
  at 22.05 kHz, and reused. Sounds for a song are warmed in small steps when it
  opens, so the first play doesn't stall.
- **Polyphony cap** of 20 sounding notes; past that the oldest is faded out.
  Re-striking a pitch replaces its previous note. Finished nodes are released.
- **Removed a distortion stage**: the earlier "soft limiter" was a waveshaper
  that distorted every note. It's gone; the master is plain headroom.
- **BPM**: type it in the tempo field (30–300) next to ±5 and Tap tempo.
- Verified with a fake audio clock in unit tests and in the browser. Not yet
  heard on a phone.

## Round 4 — audio degrading with every play; faster builds

- **Audio leak fixed**: the engine never disconnected anything. Every note left
  a gain node wired to the output and every metronome tick left a source, so the
  native audio graph grew with every play. Now: a fixed pool of reusable gain
  nodes, sources disconnected when they finish (by audio time, not relying on
  events), one shared output for ticks, chords and melody queued together in
  time order, and a note is skipped rather than double-booking a slot. A test
  plays 40 rounds and checks no nodes are added. *Not yet heard on a phone.*
- **Builds**: arm64-only by default (manual run can build all chips), Gradle and
  ccache caching, newer pushes cancel running builds, docs/tests/server changes
  don't trigger a build.

## 1.1 (in progress, on branch `v1.1`; not built)

- **Screenshot import**: Import lyrics → "From a screenshot or photo". Picks an
  image, reads it on the device (Google ML Kit, model bundled so it works
  offline), rebuilds blank lines between sections from the vertical spacing,
  drops status-bar clutter, and fills the paste box so you can fix mistakes
  before it sorts into sections. Layout step is unit-tested; the native
  recognition has **not been compiled or run**. If the native module fails to
  load, the app shows a message instead of crashing. Android only.
- **Chord sheet mode**: the ♪ button in the top bar switches the lyric page to
  a printed-style chord sheet: chords above the words they belong to, section
  bar grids, tap a word to put a chord on it (long-press a longer word to pick
  the syllable), tap a chord to change/remove it. Transpose, capo, Roman
  numerals, text size, and "Share as text" (monospace chord-over-lyric text
  that the lyrics importer reads back). Lyrics aren't editable in this mode.
  Tested in the browser. Also fixed: switching back from the sheet no longer
  reopens the keyboard.
- **Faster updates (OTA)**: waiting on an Expo account and token.
- **Fixes and requests from use**: waiting on your list.

## 1.1 audio audit (crackly after changing chords; too quiet)

Found by reading the native engine's source, not just testing in a browser:
- **Sample-rate bug (introduced in round 3)**: sounds were rendered at 22.05 kHz,
  but the native engine plays buffers frame-for-frame without converting. On a
  44.1/48 kHz phone that is ~2x too fast: too high, too short, "weird".
  Browsers convert automatically, which hid it. Now rendered at the device rate.
- **Fading a re-struck or stolen note cancelled other notes' volume automation**
  on the same pooled gain node (strums re-strike constantly). Replaced pooling
  with one volume node per note, silent until its start, disconnected as soon
  as it finishes (source and volume node), by audio time.
- **Per-note `onended` callbacks** (a native subscription per note) removed.
- **Level**: notes were ~5 % of full scale. Notes are now normalised to one
  level, chord notes scaled by how many sound together (arpeggios and
  bass+chord patterns scaled by how many sound at once), and a transparent
  soft limiter (identical below 0.8, smooth roll-off above) protects the top.
- **Volume slider** (Chords → Play, the chord picker, Settings): follows the
  finger, saved when you let go, plays a short note so you can hear the level.
  Default 70 %.
- Chords you are likely to try are rendered in the background when the picker
  opens; pad rendering is ~3x faster.
- Settings → Chord player → "Play a test chord" shows output rate, sounds
  ready, notes active and volume.
- Tested with a fake of the native engine that is strict about the same things
  (rate, stop-before-start, cancelled automation). Not yet heard on a phone.

## 1.1 custom strumming

- Chords → Play → Pattern: **New strum** opens an editor. One bar of steps
  (8 eighths or 16 sixteenths); tap a step to cycle rest, down, soft down, up,
  soft up, muted chuck. Name it, pick Tight / Normal / Slow sweep, start from a
  template, and press **Play this strum** to hear it loop; edits restart the
  loop. Save selects it. Saved strums show as ★ chips (long-press or Edit to
  change, Delete in the editor). Stored in settings, works offline.
- Same voice cap, level and audio-clock scheduling as built-in patterns.
- Tested: unit tests for the timing model (11), browser test for build, save,
  play, edit, delete. Not yet heard on a phone. Lint could not run in this
  environment (no network to set up ESLint); typecheck and all tests pass.

## 1.1 standard chord shapes + least-movement fingering

- **Standard shapes first.** `src/core/music/shapeLibrary.ts` holds the shapes
  guitarists actually learn: open C A G E D, Am Em Dm, F, Bm, sevenths, maj7,
  m7, sus2/4, add9, 6, dim, aug, common slash chords (G/B, D/F#, C/G...), plus
  movable E-form and A-form barre shapes for every root (major, minor, 7, m7,
  maj7, sus, 6, m6, m7b5, dim7, power chords). The old search is only a
  fallback for chords not covered. Diagrams and the chord player use these.
- Verified by tests: every shape for every root contains only notes of its
  chord, with the root (or slash bass) as the lowest note.
- Sources: the search tool confirmed Em, Am and Dm fingerings; the reference
  pages (Wikibooks, MusicRadar) could not be fetched from this environment, so
  the rest is written from standard CAGED teaching and checked by the tests
  above, not against a printed chart. Worth a glance at a few diagrams.
- **Least movement.** `fingering.ts` scores a change between two shapes
  (fingers that stay, slides, lifts, hand travel up the neck, forming or
  releasing a barre) and finds the cheapest set of shapes for a whole
  progression, including the jump back to the start. Chords → Shapes shows
  "Easiest way to play the changes" ("C → F: 2 fingers stay · 3 move") and the
  diagrams use the chosen shapes. "Avoid barre chords" is a beginner toggle.
- Test fix: the chord-sheet browser test reloaded before the preference was
  written; it now waits.

## 1.1 batch 1: hum a strum, rhyme web, energy map, stage view

- **Hum a strum** (Chords → Play → New strum → "Play it in"). Tap the rhythm on a
  pad after a one-bar count-in, or hum/clap it into the mic. Hits are snapped to
  the bar's grid (eighths, or sixteenths if hits fall between eighths); several
  bars are folded into one and a stray hit is ignored; on the beat = down,
  between = up, quiet hits become soft strokes. It fills the grid to tidy up.
  Tested on synthetic audio and real taps in the browser. **Not tested with a
  real microphone**; very noisy rooms or quiet humming may give "could not hear
  a rhythm".
- **Rhyme web** (song menu). Rhyme families as clusters, line endings that rhyme
  with nothing, one sound carrying the song, and worn-out rhyme pairs.
- **Energy map** (Song shape → Energy). Drag each section's dot to draw the
  energy you want; the thin line is what the song does (melody height, range,
  rhythm, chord pace, line length). Both are relative across the song. Where they
  disagree it names a lever ("sing it higher", "leave more space"), never words.
- **Stage view.** The app already had a performance mode, so this upgrades it
  instead of adding a second screen: tempo-and-structure pacing for the whole
  song (not "one line per bar"), chords placed over the right syllable, touch the
  page to pause, speed %, transpose, chords on/off, and the screen stays awake.
  Open it from the song menu or the chord sheet ("Stage view").
- Fixed along the way: the tap pad listens for the touch *starting* (a tap's time
  is when the finger lands), not the release.
- Checks: 151 unit tests and all 11 browser suites pass. Lint cannot run here.

## 1.1 batch 2: constraint cards, word swap preview, ghost of the take, idea of the day

- **Constraint cards** (song menu → Constraint cards). Nine rules to write inside:
  small words only, tight lines (8 syllables), land hard (strong ending), no end
  rhymes, everything rhymes, nothing twice, only questions, no articles, start
  alike. Pick or draw a card, choose whole song or one section, and it lists the
  lines that break it and why. It only checks; it never suggests words. The song
  menu shows the card in play and how many lines break it.
- **Word swap preview** (Words sheet, opened from a line). Each candidate word is
  tagged "fits" (same syllables and stress), "+1 syl", or "stress differs". Tap
  one to see your line with it swapped in: syllables before and after, stress,
  and which lines it rhymes with before and after. "Use in my line" applies it.
  This replaces the old "Use instead of…" menu (phase 2 test updated).
- **Ghost of the take** (Takes sheet → pulse icon on a take). Decodes the take,
  tracks its pitch, trims to the sung part, and draws the curve. For a take
  attached to a line, the line's words are laid along it by syllable, each marked
  rises / falls / holds and high / mid / low. Words are spread evenly, so it is a
  guide, not exact timing. Spoken takes show "no clear singing". Tested on
  synthetic tones and the browser's fake microphone, **not on real singing**.
- **Idea of the day** (song list, off in Settings). 48 prompts (questions and
  situations, never lyrics), the same one all day, every one used before any
  repeats; some come with a constraint card. Start a song (puts the card in play),
  Save to Inbox, or Not today.
- **Not built: a daily notification.** It needs a native notifications library and
  a new APK, and it cannot be tested here, so the idea only appears in the app.
- Checks: 178 unit tests and all 12 browser suites pass. Lint cannot run here.

## 1.1 batch 3: strum codes, chord feel, capo help, time travel, finish ring, lyric card, writing stats

- **Strum codes.** A custom strum becomes one line of text
  (`stanza-strum/1/e/n/D-D-----/Name~x`). Strum editor → "Share as a code" (the
  phone's share sheet; copies in a browser). Chords → Play → "Import code" pastes
  one back, even inside a longer message. A checksum rejects a damaged code with
  a reason. (Found and fixed along the way: names with spaces broke the format.)
- **Chord swap by feel** (chord picker → Change the feel). Warmer, tenser, more
  open, brighter, darker: up to four swaps each, same root and slash bass, with a
  plain reason ("a soft major 7th"). Tap one to hear it, then use it.
- **Capo help** (Chords → Shapes). Ranks capo 0-7 by how easy the resulting shapes
  are (open and common chords, barres, how far the hand travels) and shows the top
  three with "Use capo N". The sound is unchanged. Bm G D A → capo 7 (Em C G D).
  (Found and fixed: the open-position Bm was not marked as a barre in the shape
  library.)
- **Version time travel** (song menu → Versions → Time travel). A slider and
  earlier/later buttons through up to the last 40 versions, what changed at each
  step, and lines that were there but are gone now with "Pull back" (adds the line
  back to its section) and "Restore this version".
- **Finish ring.** Five parts: words (8+ lines), chords, melody, a take, a title.
  Shown as a ring on every song in the list, and in the song menu with what to do
  next. A guide to what is missing, not a grade.
- **Lyric card.** Song menu → Export → Lyric card: pick a section, one of four
  looks, square or tall, and share a PNG. Browser: tested as a real PNG download.
  **Phone: the PNG comes from react-native-svg's toDataURL and has not been run on
  a device.** If sharing the picture fails on the phone, that is the place to look.
- **Writing stats** (Settings → Your writing this week). Minutes writing (time
  between edits, capped at 2 min, so an idle app adds nothing), lines written,
  lines sent to the scrapyard, a 7-day chart and a streak. Stored on the device;
  saved a few seconds after the last edit and when the app leaves the screen.
- **Not built: walk-and-write** (hands-free recording that marks keepers while you
  walk). It needs background audio recording, which has to be set up in the native
  build and cannot be tested here. Not started rather than half done.
- Checks: 228 unit tests and all 13 browser suites pass. Lint cannot run here.
