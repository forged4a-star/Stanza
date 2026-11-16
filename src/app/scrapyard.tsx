/** Every line ever cut, from every song, searchable. Copy one back into the open song. */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Scrap } from '../core/model';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { useSong } from '../store/song';
import { choose, toast } from '../ui/Dialogs';
import { Empty, Icon, IconButton, Row } from '../ui/kit';
import { font, radius, space, TAP, useTheme } from '../ui/theme';

export default function Scrapyard() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [scraps, setScraps] = useState<Scrap[]>([]);
  const load = useCallback(async () => setScraps(await repo.listScraps(await getDb(), q)), [q]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (s: Scrap) => {
    const doc = useSong.getState().doc;
    const v = await choose(s.text, [
      ...(doc ? [{ label: `Add to "${doc.song.title || 'Untitled'}"`, value: 'use' }] : []),
      { label: 'Send to Inbox', value: 'inbox' },
      { label: 'Delete for good', value: 'delete', danger: true },
    ]);
    const db = await getDb();
    if (v === 'use' && doc) {
      const st = useSong.getState();
      const at = st.activeLineId ? doc.sections.find((x) => x.lines.some((l) => l.id === st.activeLineId)) : null;
      const sec = at ?? doc.sections[doc.sections.length - 1];
      st.appendLine(sec.id, s.text);
      toast('Added to the song');
      router.back();
    }
    if (v === 'inbox') {
      await repo.addIdea(db, 'text', s.text);
      toast('Sent to Inbox');
    }
    if (v === 'delete') {
      await repo.deleteScrap(db, s.id);
      void load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <Row style={{ minHeight: TAP + 4, paddingHorizontal: space.xs }}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
        <Text style={{ flex: 1, color: t.text, fontSize: font.title, fontWeight: '700' }} accessibilityRole="header">
          Scrapyard
        </Text>
      </Row>
      <View style={{ paddingHorizontal: space.lg }}>
        <Row style={{ backgroundColor: t.surface2, borderRadius: radius.md, paddingLeft: space.md }}>
          <Icon name="search" size={18} color={t.textDim} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search every cut line" placeholderTextColor={t.textFaint} style={{ flex: 1, color: t.text, fontSize: font.body, minHeight: TAP }} testID="scrap-search" />
        </Row>
      </View>
      <FlatList
        data={scraps}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: space.lg, gap: space.xs, paddingBottom: 80 }}
        ListEmptyComponent={<Empty icon="trash-bin-outline" title={q ? 'No cut lines match' : 'Nothing cut yet'} hint="Deleted lines and versions land here so nothing is ever lost." />}
        renderItem={({ item: s }) => (
          <Pressable onPress={() => act(s)} style={({ pressed }) => [{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: t.border }, pressed && { opacity: 0.6 }]} accessibilityRole="button">
            <Text style={{ color: t.text, fontSize: font.lyric - 1 }}>{s.text}</Text>
            <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: 2 }}>
              {[s.songTitle || 'Untitled', s.sectionLabel, new Date(s.createdAt).toLocaleDateString()].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
