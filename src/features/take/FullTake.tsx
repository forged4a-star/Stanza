/**
 * Record the whole song in one take. Your words and chords scroll along at the
 * song's tempo while you sing, with a count-in first. When you stop, the take is
 * saved to the song and ready to play back.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playNote } from '../../audio/engine';
import { sectionDisplayNames, type Recording, type SongDoc } from '../../core/model';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { choose } from '../../ui/Dialogs';
import { Button, Chip, Icon, IconButton, Row, pageStyle } from '../../ui/kit';
import { alpha } from '../../ui/color';
import { displayText, font, space, useTheme } from '../../ui/theme';
import { StageSections } from '../chords/StageView';
import { scrollVelocity, sectionAt, songSeconds } from '../chords/stage';
import { cancelCapture, startCapture, stopCapture, useCapturePhase } from '../capture/capture';
import { TakeRow, useTakePlayer } from '../takes/TakesSheet';

const COUNT_IN_BEATS = 4;

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Stage = 'ready' | 'count' | 'recording' | 'saving' | 'done';

export function FullTake({ doc, onClose, onChartRequest }: { doc: SongDoc; onClose: () => void; onChartRequest?: (take: Recording) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const phase = useCapturePhase();
  const names = useMemo(() => sectionDisplayNames(doc.sections), [doc]);
  const seconds = useMemo(() => songSeconds(doc), [doc]);
  const hasChords = doc.sections.some((s) => s.bars.length || s.lines.some((l) => l.chords.length));

  const [stage, setStage] = useState<Stage>('ready');
  const [countIn, setCountIn] = useState(true);
  const [follow, setFollow] = useState(true);
  const [beat, setBeat] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Recording | null>(null);
  const size = 26;
  const player = useTakePlayer();

  const scroll = useRef<ScrollViewInstance>(null);
  const pos = useRef(0);
  const content = useRef(0);
  const view = useRef(0);
  const startedAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stageRef = useRef<Stage>('ready');
  stageRef.current = stage;

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(
    () => () => {
      clearTimers();
      if (stageRef.current === 'recording' || stageRef.current === 'count') cancelCapture();
    },
    []
  );

  // the capture host moves 'starting' to 'recording' to 'saving' to 'idle'; follow it
  useEffect(() => {
    if (phase === 'recording' && stage !== 'recording') {
      startedAt.current = Date.now();
      setElapsed(0);
      setStage('recording');
    } else if (phase === 'saving' && stage === 'recording') setStage('saving');
    else if (phase === 'idle' && stage === 'saving') {
      void (async () => {
        const list = await repo.listRecordings(await getDb(), doc.song.id);
        const newest = [...list].filter((r) => !r.sectionId && !r.lineId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
        setTake(newest);
        setStage('done');
      })();
    } else if (phase === 'idle' && stage === 'recording') {
      // discarded from elsewhere
      setStage('ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // elapsed time, and the lyrics following along at the song's pace
  useEffect(() => {
    if (stage !== 'recording') return;
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      setElapsed(now - startedAt.current);
      if (follow) {
        const max = Math.max(0, content.current - view.current);
        pos.current = Math.min(max, pos.current + (scrollVelocity(max, seconds, 1) * (now - last)) / 1000);
        scroll.current?.scrollTo({ y: pos.current, animated: false });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, follow, seconds]);

  const begin = () => {
    pos.current = 0;
    scroll.current?.scrollTo({ y: 0, animated: false });
    setTake(null);
    const go = () => startCapture({ songId: doc.song.id, sectionId: null, lineId: null, label: 'Full song', hideBar: true });
    if (!countIn) return go();
    setStage('count');
    const beatMs = 60000 / Math.max(30, doc.song.bpm);
    for (let i = 0; i < COUNT_IN_BEATS; i++) {
      timers.current.push(
        setTimeout(() => {
          setBeat(i + 1);
          playNote(i === 0 ? 88 : 81, 0.08);
        }, i * beatMs)
      );
    }
    timers.current.push(setTimeout(go, COUNT_IN_BEATS * beatMs));
  };

  const cancelCount = () => {
    clearTimers();
    setStage('ready');
    setBeat(0);
  };

  const close = async () => {
    if (stage === 'recording') {
      const v = await choose('You are recording', [
        { label: 'Stop and keep the take', value: 'keep' },
        { label: 'Discard the take and leave', value: 'discard', danger: true },
      ]);
      if (v === 'keep') stopCapture();
      else if (v === 'discard') {
        cancelCapture();
        onClose();
      }
      return;
    }
    if (stage === 'count') cancelCount();
    onClose();
  };

  const label = (c: string) => c;
  const current = stage === 'recording' ? sectionAt(doc, elapsed / 1000) : undefined;

  return (
    <View style={[pageStyle(t), { paddingTop: insets.top }]} testID="full-take">
      <Row style={{ minHeight: 56, paddingHorizontal: space.xs }}>
        <IconButton icon="close" label="Close" onPress={() => void close()} testID="take-close" />
        <View style={{ flex: 1 }}>
          <Text style={[{ color: t.text }, displayText(t, 20)]} numberOfLines={1}>
            Record the full song
          </Text>
          <Text style={{ color: t.textDim, fontSize: font.small }} numberOfLines={1}>
            {doc.song.title.trim() || 'Untitled'} · {Math.round(doc.song.bpm)} bpm
          </Text>
        </View>
        {stage === 'recording' && (
          <View style={styles.live} accessibilityLiveRegion="polite">
            <View style={[styles.dot, { backgroundColor: t.record }]} />
            <Text style={{ color: t.text, fontWeight: '700', fontVariant: ['tabular-nums'] }} testID="take-timer">
              {fmt(elapsed)}
            </Text>
          </View>
        )}
      </Row>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 320 }}
        onScroll={(e) => (pos.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        onLayout={(e: LayoutChangeEvent) => (view.current = e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => (content.current = h)}
        testID="take-scroll"
      >
        <StageSections doc={doc} names={names} size={size} showChords={hasChords} label={label} activeIndex={current} />
      </ScrollView>

      {stage === 'count' && (
        <View style={[StyleSheet.absoluteFill, styles.countWrap, { backgroundColor: alpha(t.bg, 0.82) }]} pointerEvents="box-none" testID="take-count">
          <Text style={[{ color: t.chord }, displayText(t, 120)]} accessibilityLiveRegion="assertive">
            {beat || ' '}
          </Text>
          <Text style={{ color: t.textDim, fontSize: font.body }}>Get ready…</Text>
          <Button title="Cancel" onPress={cancelCount} style={{ marginTop: space.lg }} testID="take-cancel-count" />
        </View>
      )}

      <View style={[styles.panel, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: insets.bottom + space.md }, ({ boxShadow: '0 -10px 30px rgba(0,0,0,0.22)' } as object)]}>
        {stage === 'ready' && (
          <>
            <Text style={{ color: t.textDim, fontSize: font.small }}>
              Your words and chords scroll along while you sing. Use headphones if you play the click.
            </Text>
            <Row style={{ flexWrap: 'wrap' }}>
              <Chip label="Count-in" selected={countIn} onPress={() => setCountIn((v) => !v)} testID="take-countin" />
              <Chip label="Scroll along" selected={follow} onPress={() => setFollow((v) => !v)} testID="take-follow" />
            </Row>
            <Button kind="primary" icon="mic" title="Start recording" onPress={begin} testID="take-start" />
          </>
        )}
        {stage === 'count' && <Text style={{ color: t.textDim, textAlign: 'center' }}>Counting in…</Text>}
        {stage === 'recording' && (
          <>
            <Text style={{ color: t.text, fontWeight: '700', textAlign: 'center' }} testID="take-section">
              {current !== undefined ? names[current] : ''}
            </Text>
            <Button kind="primary" icon="stop" title="Stop and save" onPress={stopCapture} testID="take-stop" style={{ backgroundColor: t.record }} />
          </>
        )}
        {stage === 'saving' && <Text style={{ color: t.textDim, textAlign: 'center' }}>Saving your take…</Text>}
        {stage === 'done' && (
          <>
            <Row>
              <Icon name="checkmark-circle" size={20} color={t.ok} />
              <Text style={{ color: t.text, fontWeight: '700' }} testID="take-saved">
                Saved to the song
              </Text>
            </Row>
            {take ? <TakeRow rec={take} player={player} onChanged={() => undefined} context="Whole song" /> : <Text style={{ color: t.textDim }}>The take is in your Takes list.</Text>}
            <Row style={{ flexWrap: 'wrap' }}>
              <Button compact title="Record again" icon="refresh" onPress={() => (setStage('ready'), setBeat(0))} testID="take-again" />
              {take && onChartRequest && <Button compact title="Chords from this take" icon="musical-notes-outline" onPress={() => onChartRequest(take)} testID="take-chart" />}
              <Button compact kind="primary" title="Done" onPress={onClose} testID="take-done" />
            </Row>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: space.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  countWrap: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
});
