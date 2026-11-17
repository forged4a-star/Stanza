/** Which section (or the whole song) is playing, and which bar is sounding. */
import { create } from 'zustand';
import { startTransport, stopTransport } from '../../audio/engine';
import type { CustomStrum } from '../../core/audio/strums';
import type { ChordBar, SongDoc } from '../../core/model';
import { sectionSteps } from '../../core/export/formats';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';

interface PlayerState {
  playing: boolean;
  /** 'song' or a section id */
  scope: string | null;
  sectionId: string | null;
  bar: number | null;
  loop: boolean;
}

export const usePlayer = create<PlayerState>(() => ({ playing: false, scope: null, sectionId: null, bar: null, loop: true }));

/** Melody notes of the given sections as timed events (seconds), for playing along with chords. */
export function melodyEvents(doc: SongDoc, sectionIds: string[]) {
  const [beats, unit] = doc.song.timeSig;
  const step = (60 / doc.song.bpm) * (4 / unit) / 4;
  const out: { time: number; midi: number; dur: number }[] = [];
  let offset = 0;
  for (const s of doc.sections) {
    if (!sectionIds.includes(s.id)) continue;
    for (const n of s.melody) out.push({ time: (offset + n.start) * step, midi: n.pitch, dur: n.length * step });
    offset += Math.max(sectionSteps(s, doc.song.timeSig), s.bars.length * ((beats * 16) / unit));
  }
  return out;
}

export function playScope(
  scope: string,
  opts: { melody?: boolean; bars?: ChordBar[]; pattern?: string; customStrums?: CustomStrum[]; loop?: boolean; /** play this section's melody over the given chords */ melodyOf?: string } = {}
) {
  const doc = useSong.getState().doc;
  if (!doc) return;
  const settings = useSettings.getState();
  const sections = scope === 'song' ? doc.sections.filter((s) => s.bars.length || s.melody.length) : doc.sections.filter((s) => s.id === scope);
  // map flat bar index → section, so the playhead can show in the right grid
  const map: { sectionId: string; bar: number }[] = [];
  const bars: ChordBar[] = opts.bars ?? [];
  if (!opts.bars) {
    const barSteps = (doc.song.timeSig[0] * 16) / doc.song.timeSig[1];
    for (const s of sections) {
      const n = Math.max(s.bars.length, Math.ceil(sectionSteps(s, doc.song.timeSig) / barSteps));
      for (let i = 0; i < n; i++) {
        bars.push(s.bars[i] ?? { chords: [] });
        map.push({ sectionId: s.id, bar: i });
      }
    }
  }
  const extra = opts.melodyOf ? melodyEvents(doc, [opts.melodyOf]) : opts.melody !== false && !opts.bars ? melodyEvents(doc, sections.map((s) => s.id)) : [];
  const { loop } = usePlayer.getState();
  const sched = startTransport(bars, {
    bpm: doc.song.bpm,
    timeSig: doc.song.timeSig,
    pattern: opts.pattern ?? settings.pattern,
    customStrums: opts.customStrums ?? settings.customStrums,
    instrument: settings.instrument,
    metronome: settings.metronome,
    loop: opts.loop ?? (opts.bars ? false : loop),
    capo: doc.song.capo,
    extra,
    onBar: (i) => usePlayer.setState({ bar: map[i]?.bar ?? i, sectionId: map[i]?.sectionId ?? null }),
    onEnd: () => usePlayer.setState({ playing: false, scope: null, bar: null, sectionId: null }),
  });
  usePlayer.setState({ playing: !!sched, scope, bar: null, sectionId: null });
}

export function stopPlayer() {
  stopTransport();
  usePlayer.setState({ playing: false, scope: null, bar: null, sectionId: null });
}

export function togglePlay(scope: string) {
  const s = usePlayer.getState();
  if (s.playing && s.scope === scope) stopPlayer();
  else playScope(scope);
}
