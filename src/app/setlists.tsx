/** Setlists: ordered runs of songs for a gig. */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { askText, choose, confirm } from '../ui/Dialogs';
import { Button, Empty, Icon, IconButton, Row, cardStyle, pageStyle } from '../ui/kit';
import { font, space, TAP, useTheme, displayText } from '../ui/theme';

export default function Setlists() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<repo.SetlistSummary[]>([]);
  const load = useCallback(async () => setLists(await repo.listSetlists(await getDb())), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const create = async () => {
    const name = await askText('New setlist', '', { placeholder: 'e.g. Friday at the bar', ok: 'Create' });
    if (name === null) return;
    const id = await repo.createSetlist(await getDb(), name);
    router.push(`/setlist/${id}`);
  };
  const menu = async (l: repo.SetlistSummary) => {
    const v = await choose(l.name, [
      { label: 'Rename', value: 'rename' },
      { label: 'Delete setlist', value: 'delete', danger: true },
    ]);
    const db = await getDb();
    if (v === 'rename') {
      const name = await askText('Setlist name', l.name);
      if (name?.trim()) await repo.renameSetlist(db, l.id, name);
    } else if (v === 'delete' && (await confirm('Delete this setlist?', 'The songs stay in your library.', 'Delete', true))) await repo.deleteSetlist(db, l.id);
    void load();
  };

  return (
    <View style={[pageStyle(t), { paddingTop: insets.top }]} testID="setlists">
      <Row style={{ minHeight: TAP + 4, paddingHorizontal: space.xs }}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} testID="setlists-back" />
        <Text style={[{ flex: 1, color: t.text }, displayText(t, font.title + 2)]} accessibilityRole="header">
          Setlists
        </Text>
        <Button compact kind="primary" icon="add" title="New" onPress={() => void create()} testID="new-setlist" />
      </Row>
      <FlatList
        data={lists}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 80 }}
        ListEmptyComponent={<Empty icon="list-outline" title="No setlists yet" hint="Put finished songs in order for a gig, with the key and capo for each, and play them back to back." />}
        renderItem={({ item: l }) => (
          <Pressable onPress={() => router.push(`/setlist/${l.id}`)} onLongPress={() => void menu(l)} style={({ pressed }) => [cardStyle(t, { padded: true }), pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityHint="Long-press for options" testID={`setlist-${l.name}`}>
            <Row>
              <Icon name="list" size={20} color={t.accent} />
              <Text style={[{ flex: 1, color: t.text }, displayText(t, 18)]} numberOfLines={1}>
                {l.name}
              </Text>
              <Text style={{ color: t.textFaint, fontSize: font.small }}>{`${l.songs} song${l.songs === 1 ? '' : 's'}`}</Text>
            </Row>
          </Pressable>
        )}
      />
    </View>
  );
}
