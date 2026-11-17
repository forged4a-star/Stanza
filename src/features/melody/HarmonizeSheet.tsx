/**
 * Harmonize my melody: three ways to put chords under the notes of a section,
 * each ranked by how well it supports the tune. Hear the melody over each one,
 * then keep the one you like.
 */
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { harmonize, guessKey, type HarmonyOption } from '../../core/music/harmonize';
import type { SectionWithLines } from '../../core/model';
import { keyName, parseKey } from '../../core/music/theory';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { alpha } from '../../ui/color';
import { confirm, toast } from '../../ui/Dialogs';
import { Button, Card, Chip, Row } from '../../ui/kit';
import { displayText, font, space, useTheme } from '../../ui/theme';
import { playScope, stopPlayer, usePlayer } from '../chords/player';

export function HarmonizeSheet({ visible, onClose, section }: { visible: boolean; onClose: () => void; section: SectionWithLines }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const playing = usePlayer((p) => p.playing && p.scope === 'harmony-preview');
  const [perBar, setPerBar] = useState<1 | 2>(1);
  const [heard, setHeard] = useState<number | null>(null);
  const songKey = parseKey(doc?.song.key);
  const key = songKey ?? (section.melody.length ? guessKey(section.melody) : null);
  const options = useMemo(
    () => (visible && doc ? harmonize(section.melody, { key: songKey, timeSig: doc.song.timeSig, chordsPerBar: perBar }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, section.melody, doc?.song.key, doc?.song.timeSig, perBar]
  );

  const play = (o: HarmonyOption, i: number) => {
    if (playing && heard === i) return stopPlayer();
    setHeard(i);
    playScope('harmony-preview', { bars: o.bars, melodyOf: section.id, loop: false });
  };

  const use = async (o: HarmonyOption) => {
    if (section.bars.length && !(await confirm('Replace the chords in this section?', 'The chords you have now will be replaced. You can undo this from Versions.', 'Replace'))) return;
    stopPlayer();
    useSong.getState().setBars(section.id, o.bars);
    // a song with no key yet takes the key the tune was heard in
    if (!songKey && key) useSong.getState().setMeta({ key: keyName(key) });
    toast(`${o.label} chords added`);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        stopPlayer();
        onClose();
      }}
      title="Harmonize my melody"
      height={0.86}
      light
      testID="harmonize-sheet"
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }}>
        {!section.melody.length ? (
          <Text style={{ color: t.textDim }}>Hum or draw a melody on the piano roll first. Then this finds chords that fit it.</Text>
        ) : (
          <>
            <Text style={{ color: t.textDim, fontSize: font.small }} testID="harmonize-key">
              Key: {key ? keyName(key, true) : 'unknown'} {songKey ? '(your song)' : '(heard from the tune)'}
            </Text>
            <Row>
              <Chip label="Chord every bar" selected={perBar === 1} onPress={() => setPerBar(1)} testID="harmonize-1" />
              <Chip label="Chord every half bar" selected={perBar === 2} onPress={() => setPerBar(2)} testID="harmonize-2" />
            </Row>
            {options.map((o, i) => (
              <Card key={o.style} testID={`harmony-${o.style}`}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={[{ color: t.text }, displayText(t, 19)]}>{o.label}</Text>
                  <Text style={{ color: t.textDim, fontSize: font.small }} testID={`harmony-fit-${o.style}`}>
                    Fits {Math.round(o.fit * 100)}% of your melody
                  </Text>
                </Row>
                <Text style={{ color: t.textDim, fontSize: font.small, marginTop: 2 }}>{o.blurb}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
                  {o.bars.map((b, bi) => (
                    <View key={bi} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: t.r.md, backgroundColor: alpha(t.accent, 0.13) }}>
                      <Text style={{ color: t.chord, fontWeight: '700' }}>{b.chords.join(' ')}</Text>
                    </View>
                  ))}
                </View>
                <Row style={{ marginTop: space.md }}>
                  <Button compact icon={playing && heard === i ? 'stop' : 'play'} title={playing && heard === i ? 'Stop' : 'Hear it'} onPress={() => play(o, i)} testID={`harmony-play-${o.style}`} />
                  <Button compact kind="primary" title="Use these chords" onPress={() => void use(o)} testID={`harmony-use-${o.style}`} />
                </Row>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
