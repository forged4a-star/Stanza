/**
 * Build your own strumming pattern: one bar of steps, tap a step to cycle it
 * (rest, down, soft down, up, soft up, muted chuck), hear it loop as you edit.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  changeResolution,
  customPatternId,
  nextStep,
  STRUM_TEMPLATES,
  strumFromTemplate,
  type CustomStrum,
  type StrumSpread,
  type StrumStep,
} from '../../core/audio/strums';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { confirm, toast } from '../../ui/Dialogs';
import { RhythmInput } from './RhythmInput';
import { Button, Chip, Field, Icon, Row, SectionTitle, Segmented } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { playScope, stopPlayer, usePlayer } from './player';

const LABELS: Record<StrumStep, { glyph: string; name: string }> = {
  '-': { glyph: '·', name: 'rest' },
  D: { glyph: '↓', name: 'down stroke' },
  d: { glyph: '↓', name: 'soft down stroke' },
  U: { glyph: '↑', name: 'up stroke' },
  u: { glyph: '↑', name: 'soft up stroke' },
  X: { glyph: '✕', name: 'muted chuck' },
};

const COUNTS_EIGHTH = ['1', '&', '2', '&', '3', '&', '4', '&'];
const COUNTS_SIXTEENTH = ['1', 'e', '&', 'a', '2', 'e', '&', 'a'];

export function StrumEditor({ initial, existing, onClose }: { initial: CustomStrum | null; existing: boolean; onClose: () => void }) {
  const t = useTheme();
  const settings = useSettings();
  const doc = useSong((s) => s.doc);
  const [draft, setDraft] = useState<CustomStrum | null>(initial);
  const [chord, setChord] = useState('G');
  const playing = usePlayer((p) => p.playing && p.scope === 'strum-preview');
  const first = useRef(true);

  useEffect(() => {
    setDraft(initial);
    first.current = true;
    // preview with the song's first chord if it has one
    const c = doc?.sections.flatMap((s) => s.bars.flatMap((b) => b.chords))[0];
    if (c) setChord(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const previewKey = useMemo(() => (draft ? JSON.stringify([draft.steps, draft.resolution, draft.spread, chord]) : ''), [draft, chord]);
  const startPreview = () => {
    if (!draft) return;
    playScope('strum-preview', {
      bars: Array.from({ length: 2 }, () => ({ chords: [chord] })),
      pattern: customPatternId(draft),
      customStrums: [draft],
      loop: true,
      melody: false,
    });
  };
  // while previewing, every edit restarts the loop so you hear it straight away
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (usePlayer.getState().playing && usePlayer.getState().scope === 'strum-preview') {
      const tm = setTimeout(startPreview, 120);
      return () => clearTimeout(tm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);
  useEffect(
    () => () => {
      if (usePlayer.getState().scope === 'strum-preview') stopPlayer();
    },
    []
  );

  if (!draft) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const set = (p: Partial<CustomStrum>) => setDraft({ ...draft, ...p });
  const setStep = (i: number) => set({ steps: draft.steps.map((s, k) => (k === i ? nextStep(s) : s)) });
  const hits = draft.steps.filter((s) => s !== '-').length;
  const rows = draft.steps.length / 8;
  const counts = draft.resolution === 'sixteenth' ? COUNTS_SIXTEENTH : COUNTS_EIGHTH;

  const save = () => {
    const name = draft.name.trim() || 'My strum';
    if (!hits) return toast('Tap some steps first. A pattern needs at least one stroke.');
    const saved = { ...draft, name };
    const list = existing ? settings.customStrums.map((c) => (c.id === saved.id ? saved : c)) : [...settings.customStrums, saved];
    settings.set({ customStrums: list, pattern: customPatternId(saved) });
    if (usePlayer.getState().scope === 'strum-preview') stopPlayer();
    toast(`Saved "${name}" and selected it`);
    onClose();
  };

  const remove = async () => {
    if (!(await confirm(`Delete "${draft.name}"?`, undefined, 'Delete', true))) return;
    settings.set({
      customStrums: settings.customStrums.filter((c) => c.id !== draft.id),
      pattern: settings.pattern === customPatternId(draft) ? 'strum-folk' : settings.pattern,
    });
    onClose();
  };

  return (
    <BottomSheet visible onClose={onClose} title={existing ? 'Edit strum' : 'New strum'} height={0.9} testID="strum-editor">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="e.g. Campfire" testID="strum-name" />

        <SectionTitle>Play it in</SectionTitle>
        <Text style={{ color: t.textDim, fontSize: font.small, marginBottom: space.sm }}>
          Tap the rhythm or hum it ({doc ? Math.round(doc.song.bpm) : 90} bpm, after a one-bar count-in). It fills the grid below for you to tidy up.
        </Text>
        <RhythmInput
          bpm={doc?.song.bpm ?? 90}
          onGuess={(g) => setDraft({ ...draft, steps: g.strum.steps, resolution: g.strum.resolution })}
        />

        <SectionTitle>Tap a step to change it</SectionTitle>
        <View testID="strum-grid" style={{ gap: space.sm }}>
          {Array.from({ length: rows }, (_, r) => (
            <View key={r}>
              <View style={styles.row}>
                {counts.map((c, i) => (
                  <Text key={i} style={[styles.count, { color: i % 2 === 0 && draft.resolution === 'eighth' ? t.text : t.textFaint }]}>
                    {c}
                  </Text>
                ))}
              </View>
              <View style={styles.row}>
                {draft.steps.slice(r * 8, r * 8 + 8).map((s, k) => {
                  const i = r * 8 + k;
                  const on = s !== '-';
                  const soft = s === 'd' || s === 'u';
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setStep(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Step ${i + 1}: ${LABELS[s].name}. Tap to change.`}
                      testID={`step-${i}`}
                      style={[styles.cell, { backgroundColor: on ? (soft ? t.accent + '55' : t.accent) : t.surface2, borderColor: on ? t.accent : t.border }]}
                    >
                      <Text style={{ color: on ? (soft ? t.text : t.accentText) : t.textFaint, fontSize: soft ? 20 : 26, fontWeight: '700' }}>{LABELS[s].glyph}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
        <Text style={{ color: t.textDim, fontSize: font.small, marginTop: space.sm }}>
          ↓ down · ↑ up · light arrows are soft ghost strokes · ✕ is a muted chuck · · is a rest. Tap cycles through them.
        </Text>
        <Row style={{ marginTop: space.sm }}>
          <Button compact title="Clear" onPress={() => set({ steps: draft.steps.map(() => '-' as StrumStep) })} testID="strum-clear" />
        </Row>

        <SectionTitle>Hear it</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {[...new Set([chord, 'G', 'C', 'Am', 'D', 'Em'])].map((c) => (
            <Chip key={c} label={c} selected={chord === c} onPress={() => setChord(c)} />
          ))}
        </Row>
        <Button
          title={playing ? 'Stop' : 'Play this strum'}
          icon={playing ? 'stop' : 'play'}
          kind="primary"
          onPress={() => (playing ? stopPlayer() : startPreview())}
          style={{ marginTop: space.sm }}
          disabled={!hits}
          testID="strum-preview"
        />

        <SectionTitle>Feel</SectionTitle>
        <Segmented
          value={draft.resolution}
          onChange={(v) => setDraft(changeResolution(draft, v))}
          options={[
            { value: 'eighth', label: 'Eighths (8 steps)' },
            { value: 'sixteenth', label: 'Sixteenths (16)' },
          ]}
          testID="strum-resolution"
        />
        <View style={{ height: space.sm }} />
        <Segmented
          value={draft.spread}
          onChange={(v: StrumSpread) => set({ spread: v })}
          options={[
            { value: 'tight', label: 'Tight' },
            { value: 'normal', label: 'Normal' },
            { value: 'slow', label: 'Slow sweep' },
          ]}
          testID="strum-spread"
        />

        <SectionTitle>Start from</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {STRUM_TEMPLATES.map((tpl) => (
            <Chip
              key={tpl.name}
              label={tpl.name}
              onPress={() => {
                const s = strumFromTemplate(tpl);
                setDraft({ ...draft, steps: s.steps, resolution: s.resolution, spread: s.spread, name: draft.name.trim() && draft.name !== 'My strum' ? draft.name : tpl.name });
              }}
              testID={`tpl-${tpl.name}`}
            />
          ))}
        </Row>

        <Row style={{ marginTop: space.xl }}>
          {existing && <Button title="Delete" kind="danger" icon="trash-outline" onPress={remove} testID="strum-delete" />}
          <Button title={existing ? 'Save changes' : 'Save strum'} kind="primary" icon="checkmark" onPress={save} style={{ flex: 1 }} testID="strum-save" />
        </Row>
        <Row style={{ marginTop: space.sm, justifyContent: 'center' }}>
          <Icon name="information-circle-outline" size={14} color={t.textFaint} />
          <Text style={{ color: t.textFaint, fontSize: font.tiny, flex: 1 }}>The pattern repeats each bar. A second chord in the same bar carries it on from where the first left off.</Text>
        </Row>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  count: { flex: 1, textAlign: 'center', fontSize: font.small, fontWeight: '600', marginBottom: 2 },
  cell: { flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
