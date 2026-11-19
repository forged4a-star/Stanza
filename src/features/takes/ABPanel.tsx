/**
 * Compare two takes: one play button, an A and a B button. Switching keeps
 * the position, so you hear the same moment of each. Loudness can be matched
 * so the louder take does not win just for being louder.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { decodeStored } from '../../audio/decode';
import { playableUri } from '../../audio/storage';
import { activeRms, matchLevels, toDb } from '../../core/dsp/level';
import type { Recording } from '../../core/model';
import { alpha } from '../../ui/color';
import { Button, Icon, Row, ToggleRow } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function ABPanel({ a, b, onClose }: { a: Recording; b: Recording; onClose: () => void }) {
  const t = useTheme();
  const pa = useAudioPlayer(null);
  const pb = useAudioPlayer(null);
  const sa = useAudioPlayerStatus(pa);
  const sb = useAudioPlayerStatus(pb);
  const [side, setSide] = useState<'a' | 'b'>('a');
  const [ready, setReady] = useState(false);
  const [match, setMatch] = useState(true);
  const [levels, setLevels] = useState<[number, number]>([1, 1]);
  const [diffDb, setDiffDb] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  /** where we just moved to, shown until the other player reports its own position */
  const [held, setHeld] = useState<number | null>(null);
  const sideRef = useRef(side);
  sideRef.current = side;

  // load both takes, and measure how loud each is
  useEffect(() => {
    let dead = false;
    setReady(false);
    (async () => {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      pa.replace({ uri: await playableUri(a.file) });
      pb.replace({ uri: await playableUri(b.file) });
      if (!dead) setReady(true);
      try {
        const [x, y] = await Promise.all([decodeStored(a.file), decodeStored(b.file)]);
        const ra = activeRms(x.samples, x.sampleRate);
        const rb = activeRms(y.samples, y.sampleRate);
        if (dead) return;
        setLevels(matchLevels(ra, rb));
        setDiffDb(ra > 1e-5 && rb > 1e-5 ? toDb(ra / rb) : null);
      } catch {
        /* levels stay at 1 */
      }
    })();
    return () => {
      dead = true;
      pa.pause();
      pb.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, b.id]);

  useEffect(() => {
    if (held === null) return;
    const id = setTimeout(() => setHeld(null), 1500);
    return () => clearTimeout(id);
  }, [held]);

  useEffect(() => {
    pa.volume = match ? levels[0] : 1;
    pb.volume = match ? levels[1] : 1;
  }, [match, levels, pa, pb]);

  const cur = side === 'a' ? pa : pb;
  const curStatus = side === 'a' ? sa : sb;
  const duration = Math.min(sa.duration || Infinity, sb.duration || Infinity);
  const total = Number.isFinite(duration) ? duration : curStatus.duration || 0;
  const reported = curStatus.currentTime;
  const position = held !== null && reported < held - 0.25 ? held : reported;
  const playing = curStatus.playing;

  const choose = (next: 'a' | 'b') => {
    if (next === side) return;
    const from = side === 'a' ? pa : pb;
    const to = next === 'a' ? pa : pb;
    const was = from.playing;
    const at = from.currentTime;
    from.pause();
    setHeld(at);
    void to.seekTo(at).then(() => was && to.play());
    setSide(next);
  };
  const toggle = () => {
    if (playing) cur.pause();
    else {
      if (total && position >= total - 0.05) void cur.seekTo(0).then(() => cur.play());
      else cur.play();
    }
  };
  const seek = (x: number) => {
    if (!width || !total) return;
    const to = Math.max(0, Math.min(total, (x / width) * total));
    setHeld(to);
    void pa.seekTo(to);
    void pb.seekTo(to);
  };

  const Pick = ({ id, rec }: { id: 'a' | 'b'; rec: Recording }) => {
    const on = side === id;
    return (
      <Pressable
        onPress={() => choose(id)}
        style={{ flex: 1, minHeight: 84, padding: space.md, borderRadius: t.r.lg, borderWidth: 2, borderColor: on ? t.accent : t.border, backgroundColor: on ? alpha(t.accent, 0.14) : t.surface2, justifyContent: 'center', gap: 2 }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`Listen to take ${id.toUpperCase()}: ${rec.title}`}
        testID={`ab-pick-${id}`}
      >
        <Text style={{ color: on ? t.accent : t.textDim, fontSize: 28, fontWeight: '800' }}>{id.toUpperCase()}</Text>
        <Text style={{ color: t.text, fontSize: font.small + 1 }} numberOfLines={2}>
          {rec.title}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ margin: space.lg, marginBottom: space.sm, padding: space.md, borderRadius: t.r.lg, borderWidth: 1, borderColor: alpha(t.accent, 0.5), backgroundColor: alpha(t.accent, 0.06), gap: space.md }} testID="ab-panel">
      <Row>
        <Text style={{ flex: 1, color: t.text, fontSize: font.body, fontWeight: '700' }}>Compare two takes</Text>
        <Button compact title="Done" onPress={onClose} testID="ab-close" />
      </Row>
      <Row style={{ alignItems: 'stretch' }}>
        <Pick id="a" rec={a} />
        <Pick id="b" rec={b} />
      </Row>
      <Pressable onPress={(e) => seek(e.nativeEvent.locationX)} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 22, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityLabel="Position. Tap to move." testID="ab-seek">
        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border }}>
          <View style={{ width: `${total ? Math.min(100, (position / total) * 100) : 0}%`, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
        </View>
      </Pressable>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: t.textDim, fontSize: font.small }} testID="ab-time">{`${fmt(position)} / ${fmt(total)}`}</Text>
        <Text style={{ color: t.textFaint, fontSize: font.small }}>Now hearing {side.toUpperCase()}</Text>
      </Row>
      <Row style={{ justifyContent: 'center' }}>
        <Pressable
          onPress={toggle}
          disabled={!ready}
          style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? t.accent : t.surface2 }}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          testID="ab-play"
        >
          <Icon name={playing ? 'pause' : 'play'} size={28} color={t.accentText} />
        </Pressable>
      </Row>
      <ToggleRow label="Match loudness" hint={diffDb === null ? 'So the louder take does not win just for being louder' : Math.abs(diffDb) < 0.5 ? 'The two takes are about equally loud' : `A is ${Math.abs(diffDb).toFixed(1)} dB ${diffDb >= 0 ? 'louder' : 'quieter'} than B`} value={match} onChange={setMatch} testID="ab-match" />
    </View>
  );
}
