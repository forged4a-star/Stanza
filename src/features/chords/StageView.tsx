/**
 * Stage view: the chord sheet in large print. Two ways to read it:
 *  - scroll: it moves by itself at the pace of the song's tempo (touch to pause)
 *  - pages: like a music stand; tap the right side for the next page, left for the previous
 * High contrast gives pure black and white with yellow chords, for a dark room.
 * Open-mic mode is the same page with almost nothing on it: a count-in, then it
 * scrolls to the end, and offers the next song of a setlist.
 * The screen stays awake.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { columnsFor, paginate, spreadsOf, standBlocks, type StandBlock } from '../../core/export/standLayout';
import { sectionDisplayNames, type SongDoc } from '../../core/model';
import { keyPrefersFlats, mod12, parseKey, transposeChord } from '../../core/music/theory';
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

export interface StageColours {
  bg: string;
  text: string;
  chord: string;
  dim: string;
  surface: string;
  border: string;
}

const HIGH_CONTRAST: StageColours = { bg: '#000000', text: '#ffffff', chord: '#ffd23f', dim: '#c9c9c9', surface: '#0d0d0d', border: '#3a3a3a' };

export interface OpenMic {
  /** the song after this one in the setlist */
  next?: { title: string; detail: string } | null;
  onNext?: () => void;
  /** "Song 2 of 5" */
  position?: string;
}

export function StagePage({ doc, onClose, openMic, initialTranspose = 0 }: { doc: SongDoc; onClose: () => void; openMic?: OpenMic; initialTranspose?: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const contrast = settings.stageContrast;
  const colours: StageColours = contrast ? HIGH_CONTRAST : { bg: t.bg, text: t.text, chord: t.chord, dim: t.textDim, surface: t.surface, border: t.border };
  const pages = !openMic && settings.stageLayout === 'pages';
  const [transpose, setTranspose] = useState(initialTranspose);
  const [showChords, setShowChords] = useState(true);
  // spell moved chords to suit the new key (flats in Eb, sharps in E)
  const songKey = parseKey(doc.song.key);
  const flats = songKey ? keyPrefersFlats({ tonic: mod12(songKey.tonic + transpose), mode: songKey.mode }) : undefined;
  const label = (c: string) => (transpose ? transposeChord(c, transpose, flats) : c);
  const names = sectionDisplayNames(doc.sections);
  const [size, setSize] = useState(Math.max(26, settings.sheetSize + 8) + (openMic ? 4 : 0));
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState<number | null>(openMic ? 3 : null);
  const [finished, setFinished] = useState(false);
  const ref = useRef<ScrollViewInstance>(null);
  const pos = useRef(0);
  const content = useRef(0);
  const view = useRef(0);
  /** seconds spent scrolling since the last start (open-mic finishes when the song's time is up, even if it all fits on screen) */
  const elapsed = useRef(0);
  const seconds = useMemo(() => songSeconds(doc), [doc]);
  const hasChords = doc.sections.some((s) => s.bars.length || s.lines.some((l) => l.chords.length));

  useEffect(() => {
    void keepAwake(true);
    return () => void keepAwake(false);
  }, []);

  // open-mic: count 3, 2, 1, then go
  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      setCount(null);
      setRunning(true);
      return;
    }
    const id = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [count]);

  // time-based scrolling: position follows the clock, not the frame count
  const speedRef = useRef(speed);
  speedRef.current = speed;
  useEffect(() => {
    if (!running || pages) return;
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const max = Math.max(0, content.current - view.current);
      const v = scrollVelocity(max, seconds, speedRef.current);
      pos.current = Math.min(max, pos.current + (v * (now - last)) / 1000);
      elapsed.current += (now - last) / 1000;
      last = now;
      ref.current?.scrollTo({ y: pos.current, animated: false });
      const timeUp = !openMic || elapsed.current >= seconds / speedRef.current;
      if (pos.current >= max && timeUp) {
        setRunning(false);
        if (openMic) setFinished(true);
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, seconds, pages, openMic]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    pos.current = e.nativeEvent.contentOffset.y;
  };
  /** skip the rest of the count-in and go */
  const startNow = () => {
    setCount(null);
    setRunning(true);
  };
  const restart = () => {
    setFinished(false);
    pos.current = 0;
    elapsed.current = 0;
    ref.current?.scrollTo({ y: 0, animated: false });
    setCount(3);
  };

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colours.bg, paddingTop: insets.top }} testID="stage-view">
        <View style={[styles.bar, { borderBottomColor: colours.border }]}>
          <IconButton icon="close" label="Close stage view" onPress={onClose} color={colours.text} testID="stage-close" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colours.text, fontSize: font.body, fontWeight: '700' }} numberOfLines={1}>
              {doc.song.title || 'Untitled'}
            </Text>
            {openMic?.position && <Text style={{ color: colours.dim, fontSize: font.small }}>{openMic.position}</Text>}
          </View>
          {!openMic && !pages && (
            <Text style={{ color: colours.dim, fontSize: font.small }} testID="stage-progress">
              {`${Math.round(speed * 100)}%`}
            </Text>
          )}
          {openMic && (
            <Button compact kind="primary" icon={running ? 'pause' : 'play'} title={running ? 'Pause' : 'Go'} onPress={() => (count !== null ? startNow() : setRunning((r) => !r))} testID="mic-toggle" />
          )}
        </View>

        {pages ? (
          <StandPages doc={doc} names={names} size={size} showChords={showChords} label={label} colours={colours} />
        ) : (
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
            <StageSections doc={doc} names={names} size={size} showChords={showChords} label={label} colours={colours} />
          </ScrollView>
        )}

        {count !== null && (
          <Pressable style={styles.overlay} onPress={startNow} accessibilityLabel="Starting. Tap to start now." testID="mic-count">
            <Text style={{ color: '#ffffff', fontSize: 140, fontWeight: '800' }}>{count}</Text>
            <Text style={{ color: '#d6d6d6', fontSize: font.body }}>Tap to start now</Text>
          </Pressable>
        )}
        {finished && openMic && (
          <View style={[styles.overlay, { backgroundColor: alphaBlack(contrast) }]} testID="mic-finished">
            <Text style={{ color: '#ffffff', fontSize: 32, fontWeight: '800' }}>That's the song</Text>
            {openMic.next && (
              <Text style={{ color: '#d6d6d6', fontSize: font.body, textAlign: 'center' }} testID="mic-next-title">
                Up next: {openMic.next.title}
                {'\n'}
                {openMic.next.detail}
              </Text>
            )}
            <View style={{ gap: space.md, alignSelf: 'stretch', paddingHorizontal: space.xl }}>
              {openMic.next && openMic.onNext && <Button kind="primary" icon="play-forward" title="Start the next song" onPress={openMic.onNext} testID="mic-next" />}
              <Button title="Play this one again" icon="refresh" onPress={restart} testID="mic-again" />
              <Button title="Finish" onPress={onClose} testID="mic-done" />
            </View>
          </View>
        )}

        {!openMic && (
          <View style={[styles.controls, { backgroundColor: colours.surface, borderTopColor: colours.border, paddingBottom: insets.bottom + space.sm }]}>
            {hasChords && <Button compact title={showChords ? 'Chords on' : 'Chords off'} onPress={() => setShowChords((v) => !v)} testID="stage-chords" />}
            {hasChords && showChords && <Button compact title={transpose > 0 ? `+${transpose}` : `${transpose}`} onPress={() => setTranspose((x) => (x >= 6 ? -5 : x + 1))} testID="stage-transpose" />}
            <Button compact title="A−" onPress={() => setSize((s) => Math.max(18, s - 2))} testID="stage-smaller" />
            <Button compact title="A+" onPress={() => setSize((s) => Math.min(60, s + 2))} testID="stage-larger" />
            <Button compact icon={contrast ? 'contrast' : 'contrast-outline'} title={contrast ? 'High contrast on' : 'High contrast'} onPress={() => settings.set({ stageContrast: !contrast })} testID="stage-contrast" />
            <Button compact icon={pages ? 'albums' : 'albums-outline'} title={pages ? 'Pages' : 'Scrolling'} onPress={() => settings.set({ stageLayout: pages ? 'scroll' : 'pages' })} testID="stage-layout" />
            {!pages && (
              <>
                <Button compact title="Slower" onPress={() => setSpeed((s) => clampSpeed(s - 0.1))} testID="stage-slower" />
                <Button compact title="Faster" onPress={() => setSpeed((s) => clampSpeed(s + 0.1))} testID="stage-faster" />
                <Button
                  compact
                  icon="refresh"
                  title="Top"
                  onPress={() => {
                    setRunning(false);
                    pos.current = 0;
                    elapsed.current = 0;
                    ref.current?.scrollTo({ y: 0, animated: false });
                  }}
                  testID="stage-top"
                />
                <Button kind="primary" icon={running ? 'pause' : 'play'} title={running ? 'Pause' : 'Scroll'} onPress={() => setRunning((r) => !r)} testID="perform-play" style={{ minWidth: 110 }} />
              </>
            )}
          </View>
        )}
      </View>
    </>
  );
}

const alphaBlack = (contrast: boolean) => (contrast ? 'rgba(0,0,0,0.94)' : 'rgba(0,0,0,0.86)');

// ------------------------------------------------------------------ pages

function StandPages({ doc, names, size, showChords, label, colours }: { doc: SongDoc; names: string[]; size: number; showChords: boolean; label: (c: string) => string; colours: StageColours }) {
  const { width: winW } = useWindowDimensions();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [spread, setSpread] = useState(0);
  const cols = columnsFor(box.w || winW);
  const GAP = space.xl;
  const PAD = space.lg;
  const colW = Math.max(160, ((box.w || winW) - PAD * 2 - GAP * (cols - 1)) / cols);
  const pageH = Math.max(120, box.h - PAD * 2 - 24);
  const pages = useMemo(() => paginate(standBlocks(doc, { size, colWidth: colW, showChords }), pageH), [doc, size, colW, showChords, pageH]);
  const spreads = useMemo(() => spreadsOf(pages, cols), [pages, cols]);
  const at = Math.min(spread, Math.max(0, spreads.length - 1));
  useEffect(() => setSpread((s) => Math.min(s, Math.max(0, spreads.length - 1))), [spreads.length]);
  const go = (d: number) => setSpread((s) => Math.max(0, Math.min(spreads.length - 1, s + d)));

  return (
    <View style={{ flex: 1 }} testID="stage-pages" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View style={{ flex: 1, flexDirection: 'row', gap: GAP, padding: PAD, overflow: 'hidden' }}>
        {(spreads[at] ?? []).map((page, i) => (
          <View key={i} style={{ width: colW, height: pageH, overflow: 'hidden' }} testID={`stage-page-${at * cols + i}`}>
            {page.map((b, k) => (
              <BlockView key={k} block={b} doc={doc} names={names} size={size} showChords={showChords} label={label} colours={colours} />
            ))}
          </View>
        ))}
      </View>
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]} pointerEvents="box-none">
        <Pressable style={{ flex: 2 }} onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Previous page" testID="stage-prev" />
        <Pressable style={{ flex: 3 }} onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Next page" testID="stage-next" />
      </View>
      <Text style={{ position: 'absolute', bottom: 4, alignSelf: 'center', color: colours.dim, fontSize: font.small }} pointerEvents="none" testID="stage-page-count">
        {spreads.length ? `Page ${at + 1} of ${spreads.length}` : ''}
      </Text>
    </View>
  );
}

function BlockView({ block, doc, names, size, showChords, label, colours }: { block: StandBlock; doc: SongDoc; names: string[]; size: number; showChords: boolean; label: (c: string) => string; colours: StageColours }) {
  const t = useTheme();
  const s = doc.sections[block.section];
  switch (block.kind) {
    case 'header':
      return <StageHeader name={names[block.section]} size={size} colours={colours} />;
    case 'bars':
      return <StageBars bars={s.bars} size={size} label={label} colours={colours} />;
    case 'line':
      return <StageLine line={s.lines[block.line!]} size={size} showChords={showChords} label={label} colours={colours} lyricFont={t.fonts.lyric} />;
    case 'blank':
      return <View style={{ height: size * 0.8 }} />;
    default:
      return <View style={{ height: size }} />;
  }
}

// ------------------------------------------------------------------ pieces

function StageHeader({ name, size, colours, active }: { name: string; size: number; colours: StageColours; active?: boolean }) {
  return <Text style={{ color: active ? colours.chord : colours.dim, fontSize: size * 0.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{name}</Text>;
}

function StageBars({ bars, size, label, colours }: { bars: SongDoc['sections'][number]['bars']; size: number; label: (c: string) => string; colours: StageColours }) {
  return <Text style={{ color: colours.chord, fontSize: size * 0.8, fontWeight: '700', marginBottom: 6 }}>{bars.map((b) => b.chords.map(label).join(' ') || '·').join('  |  ')}</Text>;
}

function StageLine({ line, size, showChords, label, colours, lyricFont }: { line: SongDoc['sections'][number]['lines'][number]; size: number; showChords: boolean; label: (c: string) => string; colours: StageColours; lyricFont?: string }) {
  if (!line.text.trim()) return <View style={{ height: size * 0.8 }} />;
  const pieces = piecesOf(line);
  return (
    <View style={styles.line}>
      {(pieces.length ? pieces : [{ syl: 0, text: line.text, chord: undefined, wordSyls: [] }]).map((p, k) => (
        <View key={k} style={{ alignItems: 'flex-start', justifyContent: 'flex-end' }}>
          <Text style={{ color: colours.chord, fontWeight: '800', fontSize: size * 0.8, minHeight: size * 1.1 }}>{showChords && p.chord ? label(p.chord) : ' '}</Text>
          <Text style={[{ color: colours.text, fontSize: size, lineHeight: size * 1.3 }, lyricFont ? { fontFamily: lyricFont } : null]}>{p.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** The song as big readable lyrics with chords over the words. Shared by performance mode and the full-song take. */
export function StageSections({ doc, names, size, showChords, label, activeIndex, colours }: { doc: SongDoc; names: string[]; size: number; showChords: boolean; label: (c: string) => string; activeIndex?: number; colours?: StageColours }) {
  const t = useTheme();
  const c: StageColours = colours ?? { bg: t.bg, text: t.text, chord: t.chord, dim: t.textDim, surface: t.surface, border: t.border };
  return (
    <>
      {doc.sections.map((s, i) => (
        <View key={s.id} style={{ marginBottom: size, opacity: activeIndex === undefined || activeIndex === i ? 1 : 0.45 }} testID={`stage-section-${i}`}>
          <StageHeader name={names[i]} size={size} colours={c} active={activeIndex === i} />
          {showChords && s.bars.length > 0 && <StageBars bars={s.bars} size={size} label={label} colours={c} />}
          {s.lines.map((l) => (
            <StageLine key={l.id} line={l} size={size} showChords={showChords} label={label} colours={c} lyricFont={t.fonts.lyric} />
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 6 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: space.lg, backgroundColor: 'rgba(0,0,0,0.55)' },
});
