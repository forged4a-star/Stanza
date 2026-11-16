/**
 * Energy map: draw the energy arc you want (drag a dot up or down), and see the
 * arc the song actually has (melody height, rhythm, chord pace, line length).
 * Where they disagree it says which lever to pull. It never suggests words.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { energyMap } from '../../core/lyrics/shape';
import { sectionDisplayNames } from '../../core/model';
import { useSong } from '../../store/song';
import { font, radius, space, useTheme } from '../../ui/theme';

const H = 190;
const PAD_X = 28;
const TOP = 16;
const BOTTOM = 34;

export function EnergyMap() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const { width } = useWindowDimensions();
  const W = Math.min(width - space.lg * 2, 700);
  const names = sectionDisplayNames(doc.sections);
  const points = useMemo(() => energyMap(doc.sections, doc.song.timeSig), [doc]);
  const n = doc.sections.length;
  const xOf = (i: number) => (n === 1 ? W / 2 : PAD_X + (i * (W - PAD_X * 2)) / (n - 1));
  const yOf = (v: number) => TOP + (1 - v) * (H - TOP - BOTTOM);

  // drag: the section nearest the finger takes the height under it
  const geo = useRef({ W, n, sections: doc.sections });
  geo.current = { W, n, sections: doc.sections };
  const [dragging, setDragging] = useState<number | null>(null);
  const apply = (x: number, y: number) => {
    const g = geo.current;
    if (!g.n) return;
    const step = g.n === 1 ? 1 : (g.W - PAD_X * 2) / (g.n - 1);
    const i = g.n === 1 ? 0 : Math.max(0, Math.min(g.n - 1, Math.round((x - PAD_X) / step)));
    const v = Math.max(0, Math.min(1, 1 - (y - TOP) / (H - TOP - BOTTOM)));
    setDragging(i);
    useSong.getState().updateSection(g.sections[i].id, { intensity: Math.round(v * 20) / 20 });
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => apply(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => apply(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderRelease: () => setDragging(null),
      onPanResponderTerminate: () => setDragging(null),
    })
  ).current;

  const line = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? ' L' : 'M'}${xOf(i)},${yOf(v)}`;
      pen = true;
    });
    return d;
  };
  const intended = points.map((p) => p.intended);
  const measured = points.map((p) => p.measured);
  const drawn = doc.sections.filter((s) => s.intensity !== null).length;
  const flagged = points.filter((p) => p.advice);

  if (n < 2) return <Text style={{ color: t.textDim }}>Add a second section to see how the energy moves through the song.</Text>;
  return (
    <View testID="energy-map">
      <Text style={{ color: t.textDim, fontSize: font.small }}>
        Drag the dots to draw the energy you want in each part. The thin line is what the song does now: melody height, rhythm, chord pace and line length. Both are relative, so it shows the shape of the song.
      </Text>
      <View style={{ marginVertical: space.md, backgroundColor: t.surface2, borderRadius: radius.md }} {...pan.panHandlers} testID="energy-chart" accessible accessibilityLabel="Energy chart. Drag a section's dot up or down to set how intense it should be.">
        <Svg width={W} height={H} pointerEvents="none">
          <Line x1={PAD_X} x2={W - PAD_X} y1={yOf(0.5)} y2={yOf(0.5)} stroke={t.border} strokeDasharray="3 5" />
          <Path d={line(measured)} stroke={t.textDim} strokeWidth={2} fill="none" />
          {drawn >= 2 && <Path d={line(intended)} stroke={t.accent} strokeWidth={3} fill="none" />}
          {points.map((p, i) =>
            p.measured === null ? null : <Circle key={'m' + i} cx={xOf(i)} cy={yOf(p.measured)} r={4} fill={t.textDim} />
          )}
          {doc.sections.map((s, i) => {
            const v = s.intensity === null ? null : intended[i] ?? s.intensity;
            return v === null ? (
              <Circle key={'i' + i} cx={xOf(i)} cy={yOf(0.5)} r={9} fill="none" stroke={t.accent} strokeWidth={2} strokeDasharray="3 3" />
            ) : (
              <Circle key={'i' + i} cx={xOf(i)} cy={yOf(v)} r={dragging === i ? 12 : 9} fill={t.accent} />
            );
          })}
          {names.map((nm, i) => (
            <SvgText key={'n' + i} x={xOf(i)} y={H - 10} fontSize={10} fill={t.textDim} textAnchor="middle">
              {nm.length > 10 ? nm.slice(0, 9) + '…' : nm}
            </SvgText>
          ))}
        </Svg>
      </View>
      <Text style={{ color: t.textFaint, fontSize: font.small }}>● your arc   ● what the song does now</Text>
      {drawn < 2 ? (
        <Text style={{ color: t.textDim, marginTop: space.md }}>Set the energy of at least two sections to compare. Dashed circles are sections you have not set yet.</Text>
      ) : flagged.length === 0 ? (
        <Text style={{ color: t.text, marginTop: space.md }} testID="energy-ok">The song's energy follows the arc you drew.</Text>
      ) : (
        <View style={{ marginTop: space.md, gap: space.sm }} testID="energy-advice">
          {flagged.map((p) => (
            <View key={p.index} style={{ padding: space.md, borderRadius: radius.md, backgroundColor: t.surface2 }}>
              <Text style={{ color: t.text, fontWeight: '700' }}>{names[p.index]}</Text>
              <Text style={{ color: t.textDim, fontSize: font.small + 1, marginTop: 2 }}>{p.advice}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
