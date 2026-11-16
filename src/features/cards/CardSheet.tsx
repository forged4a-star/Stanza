/** Constraint cards: pick (or draw) a writing rule, see which of your lines break it. */
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CARDS, cardById, checkCard, drawCard } from '../../core/lyrics/constraints';
import { sectionDisplayNames } from '../../core/model';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button, Chip, ListItem, Row, SectionTitle } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';

/** How many lines break the card in play (null when none is in play). Used by the song menu. */
export function useCardBreaks(): { title: string; breaks: number } | null {
  const doc = useSong((s) => s.doc);
  const c = useSettings((s) => s.constraint);
  return useMemo(() => {
    const card = cardById(c?.id);
    if (!card || !doc) return null;
    const secs = c!.scope === 'song' ? doc.sections : doc.sections.filter((s) => s.id === c!.scope);
    return { title: card.title, breaks: card.check(secs).length };
  }, [doc, c]);
}

export function CardSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const settings = useSettings();
  const names = doc ? sectionDisplayNames(doc.sections) : [];
  const held = cardById(settings.constraint?.id);
  const scope = settings.constraint?.scope ?? 'song';
  const result = useMemo(() => {
    if (!doc || !held) return [];
    const secs = scope === 'song' ? doc.sections : doc.sections.filter((s) => s.id === scope);
    return checkCard(held.id, secs).map((v) => ({ ...v, name: scope === 'song' ? names[v.sectionIndex] : names[doc.sections.findIndex((s) => s.id === scope)] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, held, scope]);
  const written = doc ? (scope === 'song' ? doc.sections : doc.sections.filter((s) => s.id === scope)).flatMap((s) => s.lines).filter((l) => l.text.trim()).length : 0;
  const play = (id: string) => settings.set({ constraint: { id, scope } });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Constraint cards" height={0.82} light testID="cards-sheet">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
        <Text style={{ color: t.textDim, fontSize: font.small }}>
          A card is a rule to write inside. The app only checks your lines against it and points at the ones that break it. It never suggests words.
        </Text>
        {held ? (
          <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: t.surface2 }} testID="card-held">
            <Text style={{ color: t.textDim, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 0.8 }}>IN PLAY</Text>
            <Text style={{ color: t.text, fontSize: font.title - 2, fontWeight: '700', marginTop: 2 }}>{held.title}</Text>
            <Text style={{ color: t.text, fontSize: font.body, marginTop: 2 }}>{held.rule}</Text>
            <SectionTitle>Check</SectionTitle>
            <Row style={{ flexWrap: 'wrap' }}>
              <Chip label="Whole song" selected={scope === 'song'} onPress={() => settings.set({ constraint: { id: held.id, scope: 'song' } })} testID="card-scope-song" />
              {doc?.sections.map((s, i) => (
                <Chip key={s.id} label={names[i]} selected={scope === s.id} onPress={() => settings.set({ constraint: { id: held.id, scope: s.id } })} />
              ))}
            </Row>
            <View style={{ marginTop: space.md }} testID="card-result">
              {written === 0 ? (
                <Text style={{ color: t.textDim }}>Write a few lines and they will be checked here.</Text>
              ) : result.length === 0 ? (
                <Text style={{ color: t.text, fontWeight: '600' }} testID="card-ok">
                  All {written} lines follow the card.
                </Text>
              ) : (
                <>
                  <Text style={{ color: t.text, fontWeight: '600' }} testID="card-breaks">
                    {result.length} of {written} lines break the card
                  </Text>
                  {result.map((v) => (
                    <Text key={v.lineId} style={{ color: t.textDim, fontSize: font.small + 1, marginTop: 4 }}>
                      {v.name} · line {v.row}: {v.message}
                    </Text>
                  ))}
                </>
              )}
            </View>
            <Button title="Put the card down" onPress={() => settings.set({ constraint: null })} style={{ marginTop: space.md }} testID="card-clear" />
          </View>
        ) : null}
        <Button
          title={held ? 'Draw a different card' : 'Draw a card for me'}
          icon="shuffle"
          kind="primary"
          onPress={() => play(drawCard(Date.now() & 0x7fffffff, held?.id).id)}
          style={{ marginTop: space.md }}
          testID="card-draw"
        />
        <SectionTitle>The deck</SectionTitle>
        {CARDS.map((c) => (
          <ListItem key={c.id} title={c.title} subtitle={c.rule} icon={held?.id === c.id ? 'checkmark-circle' : 'albums-outline'} onPress={() => play(c.id)} testID={`card-${c.id}`} />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
