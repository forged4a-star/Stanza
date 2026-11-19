import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { sectionDisplayNames, type Recording } from '../../core/model';
import { deleteAudio, playableUri } from '../../audio/storage';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { decodeStored } from '../../audio/decode';
import { contourOf, wordMoves, type Contour } from '../../core/dsp/contour';
import { router } from 'expo-router';
import { findLine, flushSaves, useSong } from '../../store/song';
import { ABPanel } from './ABPanel';
import { ChartSheet } from './ChartSheet';
import { ContourView } from './ContourView';
import { BottomSheet } from '../../ui/BottomSheet';
import { askText, choose, confirm, toast } from '../../ui/Dialogs';
import { Button, Empty, Icon, IconButton, SectionTitle, Segmented } from '../../ui/kit';
import { alpha } from '../../ui/color';
import { font, radius, space, useTheme } from '../../ui/theme';
import { exportTake } from '../export/exportActions';
import { startCapture } from '../capture/capture';

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** One shared player for the sheet. */
export function useTakePlayer() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<string | null>(null);
  const toggle = async (rec: Recording) => {
    if (current === rec.id && status.playing) {
      player.pause();
      return;
    }
    if (current !== rec.id) {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.replace({ uri: await playableUri(rec.file) });
      setCurrent(rec.id);
    } else if (status.didJustFinish || (status.duration && status.currentTime >= status.duration - 0.05)) {
      await player.seekTo(0);
    }
    player.play();
  };
  const stop = () => {
    player.pause();
    setCurrent(null);
  };
  return { toggle, stop, current, playing: status.playing, position: status.currentTime, duration: status.duration };
}

export function TakeRow({ rec, player, onChanged, context, onCompare, compareWith }: { rec: Recording; player: ReturnType<typeof useTakePlayer>; onChanged: () => void; context?: string; /** start or finish an A/B comparison with this take */ onCompare?: (rec: Recording) => void; /** the take already picked as A, if any */ compareWith?: Recording | null }) {
  const t = useTheme();
  const isCur = player.current === rec.id;
  const doc = useSong((st) => st.doc);
  const lineText = rec.lineId && doc ? findLine(doc, rec.lineId)?.line.text ?? '' : '';
  const [ghost, setGhost] = useState<{ state: 'loading' | 'none' | 'error' | 'ready'; contour?: Contour }>({ state: 'none' });
  const [showGhost, setShowGhost] = useState(false);
  const [chart, setChart] = useState(false);
  const toggleGhost = async () => {
    if (showGhost) return setShowGhost(false);
    setShowGhost(true);
    if (ghost.state === 'ready') return;
    setGhost({ state: 'loading' });
    try {
      const pcm = await decodeStored(rec.file);
      const c = contourOf(pcm.samples, pcm.sampleRate);
      setGhost(c ? { state: 'ready', contour: c } : { state: 'none' });
    } catch {
      setGhost({ state: 'error' });
    }
  };
  const playing = isCur && player.playing;
  const progress = isCur && player.duration ? player.position / player.duration : 0;
  const menu = async () => {
    const v = await choose(rec.title, [
      { label: 'Rename', value: 'rename' },
      { label: rec.starred ? 'Unstar' : 'Star as best take', value: 'star' },
      ...(doc && rec.songId === doc.song.id ? [{ label: 'Chords from this take', value: 'chart' }] : []),
      ...(onCompare ? [{ label: compareWith && compareWith.id !== rec.id ? `Compare with “${compareWith.title}”` : 'Compare with another take (A/B)', value: 'compare' }] : []),
      { label: 'Edit transcript', value: 'transcript' },
      { label: 'Share audio', value: 'share' },
      ...(rec.songId ? [{ label: 'Move to Inbox', value: 'inbox' }] : []),
      { label: 'Delete take', value: 'delete', danger: true },
    ]);
    if (v === 'chart') return setChart(true);
    if (v === 'compare') return onCompare?.(rec);
    const db = await getDb();
    if (v === 'rename') {
      const name = await askText('Take name', rec.title);
      if (name?.trim()) await repo.updateRecording(db, rec.id, { title: name.trim() });
    } else if (v === 'star') await repo.updateRecording(db, rec.id, { starred: !rec.starred });
    else if (v === 'transcript') {
      const tx = await askText('Transcript', rec.transcript, { multiline: true });
      if (tx !== null) await repo.updateRecording(db, rec.id, { transcript: tx });
    } else if (v === 'share') await exportTake(rec.id).catch(() => toast('Could not share this take'));
    else if (v === 'inbox') {
      await repo.updateRecording(db, rec.id, { songId: null, sectionId: null, lineId: null });
      await repo.addIdea(db, 'audio', '', rec.id);
      toast('Moved to Inbox');
    } else if (v === 'delete') {
      if (await confirm('Delete this take?', 'The audio is removed from this device.', 'Delete', true)) {
        if (isCur) player.stop();
        const file = await repo.deleteRecording(db, rec.id);
        if (file) await deleteAudio(file);
      }
    }
    onChanged();
  };
  return (
    <View style={{ borderBottomColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth }}>
    <View style={[styles.take, { borderBottomWidth: 0 }]} testID={`take-${rec.id}`}>
      <Pressable onPress={() => void player.toggle(rec).catch(() => toast('Could not play this take'))} style={[styles.play, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel={playing ? `Pause ${rec.title}` : `Play ${rec.title}`}>
        <Icon name={playing ? 'pause' : 'play'} size={20} color={t.accent} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: font.body }} numberOfLines={1}>
          {rec.starred ? '★ ' : ''}
          {rec.title}
        </Text>
        <Text style={{ color: t.textDim, fontSize: font.small }} numberOfLines={1}>
          {[fmt(rec.durationMs), context, rec.analysis === 'pending' ? 'analysing…' : null].filter(Boolean).join(' · ')}
        </Text>
        {!!rec.transcript && (
          <Text style={{ color: t.textFaint, fontSize: font.small, fontStyle: 'italic' }} numberOfLines={2}>
            “{rec.transcript}”
          </Text>
        )}
        {isCur && (
          <View style={[styles.progress, { backgroundColor: t.border }]}>
            <View style={{ width: `${progress * 100}%`, height: 3, backgroundColor: t.accent, borderRadius: 2 }} />
          </View>
        )}
      </View>
      <IconButton icon="pulse-outline" label={showGhost ? 'Hide the melody' : 'Show the melody'} color={showGhost ? t.accent : t.textDim} onPress={() => void toggleGhost()} testID={`ghost-${rec.id}`} />
      <IconButton icon="ellipsis-horizontal" label={`Options for ${rec.title}`} color={t.textDim} onPress={menu} />
    </View>
    {chart && doc && <ChartSheet take={rec} doc={doc} onClose={() => setChart(false)} />}
    {showGhost && (
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }} testID={`ghost-view-${rec.id}`}>
        {ghost.state === 'loading' ? (
          <Text style={{ color: t.textDim }}>Reading the melody…</Text>
        ) : ghost.state === 'error' ? (
          <Text style={{ color: t.textDim }}>Could not read this take.</Text>
        ) : ghost.state === 'none' ? (
          <Text style={{ color: t.textDim }}>No clear singing or humming found. Spoken words do not show a melody.</Text>
        ) : (
          <ContourView contour={ghost.contour!} words={lineText ? wordMoves(ghost.contour!, lineText) : []} />
        )}
      </View>
    )}
    </View>
  );
}

function SectionTitleRow() {
  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <SectionTitle>Takes in this song</SectionTitle>
    </View>
  );
}

export function TakesSheet({ visible, onClose, header }: { visible: boolean; onClose: () => void; header?: ReactNode }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const recordings = useSong((s) => s.recordings);
  const activeLineId = useSong((s) => s.activeLineId);
  const player = useTakePlayer();
  const [filter, setFilter] = useState<'all' | 'section' | 'starred'>('all');
  const [first, setFirst] = useState<Recording | null>(null);
  const [pair, setPair] = useState<[Recording, Recording] | null>(null);
  const compare = (rec: Recording) => {
    if (first && first.id !== rec.id) {
      player.stop();
      setPair([first, rec]);
      setFirst(null);
    } else if (first) setFirst(null);
    else {
      setFirst(rec);
      toast(`Now open the menu on the take to compare with “${rec.title}”`);
    }
  };

  useEffect(() => {
    if (visible) void useSong.getState().reloadRecordings();
    else player.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const names = useMemo(() => (doc ? sectionDisplayNames(doc.sections) : []), [doc]);
  if (!doc) return null;
  const activeSection = activeLineId ? doc.sections.find((s) => s.lines.some((l) => l.id === activeLineId)) : null;
  const where = (r: Recording) => {
    const si = doc.sections.findIndex((s) => s.id === r.sectionId);
    if (si < 0) return 'Whole song';
    const li = r.lineId ? doc.sections[si].lines.findIndex((l) => l.id === r.lineId) : -1;
    return li >= 0 ? `${names[si]}, line ${li + 1}` : names[si];
  };
  const list = recordings.filter((r) => (filter === 'starred' ? r.starred : filter === 'section' ? activeSection && r.sectionId === activeSection.id : true));
  const filter_ = (
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${recordings.length})` },
            { value: 'section', label: activeSection ? names[doc.sections.indexOf(activeSection)] : 'This section' },
            { value: 'starred', label: 'Starred' },
          ]}
        />
      </View>
  );
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Takes" height={0.7} testID="takes-sheet">
      {!header && filter_}
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        {header}
        {pair && <ABPanel a={pair[0]} b={pair[1]} onClose={() => setPair(null)} />}
        {first && (
          <View style={{ marginHorizontal: space.lg, marginTop: space.sm, padding: space.md, borderRadius: t.r.md, backgroundColor: alpha(t.accent, 0.12), flexDirection: 'row', alignItems: 'center', gap: space.sm }} testID="ab-picking">
            <Text style={{ flex: 1, color: t.text, fontSize: font.small + 1 }}>Comparing with “{first.title}”: open the ⋯ menu on another take and choose Compare.</Text>
            <Button compact title="Cancel" onPress={() => setFirst(null)} />
          </View>
        )}
        {header && <SectionTitleRow />}
        {header && filter_}
        {list.length === 0 ? (
          <Empty icon="mic-outline" title="No takes here yet" hint="Tap the record button. A take attaches to the line or section you're on." />
        ) : (
          list.map((r) => <TakeRow key={r.id} rec={r} player={player} context={where(r)} onChanged={() => void useSong.getState().reloadRecordings()} onCompare={recordings.length > 1 ? compare : undefined} compareWith={first} />)
        )}
        {!header && <Pressable
          onPress={async () => {
            await flushSaves();
            onClose();
            router.push(`/take/${doc.song.id}`);
          }}
          style={[styles.newTake, { borderColor: t.accent, borderStyle: 'solid', backgroundColor: alpha(t.accent, 0.1) }]}
          accessibilityRole="button"
          testID="record-full"
        >
          <Icon name="radio-button-on" size={18} color={t.record} />
          <Text style={{ color: t.text, fontSize: font.body, fontWeight: '700' }}>Record the full song</Text>
        </Pressable>}
        <Pressable
          onPress={() => {
            onClose();
            startCapture({ songId: doc.song.id, sectionId: activeSection?.id ?? null, label: activeSection ? names[doc.sections.indexOf(activeSection)] : 'Song' });
          }}
          style={[styles.newTake, { borderColor: t.border }]}
          accessibilityRole="button"
        >
          <Icon name="mic" size={18} color={t.record} />
          <Text style={{ color: t.text, fontSize: font.body }}>Record a new take</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  take: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  progress: { height: 3, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  newTake: { margin: space.lg, minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
});
