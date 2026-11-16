/**
 * Performance mode: big type, screen stays awake, auto-scroll paced by the
 * song's tempo (one line per bar by default), lyrics or chord chart view.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { openSong } from '../../features/nav/openSong';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sectionDisplayNames, type SongDoc } from '../../core/model';
import { lineSegments } from '../../core/export/formats';
import { transposeChord } from '../../core/music/theory';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { Icon, IconButton, Row, Segmented } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';

export default function Perform() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [doc, setDoc] = useState<SongDoc | null>(null);
  const [view, setView] = useState<'lyrics' | 'chords'>('lyrics');
  const [playing, setPlaying] = useState(false);
  const [barsPerLine, setBarsPerLine] = useState(1);
  const [size, setSize] = useState(30);
  const [transpose, setTranspose] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);
  const y = useRef(0);
  const lineH = useRef(size * 1.5);
  const contentH = useRef(0);
  const viewH = useRef(0);

  useEffect(() => {
    void getDb().then((db) => repo.loadSong(db, id!)).then(setDoc);
  }, [id]);

  useEffect(() => {
    lineH.current = size * 1.45 + 6;
  }, [size]);

  // scroll speed: one line per `barsPerLine` bars at the song's tempo
  useEffect(() => {
    if (!playing || !doc) return;
    const [beats, unit] = doc.song.timeSig;
    const secPerBar = (beats * (4 / unit) * 60) / doc.song.bpm;
    let last = Date.now();
    const iv = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      y.current = Math.min(Math.max(0, contentH.current - viewH.current), y.current + (lineH.current / (secPerBar * barsPerLine)) * dt);
      scroll.current?.scrollTo({ y: y.current, animated: false });
    }, 33);
    return () => clearInterval(iv);
  }, [playing, doc, barsPerLine]);

  if (!doc) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const names = sectionDisplayNames(doc.sections);
  const hasChords = doc.sections.some((s) => s.bars.length || s.lines.some((l) => l.chords.length));
  const tr = (c: string) => (transpose ? transposeChord(c, transpose) : c);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <Row style={{ paddingHorizontal: space.xs }}>
        <IconButton icon="close" label="Leave performance mode" onPress={() => (router.canGoBack() ? router.back() : openSong(id))} />
        <Text style={{ flex: 1, color: t.textDim, fontSize: font.body }} numberOfLines={1}>
          {doc.song.title || 'Untitled'} · {Math.round(doc.song.bpm)} bpm
        </Text>
        <IconButton icon="remove" label="Smaller text" onPress={() => setSize(Math.max(18, size - 3))} />
        <IconButton icon="add" label="Larger text" onPress={() => setSize(Math.min(56, size + 3))} />
      </Row>
      {hasChords && (
        <View style={{ paddingHorizontal: space.lg }}>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'lyrics', label: 'Lyrics' },
              { value: 'chords', label: 'Chord chart' },
            ]}
          />
        </View>
      )}
      <ScrollView
        ref={scroll}
        onScroll={(e) => (y.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        onLayout={(e: LayoutChangeEvent) => (viewH.current = e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => (contentH.current = h)}
        contentContainerStyle={{ padding: space.xl, paddingBottom: 400 }}
        testID="perform-scroll"
      >
        {doc.sections.map((s, i) => (
          <View key={s.id} style={{ marginBottom: size }}>
            <Text style={{ color: t.textFaint, fontSize: size * 0.45, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{names[i]}</Text>
            {view === 'chords' && s.bars.length > 0 && <Text style={{ color: t.chord, fontSize: size * 0.6, fontWeight: '700', marginVertical: 4 }}>{s.bars.map((b) => b.chords.map(tr).join(' ')).join('  |  ')}</Text>}
            {s.lines.map((l) =>
              view === 'chords' && l.chords.length ? (
                <View key={l.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {lineSegments(l.text, l.chords, transpose).map((seg, k) => (
                    <View key={k}>
                      <Text style={{ color: t.chord, fontSize: size * 0.55, fontWeight: '700', minHeight: size * 0.7 }}>{seg.chord ?? ' '}</Text>
                      <Text style={{ color: t.text, fontSize: size, lineHeight: size * 1.45 }}>{seg.text}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text key={l.id} style={{ color: t.text, fontSize: size, lineHeight: size * 1.45 }}>
                  {l.text || ' '}
                </Text>
              )
            )}
          </View>
        ))}
      </ScrollView>
      <View style={[styles.controls, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable onPress={() => setBarsPerLine(Math.max(0.5, barsPerLine / 2))} style={[styles.pill, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel="Scroll faster">
          <Text style={{ color: t.text }}>faster</Text>
        </Pressable>
        <Pressable
          onPress={() => setPlaying(!playing)}
          style={[styles.play, { backgroundColor: t.accent }]}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause scrolling' : 'Start scrolling'}
          testID="perform-play"
        >
          <Icon name={playing ? 'pause' : 'play'} size={30} color={t.accentText} />
        </Pressable>
        <Pressable onPress={() => setBarsPerLine(Math.min(8, barsPerLine * 2))} style={[styles.pill, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel="Scroll slower">
          <Text style={{ color: t.text }}>slower</Text>
        </Pressable>
        {view === 'chords' && (
          <Pressable onPress={() => setTranspose(transpose >= 6 ? -5 : transpose + 1)} style={[styles.pill, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel="Transpose up">
            <Text style={{ color: t.text }}>{transpose > 0 ? `+${transpose}` : transpose}</Text>
          </Pressable>
        )}
      </View>
      <Text style={{ position: 'absolute', bottom: insets.bottom + 90, alignSelf: 'center', color: t.textFaint, fontSize: font.small }}>
        {barsPerLine === 1 ? '1 line per bar' : `1 line per ${barsPerLine} bars`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingTop: space.sm },
  play: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, justifyContent: 'center' },
});
