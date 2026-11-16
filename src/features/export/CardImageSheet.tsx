/** Share part of a song as a picture: pick a section, a look and a shape. */
import { useMemo, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { CARD_MARGIN, CARD_THEMES, layoutCard, type CardRatio, type CardTheme } from '../../core/export/lyricCard';
import { sectionDisplayNames } from '../../core/model';
import { shareFile } from '../../platform/share';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { toast } from '../../ui/Dialogs';
import { Button, Chip, Row, SectionTitle, Segmented } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';
import { cardToPng, type SvgHandle } from './cardImage';

export function CardImageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const { width } = useWindowDimensions();
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [themeId, setThemeId] = useState('paper');
  const [ratio, setRatio] = useState<CardRatio>('square');
  const [busy, setBusy] = useState(false);
  const ref = useRef<SvgHandle | null>(null);
  const names = doc ? sectionDisplayNames(doc.sections) : [];
  const sections = doc?.sections.filter((s) => s.lines.some((l) => l.text.trim())) ?? [];
  const section = sections.find((s) => s.id === sectionId) ?? sections[0] ?? null;
  const theme: CardTheme = CARD_THEMES.find((x) => x.id === themeId) ?? CARD_THEMES[0];
  const layout = useMemo(
    () => (section && doc ? layoutCard(section.lines.map((l) => l.text), { title: doc.song.title || 'Untitled', theme, ratio }) : null),
    [section, doc, theme, ratio]
  );
  const W = Math.min(width - space.lg * 2, 420);
  const scale = layout ? W / layout.width : 1;

  const share = async () => {
    if (!layout || !doc) return;
    setBusy(true);
    try {
      const bytes = await cardToPng(layout, ref);
      await shareFile(`${(doc.song.title || 'lyrics').replace(/[^\w ]+/g, '').trim() || 'lyrics'} - card.png`, 'image/png', bytes);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not make the picture');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Lyric card" height={0.9} light testID="card-image-sheet">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
        {!layout || !section ? (
          <Text style={{ color: t.textDim }}>Write some lines first, then turn them into a picture.</Text>
        ) : (
          <>
            <SectionTitle>Which part</SectionTitle>
            <Row style={{ flexWrap: 'wrap' }}>
              {sections.map((s) => (
                <Chip key={s.id} label={names[doc!.sections.indexOf(s)]} selected={s.id === section.id} onPress={() => setSectionId(s.id)} testID={`cardimg-section-${doc!.sections.indexOf(s)}`} />
              ))}
            </Row>
            <SectionTitle>Look</SectionTitle>
            <Row style={{ flexWrap: 'wrap' }}>
              {CARD_THEMES.map((x) => (
                <Chip key={x.id} label={x.name} selected={x.id === theme.id} onPress={() => setThemeId(x.id)} testID={`cardimg-theme-${x.id}`} />
              ))}
            </Row>
            <View style={{ height: space.sm }} />
            <Segmented
              value={ratio}
              onChange={setRatio}
              options={[
                { value: 'square', label: 'Square' },
                { value: 'story', label: 'Tall (story)' },
              ]}
              testID="cardimg-ratio"
            />
            <View style={{ marginTop: space.md, alignItems: 'center' }} testID="cardimg-preview">
              <Svg ref={ref as never} width={layout.width * scale} height={layout.height * scale} viewBox={`0 0 ${layout.width} ${layout.height}`}>
                <Rect width={layout.width} height={layout.height} fill={theme.bg} />
                <Rect x={CARD_MARGIN} y={CARD_MARGIN} width={72} height={6} rx={3} fill={theme.accent} />
                {layout.lines
                  .filter((l) => l.text)
                  .map((l, i) => (
                    <SvgText key={i} x={CARD_MARGIN} y={l.y} fontFamily="serif" fontSize={layout.size} fill={theme.fg}>
                      {l.text}
                    </SvgText>
                  ))}
                <SvgText x={CARD_MARGIN} y={layout.height - CARD_MARGIN} fontFamily="serif" fontSize={30} fontStyle="italic" fill={theme.sub}>
                  {layout.title}
                </SvgText>
                <SvgText x={layout.width - CARD_MARGIN} y={layout.height - CARD_MARGIN} fontFamily="serif" fontSize={26} textAnchor="end" fill={theme.sub}>
                  {layout.footer}
                </SvgText>
              </Svg>
            </View>
            {layout.truncated && <Text style={{ color: t.textDim, fontSize: font.small, marginTop: space.sm }}>This part is long, so the end was cut. Pick a shorter section for a bigger card.</Text>}
            <Button title="Share picture" icon="share-outline" kind="primary" busy={busy} onPress={() => void share()} style={{ marginTop: space.md }} testID="cardimg-share" />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
