/** Full-screen Inbox: loose ideas, ready to start a song or join one. */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { openSong } from '../features/nav/openSong';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Idea, Recording } from '../core/model';
import { deleteAudio } from '../audio/storage';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { startCapture, useCapturePhase } from '../features/capture/capture';
import { addTextIdea } from '../features/inbox/InboxSheet';
import { TakeRow, useTakePlayer } from '../features/takes/TakesSheet';
import { choose, toast } from '../ui/Dialogs';
import { Button, Empty, IconButton, Row, pageStyle } from '../ui/kit';
import { font, space, TAP, useTheme, displayText } from '../ui/theme';

type Item = Idea & { recording: Recording | null };

export default function InboxScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const player = useTakePlayer();
  const phase = useCapturePhase();
  const load = useCallback(async () => setItems(await repo.listIdeas(await getDb())), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, phase])
  );

  const send = async (it: Item) => {
    const db = await getDb();
    const songs = await repo.listSongs(db, { sort: 'opened' });
    const v = await choose('Put this idea in…', [{ label: 'A new song', value: '__new' }, ...songs.slice(0, 12).map((s) => ({ label: s.title || 'Untitled', value: s.id }))]);
    if (!v) return;
    let songId = v;
    if (v === '__new') songId = (await repo.createSong(db, { title: it.kind === 'text' ? it.text.split('\n')[0].slice(0, 40) : '' })).song.id;
    await repo.useIdea(db, it.id, songId, null);
    toast('Added');
    openSong(songId);
  };

  return (
    <View style={[pageStyle(t), { paddingTop: insets.top }]}>
      <Row style={{ minHeight: TAP + 4, paddingHorizontal: space.xs }}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
        <Text style={[{ flex: 1, color: t.text }, displayText(t, font.title + 2)]} accessibilityRole="header">
          Inbox
        </Text>
      </Row>
      <Row style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <Button compact title="Line" icon="add" onPress={async () => (await addTextIdea('text')) && load()} style={{ flex: 1 }} testID="inbox-add-line" />
        <Button compact title="Chords" icon="add" onPress={async () => (await addTextIdea('chords')) && load()} style={{ flex: 1 }} />
        <Button compact title="Hum" icon="mic" onPress={() => startCapture({ songId: null, label: 'Idea' })} style={{ flex: 1 }} />
      </Row>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {items.length === 0 && <Empty icon="file-tray-outline" title="Nothing waiting" hint="Capture a line, a hum or a chord loop. Open a song and drag ideas in from the Inbox sheet." />}
        {items.map((it) => (
          <View key={it.id} style={[styles.row, { borderBottomColor: t.border }]}>
            {it.kind === 'audio' && it.recording ? (
              <View style={{ flex: 1 }}>
                <TakeRow rec={it.recording} player={player} onChanged={load} />
              </View>
            ) : (
              <View style={{ flex: 1, paddingHorizontal: space.lg, paddingVertical: space.md }}>
                <Text style={{ color: t.textDim, fontSize: font.tiny, fontWeight: '700' }}>{it.kind === 'chords' ? 'CHORDS' : 'LINE'}</Text>
                <Text style={{ color: t.text, fontSize: font.lyric - 1 }}>{it.text}</Text>
              </View>
            )}
            <IconButton icon="arrow-redo-outline" label="Put in a song" onPress={() => send(it)} />
            {it.kind !== 'audio' && (
              <IconButton
                icon="trash-outline"
                label="Delete idea"
                color={t.textFaint}
                onPress={async () => {
                  const f = await repo.deleteIdea(await getDb(), it.id);
                  if (f) await deleteAudio(f);
                  void load();
                }}
              />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: space.sm } });
