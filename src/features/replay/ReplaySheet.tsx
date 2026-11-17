/**
 * Watch the song being written: the lyrics rebuild themselves from the history
 * of your edits. Pauses are squeezed so a long session plays in under a minute.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { buildTimeline, describeReplay, frameIndexAt, namesOf, stateAtTime, type EditEvent } from '../../core/lyrics/replay';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { flushEditLog, forgetEditBase } from '../../store/editLog';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { alpha } from '../../ui/color';
import { confirm, toast } from '../../ui/Dialogs';
import { Button, Chip, Row, Slider } from '../../ui/kit';
import { displayText, font, space, useTheme } from '../../ui/theme';

const SPEEDS = [1, 2, 4, 8, 16, 32];
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ReplaySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const [events, setEvents] = useState<EditEvent[] | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const clock = useRef(0);

  const tl = useMemo(() => buildTimeline(events ?? []), [events]);

  useEffect(() => {
    if (!visible || !doc) {
      setPlaying(false);
      return;
    }
    setEvents(null);
    void (async () => {
      await flushEditLog();
      setEvents(await repo.listEditEvents(await getDb(), doc.song.id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, doc?.song.id]);

  // choose a speed that plays the whole thing in about 40 seconds, and start from the beginning
  useEffect(() => {
    if (!events) return;
    const fit = SPEEDS.find((s) => tl.duration / s <= 40000) ?? SPEEDS[SPEEDS.length - 1];
    setSpeed(fit);
    clock.current = 0;
    setNow(0);
  }, [events]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const n = Date.now();
      clock.current = Math.min(tl.duration, clock.current + (n - last) * speed);
      last = n;
      setNow(clock.current);
      if (clock.current >= tl.duration) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tl.duration]);

  const enough = tl.frames.length >= 3;
  const view = useMemo(() => stateAtTime(tl, now), [tl, now]);
  const names = namesOf(view);
  const frame = tl.frames[Math.max(0, frameIndexAt(tl, now))];

  const clear = async () => {
    if (!doc || !(await confirm('Clear the replay history?', 'The song itself is not touched. Only the record of how it was written is removed.', 'Clear', true))) return;
    await repo.clearEditEvents(await getDb(), doc.song.id);
    forgetEditBase(doc.song.id);
    setEvents([]);
    toast('Replay history cleared');
  };

  return (
    <BottomSheet visible={visible} onClose={() => (setPlaying(false), onClose())} title="Watch it being written" height={0.9} light testID="replay-sheet">
      <View style={{ flex: 1 }}>
        {events === null ? (
          <Text style={{ color: t.textDim, padding: space.lg }}>Loading…</Text>
        ) : !enough ? (
          <Text style={{ color: t.textDim, padding: space.lg }} testID="replay-empty">
            Not enough history yet. From now on, every change you make to the words is remembered on this phone, so you can watch the song being written here.
          </Text>
        ) : (
          <>
            <Text style={{ color: t.textDim, fontSize: font.small, paddingHorizontal: space.lg }} testID="replay-caption">
              {describeReplay(tl)}
            </Text>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.lg }} testID="replay-view">
              <Text style={[{ color: t.text }, displayText(t, 26)]} testID="replay-title">
                {view.title || 'Untitled'}
              </Text>
              {view.sections.map((s, i) => (
                <View key={s.id} testID={`replay-section-${i}`}>
                  <View style={{ alignSelf: 'flex-start', backgroundColor: alpha(t.accent, 0.14), borderRadius: t.r.pill, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 6 }}>
                    <Text style={{ color: t.chord, fontSize: font.small - 1, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' }}>{names[i]}</Text>
                  </View>
                  {s.lines.map((l, k) => (
                    <Text key={k} style={{ color: t.text, fontSize: t.lyric.fontSize, lineHeight: t.lyric.lineHeight, fontFamily: t.lyric.fontFamily, minHeight: t.lyric.lineHeight }}>
                      {l}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>
            <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 1, borderTopColor: t.border }}>
              <Slider
                value={tl.duration ? now / tl.duration : 0}
                onChange={(v) => {
                  setPlaying(false);
                  clock.current = v * tl.duration;
                  setNow(clock.current);
                }}
                label="Scrub through the writing"
                testID="replay-slider"
              />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: t.textDim, fontSize: font.small }} testID="replay-time">
                  {fmt(now)} / {fmt(tl.duration)} · {frame ? new Date(frame.wall).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
              </Row>
              <Row style={{ flexWrap: 'wrap' }}>
                <Button
                  kind="primary"
                  icon={playing ? 'pause' : 'play'}
                  title={playing ? 'Pause' : now >= tl.duration ? 'Watch again' : 'Play'}
                  onPress={() => {
                    if (!playing && clock.current >= tl.duration) clock.current = 0;
                    setPlaying((p) => !p);
                  }}
                  testID="replay-play"
                />
                {SPEEDS.map((s) => (
                  <Chip key={s} label={`${s}×`} selected={speed === s} onPress={() => setSpeed(s)} testID={`replay-speed-${s}`} />
                ))}
              </Row>
              <Button compact kind="ghost" title="Clear this history" onPress={() => void clear()} testID="replay-clear" />
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}
