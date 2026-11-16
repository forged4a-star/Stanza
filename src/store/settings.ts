/** App-wide preferences, persisted in the settings table. */
import { create } from 'zustand';
import { DEFAULT_SOUND_SETTINGS, type SoundMode } from '../core/phonetics/sound';
import { getDb } from '../db/client';
import * as repo from '../db/repo';

export type ThemePref = 'system' | 'light' | 'dark';
export type PaletteName = 'calm' | 'vivid' | 'colorblind';

export interface Settings {
  theme: ThemePref;
  /** margin: syllable counts per line */
  showSyllables: boolean;
  /** dots under strong/weak syllables */
  showStress: boolean;
  /** ABAB letters in the margin */
  showScheme: boolean;
  /** sound highlighting */
  highlight: boolean;
  soundModes: SoundMode[];
  sensitivity: number;
  scope: 'end' | 'all';
  palette: PaletteName;
  /** transcribe takes on-device after recording */
  transcribe: boolean;
  /** AI may write or complete lyrics. Off by default; nothing generates lyrics unless this is on. */
  aiWritesLyrics: boolean;
  /** cliché and repetition flags */
  clicheFlags: boolean;
  /** singer's comfortable range, MIDI */
  vocalLow: number;
  vocalHigh: number;
  /** chord player instrument */
  instrument: 'piano' | 'acoustic' | 'electric' | 'pad';
  /** prefer flats when spelling chords without a key */
  preferFlats: boolean;
  /** show a chord slot over every syllable (lines with chords always show theirs) */
  showChords: boolean;
  /** show chords as Roman numerals (needs a song key) */
  romanChords: boolean;
  /** chord player master volume, 0..1 */
  volume: number;
  /** chord player pattern and metronome */
  pattern: import('../core/audio/patterns').PatternId | string;
  /** strum patterns you made (the pattern id is `custom:<id>`) */
  customStrums: import('../core/audio/strums').CustomStrum[];
  metronome: boolean;
  /** show the song as a chord sheet (chords over words) instead of the editor */
  chordSheet: boolean;
  /** lyric size in the chord sheet */
  sheetSize: number;
  /** chord suggestion extras */
  suggestBorrowed: boolean;
  suggestSecondary: boolean;
  suggestPivots: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  showSyllables: true,
  showStress: false,
  showScheme: true,
  highlight: true,
  soundModes: DEFAULT_SOUND_SETTINGS.modes,
  sensitivity: DEFAULT_SOUND_SETTINGS.sensitivity,
  scope: DEFAULT_SOUND_SETTINGS.scope,
  palette: 'calm',
  transcribe: true,
  aiWritesLyrics: false,
  clicheFlags: false,
  vocalLow: 52,
  vocalHigh: 72,
  instrument: 'piano',
  preferFlats: false,
  showChords: false,
  romanChords: false,
  volume: 0.7,
  pattern: 'strum-folk',
  customStrums: [],
  metronome: false,
  chordSheet: false,
  sheetSize: 20,
  suggestBorrowed: false,
  suggestSecondary: false,
  suggestPivots: false,
};

interface SettingsStore extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const db = await getDb();
    const saved = await repo.getSetting<Partial<Settings>>(db, 'prefs', {});
    set({ ...DEFAULT_SETTINGS, ...saved, loaded: true });
  },
  set: (patch) => {
    set(patch);
    const { loaded: _l, load: _a, set: _b, ...prefs } = get();
    getDb().then((db) => repo.setSetting(db, 'prefs', prefs));
  },
}));

export async function getSettings(): Promise<Settings> {
  const s = useSettings.getState();
  if (!s.loaded) await s.load();
  return useSettings.getState();
}
