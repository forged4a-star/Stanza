/** The rhyme web: families of rhyming sounds as clusters, plus line endings that rhyme with nothing. */
import { useMemo } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { sectionDisplayNames } from '../../core/model';
import { layoutWeb, rhymeWeb } from '../../core/phonetics/web';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { font, radius, space, useTheme } from '../../ui/theme';

export function RhymeWebSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const { width } = useWindowDimensions();
  const W = Math.min(width - space.lg * 2, 700);
  const web = useMemo(() => (visible && doc ? rhymeWeb(doc.sections) : null), [visible, doc]);
  const layout = useMemo(() => (web ? layoutWeb(web, W) : null), [web, W]);
  const names = doc ? sectionDisplayNames(doc.sections) : [];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Rhyme web" height={0.85} light testID="web-sheet">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
        {!web || web.lineCount === 0 ? (
          <Text style={{ color: t.textDim }}>Write a few lines and the families of rhyming sounds will appear here.</Text>
        ) : (
          <View testID="web-body">
            <Text style={{ color: t.textDim, fontSize: font.small }}>
              Each circle is a family of rhyming sounds ({web.families.length}). Words in the same circle rhyme; a bigger cluster means that sound is doing more work.
            </Text>
            {layout && layout.families.length > 0 ? (
              <View style={{ marginTop: space.md, backgroundColor: t.surface2, borderRadius: radius.md }} testID="web-graph">
                <Svg width={W} height={layout.height}>
                  {layout.families.map(({ family, x, y, r, words }) => {
                    const fill = t.palette[family.color % t.palette.length];
                    return (
                      <G key={family.id}>
                        {words.map((w, j) => (
                          <Line key={'l' + j} x1={x} y1={y} x2={w.x} y2={w.y} stroke={t.paletteInk[family.color % t.paletteInk.length]} strokeWidth={1.2} opacity={0.6} />
                        ))}
                        <Circle cx={x} cy={y} r={family.kind === 'perfect' ? 7 : 5} fill={fill} stroke={t.paletteInk[family.color % t.paletteInk.length]} strokeWidth={family.kind === 'perfect' ? 0 : 1.5} />
                        {words.map((w, j) => (
                          <SvgText key={'w' + j} x={w.x} y={w.y + 4} fontSize={11} fill={t.text} textAnchor="middle" fontWeight={w.word.atLineEnd ? '700' : '400'}>
                            {w.word.text.slice(0, 12)}
                          </SvgText>
                        ))}
                        <SvgText x={x} y={y + r + 30} fontSize={9} fill={t.textDim} textAnchor="middle">{`${family.kind === 'perfect' ? 'perfect' : 'near'} · ${family.endings} line ending${family.endings === 1 ? '' : 's'}`}</SvgText>
                      </G>
                    );
                  })}
                </Svg>
              </View>
            ) : (
              <Text style={{ color: t.textDim, marginTop: space.md }}>No rhymes found yet.</Text>
            )}
            {web.orphans.length > 0 && (
              <View style={{ marginTop: space.lg }} testID="web-orphans">
                <Text style={{ color: t.textDim, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 0.8 }}>RHYME WITH NOTHING</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs }}>
                  {web.orphans.map((o) => (
                    <View key={o.lineIndex} style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: t.border }}>
                      <Text style={{ color: t.text }}>
                        {o.text} <Text style={{ color: t.textFaint, fontSize: font.small }}>{names[o.sectionIndex]} · {o.row}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {web.notes.length > 0 && (
              <View style={{ marginTop: space.lg, gap: space.sm }} testID="web-notes">
                {web.notes.map((n, i) => (
                  <Text key={i} style={{ color: t.text, fontSize: font.small + 1 }}>
                    • {n}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
