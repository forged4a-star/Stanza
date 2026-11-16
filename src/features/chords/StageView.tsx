/**
 * Stage view: the chord sheet in large print, scrolling by itself at the pace
 * of the song's tempo. Touch the page to pause; the screen stays awake.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sectionDisplayNames, type SongDoc } from '../../core/model';
import { transposeChord } from '../../core/music/theory';
import { useSettings } from '../../store/settings';
import { Button, IconButton } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';
import { piecesOf } from './ChordSheetView';
import { clampSpeed, scrollVelocity, songSeconds } from './stage';

async function keepAwake(on: boolean) {
  try {
    const m = await import('expo-keep-awake');
    if (on) await m.activateKeepAwakeAsync('stage');
    else await m.deactivateKeepAwake('stage');
  } catch {
    /* not available here; the screen may dim */
  }
}

export function StagePage({ doc, onClose }: { doc: SongDoc; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const label = (c: string) => (transpose ? transposeChord(c, transpose) : c);
  const names = sectionDisplayNames(doc.sections);
  const [size, setSize] = useState(Math.max(26, settings.sheetSize + 8));
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const ref = useRef<ScrollViewInstance>(null);
  const pos = useRef(0);
  const content = useRef(0);
  const view = useRef(0);
  const seconds = useMemo(() => songSeconds(doc), [doc]);
  const hasChords = doc.sections.some((s) => s.bars.length || s.lines.some((l) => l.chords.length));

  useEffect(() => {
    void keepAwake(true);
    return () => void keepAwake(false);
  }, []);

  // time-based scrolling: position follows the clock, not the frame count
  const speedRef = useRef(speed);
  speedRef.current = speed;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const max = Math.max(0, content.current - view.current);
      const v = scrollVelocity(max, seconds, speedRef.current);
      pos.current = Math.min(max, pos.current + (v * (now - last)) / 1000);
      last = now;
      ref.current?.scrollTo({ y: pos.current, animated: false });
      if (pos.current >= max) setRunning(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, seconds]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    pos.current = e.nativeEvent.contentOffset.y;
  };
  const progress = content.current > view.current ? Math.round((pos.current / (content.current - view.current)) * 100) : 0;

  return (
    <>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }} testID="stage-view">
        <View style={[styles.bar, { borderBottomColor: t.border }]}>
          <IconButton icon="close" label="Close stage view" onPress={onClose} testID="stage-close" />
          <Text style={{ flex: 1, color: t.text, fontSize: font.body, fontWeight: '700' }} numberOfLines={1}>
            {doc.song.title || 'Untitled'}
          </Text>
          <Text style={{ color: t.textDim, fontSize: font.small }} testID="stage-progress">{`${Math.round(speed * 100)}%`}</Text>
        </View>
        <ScrollView
          ref={ref}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 400 }}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onLayout={(e: LayoutChangeEvent) => (view.current = e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => (content.current = h)}
          onScrollBeginDrag={() => setRunning(false)}
          testID="perform-scroll"
        >
          {doc.sections.map((s, i) => (
            <View key={s.id} style={{ marginBottom: size }}>
              <Text style={{ color: t.textDim, fontSize: size * 0.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{names[i]}</Text>
              {showChords && s.bars.length > 0 && (
                <Text style={{ color: t.chord, fontSize: size * 0.8, fontWeight: '700', marginBottom: 6 }}>{s.bars.map((b) => b.chords.map(label).join(' ') || '·').join('  |  ')}</Text>
              )}
              {s.lines.map((l) =>
                !l.text.trim() ? (
                  <View key={l.id} style={{ height: size * 0.8 }} />
                ) : (
                  <View key={l.id} style={styles.line}>
                    {(piecesOf(l).length ? piecesOf(l) : [{ syl: 0, text: l.text, chord: undefined, wordSyls: [] }]).map((p, k) => (
                      <View key={k} style={{ alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                        <Text style={{ color: t.chord, fontWeight: '800', fontSize: size * 0.8, minHeight: size * 1.1 }}>{showChords && p.chord ? label(p.chord) : ' '}</Text>
                        <Text style={{ color: t.text, fontSize: size, lineHeight: size * 1.3 }}>{p.text}</Text>
                      </View>
                    ))}
                  </View>
                )
              )}
            </View>
          ))}
        </ScrollView>
        <View style={[styles.controls, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: insets.bottom + space.sm }]}>
          {hasChords && <Button compact title={showChords ? 'Chords on' : 'Chords off'} onPress={() => setShowChords((v) => !v)} testID="stage-chords" />}
          {hasChords && showChords && <Button compact title={transpose > 0 ? `+${transpose}` : `${transpose}`} onPress={() => setTranspose((x) => (x >= 6 ? -5 : x + 1))} testID="stage-transpose" />}
          <Button compact title="A−" onPress={() => setSize((s) => Math.max(18, s - 2))} testID="stage-smaller" />
          <Button compact title="A+" onPress={() => setSize((s) => Math.min(60, s + 2))} testID="stage-larger" />
          <Button compact title="Slower" onPress={() => setSpeed((s) => clampSpeed(s - 0.1))} testID="stage-slower" />
          <Button compact title="Faster" onPress={() => setSpeed((s) => clampSpeed(s + 0.1))} testID="stage-faster" />
          <Button
            compact
            icon="refresh"
            title="Top"
            onPress={() => {
              setRunning(false);
              pos.current = 0;
              ref.current?.scrollTo({ y: 0, animated: false });
            }}
            testID="stage-top"
          />
          <Button kind="primary" icon={running ? 'pause' : 'play'} title={running ? 'Pause' : 'Scroll'} onPress={() => setRunning((r) => !r)} testID="perform-play" style={{ minWidth: 110 }} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 6 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
