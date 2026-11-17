/**
 * Capture: one tap starts recording immediately. A single host component
 * owns the recorder; anything can call `startCapture(target)`.
 *
 * Targets: a line, a section, a song, or nothing (→ the Inbox).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { create } from 'zustand';
import { processPendingRecordings } from '../../audio/analysisJob';
import { adoptRecording } from '../../audio/storage';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { useSong } from '../../store/song';
import { toast } from '../../ui/Dialogs';
import { Icon } from '../../ui/kit';
import { font, radius, space, TAP, useTheme } from '../../ui/theme';

export interface CaptureTarget {
  songId: string | null;
  sectionId?: string | null;
  lineId?: string | null;
  /** what the take is "of", used in its title: "Chorus", "Verse 2 · line 3", "Idea" */
  label: string;
  /** the caller shows its own recording controls, so the floating bar stays hidden */
  hideBar?: boolean;
}

interface CaptureStore {
  target: CaptureTarget | null;
  phase: 'idle' | 'starting' | 'recording' | 'saving';
  request: { kind: 'start' | 'stop' | 'cancel'; n: number } | null;
}

const useCapture = create<CaptureStore>(() => ({ target: null, phase: 'idle', request: null }));
let reqN = 0;

export function startCapture(target: CaptureTarget) {
  const s = useCapture.getState();
  if (s.phase !== 'idle') {
    useCapture.setState({ request: { kind: 'stop', n: ++reqN } });
    return;
  }
  useCapture.setState({ target, request: { kind: 'start', n: ++reqN } });
}

export const stopCapture = () => useCapture.setState({ request: { kind: 'stop', n: ++reqN } });
export const cancelCapture = () => useCapture.setState({ request: { kind: 'cancel', n: ++reqN } });
export const useCapturePhase = () => useCapture((s) => s.phase);
export const useCaptureTarget = () => useCapture((s) => s.target);

const shortTime = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Mount once at the app root. Shows a compact recording bar while recording. */
export function CaptureHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true, directory: 'document' } as typeof RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 80);
  const phase = useCapture((s) => s.phase);
  const target = useCapture((s) => s.target);
  const request = useCapture((s) => s.request);
  const handled = useRef(0);
  const level = useRef(new Animated.Value(0)).current;
  const [levels, setLevels] = useState<number[]>([]);

  useEffect(() => {
    if (phase !== 'recording') return;
    // metering is dBFS (-160..0); map -55..0 to 0..1
    const m = state.metering ?? -160;
    const v = Math.max(0, Math.min(1, (m + 55) / 55));
    level.setValue(v);
    setLevels((l) => [...l.slice(-39), v]);
  }, [state.metering, state.durationMillis, phase, level]);

  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    if (request.kind === 'start') void begin();
    else if (request.kind === 'stop') void finish(true);
    else void finish(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  async function begin() {
    useCapture.setState({ phase: 'starting' });
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast('Microphone access is off. Turn it on in Settings to record.');
        useCapture.setState({ phase: 'idle', target: null });
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setLevels([]);
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      useCapture.setState({ phase: 'recording' });
    } catch (e) {
      console.warn(e);
      toast('Could not start recording.');
      useCapture.setState({ phase: 'idle', target: null });
    }
  }

  async function finish(keep: boolean) {
    const s = useCapture.getState();
    if (s.phase !== 'recording') return;
    useCapture.setState({ phase: 'saving' });
    const duration = recorder.getStatus().durationMillis || state.durationMillis;
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const uri = recorder.uri;
      if (!keep || !uri) {
        useCapture.setState({ phase: 'idle', target: null });
        if (!keep) toast('Recording discarded');
        return;
      }
      const tg = s.target ?? { songId: null, label: 'Idea' };
      const file = await adoptRecording(uri, Platform.OS === 'web' ? 'webm' : 'm4a');
      const db = await getDb();
      const mime = file.endsWith('.webm') ? 'audio/webm' : file.endsWith('.wav') ? 'audio/wav' : 'audio/mp4';
      const rec = await repo.addRecording(db, {
        songId: tg.songId,
        sectionId: tg.sectionId ?? null,
        lineId: tg.lineId ?? null,
        title: tg.label,
        file,
        mime,
        durationMs: duration,
      });
      const title = tg.songId ? `${tg.label} take ${rec.takeNo}` : `Idea – ${shortTime(new Date(rec.createdAt))}`;
      await repo.updateRecording(db, rec.id, { title });
      if (!tg.songId) await repo.addIdea(db, 'audio', '', rec.id);
      toast(tg.songId ? `Saved: ${title}` : 'Saved to Inbox');
      if (tg.songId && useSong.getState().doc?.song.id === tg.songId) void useSong.getState().reloadRecordings();
      void processPendingRecordings().then(() => {
        if (tg.songId && useSong.getState().doc?.song.id === tg.songId) void useSong.getState().reloadRecordings();
      });
    } catch (e) {
      console.warn(e);
      toast('Could not save the recording.');
    } finally {
      useCapture.setState({ phase: 'idle', target: null });
    }
  }

  if (phase === 'idle' || target?.hideBar) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      <View
        testID="capture-bar"
        style={[styles.bar, { backgroundColor: t.surface, borderColor: t.border, marginBottom: insets.bottom + space.md }]}
        accessibilityLiveRegion="polite"
      >
        <View style={[styles.dot, { backgroundColor: t.record, opacity: phase === 'recording' ? 1 : 0.4 }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.text, fontSize: font.body, fontWeight: '600' }} numberOfLines={1}>
            {phase === 'saving' ? 'Saving…' : phase === 'starting' ? 'Starting…' : `${fmt(state.durationMillis)} · ${target?.label ?? 'Idea'}`}
          </Text>
          <View style={styles.meter}>
            {levels.map((v, i) => (
              <View key={i} style={{ width: 3, height: 2 + v * 20, borderRadius: 2, backgroundColor: t.record, opacity: 0.35 + v * 0.65 }} />
            ))}
          </View>
        </View>
        <Pressable onPress={cancelCapture} style={styles.small} accessibilityRole="button" accessibilityLabel="Discard recording">
          <Icon name="trash-outline" color={t.textDim} />
        </Pressable>
        <Pressable
          testID="capture-stop"
          onPress={stopCapture}
          style={[styles.stop, { backgroundColor: t.record }]}
          accessibilityRole="button"
          accessibilityLabel="Stop and save recording"
        >
          <View style={styles.square} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    maxWidth: 640,
    alignSelf: 'center',
    width: '94%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  meter: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' },
  small: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  stop: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  square: { width: 20, height: 20, borderRadius: 4, backgroundColor: '#fff' },
});
