/** A take's pitch curve with the words of its line laid along it: where the melody rises, falls, sits high or low. */
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import type { Contour, WordMove } from '../../core/dsp/contour';
import { font, radius, space, useTheme } from '../../ui/theme';

const H = 120;
const ARROW = { rises: '↗', falls: '↘', holds: '→' } as const;

export function ContourView({ contour, words }: { contour: Contour; words: WordMove[] }) {
  const t = useTheme();
  const [w, setW] = useState(300);
  const voiced = contour.bins.filter((b): b is number => b !== null);
  if (!voiced.length) return <Text style={{ color: t.textDim }}>No clear pitch was found in this take.</Text>;
  const lo = Math.min(...voiced) - 1.5;
  const hi = Math.max(...voiced) + 1.5;
  const n = contour.bins.length;
  const x = (i: number) => 6 + ((w - 12) * (i + 0.5)) / n;
  const y = (m: number) => 8 + (1 - (m - lo) / Math.max(1, hi - lo)) * (H - 36);
  let d = '';
  let pen = false;
  contour.bins.forEach((b, i) => {
    if (b === null) {
      pen = false;
      return;
    }
    d += `${pen ? ' L' : 'M'}${x(i).toFixed(1)},${y(b).toFixed(1)}`;
    pen = true;
  });
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.max(120, e.nativeEvent.layout.width))} style={{ marginTop: space.sm }} testID="contour">
      <View style={{ backgroundColor: t.surface2, borderRadius: radius.md }}>
        <Svg width={w} height={H}>
          {words.map((m, i) => (
            <Line key={'d' + i} x1={x(m.from) - w / n / 2} x2={x(m.from) - w / n / 2} y1={4} y2={H - 4} stroke={t.border} strokeDasharray="2 4" />
          ))}
          <Path d={d} stroke={t.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {words.map((m, i) => (
            <SvgText key={'w' + i} x={(x(m.from) + x(Math.max(m.from, m.to - 1))) / 2} y={H - 10} fontSize={11} fill={t.text} textAnchor="middle">
              {m.word.length > 9 ? m.word.slice(0, 8) + '…' : m.word}
            </SvgText>
          ))}
        </Svg>
      </View>
      {words.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }} testID="contour-words">
          {words.map((m, i) =>
            m.move ? (
              <Text key={i} style={{ color: t.textDim, fontSize: font.small + 1 }}>
                <Text style={{ color: t.text, fontWeight: '600' }}>{m.word}</Text> {ARROW[m.move]} {m.level}
              </Text>
            ) : null
          )}
        </View>
      )}
      <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: 4 }}>The words are spread evenly along what you sang, so this is a guide, not exact timing.</Text>
    </View>
  );
}
