/**
 * Write to the tune: each phrase of the melody shows its beat skeleton (big
 * dots for strong notes, small for weak). Type words under it and every
 * syllable lands on its note, green if it sits well and red if its stress
 * fights the beat. Nothing is suggested; it only tells you how your words fit.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import type { SectionWithLines } from '../../core/model';
import { autoLink } from '../../core/music/melody';
import { fitWords, phrasesOf, type FitStatus, type Phrase } from '../../core/music/skeleton';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { alpha } from '../../ui/color';
import { toast } from '../../ui/Dialogs';
import { Button, Card, Row } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';
import { playScope, stopPlayer, usePlayer } from '../chords/player';

const PIP = { strong: 20, medium: 14, weak: 8 } as const;

export function FitSheet({ visible, onClose, section }: { visible: boolean; onClose: () => void; section: SectionWithLines }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const playing = usePlayer((p) => p.playing && p.scope === section.id);
  const phrases = useMemo(() => (doc ? phrasesOf(section.melody, doc.song.timeSig) : []), [section.melody, doc?.song.timeSig]);
  const [texts, setTexts] = useState<string[]>([]);

  // start from the lines you already have, one per phrase
  useEffect(() => {
    if (visible) setTexts(phrases.map((_, i) => section.lines[i]?.text ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const color = (s: FitStatus | 'empty') => (s === 'good' ? t.ok : s === 'ok' ? t.textDim : s === 'bad' ? t.danger : t.textFaint);

  const use = () => {
    const st = useSong.getState();
    const lines = section.lines.map((l) => l.text);
    phrases.forEach((_, i) => (lines[i] = texts[i] ?? ''));
    if (!st.setSectionText(section.id, lines.join('\n'))) return toast('A locked line is in the way. Unlock it first.');
    // the notes now follow the new words, in order
    const fresh = useSong.getState().doc?.sections.find((s) => s.id === section.id);
    if (fresh) st.setMelody(section.id, autoLink(fresh.melody, fresh.lines));
    stopPlayer();
    toast('Words added and linked to the notes');
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        stopPlayer();
        onClose();
      }}
      title="Write to the tune"
      height={0.88}
      light
      testID="fit-sheet"
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }} keyboardShouldPersistTaps="handled">
        {!phrases.length ? (
          <Text style={{ color: t.textDim }}>Hum or draw a melody on the piano roll first. Then you can write words that fit it here.</Text>
        ) : (
          <>
            <Text style={{ color: t.textDim, fontSize: font.small }}>
              Big dots are strong beats, small dots are weak. Say a word with its stress on a big dot.
            </Text>
            <Button compact icon={playing ? 'stop' : 'play'} title={playing ? 'Stop' : 'Hear the tune'} onPress={() => (playing ? stopPlayer() : playScope(section.id))} testID="fit-play" />
            {phrases.map((p, i) => (
              <PhraseCard key={i} phrase={p} text={texts[i] ?? ''} onText={(v) => setTexts((cur) => cur.map((x, k) => (k === i ? v : x)))} color={color} />
            ))}
            <Button kind="primary" title="Use these words" icon="checkmark" onPress={use} testID="fit-use" />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function PhraseCard({ phrase, text, onText, color }: { phrase: Phrase; text: string; onText: (v: string) => void; color: (s: FitStatus | 'empty') => string }) {
  const t = useTheme();
  const fit = fitWords(phrase, text);
  const extra = fit.syllables.filter((s) => s.slot === null);
  const i = phrase.index;
  return (
    <Card testID={`fit-phrase-${i}`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 4 }}>
        {phrase.slots.map((s, k) => {
          const syl = fit.syllables.find((x) => x.slot === k);
          const status = syl ? syl.status : 'empty';
          return (
            <View key={k} style={{ alignItems: 'center', minWidth: 34, gap: 4 }} testID={`fit-slot-${i}-${k}`} accessibilityLabel={`${s.cls} note${syl ? `, ${syl.text}, ${syl.status}` : ', empty'}`}>
              <View style={{ width: PIP[s.cls], height: PIP[s.cls], borderRadius: PIP[s.cls] / 2, backgroundColor: s.cls === 'weak' ? alpha(t.accent, 0.5) : t.accent }} />
              <Text style={{ color: color(status), fontSize: font.small + 1, fontWeight: status === 'bad' ? '700' : '500', minHeight: 18 }} numberOfLines={1} testID={`fit-syl-${i}-${k}`}>
                {syl ? syl.text : '·'}
              </Text>
            </View>
          );
        })}
        {extra.map((s, k) => (
          <View key={'x' + k} style={{ alignItems: 'center', minWidth: 30, gap: 4 }}>
            <Text style={{ color: t.danger, fontWeight: '700' }}>+</Text>
            <Text style={{ color: t.danger, fontSize: font.small + 1 }}>{s.text}</Text>
          </View>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={onText}
        placeholder={`Write words for these ${phrase.slots.length} notes…`}
        placeholderTextColor={t.textFaint}
        style={{ marginTop: space.sm, minHeight: 44, borderRadius: t.r.md, paddingHorizontal: space.md, backgroundColor: t.surface2, color: t.text, fontSize: font.body, borderWidth: 1, borderColor: t.border }}
        accessibilityLabel={`Words for phrase ${i + 1}`}
        testID={`fit-input-${i}`}
      />
      <Row style={{ marginTop: 6 }}>
        <Text style={{ color: fit.fits ? t.ok : t.textDim, fontSize: font.small, fontWeight: fit.fits ? '700' : '400', flex: 1 }} testID={`fit-summary-${i}`}>
          {fit.fits ? 'Fits the tune · ' : ''}
          {fit.summary}
        </Text>
      </Row>
    </Card>
  );
}
