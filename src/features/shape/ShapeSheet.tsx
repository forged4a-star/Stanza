/**
 * Song shape: the feeling map (each section's feeling in the writer's words,
 * drawn as an arc), the contrast meter (verse vs chorus) and questions that
 * help you say what you mean. Nothing here writes lyrics.
 */
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { compareSections, defaultContrastPair, questionsFor } from '../../core/lyrics/shape';
import { sectionDisplayNames } from '../../core/model';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { EnergyMap } from './EnergyMap';
import { Chip, Row, SectionTitle, Segmented, Slider } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';

type Tab = 'feeling' | 'energy' | 'contrast' | 'questions';

export function ShapeSheet({ visible, onClose, initialTab = 'feeling' }: { visible: boolean; onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Song shape" height={0.82} light testID="shape-sheet">
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'feeling', label: 'Feeling' },
            { value: 'energy', label: 'Energy' },
            { value: 'contrast', label: 'Contrast' },
            { value: 'questions', label: 'Questions' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        {tab === 'feeling' && <FeelingMap />}
        {tab === 'energy' && <EnergyMap />}
        {tab === 'contrast' && <ContrastMeter />}
        {tab === 'questions' && <Questions />}
      </ScrollView>
    </BottomSheet>
  );
}

function FeelingMap() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const { width } = useWindowDimensions();
  const names = sectionDisplayNames(doc.sections);
  const W = Math.min(width - space.lg * 2, 700);
  const H = 170;
  const n = doc.sections.length;
  const pts = doc.sections.map((s, i) => ({
    x: n === 1 ? W / 2 : 24 + (i * (W - 48)) / (n - 1),
    y: 30 + (1 - (s.intensity ?? 0.5)) * (H - 70),
    s,
    i,
  }));
  // smooth curve through the points
  let d = '';
  pts.forEach((p, i) => {
    if (i === 0) d = `M${p.x},${p.y}`;
    else {
      const q = pts[i - 1];
      const cx = (q.x + p.x) / 2;
      d += ` C${cx},${q.y} ${cx},${p.y} ${p.x},${p.y}`;
    }
  });
  return (
    <View>
      <Text style={{ color: t.textDim, fontSize: font.small }}>Name the feeling each section carries, in your own words, and how strongly. The arc shows the journey.</Text>
      <View style={{ marginVertical: space.md, backgroundColor: t.surface2, borderRadius: radius.md }} testID="feeling-arc">
        <Svg width={W} height={H}>
          <Path d={d} stroke={t.accent} strokeWidth={3} fill="none" />
          {pts.map((p) => (
            <Circle key={p.s.id} cx={p.x} cy={p.y} r={6} fill={p.s.feeling ? t.accent : t.surface} stroke={t.accent} strokeWidth={2} />
          ))}
          {pts.map((p) => (
            <SvgText key={'f' + p.s.id} x={p.x} y={p.y - 12} fontSize={11} fill={t.text} textAnchor="middle" fontStyle="italic">
              {p.s.feeling.slice(0, 16)}
            </SvgText>
          ))}
          {pts.map((p) => (
            <SvgText key={'n' + p.s.id} x={p.x} y={H - 8} fontSize={10} fill={t.textDim} textAnchor="middle">
              {names[p.i].length > 10 ? names[p.i].slice(0, 9) + '…' : names[p.i]}
            </SvgText>
          ))}
        </Svg>
      </View>
      {doc.sections.map((s, i) => (
        <View key={s.id} style={{ marginBottom: space.md }} testID={`feeling-${i}`}>
          <Text style={{ color: t.textDim, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 0.8 }}>{names[i].toUpperCase()}</Text>
          <TextInput
            value={s.feeling}
            onChangeText={(v) => useSong.getState().updateSection(s.id, { feeling: v })}
            placeholder="How does this part feel? (your words)"
            placeholderTextColor={t.textFaint}
            style={{ color: t.text, fontSize: font.body, minHeight: 40, borderBottomWidth: 1, borderBottomColor: t.border }}
            accessibilityLabel={`Feeling of ${names[i]}`}
            testID={`feeling-input-${i}`}
          />
          <Row>
            <Text style={{ color: t.textFaint, fontSize: font.small }}>quiet</Text>
            <View style={{ flex: 1 }}>
              <Slider value={s.intensity ?? 0.5} onChange={(v) => useSong.getState().updateSection(s.id, { intensity: Math.round(v * 20) / 20 })} label={`Intensity of ${names[i]}`} testID={`intensity-${i}`} />
            </View>
            <Text style={{ color: t.textFaint, fontSize: font.small }}>intense</Text>
          </Row>
        </View>
      ))}
    </View>
  );
}

function ContrastMeter() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const names = sectionDisplayNames(doc.sections);
  const [pair, setPair] = useState<[number, number] | null>(() => defaultContrastPair(doc.sections));
  const result = useMemo(() => (pair ? compareSections(doc.sections[pair[0]], doc.sections[pair[1]], doc.song.timeSig, [names[pair[0]], names[pair[1]]]) : null), [doc, pair, names]);
  if (!pair || !result) return <Text style={{ color: t.textDim }}>Add a second section to compare.</Text>;
  return (
    <View>
      {[0, 1].map((side) => (
        <Row key={side} style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
          <Text style={{ color: t.textDim, width: 70 }}>{side === 0 ? 'Compare' : 'with'}</Text>
          {doc.sections.map((s, i) => (
            <Chip key={s.id} label={names[i]} selected={pair[side] === i} onPress={() => setPair(side === 0 ? [i, pair[1]] : [pair[0], i])} />
          ))}
        </Row>
      ))}
      <View style={{ backgroundColor: t.surface2, borderRadius: radius.md, padding: space.md, marginVertical: space.sm }}>
        <Text style={{ color: t.text, fontSize: font.body }} testID="contrast-verdict">
          {result.verdict}
        </Text>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, marginTop: space.sm }}>
          <View style={{ width: `${Math.round(result.score * 100)}%`, height: 8, borderRadius: 4, backgroundColor: t.accent }} />
        </View>
      </View>
      {result.rows.map((r) => {
        const max = Math.max(Math.abs(r.a ?? 0), Math.abs(r.b ?? 0), 1e-9);
        const rel = r.metric === 'register' ? (v: number) => (v - 36) / 48 : (v: number) => v / max;
        return (
          <View key={r.metric} style={{ marginBottom: space.md }} testID={`contrast-${r.metric}`}>
            <Text style={{ color: t.textDim, fontSize: font.small, fontWeight: '700' }}>{r.label}</Text>
            {[r.a, r.b].map((v, k) => (
              <Row key={k} style={{ marginTop: 3 }}>
                <Text style={{ color: t.textFaint, fontSize: font.tiny, width: 70 }} numberOfLines={1}>
                  {names[pair[k]]}
                </Text>
                <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: t.surface2 }}>
                  <View style={{ width: `${Math.max(3, Math.min(100, rel(v ?? 0) * 100))}%`, height: 10, borderRadius: 5, backgroundColor: k ? t.accent : t.textDim }} />
                </View>
              </Row>
            ))}
            <Text style={{ color: t.text, fontSize: font.small, marginTop: 3 }}>{r.note}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Questions() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const names = sectionDisplayNames(doc.sections);
  const st = useSong.getState();
  const active = st.activeLineId ? doc.sections.findIndex((s) => s.lines.some((l) => l.id === st.activeLineId)) : 0;
  const [i, setI] = useState(Math.max(0, active));
  const qs = questionsFor(doc.sections[i], { name: names[i], songTitle: doc.song.title });
  return (
    <View>
      <Text style={{ color: t.textDim, fontSize: font.small }}>Questions to help you say what you mean. The words stay yours: nothing here writes lines for you.</Text>
      <Row style={{ flexWrap: 'wrap', marginVertical: space.sm }}>
        {doc.sections.map((s, k) => (
          <Chip key={s.id} label={names[k]} selected={i === k} onPress={() => setI(k)} />
        ))}
      </Row>
      <SectionTitle>{names[i]}</SectionTitle>
      <View testID="questions">
        {qs.map((q, k) => (
          <View key={k} style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            <Text style={{ color: t.accent, fontSize: font.body + 2 }}>?</Text>
            <Text style={{ color: t.text, fontSize: font.body + 1, lineHeight: 24, flex: 1 }}>{q}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
