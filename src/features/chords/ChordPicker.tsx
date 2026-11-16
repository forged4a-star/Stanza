/**
 * Pick a chord: in-key chords and next-chord ideas first, then any root +
 * quality (+ optional slash bass). Every tap plays the chord.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { prepareChords, previewChord } from '../../audio/engine';
import { feelSwaps, MOODS, type Mood } from '../../core/music/feel';
import { suggestNext } from '../../core/music/suggest';
import { diatonicChords, keyPrefersFlats, noteName, parseChord, parseKey, QUALITY_BY_SUFFIX } from '../../core/music/theory';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button, Chip, Icon, IconButton, Row, SectionTitle } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { GuitarDiagram, PianoKeys } from './ChordDiagram';
import { VolumeSlider } from './VolumeSlider';

export type PickerTarget =
  | { kind: 'bar'; sectionId: string; bar: number | null; slot: number }
  | { kind: 'syl'; lineId: string; syl: number }
  | { kind: 'callback'; title: string; onPick: (chord: string) => void; initial?: string | null };

const usePicker = create<{ target: PickerTarget | null }>(() => ({ target: null }));
export const openChordPicker = (target: PickerTarget) => usePicker.setState({ target });
const closePicker = () => usePicker.setState({ target: null });

const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', '6', 'm6', '9', 'm9', 'maj9', '7sus4', 'dim', 'm7b5', 'dim7', 'aug', '5', '11', '13'];
const qLabel = (q: string) => (q === '' ? 'maj' : q);

export const FN_COLOURS: Record<string, string> = { tension: '#d9822b', release: '#3b8a3a', lift: '#2f7fc1', darken: '#7a52b3', colour: '#888888' };

/** The chord just before a bar slot or syllable, for "what comes next" ideas. */
function previousChord(target: PickerTarget): string | null {
  const doc = useSong.getState().doc;
  if (!doc || target.kind === 'callback') return null;
  if (target.kind === 'bar') {
    const s = doc.sections.find((x) => x.id === target.sectionId);
    if (!s) return null;
    const flat = s.bars.flatMap((b, bi) => b.chords.map((c, ci) => ({ c, bi, ci })));
    const before = flat.filter((x) => target.bar === null || x.bi < target.bar || (x.bi === target.bar && x.ci < target.slot));
    return before.length ? before[before.length - 1].c : null;
  }
  for (const s of doc.sections) {
    const li = s.lines.findIndex((l) => l.id === target.lineId);
    if (li < 0) continue;
    for (let i = li; i >= 0; i--) {
      const cs = [...s.lines[i].chords].sort((a, b) => a.syl - b.syl).filter((c) => i < li || c.syl < target.syl);
      if (cs.length) return cs[cs.length - 1].chord;
    }
    if (s.bars.length) return s.bars[s.bars.length - 1].chords.slice(-1)[0] ?? null;
  }
  return null;
}

function currentChord(target: PickerTarget): string | null {
  const doc = useSong.getState().doc;
  if (target.kind === 'callback') return target.initial ?? null;
  if (!doc) return null;
  if (target.kind === 'bar') {
    const s = doc.sections.find((x) => x.id === target.sectionId);
    return target.bar === null ? null : (s?.bars[target.bar]?.chords[target.slot] ?? null);
  }
  for (const s of doc.sections) for (const l of s.lines) if (l.id === target.lineId) return l.chords.find((c) => c.syl === target.syl)?.chord ?? null;
  return null;
}

export function ChordPicker() {
  const t = useTheme();
  const target = usePicker((s) => s.target);
  const doc = useSong((s) => s.doc);
  const instrument = useSettings((s) => s.instrument);
  const [root, setRoot] = useState<number | null>(null);
  const [quality, setQuality] = useState('');
  const [bass, setBass] = useState<number | null>(null);
  const [slashMode, setSlashMode] = useState(false);
  const [shape, setShape] = useState(0);
  const [mood, setMood] = useState<Mood | null>(null);
  const key = parseKey(doc?.song.key);
  const flats = key ? keyPrefersFlats(key) : useSettings.getState().preferFlats;
  const existing = target ? currentChord(target) : null;

  useEffect(() => {
    if (!target) return;
    const c = existing ? parseChord(existing) : null;
    setRoot(c ? c.root : null);
    setQuality(c ? c.quality.suffix : '');
    setBass(c ? c.bass : null);
    setSlashMode(false);
    setShape(0);
    setMood(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // warm the chords you're likely to try, in the background, so hearing them is instant
  useEffect(() => {
    if (!target) return;
    const tm = setTimeout(() => void prepareChords(inKey, instrument, doc?.song.capo ?? 0), 300);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, instrument, doc?.song.key]);

  const name = root === null ? null : noteName(root, flats) + quality + (bass !== null && bass !== root ? '/' + noteName(bass, flats) : '');
  const prev = target ? previousChord(target) : null;
  const ideas = useMemo(() => (key ? suggestNext(prev, key).slice(0, 6) : []), [key?.tonic, key?.mode, prev]);
  const inKey = key ? diatonicChords(key) : ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'D', 'E', 'A'];

  const choose = (chord: string) => {
    const c = parseChord(chord);
    if (!c) return;
    setRoot(c.root);
    setQuality(c.quality.suffix);
    setBass(c.bass);
    setShape(0);
    previewChord(chord, instrument, doc?.song.capo ?? 0);
  };
  const tweak = (r: number | null, q: string, b: number | null) => {
    setRoot(r);
    setQuality(q);
    setBass(b);
    setShape(0);
    if (r !== null) previewChord(noteName(r, flats) + q + (b !== null && b !== r ? '/' + noteName(b, flats) : ''), instrument, doc?.song.capo ?? 0);
  };

  const apply = (chord: string | null) => {
    if (!target) return;
    const st = useSong.getState();
    if (target.kind === 'callback') {
      if (chord) target.onPick(chord);
    } else if (target.kind === 'bar') {
      const s = st.doc!.sections.find((x) => x.id === target.sectionId)!;
      const bars = s.bars.map((b) => ({ chords: [...b.chords] }));
      if (target.bar === null) {
        if (chord) bars.push({ chords: [chord] });
      } else if (chord) {
        bars[target.bar].chords[target.slot] = chord;
      } else {
        bars[target.bar].chords.splice(target.slot, 1);
        if (!bars[target.bar].chords.length) bars.splice(target.bar, 1);
      }
      st.setBars(s.id, bars);
    } else {
      const line = st.doc!.sections.flatMap((s) => s.lines).find((l) => l.id === target.lineId)!;
      const others = line.chords.filter((c) => c.syl !== target.syl);
      st.setLineChords(line.id, chord ? [...others, { syl: target.syl, chord }].sort((a, b) => a.syl - b.syl) : others);
    }
    closePicker();
  };

  const title = target?.kind === 'callback' ? target.title : target?.kind === 'bar' ? (target.bar === null ? 'Add a bar' : `Bar ${target.bar + 1}`) : 'Chord over the lyric';

  return (
    <BottomSheet visible={!!target} onClose={closePicker} title={title} height={0.82} light testID="chord-picker">
      <View style={[styles.head, { borderBottomColor: t.border }]}>
        <Pressable onPress={() => name && previewChord(name, instrument, doc?.song.capo ?? 0)} style={styles.nameBox} accessibilityRole="button" accessibilityLabel={name ? `Play ${name}` : 'No chord chosen'}>
          <Text style={{ color: name ? t.text : t.textFaint, fontSize: 30, fontWeight: '700' }} testID="picker-name">
            {name ?? '—'}
          </Text>
          {name && <Icon name="play" size={18} color={t.accent} />}
        </Pressable>
        {name && (
          <Pressable onPress={() => setShape((x) => x + 1)} accessibilityLabel="Next guitar shape">
            <GuitarDiagram chord={name} capo={doc?.song.capo ?? 0} size={0.75} index={shape % 4} />
          </Pressable>
        )}
      </View>
      <View style={{ paddingHorizontal: space.lg }}>
        <VolumeSlider compact />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        {name && (
          <View style={{ alignItems: 'center', marginBottom: space.sm }}>
            <PianoKeys chord={name} width={280} />
          </View>
        )}
        {ideas.length > 0 && (
          <>
            <SectionTitle>{prev ? `After ${prev}` : 'Good places to start'}</SectionTitle>
            <Row style={{ flexWrap: 'wrap' }}>
              {ideas.map((s) => (
                <Pressable key={s.chord} onPress={() => choose(s.chord)} style={[styles.idea, { borderColor: FN_COLOURS[s.fn], backgroundColor: name === s.chord ? t.surface2 : 'transparent' }]} accessibilityRole="button" accessibilityLabel={`${s.chord}, ${s.fn}: ${s.why}`} testID={`idea-${s.chord}`}>
                  <Text style={{ color: t.text, fontWeight: '700' }}>{s.chord}</Text>
                  <Text style={{ color: FN_COLOURS[s.fn], fontSize: font.tiny, fontWeight: '600' }}>{s.fn}</Text>
                </Pressable>
              ))}
            </Row>
          </>
        )}
        {name && (
          <>
            <SectionTitle>Change the feel</SectionTitle>
            <Row style={{ flexWrap: 'wrap' }}>
              {MOODS.map((m) => (
                <Chip key={m.id} label={m.label} selected={mood === m.id} onPress={() => setMood(mood === m.id ? null : m.id)} testID={`mood-${m.id}`} />
              ))}
            </Row>
            {mood && (
              <View style={{ marginTop: space.sm, gap: 6 }} testID="feel-swaps">
                {feelSwaps(name, mood).length === 0 ? (
                  <Text style={{ color: t.textDim, fontSize: font.small }}>No {MOODS.find((m) => m.id === mood)!.label.toLowerCase()} version of {name}. Try another mood.</Text>
                ) : (
                  feelSwaps(name, mood).map((sw) => (
                    <Pressable key={sw.chord} onPress={() => choose(sw.chord)} style={[styles.swap, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel={`${sw.chord}: ${sw.why}`} testID={`swap-${sw.chord}`}>
                      <Text style={{ color: t.text, fontWeight: '700', fontSize: font.body + 1, minWidth: 64 }}>{sw.chord}</Text>
                      <Text style={{ color: t.textDim, flex: 1, fontSize: font.small + 1 }}>{sw.why}</Text>
                      <Icon name="play" size={16} color={t.accent} />
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </>
        )}
        <SectionTitle>{key ? `In ${doc?.song.key}` : 'Common chords'}</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {inKey.map((c) => (
            <Chip key={c} label={c} selected={name === c} onPress={() => choose(c)} testID={`inkey-${c}`} />
          ))}
        </Row>
        <SectionTitle>{slashMode ? 'Bass note' : 'Root'}</SectionTitle>
        <View style={styles.grid}>
          {Array.from({ length: 12 }, (_, pc) => {
            const sel = slashMode ? bass === pc : root === pc;
            return (
              <Pressable
                key={pc}
                onPress={() => (slashMode ? tweak(root, quality, pc === root ? null : pc) : tweak(pc, quality, bass))}
                style={[styles.cell, { backgroundColor: sel ? t.accent : t.surface2 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                testID={`${slashMode ? 'bass' : 'root'}-${noteName(pc, flats)}`}
              >
                <Text style={{ color: sel ? t.accentText : t.text, fontWeight: '600', fontSize: font.body }}>{noteName(pc, flats)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Row style={{ marginTop: space.sm }}>
          <Chip label={slashMode ? 'Done with bass' : bass !== null ? `Bass: ${noteName(bass, flats)}` : '/ Slash bass'} selected={slashMode} onPress={() => setSlashMode(!slashMode)} testID="slash-mode" />
          {bass !== null && <Chip label="No slash" onPress={() => tweak(root, quality, null)} />}
        </Row>
        <SectionTitle>Type</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {QUALITIES.filter((q) => QUALITY_BY_SUFFIX[q]).map((q) => (
            <Chip key={q || 'maj'} label={qLabel(q)} selected={quality === q && root !== null} onPress={() => tweak(root ?? (key ? key.tonic : 0), q, bass)} testID={`q-${qLabel(q)}`} />
          ))}
        </Row>
      </ScrollView>
      <Row style={{ padding: space.md, paddingHorizontal: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
        {existing && target?.kind !== 'callback' && <IconButton icon="trash-outline" label="Remove chord" color={t.danger} onPress={() => apply(null)} testID="picker-remove" />}
        <Button title={existing ? 'Change chord' : 'Use chord'} kind="primary" disabled={!name} onPress={() => apply(name)} style={{ flex: 1 }} testID="picker-done" />
      </Row>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  nameBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '15%', minWidth: 48, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  swap: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, minHeight: 48, borderRadius: radius.md },
  idea: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 4, alignItems: 'center', minWidth: 56 },
});
