/**
 * Chords: play/loop with tempo, metronome and patterns; circle of fifths;
 * next-chord ideas and classic progressions; shapes, capo, transpose and
 * Roman numerals; and a chord detector that listens to the mic.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { previewChord } from '../../audio/engine';
import { startMic } from '../../audio/mic';
import { PATTERNS } from '../../core/audio/patterns';
import { INSTRUMENTS, tapTempo } from '../../core/audio/synth';
import { detectChord, type DetectedChord } from '../../core/music/detect';
import { PROGRESSIONS, realiseProgression, suggestNext } from '../../core/music/suggest';
import { keyName, parseChord, parseKey, romanNumeral, type Key } from '../../core/music/theory';
import { sectionDisplayNames } from '../../core/model';
import { useSettings } from '../../store/settings';
import { findLine, useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { toast } from '../../ui/Dialogs';
import { Button, Chip, Icon, IconButton, Row, SectionTitle, Segmented, ToggleRow } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { GuitarDiagram, PianoKeys } from './ChordDiagram';
import { FN_COLOURS } from './ChordPicker';
import { CircleOfFifths } from './CircleOfFifths';
import { playScope, stopPlayer, togglePlay, usePlayer } from './player';

type Tab = 'play' | 'circle' | 'ideas' | 'shapes' | 'detect';

/** The section new chords go to: the one being edited, else the first. */
function targetSection() {
  const st = useSong.getState();
  const d = st.doc!;
  const at = st.activeLineId ? findLine(d, st.activeLineId) : null;
  return at ? at.section : d.sections[0];
}

function appendBars(chords: string[]) {
  const sec = targetSection();
  useSong.getState().setBars(sec.id, [...sec.bars, ...chords.map((c) => ({ chords: [c] }))]);
  const names = sectionDisplayNames(useSong.getState().doc!.sections);
  toast(`Added to ${names[useSong.getState().doc!.sections.findIndex((s) => s.id === sec.id)]}`);
}

export function ChordsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('play');
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Chords" height={0.8} light testID="chords-sheet">
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'play', label: 'Play' },
            { value: 'circle', label: 'Circle' },
            { value: 'ideas', label: 'Ideas' },
            { value: 'shapes', label: 'Shapes' },
            { value: 'detect', label: 'Listen' },
          ]}
          testID="chords-tabs"
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
        {tab === 'play' && <PlayTab />}
        {tab === 'circle' && <CircleTab />}
        {tab === 'ideas' && <IdeasTab />}
        {tab === 'shapes' && <ShapesTab />}
        {tab === 'detect' && <DetectTab active={visible} />}
      </ScrollView>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ play

function PlayTab() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const settings = useSettings();
  const player = usePlayer();
  const taps = useRef<number[]>([]);
  const names = sectionDisplayNames(doc.sections);
  const playable = doc.sections.map((s, i) => ({ s, i })).filter(({ s }) => s.bars.length || s.melody.length);
  const [scope, setScope] = useState<string>(player.scope ?? 'song');
  const restart = () => {
    if (usePlayer.getState().playing) playScope(usePlayer.getState().scope ?? scope);
  };
  const setBpm = (bpm: number) => {
    useSong.getState().setMeta({ bpm: Math.max(30, Math.min(300, Math.round(bpm))) });
    setTimeout(restart, 0);
  };
  return (
    <View>
      {playable.length === 0 && <Text style={{ color: t.textDim, marginBottom: space.md }}>Add chords to a section (tap + under its name, or use Circle / Ideas) and play them here.</Text>}
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="Whole song" selected={scope === 'song'} onPress={() => setScope('song')} />
        {playable.map(({ s, i }) => (
          <Chip key={s.id} label={names[i]} selected={scope === s.id} onPress={() => setScope(s.id)} />
        ))}
      </Row>
      <Row style={{ marginTop: space.lg, justifyContent: 'center', gap: space.lg }}>
        <Pressable
          onPress={() => (player.playing ? stopPlayer() : playScope(scope))}
          disabled={!playable.length}
          style={[styles.bigPlay, { backgroundColor: playable.length ? t.accent : t.surface2 }]}
          accessibilityRole="button"
          accessibilityLabel={player.playing ? 'Stop' : 'Play'}
          testID="player-play"
        >
          <Icon name={player.playing ? 'stop' : 'play'} size={30} color={t.accentText} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '700' }} testID="player-bpm">
            {Math.round(doc.song.bpm)}
          </Text>
          <Text style={{ color: t.textDim, fontSize: font.small }}>bpm</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Row>
            <Button compact title="−5" onPress={() => setBpm(doc.song.bpm - 5)} />
            <Button compact title="+5" onPress={() => setBpm(doc.song.bpm + 5)} />
          </Row>
          <Button
            compact
            title="Tap tempo"
            onPress={() => {
              const n = Date.now();
              taps.current = [...taps.current.filter((x) => n - x < 4000), n];
              const bpm = tapTempo(taps.current);
              if (bpm) setBpm(bpm);
            }}
            testID="tap-tempo"
          />
        </View>
      </Row>
      <ToggleRow label="Loop" value={player.loop} onChange={(v) => usePlayer.setState({ loop: v })} />
      <ToggleRow label="Metronome" value={settings.metronome} onChange={(v) => (settings.set({ metronome: v }), setTimeout(restart, 0))} testID="metronome" />
      <SectionTitle>Time signature</SectionTitle>
      <Row style={{ flexWrap: 'wrap' }}>
        {(['4/4', '3/4', '6/8', '2/4', '12/8'] as const).map((ts) => (
          <Chip key={ts} label={ts} selected={doc.song.timeSig.join('/') === ts} onPress={() => (useSong.getState().setMeta({ timeSig: ts.split('/').map(Number) as [number, number] }), setTimeout(restart, 0))} />
        ))}
      </Row>
      <SectionTitle>Sound</SectionTitle>
      <Segmented value={settings.instrument} onChange={(v) => (settings.set({ instrument: v }), setTimeout(restart, 0))} options={INSTRUMENTS.map((x) => ({ value: x.id, label: x.label }))} testID="instrument" />
      <SectionTitle>Pattern</SectionTitle>
      <Row style={{ flexWrap: 'wrap' }}>
        {PATTERNS.map((p) => (
          <Chip key={p.id} label={p.label} selected={settings.pattern === p.id} onPress={() => (settings.set({ pattern: p.id }), setTimeout(restart, 0))} />
        ))}
      </Row>
    </View>
  );
}

// ------------------------------------------------------------------ circle

function CircleTab() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const { width } = useWindowDimensions();
  const instrument = useSettings((s) => s.instrument);
  const [sel, setSel] = useState<string | null>(null);
  const key = parseKey(doc.song.key);
  const selKey: Key | null = sel ? (() => {
    const c = parseChord(sel);
    if (!c || (c.quality.family !== 'major' && c.quality.family !== 'minor')) return null;
    return { tonic: c.root, mode: c.quality.family === 'minor' ? 'minor' : 'major' };
  })() : null;
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: t.textDim, fontSize: font.small, alignSelf: 'flex-start', marginBottom: space.sm }}>
        {key ? `Lit: the chords of ${keyName(key, true)}.` : 'Pick a key to light up its chords.'} Tap to hear, long-press to add to {sectionLabelForAdd()}.
      </Text>
      <CircleOfFifths
        keySig={key}
        size={Math.min(width - space.lg * 2, 360)}
        selected={sel}
        onTap={(c) => {
          setSel(c);
          previewChord(c, instrument, doc.song.capo);
        }}
        onLongPress={(c) => appendBars([c])}
      />
      {sel && (
        <Row style={{ marginTop: space.md, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button compact title={`Add ${sel}`} icon="add" onPress={() => appendBars([sel])} testID="circle-add" />
          {selKey && (doc.song.key !== keyName(selKey)) && <Button compact title={`Make ${keyName(selKey)} the song key`} onPress={() => useSong.getState().setMeta({ key: keyName(selKey) })} testID="circle-set-key" />}
        </Row>
      )}
    </View>
  );
}

function sectionLabelForAdd(): string {
  const d = useSong.getState().doc;
  if (!d) return 'the section';
  const sec = targetSection();
  return sectionDisplayNames(d.sections)[d.sections.indexOf(sec)];
}

// ------------------------------------------------------------------ ideas

function IdeasTab() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const settings = useSettings();
  const key = parseKey(doc.song.key);
  const sec = targetSection();
  const prev = sec.bars.length ? sec.bars[sec.bars.length - 1].chords.slice(-1)[0] : null;
  const ideas = useMemo(
    () => (key ? suggestNext(prev, key, { borrowed: settings.suggestBorrowed, secondary: settings.suggestSecondary, pivots: settings.suggestPivots }) : []),
    [key?.tonic, key?.mode, prev, settings.suggestBorrowed, settings.suggestSecondary, settings.suggestPivots]
  );
  if (!key)
    return (
      <View>
        <Text style={{ color: t.textDim, marginBottom: space.md }}>Set a key to get chord ideas. Pick one:</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Am', 'Em', 'Dm'].map((k) => (
            <Chip key={k} label={k} onPress={() => useSong.getState().setMeta({ key: k })} testID={`set-key-${k}`} />
          ))}
        </Row>
      </View>
    );
  return (
    <View>
      <Text style={{ color: t.textDim, fontSize: font.small }}>
        {prev ? `What could follow ${prev}` : 'Where to start'} in {sectionLabelForAdd()} ({keyName(key, true)}). Most common first.
      </Text>
      <Row style={{ flexWrap: 'wrap', marginVertical: space.sm }}>
        <Chip label="Borrowed" selected={settings.suggestBorrowed} onPress={() => settings.set({ suggestBorrowed: !settings.suggestBorrowed })} testID="toggle-borrowed" />
        <Chip label="Secondary dominants" selected={settings.suggestSecondary} onPress={() => settings.set({ suggestSecondary: !settings.suggestSecondary })} testID="toggle-secondary" />
        <Chip label="Key change pivots" selected={settings.suggestPivots} onPress={() => settings.set({ suggestPivots: !settings.suggestPivots })} testID="toggle-pivots" />
      </Row>
      <View testID="suggestions">
        {ideas.map((s, i) => (
          <Pressable key={s.chord + s.source + i} onPress={() => previewChord(s.chord, settings.instrument, doc.song.capo)} style={[styles.sugg, { borderBottomColor: t.border }]} accessibilityRole="button" accessibilityLabel={`${s.chord}, ${s.roman}, ${s.fn}. ${s.why}`}>
            <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: FN_COLOURS[s.fn] }} />
            <View style={{ width: 70 }}>
              <Text style={{ color: t.text, fontSize: font.body + 1, fontWeight: '700' }}>{s.chord}</Text>
              <Text style={{ color: t.textDim, fontSize: font.tiny }} numberOfLines={1}>
                {s.roman}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: FN_COLOURS[s.fn], fontSize: font.small, fontWeight: '700' }}>
                {s.fn}
                {s.source !== 'diatonic' ? ` · ${s.source}` : ''}
              </Text>
              <Text style={{ color: t.textDim, fontSize: font.small }} numberOfLines={2}>
                {s.why}
              </Text>
            </View>
            <View style={[styles.meter, { backgroundColor: t.surface2 }]}>
              <View style={{ width: `${Math.round(s.weight * 100)}%`, height: 4, borderRadius: 2, backgroundColor: t.textDim }} />
            </View>
            <IconButton icon="add" label={`Add ${s.chord}`} onPress={() => appendBars([s.chord])} testID={`add-${s.chord}`} />
          </Pressable>
        ))}
      </View>
      <SectionTitle>Classic progressions in {keyName(key)}</SectionTitle>
      {PROGRESSIONS.map((p) => {
        const chords = realiseProgression(p, key);
        return (
          <View key={p.name} style={[styles.prog, { borderBottomColor: t.border }]}>
            <Pressable style={{ flex: 1 }} onPress={() => playScope('preview', { bars: chords.map((c) => ({ chords: [c] })) })} accessibilityRole="button" accessibilityLabel={`Play ${p.name}`}>
              <Text style={{ color: t.text, fontSize: font.body }}>
                {p.name} <Text style={{ color: t.textFaint, fontSize: font.tiny }}>{p.kind}</Text>
              </Text>
              <Text style={{ color: t.chord, fontWeight: '700' }}>{chords.join('  ')}</Text>
              <Text style={{ color: t.textDim, fontSize: font.small }}>{p.note}</Text>
            </Pressable>
            <IconButton icon="add" label={`Add ${p.name}`} onPress={() => appendBars(chords)} testID={`add-prog-${p.name}`} />
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ shapes

function ShapesTab() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const settings = useSettings();
  const key = parseKey(doc.song.key);
  const chords = useMemo(() => {
    const set: string[] = [];
    for (const s of doc.sections) {
      for (const b of s.bars) for (const c of b.chords) if (!set.includes(c)) set.push(c);
      for (const l of s.lines) for (const c of l.chords) if (!set.includes(c.chord)) set.push(c.chord);
    }
    return set;
  }, [doc]);
  return (
    <View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: t.text, fontSize: font.body }}>Capo {doc.song.capo || 'none'}</Text>
        <Row>
          <Button compact title="−" onPress={() => useSong.getState().setMeta({ capo: Math.max(0, doc.song.capo - 1) })} />
          <Button compact title="+" onPress={() => useSong.getState().setMeta({ capo: Math.min(11, doc.song.capo + 1) })} testID="capo-up" />
        </Row>
      </Row>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Text style={{ color: t.text, fontSize: font.body }}>Transpose song{doc.song.key ? ` (${doc.song.key})` : ''}</Text>
        <Row>
          <Button compact title="−1" onPress={() => useSong.getState().transposeSong(-1)} testID="transpose-down" />
          <Button compact title="+1" onPress={() => useSong.getState().transposeSong(1)} testID="transpose-up" />
        </Row>
      </Row>
      <ToggleRow label="Roman numerals" hint={key ? `Show chords as numbers in ${keyName(key)}` : 'Set a song key first'} value={settings.romanChords} onChange={(v) => settings.set({ romanChords: v })} testID="toggle-roman" />
      <ToggleRow label="Place chords over lyrics" hint="Shows a tap target above every syllable" value={settings.showChords} onChange={(v) => settings.set({ showChords: v })} testID="toggle-place-chords" />
      {doc.song.capo > 0 && <Text style={{ color: t.textDim, fontSize: font.small, marginTop: space.sm }}>Shapes are shown relative to the capo (they sound as written).</Text>}
      {chords.length === 0 && <Text style={{ color: t.textDim, marginTop: space.md }}>No chords in this song yet.</Text>}
      <View style={styles.shapes} testID="shapes">
        {chords.map((c) => (
          <Pressable key={c} onPress={() => previewChord(c, settings.instrument, doc.song.capo)} style={[styles.shape, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel={`Play ${c}`}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: font.body + 1 }}>
              {c}
              {settings.romanChords && key ? <Text style={{ color: t.textDim, fontSize: font.small }}> {romanNumeral(c, key)}</Text> : null}
            </Text>
            <GuitarDiagram chord={c} capo={doc.song.capo} size={0.9} />
            <PianoKeys chord={c} width={130} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ detect

function DetectTab({ active }: { active: boolean }) {
  const t = useTheme();
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<DetectedChord | null>(null);
  const [level, setLevel] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const buf = useRef<Float32Array>(new Float32Array(0));

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  };
  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (!active) stop();
  }, [active]);

  const start = async () => {
    setResult(null);
    try {
      let last = 0;
      stopRef.current = await startMic((frame, sr) => {
        // keep the last ~0.75 s
        const keep = Math.floor(sr * 0.75);
        const merged = new Float32Array(Math.min(keep, buf.current.length + frame.length));
        const tail = buf.current.subarray(Math.max(0, buf.current.length - (merged.length - frame.length)));
        merged.set(tail, 0);
        merged.set(frame.subarray(Math.max(0, frame.length - merged.length)), tail.length);
        buf.current = merged;
        let e = 0;
        for (let i = 0; i < frame.length; i++) e += frame[i] * frame[i];
        const rms = Math.sqrt(e / frame.length);
        const now = Date.now();
        if (now - last > 350) {
          last = now;
          setLevel(Math.min(1, rms * 8));
          if (rms > 0.01 && buf.current.length >= keep * 0.6) {
            const d = detectChord(buf.current, sr);
            if (d && d.confidence > 0.15) setResult(d);
          }
        }
      });
      setListening(true);
    } catch (e) {
      toast(String((e as Error).message ?? e));
    }
  };

  return (
    <View style={{ alignItems: 'center', gap: space.md }}>
      <Text style={{ color: t.textDim, fontSize: font.small, textAlign: 'center' }}>Play and let a chord ring near the microphone.</Text>
      <Text style={{ color: result ? t.text : t.textFaint, fontSize: 56, fontWeight: '700' }} testID="detected-chord">
        {result?.name ?? (listening ? '…' : '—')}
      </Text>
      {result && <Text style={{ color: t.textDim }}>or {result.alternatives.join(', ')}</Text>}
      <View style={{ width: 200, height: 6, borderRadius: 3, backgroundColor: t.surface2 }}>
        <View style={{ width: `${level * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
      </View>
      <Row>
        <Button title={listening ? 'Stop listening' : 'Listen'} icon={listening ? 'stop' : 'mic'} kind="primary" onPress={() => (listening ? stop() : start())} testID="detect-toggle" />
        {result && <Button title={`Add ${result.name}`} icon="add" onPress={() => appendBars([result.name])} testID="detect-add" />}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  bigPlay: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  sugg: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  meter: { width: 40, height: 4, borderRadius: 2, overflow: 'hidden' },
  prog: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  shape: { alignItems: 'center', padding: space.sm, borderRadius: radius.md, gap: 4 },
});

export { togglePlay };
