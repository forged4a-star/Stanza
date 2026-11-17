/**
 * Small two-octave piano roll for one section. Tap to add a note, tap a note
 * to select it, drag it to move. Scale lock (on by default) keeps notes in the
 * key; the section's chord tones are tinted; notes show their syllable and
 * are marked when out of range or flagged by the checks.
 */
import { memo, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import { playNote } from '../../audio/engine';
import { startMic } from '../../audio/mic';
import { allIssues, type Issue } from '../../core/lyrics/checks';
import { autoLink, chordTonesAtStep, humToNotes, linkedSyllable, sectionSyllables, snapToScale, stepInScale, stepsPerBar } from '../../core/music/melody';
import type { Note, SectionWithLines } from '../../core/model';
import { midiName, mod12, parseKey, scalePcs } from '../../core/music/theory';
import { newId } from '../../core/util/id';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';
import { choose, confirm, toast } from '../../ui/Dialogs';
import { NO_SELECT } from '../../ui/DraggableList';
import { Icon, IconButton } from '../../ui/kit';
import { FitSheet } from './FitSheet';
import { HarmonizeSheet } from './HarmonizeSheet';
import { font, radius, space, useTheme } from '../../ui/theme';
import { togglePlay, usePlayer } from '../chords/player';

export const useMelodyUI = create<{ open: Record<string, boolean>; selected: string | null; scaleLock: boolean }>(() => ({ open: {}, selected: null, scaleLock: true }));
export const openMelody = (sectionId: string, open = true, select: string | null = null) =>
  useMelodyUI.setState((s) => ({ open: { ...s.open, [sectionId]: open }, selected: select ?? s.selected }));

const ROW = 18;
const STEP = 22;
const ROWS = 25;

function MelodyRollImpl({ section, index }: { section: SectionWithLines; index: number }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const settings = useSettings();
  const selected = useMelodyUI((s) => s.selected);
  const scaleLock = useMelodyUI((s) => s.scaleLock);
  const playing = usePlayer((p) => p.playing && p.scope === section.id);
  const [humming, setHumming] = useState(false);
  const [sheet, setSheet] = useState<null | 'harmonize' | 'fit'>(null);
  const humStop = useRef<(() => void) | null>(null);
  const humBuf = useRef<Float32Array[]>([]);
  const humRate = useRef(22050);
  const key = parseKey(doc.song.key);
  const scale = key ? scalePcs(key) : null;
  const ts = doc.song.timeSig;
  const per = stepsPerBar(ts);
  const melody = section.melody;
  // two octaves around the singer's range (or around the notes already written)
  const [base, setBase] = useState(() => {
    if (melody.length) {
      const mid = Math.round((Math.min(...melody.map((n) => n.pitch)) + Math.max(...melody.map((n) => n.pitch))) / 2);
      return mid - 12;
    }
    return Math.round((settings.vocalLow + settings.vocalHigh) / 2) - 12;
  });
  const top = base + ROWS - 1;
  const steps = Math.max(per * Math.max(2, section.bars.length), ...melody.map((n) => Math.ceil((n.start + n.length) / per) * per + per));
  const issues = useMemo(
    () => allIssues(melody, section.lines, { bpm: doc.song.bpm, timeSig: ts, vocalLow: settings.vocalLow, vocalHigh: settings.vocalHigh }),
    [melody, section.lines, doc.song.bpm, ts, settings.vocalLow, settings.vocalHigh]
  );
  const issueBy = useMemo(() => {
    const m = new Map<string, Issue>();
    for (const i of issues) if (!m.has(i.noteId) || i.severity > m.get(i.noteId)!.severity) m.set(i.noteId, i);
    return m;
  }, [issues]);

  const save = (next: Note[]) => useSong.getState().setMelody(section.id, next);
  const sel = melody.find((n) => n.id === selected) ?? null;
  const update = (id: string, patch: Partial<Note>) => save(melody.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const addAt = (e: GestureResponderEvent) => {
    // native: locationX/Y; web press events are DOM events with offsetX/Y
    const ne = e.nativeEvent as unknown as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
    const locationX = Number.isFinite(ne.locationX) ? ne.locationX! : (ne.offsetX ?? 0);
    const locationY = Number.isFinite(ne.locationY) ? ne.locationY! : (ne.offsetY ?? 0);
    const step = Math.max(0, Math.floor(locationX / STEP));
    let pitch = top - Math.floor(locationY / ROW);
    if (scaleLock) pitch = snapToScale(pitch, key);
    if (melody.some((n) => n.start <= step && n.start + n.length > step)) {
      useMelodyUI.setState({ selected: null });
      return;
    }
    const n: Note = { id: newId(), pitch, start: step, length: 2, lineId: null, syl: null };
    // link to the next unused syllable in order
    const linked = autoLink([...melody, n], section.lines);
    save(linked);
    useMelodyUI.setState({ selected: n.id });
    playNote(pitch, 0.35);
  };

  // while a note is being dragged the roll must not scroll under the finger
  const [dragging, setDragging] = useState(false);
  const commitNote = (id: string, patch: Partial<Note>) => {
    const cur = useSong.getState().doc!.sections.find((x) => x.id === section.id)!.melody;
    useSong.getState().setMelody(section.id, cur.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const humToggle = async () => {
    if (humming) {
      humStop.current?.();
      humStop.current = null;
      setHumming(false);
      const total = humBuf.current.reduce((s, b) => s + b.length, 0);
      const all = new Float32Array(total);
      let o = 0;
      for (const b of humBuf.current) {
        all.set(b, o);
        o += b.length;
      }
      humBuf.current = [];
      const notes = humToNotes(all, humRate.current, { bpm: doc.song.bpm, key, snap: scaleLock });
      if (!notes.length) return toast("Couldn't hear a melody. Try humming a little louder.");
      save(autoLink(notes, section.lines));
      const mid = Math.round((Math.min(...notes.map((n) => n.pitch)) + Math.max(...notes.map((n) => n.pitch))) / 2);
      setBase(mid - 12);
      toast(`${notes.length} notes from your hum`);
      return;
    }
    if (melody.length && !(await confirm('Replace this melody?', 'Humming a new one replaces the notes in this section.', 'Replace'))) return;
    try {
      humBuf.current = [];
      humStop.current = await startMic((frame, sr) => {
        humRate.current = sr;
        humBuf.current.push(frame);
      });
      setHumming(true);
    } catch (e) {
      toast(String((e as Error).message ?? e));
    }
  };

  const linkMenu = async () => {
    if (!sel) return;
    const syls = sectionSyllables(section.lines);
    const v = await choose('Sing which syllable?', [{ label: 'No syllable (melisma)', value: '' }, ...syls.map((s, i) => ({ label: `${s.text}${s.stress === 2 ? ' ●' : ''}`, value: String(i) }))]);
    if (v === null) return;
    const s = v === '' ? null : syls[Number(v)];
    update(sel.id, { lineId: s?.lineId ?? null, syl: s?.syl ?? null });
  };

  // ---------------------------------------------------------------- background
  const bg = useMemo(() => {
    const rects: React.ReactNode[] = [];
    for (let r = 0; r < ROWS; r++) {
      const pitch = top - r;
      const inScale = !scale || scale.includes(mod12(pitch));
      const isC = mod12(pitch) === 0;
      rects.push(<Rect key={'r' + r} x={0} y={r * ROW} width={steps * STEP} height={ROW} fill={inScale ? (isC ? t.surface2 : t.surface) : t.dark ? '#0f0f0f' : '#eceae4'} />);
    }
    // chord tones, per chord segment
    for (let s = 0; s < steps; s += 4) {
      const pcs = chordTonesAtStep(section.bars, s, ts);
      if (!pcs.length) continue;
      for (let r = 0; r < ROWS; r++) if (pcs.includes(mod12(top - r))) rects.push(<Rect key={`c${s}-${r}`} x={s * STEP} y={r * ROW + 1} width={4 * STEP} height={ROW - 2} fill={t.accent} opacity={0.16} />);
    }
    for (let s = 0; s <= steps; s += 4) rects.push(<Rect key={'b' + s} x={s * STEP} y={0} width={s % per === 0 ? 1.5 : 0.5} height={ROWS * ROW} fill={s % per === 0 ? t.textDim : t.border} />);
    return rects;
  }, [top, steps, scale?.join(), section.bars, ts, per, t]);

  const outRange = (p: number) => p < settings.vocalLow || p > settings.vocalHigh;

  return (
    <View style={[styles.wrap, { borderColor: t.border, backgroundColor: t.surface }]} testID={`melody-${index}`}>
      <View style={styles.bar}>
        <IconButton icon={playing ? 'stop' : 'play'} label={playing ? 'Stop' : 'Play melody with chords'} size={18} onPress={() => togglePlay(section.id)} testID={`melody-play-${index}`} />
        <IconButton icon={humming ? 'stop-circle' : 'mic-outline'} label={humming ? 'Stop and turn the hum into notes' : 'Hum a melody'} size={18} color={humming ? t.record : undefined} onPress={humToggle} testID={`melody-hum-${index}`} />
        <IconButton icon="create-outline" label="Write words to fit this melody" size={18} onPress={() => setSheet('fit')} testID={`melody-fit-${index}`} />
        <IconButton icon="color-wand-outline" label="Harmonize: find chords for this melody" size={18} onPress={() => setSheet('harmonize')} testID={`melody-harmonize-${index}`} />
        <IconButton icon="link-outline" label="Link notes to lyrics in order" size={18} onPress={() => (save(autoLink(melody, section.lines)), toast('Notes linked to syllables in order'))} />
        <Pressable onPress={() => useMelodyUI.setState({ scaleLock: !scaleLock })} style={[styles.lock, { borderColor: scaleLock ? t.accent : t.border }]} accessibilityRole="switch" accessibilityState={{ checked: scaleLock }} accessibilityLabel="Scale lock" testID="scale-lock">
          <Text style={{ color: scaleLock ? t.accent : t.textDim, fontSize: font.tiny, fontWeight: '700' }}>{key ? `${doc.song.key} scale` : 'no key'}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <IconButton icon="chevron-down" label="Lower octave" size={18} onPress={() => setBase(base - 12)} />
        <IconButton icon="chevron-up" label="Higher octave" size={18} onPress={() => setBase(base + 12)} />
        <IconButton icon="close" label="Close piano roll" size={18} onPress={() => openMelody(section.id, false)} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 30 }}>
          {Array.from({ length: ROWS }, (_, r) => {
            const p = top - r;
            return (
              <View key={r} style={{ height: ROW, justifyContent: 'center' }}>
                {mod12(p) === 0 && <Text style={{ fontSize: 10, color: t.textDim }}>{midiName(p)}</Text>}
                {(p === settings.vocalLow || p === settings.vocalHigh) && <View style={{ position: 'absolute', right: 2, width: 6, height: 2, backgroundColor: t.warn }} />}
              </View>
            );
          })}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ width: steps * STEP }} scrollEnabled={!dragging}>
          <View style={[{ width: steps * STEP, height: ROWS * ROW }, NO_SELECT]}>
            <Svg width={steps * STEP} height={ROWS * ROW} style={StyleSheet.absoluteFill}>
              {bg}
            </Svg>
            <Pressable style={StyleSheet.absoluteFill} onPress={addAt} accessibilityLabel="Piano roll: tap to add a note" testID={`roll-grid-${index}`} />
            {melody.map((n) => {
              const r = top - n.pitch;
              if (r < 0 || r >= ROWS) return null;
              const issue = issueBy.get(n.id);
              const syl = linkedSyllable(n, section.lines);
              return (
                <NoteView
                  key={n.id}
                  note={n}
                  row={r}
                  selected={n.id === selected}
                  label={syl?.text ?? ''}
                  a11y={`${midiName(n.pitch)}${syl ? ` "${syl.text}"` : ''}${issue ? `, ${issue.message}` : ''}`}
                  color={outRange(n.pitch) ? t.danger : t.accent}
                  border={n.id === selected ? t.text : issue ? (issue.severity === 2 ? t.danger : t.warn) : 'transparent'}
                  textColor={t.accentText}
                  testID={`note-${index}-${n.start}`}
                  onDragState={setDragging}
                  onTap={() => {
                    useMelodyUI.setState({ selected: n.id === selected ? null : n.id });
                    playNote(n.pitch, 0.3);
                  }}
                  onMove={(dSteps, dRows) => {
                    let pitch = n.pitch - dRows;
                    if (useMelodyUI.getState().scaleLock) pitch = snapToScale(pitch, key);
                    commitNote(n.id, { start: Math.max(0, n.start + dSteps), pitch });
                    useMelodyUI.setState({ selected: n.id });
                    playNote(pitch, 0.3);
                  }}
                  onResize={(dSteps) => {
                    commitNote(n.id, { length: Math.max(1, n.length + dSteps) });
                    useMelodyUI.setState({ selected: n.id });
                  }}
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
      {sel && (
        <View style={[styles.selBar, { borderTopColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: '700', width: 44 }}>{midiName(sel.pitch)}</Text>
          <IconButton icon="arrow-up" label="Up" size={18} onPress={() => (update(sel.id, { pitch: scaleLock ? stepInScale(sel.pitch, 1, key) : sel.pitch + 1 }), playNote(scaleLock ? stepInScale(sel.pitch, 1, key) : sel.pitch + 1, 0.3))} testID="note-up" />
          <IconButton icon="arrow-down" label="Down" size={18} onPress={() => (update(sel.id, { pitch: scaleLock ? stepInScale(sel.pitch, -1, key) : sel.pitch - 1 }), playNote(scaleLock ? stepInScale(sel.pitch, -1, key) : sel.pitch - 1, 0.3))} />
          <IconButton icon="remove" label="Shorter" size={18} onPress={() => update(sel.id, { length: Math.max(1, sel.length - 1) })} />
          <IconButton icon="add" label="Longer" size={18} onPress={() => update(sel.id, { length: sel.length + 1 })} testID="note-longer" />
          <IconButton icon="text-outline" label="Choose syllable" size={18} onPress={linkMenu} />
          <IconButton icon="trash-outline" label="Delete note" size={18} color={t.danger} onPress={() => (save(melody.filter((n) => n.id !== sel.id)), useMelodyUI.setState({ selected: null }))} testID="note-delete" />
        </View>
      )}
      {issueBy.get(selected ?? '') && <Text style={{ color: t.warn, fontSize: font.small, paddingHorizontal: space.sm, paddingBottom: space.xs }}>{issueBy.get(selected!)!.message}</Text>}
      {humming && <Text style={{ color: t.record, fontSize: font.small, paddingHorizontal: space.sm, paddingBottom: space.xs }}>Listening… hum the melody, then press stop.</Text>}
      <HarmonizeSheet visible={sheet === 'harmonize'} onClose={() => setSheet(null)} section={section} />
      <FitSheet visible={sheet === 'fit'} onClose={() => setSheet(null)} section={section} />
    </View>
  );
}

/**
 * One note. It answers the finger directly: drag to move (snapping to the
 * grid as you go), drag its right edge to change length, tap to select.
 */
function NoteView(props: {
  note: Note;
  row: number;
  selected: boolean;
  label: string;
  a11y: string;
  color: string;
  border: string;
  textColor: string;
  testID: string;
  onTap: () => void;
  onMove: (dSteps: number, dRows: number) => void;
  onResize: (dSteps: number) => void;
  onDragState: (d: boolean) => void;
}) {
  const { note, row, selected } = props;
  const [live, setLive] = useState<{ mode: 'move' | 'resize'; ds: number; dr: number } | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const mode = useRef<'move' | 'resize'>('move');
  const last = useRef('');
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const w = cb.current.note.length * STEP;
          // the right end of a note is its length handle (the whole note if it's tiny stays "move")
          mode.current = e.nativeEvent.locationX > w - Math.min(18, w / 2) && w >= STEP * 1.5 ? 'resize' : 'move';
          last.current = '';
          cb.current.onDragState(true);
        },
        onPanResponderMove: (_, g) => {
          const ds = Math.round(g.dx / STEP);
          const dr = mode.current === 'move' ? Math.round(g.dy / ROW) : 0;
          const k = ds + ':' + dr;
          if (k !== last.current) {
            last.current = k;
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
            setLive({ mode: mode.current, ds, dr });
          }
        },
        onPanResponderRelease: (_, g) => {
          cb.current.onDragState(false);
          setLive(null);
          const ds = Math.round(g.dx / STEP);
          const dr = Math.round(g.dy / ROW);
          if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) cb.current.onTap();
          else if (mode.current === 'resize') {
            if (ds) cb.current.onResize(ds);
          } else if (ds || dr) cb.current.onMove(ds, dr);
        },
        onPanResponderTerminate: () => {
          cb.current.onDragState(false);
          setLive(null);
        },
      }),
    []
  );
  const start = note.start + (live?.mode === 'move' ? live.ds : 0);
  const length = Math.max(1, note.length + (live?.mode === 'resize' ? live.ds : 0));
  return (
    <View
      {...pan.panHandlers}
      // a little taller than the row so it's easy to grab
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      style={[
        styles.note,
        {
          left: Math.max(0, start) * STEP,
          top: (row + (live?.mode === 'move' ? live.dr : 0)) * ROW,
          width: length * STEP - 1,
          height: ROW,
          backgroundColor: props.color,
          borderColor: props.border,
          borderWidth: selected || props.border !== 'transparent' ? 2 : 0,
          opacity: live ? 0.75 : 1,
          zIndex: live || selected ? 5 : 1,
        },
      ]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.a11y}
      testID={props.testID}
    >
      {!!props.label && (
        <Text style={[styles.sylText, { color: props.textColor }]} numberOfLines={1}>
          {props.label}
        </Text>
      )}
      {selected && <View style={styles.handle} />}
    </View>
  );
}

export const MelodyRoll = memo(MelodyRollImpl);

/** A one-line summary shown under the section header when the roll is closed. */
export function MelodyChip({ section }: { section: SectionWithLines }) {
  const t = useTheme();
  if (!section.melody.length) return null;
  return (
    <Pressable onPress={() => openMelody(section.id)} style={[styles.chip, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel={`Open melody, ${section.melody.length} notes`}>
      <Icon name="musical-note" size={13} color={t.accent} />
      <Text style={{ color: t.textDim, fontSize: font.small }}>Melody · {section.melody.length} notes</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginLeft: 22, marginRight: 4, marginBottom: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  lock: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4 },
  note: { position: 'absolute', borderRadius: 3, justifyContent: 'center', overflow: 'hidden', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}) },
  sylText: { fontSize: 11, fontWeight: '700', paddingHorizontal: 3 },
  handle: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, backgroundColor: 'rgba(255,255,255,0.55)' },
  selBar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginLeft: 22, marginBottom: space.sm, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
});
