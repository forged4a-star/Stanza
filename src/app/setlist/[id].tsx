/** One setlist: order the songs, set the key and a note for each, then play it through. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { songSeconds } from '../../features/chords/stage';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { safeFileName } from '../../core/export/formats';
import { keyJumps, moveItem, playedKey, setlistText, setTotals, transposeLabel, type SetlistEntry } from '../../core/song/setlist';
import { copyWithToast } from '../../features/export/exportActions';
import { shareFile } from '../../platform/share';
import { BottomSheet } from '../../ui/BottomSheet';
import { askText, toast } from '../../ui/Dialogs';
import { Button, Empty, IconButton, ListItem, Row, cardStyle, pageStyle } from '../../ui/kit';
import { font, space, TAP, useTheme, displayText } from '../../ui/theme';


export default function SetlistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [entries, setEntries] = useState<SetlistEntry[]>([]);
  const [missing, setMissing] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const set = await repo.getSetlist(db, id!);
    if (!set) return setMissing(true);
    setName(set.name);
    const out: SetlistEntry[] = [];
    for (const it of set.items) {
      const doc = await repo.loadSong(db, it.songId);
      if (!doc) continue;
      out.push({ id: it.id, songId: it.songId, title: doc.song.title, key: doc.song.key, bpm: doc.song.bpm, capo: doc.song.capo, transpose: it.transpose, note: it.note, seconds: songSeconds(doc) });
    }
    setEntries(out);
  }, [id]);
  useEffect(() => void load(), [load]);

  const totals = useMemo(() => setTotals(entries), [entries]);
  const jumps = useMemo(() => keyJumps(entries), [entries]);

  const move = async (from: number, to: number) => {
    const next = moveItem(entries, from, to);
    if (next === entries) return;
    setEntries(next);
    await repo.reorderSetlist(await getDb(), id!, next.map((e) => e.id));
  };
  const patch = async (e: SetlistEntry, p: { transpose?: number; note?: string }) => {
    setEntries((list) => list.map((x) => (x.id === e.id ? { ...x, ...p } : x)));
    await repo.updateSetlistItem(await getDb(), e.id, p);
  };
  const remove = async (e: SetlistEntry) => {
    setEntries((list) => list.filter((x) => x.id !== e.id));
    await repo.removeFromSetlist(await getDb(), e.id);
  };
  const play = (from = 0) => {
    const e = entries[from];
    if (!e) return;
    router.push(`/perform/${e.songId}?mic=1&set=${id}&i=${from}`);
  };
  const share = async () => {
    try {
      await shareFile(`${safeFileName(name || 'Setlist')}.txt`, 'text/plain', setlistText(name, entries));
    } catch {
      toast('Could not share the setlist');
    }
  };

  if (missing)
    return (
      <View style={[pageStyle(t), { paddingTop: insets.top }]}>
        <Empty icon="alert-circle-outline" title="This setlist is gone" />
      </View>
    );

  return (
    <View style={[pageStyle(t), { paddingTop: insets.top }]} testID="setlist-page">
      <Row style={{ minHeight: TAP + 4, paddingHorizontal: space.xs }}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/setlists'))} testID="setlist-back" />
        <Text
          style={[{ flex: 1, color: t.text }, displayText(t, font.title)]}
          numberOfLines={1}
          accessibilityRole="header"
          onPress={async () => {
            const n = await askText('Setlist name', name);
            if (n?.trim()) {
              await repo.renameSetlist(await getDb(), id!, n);
              setName(n.trim());
            }
          }}
          testID="setlist-name"
        >
          {name}
        </Text>
        <IconButton icon="copy-outline" label="Copy the run sheet" onPress={() => void copyWithToast(setlistText(name, entries), 'Copied the run sheet')} testID="setlist-copy" />
        <IconButton icon="share-outline" label="Share the run sheet as a file" onPress={() => void share()} testID="setlist-share" />
      </Row>
      <Text style={{ color: t.textDim, fontSize: font.small, paddingHorizontal: space.lg }} testID="setlist-totals">
        {totals.label}
      </Text>
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Button kind="primary" icon="play" title="Play the set" onPress={() => play(0)} disabled={!entries.length} testID="setlist-play" />
        <Button icon="add" title="Add a song" onPress={() => setPicking(true)} testID="setlist-add" />
      </Row>
      {jumps.map((j, i) => (
        <Text key={i} style={{ color: t.warn, fontSize: font.small, paddingHorizontal: space.lg, paddingBottom: 2 }} testID="setlist-jump">
          {j.text} Moving one of them with the key buttons can help.
        </Text>
      ))}
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 80 }}
        ListEmptyComponent={<Empty icon="musical-notes-outline" title="No songs in this set" hint="Add songs from your library." />}
        renderItem={({ item: e, index }) => {
          const k = playedKey(e);
          return (
            <View style={[cardStyle(t, { padded: true }), { gap: space.xs }]} testID={`setlist-item-${index}`}>
              <Row>
                <Text style={{ color: t.textFaint, fontSize: font.body, fontWeight: '700', width: 22 }}>{index + 1}</Text>
                <Text style={[{ flex: 1, color: t.text }, displayText(t, 18)]} numberOfLines={1}>
                  {e.title || 'Untitled'}
                </Text>
                <IconButton icon="arrow-up" label="Move up" size={18} onPress={() => void move(index, index - 1)} disabled={index === 0} testID={`setlist-up-${index}`} />
                <IconButton icon="arrow-down" label="Move down" size={18} onPress={() => void move(index, index + 1)} disabled={index === entries.length - 1} testID={`setlist-down-${index}`} />
                <IconButton icon="close" label={`Remove ${e.title || 'Untitled'}`} size={18} color={t.textDim} onPress={() => void remove(e)} testID={`setlist-remove-${index}`} />
              </Row>
              <Row style={{ flexWrap: 'wrap' }}>
                <Text style={{ color: t.textDim, fontSize: font.small }} testID={`setlist-key-${index}`}>
                  {[k ? `Key ${k}` : 'No key set', e.capo ? `capo ${e.capo}` : null, `${Math.round(e.bpm)} bpm`].filter(Boolean).join(' · ')}
                </Text>
              </Row>
              <Row>
                <Text style={{ color: t.textDim, fontSize: font.small, flex: 1 }}>{`Chords ${transposeLabel(e.transpose)}`}</Text>
                <Button compact title="Down" onPress={() => void patch(e, { transpose: Math.max(-11, e.transpose - 1) })} testID={`setlist-tdown-${index}`} />
                <Button compact title="Up" onPress={() => void patch(e, { transpose: Math.min(11, e.transpose + 1) })} testID={`setlist-tup-${index}`} />
              </Row>
              <Row>
                <Text
                  style={{ flex: 1, color: e.note ? t.text : t.textFaint, fontSize: font.small + 1, fontStyle: e.note ? 'normal' : 'italic' }}
                  onPress={async () => {
                    const n = await askText('Note for this song', e.note, { placeholder: 'e.g. start quiet, capo up', multiline: true });
                    if (n !== null) void patch(e, { note: n.trim() });
                  }}
                  accessibilityRole="button"
                  testID={`setlist-note-${index}`}
                >
                  {e.note || 'Add a note'}
                </Text>
                <Button compact icon="play" title="From here" onPress={() => play(index)} testID={`setlist-from-${index}`} />
              </Row>
            </View>
          );
        }}
      />
      <SongPicker visible={picking} onClose={() => setPicking(false)} onPick={async (songId) => (await repo.addToSetlist(await getDb(), id!, songId), setPicking(false), void load())} />
    </View>
  );
}

function SongPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (songId: string) => void }) {
  const t = useTheme();
  const [songs, setSongs] = useState<repo.SongListItem[]>([]);
  useEffect(() => {
    if (visible) void getDb().then((db) => repo.listSongs(db)).then(setSongs);
  }, [visible]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add a song" height={0.7} testID="song-picker">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        {songs.length === 0 && <Empty icon="musical-notes-outline" title="No songs yet" />}
        {songs.map((s) => (
          <ListItem key={s.id} icon="musical-note-outline" title={s.title || 'Untitled'} subtitle={s.preview || 'Empty'} onPress={() => onPick(s.id)} testID={`pick-${s.title || 'untitled'}`} />
        ))}
        <Text style={{ color: t.textFaint, fontSize: font.small, padding: space.lg }}>The same song can go in twice, for an encore.</Text>
      </ScrollView>
    </BottomSheet>
  );
}
