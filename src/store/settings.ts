/** App-wide preferences, persisted in the settings table. */
import { create } from 'zustand';
import { DEFAULT_SOUND_SETTINGS, type SoundMode } from '../core/phonetics/sound';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { DEFAULT_LOOK, lookById, type LookCustom } from '../ui/looks';
import { sanitizeCustom } from '../ui/lookCode';

export type ThemePref = 'system' | 'light' | 'dark';
export type { PaletteName } from '../ui/themeEngine';
import type { PaletteName } from '../ui/themeEngine';

export interface Settings {
  theme: ThemePref;
  /** the visual style (see ui/looks.ts) */
  look: string;
  /** a person's tweaks on top of the look */
  custom: LookCustom;
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
  /** smooth = deep output buffers (no crackle); fast = lowest latency */
  audioMode: 'smooth' | 'fast';
  /** chord player pattern and metronome */
  pattern: import('../core/audio/patterns').PatternId | string;
  /** strum patterns you made (the pattern id is `custom:<id>`) */
  customStrums: import('../core/audio/strums').CustomStrum[];
  metronome: boolean;
  /** show the song as a chord sheet (chords over words) instead of the editor */
  chordSheet: boolean;
  /** show an idea of the day on the library screen */
  dailyIdea: boolean;
  /** the day (YYYY-MM-DD) the idea was put away for */
  ideaHiddenDay: string | null;
  /** the writing-rule card in play: which card, and 'song' or a section id */
  constraint: { id: string; scope: string } | null;
  /** guitar shapes: skip barre chords (beginner mode) */
  avoidBarres: boolean;
  /** lyric size in the chord sheet */
  sheetSize: number;
  /** chord suggestion extras */
  suggestBorrowed: boolean;
  suggestSecondary: boolean;
  suggestPivots: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  look: DEFAULT_LOOK,
  custom: {},
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
  audioMode: 'smooth',
  pattern: 'strum-folk',
  customStrums: [],
  metronome: false,
  chordSheet: false,
  dailyIdea: true,
  ideaHiddenDay: null,
  constraint: null,
  avoidBarres: false,
  sheetSize: 20,
  suggestBorrowed: false,
  suggestSecondary: false,
  suggestPivots: false,
};

interface SettingsStore extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  set: (patch: Partial<Settings>) => void;
  /** like set, for things changed continuously (sliders): updates now, saves a moment after the last change */
  setLive: (patch: Partial<Settings>) => void;
  /** adjust the tweaks on top of the current look */
  setCustom: (patch: Partial<LookCustom>) => void;
  /** switch look; tweaks start fresh so the look appears as designed */
  chooseLook: (id: string) => void;
  /** clear all tweaks */
  resetCustom: () => void;
}

let liveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  const { loaded: _l, load: _a, set: _b, setLive: _c, setCustom: _d, chooseLook: _e, resetCustom: _f, ...prefs } = useSettings.getState();
  getDb().then((db) => repo.setSetting(db, 'prefs', prefs));
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const db = await getDb();
    const saved = await repo.getSetting<Partial<Settings>>(db, 'prefs', {});
    // saved looks and tweaks may be from another version or hand-edited: keep only what is valid
    set({ ...DEFAULT_SETTINGS, ...saved, look: lookById(saved.look).id, custom: sanitizeCustom(saved.custom), loaded: true });
  },
  set: (patch) => {
    set(patch);
    persist();
  },
  setLive: (patch) => {
    set(patch);
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      liveTimer = null;
      persist();
    }, 300);
  },
  setCustom: (patch) => get().setLive({ custom: sanitizeCustom({ ...get().custom, ...patch }) }),
  chooseLook: (id) => get().set({ look: lookById(id).id, custom: {} }),
  resetCustom: () => get().set({ custom: {} }),
}));

export async function getSettings(): Promise<Settings> {
  const s = useSettings.getState();
  if (!s.loaded) await s.load();
  return useSettings.getState();
}
