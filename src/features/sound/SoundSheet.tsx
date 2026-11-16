/**
 * Sound: what to highlight and how, plus the counts panel (rhyme families,
 * phoneme counts, vowel heatmap, most-repeated words).
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sectionDisplayNames } from '../../core/model';
import { PHONES, VOWEL_CODES } from '../../core/phonetics/arpabet';
import { analyzeLine } from '../../core/phonetics/line';
import { phonemeCounts, repeatedWords, vowelHeatmap, type SoundMode } from '../../core/phonetics/sound';
import { useSettings, type PaletteName } from '../../store/settings';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { Chip, Row, SectionTitle, Segmented, Slider, ToggleRow } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import type { SongAnalysis } from '../editor/useSongAnalysis';

const MODES: { mode: SoundMode; label: string; hint: string }[] = [
  { mode: 'perfect', label: 'Perfect rhyme', hint: 'night / light' },
  { mode: 'slant', label: 'Slant rhyme', hint: 'home / alone' },
  { mode: 'multi', label: 'Multisyllabic', hint: 'fantastic / elastic' },
  { mode: 'assonance', label: 'Assonance', hint: 'shared vowel sounds' },
  { mode: 'consonance', label: 'Consonance', hint: 'repeated consonants in a line' },
  { mode: 'alliteration', label: 'Alliteration', hint: 'same first sound' },
];

export function SoundSheet({ visible, onClose, analysis }: { visible: boolean; onClose: () => void; analysis: SongAnalysis | null }) {
  const [tab, setTab] = useState<'highlight' | 'counts'>('highlight');
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sound" height={0.75} light testID="sound-sheet">
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'highlight', label: 'Highlight' },
            { value: 'counts', label: 'Counts' },
          ]}
          testID="sound-tabs"
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>{tab === 'highlight' ? <HighlightSettings /> : <Counts analysis={analysis} />}</ScrollView>
    </BottomSheet>
  );
}

function HighlightSettings() {
  const t = useTheme();
  const s = useSettings();
  const toggle = (m: SoundMode) => s.set({ soundModes: s.soundModes.includes(m) ? s.soundModes.filter((x) => x !== m) : [...s.soundModes, m], highlight: true });
  return (
    <View>
      <ToggleRow label="Highlighting" value={s.highlight} onChange={(v) => s.set({ highlight: v })} testID="sound-on" />
      {MODES.map((m) => (
        <ToggleRow key={m.mode} label={m.label} hint={m.hint} value={s.soundModes.includes(m.mode)} onChange={() => toggle(m.mode)} testID={`mode-${m.mode}`} />
      ))}
      <View style={{ paddingHorizontal: space.lg }}>
        <SectionTitle>Sensitivity</SectionTitle>
        <Row>
          <Text style={{ color: t.textDim, fontSize: font.small }}>Strict</Text>
          <View style={{ flex: 1 }}>
            <Slider value={s.sensitivity} onChange={(v) => s.set({ sensitivity: Math.round(v * 20) / 20 })} label="Sensitivity" testID="sensitivity" />
          </View>
          <Text style={{ color: t.textDim, fontSize: font.small }}>Loose</Text>
        </Row>
        <SectionTitle>Where rhymes count</SectionTitle>
        <Segmented
          value={s.scope}
          onChange={(v) => s.set({ scope: v })}
          options={[
            { value: 'end', label: 'Line endings only' },
            { value: 'all', label: 'Internal too' },
          ]}
          testID="scope"
        />
        <SectionTitle>Colours</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {(['calm', 'vivid', 'colorblind'] as PaletteName[]).map((p) => (
            <Chip key={p} label={p === 'colorblind' ? 'Colour-blind safe' : p[0].toUpperCase() + p.slice(1)} selected={s.palette === p} onPress={() => s.set({ palette: p })} testID={`palette-${p}`} />
          ))}
        </Row>
        <Row style={{ marginTop: space.md, gap: 4 }}>
          {t.palette.map((c, i) => (
            <View key={i} style={{ flex: 1, height: 16, borderRadius: 4, backgroundColor: c }} />
          ))}
        </Row>
      </View>
    </View>
  );
}

function Counts({ analysis }: { analysis: SongAnalysis | null }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const [scope, setScope] = useState<string>('song');
  const names = useMemo(() => (doc ? sectionDisplayNames(doc.sections) : []), [doc]);
  const data = useMemo(() => {
    if (!doc) return null;
    const sections = scope === 'song' ? doc.sections : doc.sections.filter((s) => s.id === scope);
    const lines = sections.flatMap((s) => s.lines.map((l) => analyzeLine(l.text)));
    const heat = vowelHeatmap(doc.sections.map((s) => s.lines.map((l) => analyzeLine(l.text))));
    return { phonemes: phonemeCounts(lines), words: repeatedWords(lines), heat, syllables: lines.reduce((n, l) => n + l.syllables.length, 0) };
  }, [doc, scope]);
  if (!doc || !data) return null;
  const families = analysis?.families ?? [];
  const maxPh = data.phonemes[0]?.count ?? 1;
  const maxHeat = Math.max(1, ...data.heat.flat());
  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <SectionTitle>Rhyme families · {families.length}</SectionTitle>
      {families.length === 0 && <Text style={{ color: t.textDim }}>No rhymes found yet.</Text>}
      {families.map((f) => (
        <Row key={f.id} style={{ marginBottom: 6, alignItems: 'flex-start' }}>
          <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: t.palette[f.color % t.palette.length], marginTop: 3 }} />
          <Text style={{ color: t.text, flex: 1, fontSize: font.body }}>
            {f.label}
            <Text style={{ color: t.textDim }}>
              {'  '}
              {f.members.length} {f.members.length === 1 ? 'member' : 'members'}
              {f.kind === 'slant' ? ' · slant' : ''}
            </Text>
          </Text>
        </Row>
      ))}

      <SectionTitle>Phonemes</SectionTitle>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
        <Chip label="Whole song" selected={scope === 'song'} onPress={() => setScope('song')} />
        {doc.sections.map((s, i) => (
          <Chip key={s.id} label={names[i]} selected={scope === s.id} onPress={() => setScope(s.id)} />
        ))}
      </Row>
      <Text style={{ color: t.textDim, fontSize: font.small, marginBottom: space.sm }}>{data.syllables} syllables</Text>
      <View style={styles.phGrid} testID="phoneme-counts">
        {data.phonemes.map((p) => {
          const info = PHONES[p.code];
          return (
            <View key={p.code} style={[styles.ph, { backgroundColor: t.surface2 }]} accessibilityLabel={`${info.arpa} as in ${info.example}: ${p.count}`}>
              <View style={[StyleSheet.absoluteFill, { borderRadius: radius.sm, backgroundColor: info.vowel ? t.accent : t.textDim, opacity: 0.08 + (p.count / maxPh) * 0.35 }]} />
              <Text style={{ color: t.text, fontWeight: '700', fontSize: font.small + 1 }}>/{info.ipa}/</Text>
              <Text style={{ color: t.textDim, fontSize: font.tiny }}>{info.example}</Text>
              <Text style={{ color: t.text, fontSize: font.small }}>{p.count}</Text>
            </View>
          );
        })}
      </View>

      <SectionTitle>Vowel heatmap</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View testID="vowel-heatmap">
          <Row style={{ gap: 2 }}>
            <View style={{ width: 84 }} />
            {[...VOWEL_CODES].map((v) => (
              <Text key={v} style={[styles.heatHead, { color: t.textDim }]}>
                {PHONES[v].ipa}
              </Text>
            ))}
          </Row>
          {data.heat.map((row, i) => (
            <Row key={i} style={{ gap: 2, marginTop: 2 }}>
              <Text style={{ width: 84, color: t.textDim, fontSize: font.small }} numberOfLines={1}>
                {names[i]}
              </Text>
              {row.map((n, k) => (
                <Pressable key={k} style={[styles.heatCell, { backgroundColor: n ? t.accent : t.surface2, opacity: n ? 0.2 + (n / maxHeat) * 0.8 : 1 }]} accessibilityLabel={`${names[i]}: ${n} × ${PHONES[VOWEL_CODES[k]].example}`}>
                  <Text style={{ fontSize: 10, color: n / maxHeat > 0.5 ? t.accentText : t.text }}>{n || ''}</Text>
                </Pressable>
              ))}
            </Row>
          ))}
          <Row style={{ gap: 2, marginTop: 4 }}>
            <View style={{ width: 84 }} />
            {[...VOWEL_CODES].map((v) => (
              <Text key={v} style={[styles.heatHead, { color: t.textFaint, fontSize: 9 }]}>
                {PHONES[v].example}
              </Text>
            ))}
          </Row>
        </View>
      </ScrollView>

      <SectionTitle>Most repeated words</SectionTitle>
      {data.words.length === 0 && <Text style={{ color: t.textDim }}>Nothing repeats yet.</Text>}
      <Row style={{ flexWrap: 'wrap' }} >
        {data.words.slice(0, 30).map((w) => (
          <View key={w.word} style={[styles.word, { backgroundColor: t.surface2 }]}>
            <Text style={{ color: t.text }}>
              {w.word} <Text style={{ color: t.textDim }}>×{w.count}</Text>
            </Text>
          </View>
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  phGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ph: { width: 58, paddingVertical: 6, alignItems: 'center', borderRadius: radius.sm, overflow: 'hidden' },
  heatHead: { width: 26, textAlign: 'center', fontSize: font.small },
  heatCell: { width: 26, height: 26, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  word: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
});
