import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { openSong } from '../features/nav/openSong';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SONG_STATUSES, type Folder, type SongStatus } from '../core/model';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { importProject } from '../features/export/exportActions';
import { IdeaCard } from '../features/ideas/IdeaCard';
import { ImportSheet } from '../features/import/ImportSheet';
import { deleteAudio } from '../audio/storage';
import { songProgress } from '../core/song/progress';
import { askText, choose, confirm, toast } from '../ui/Dialogs';
import { ProgressRing } from '../ui/ProgressRing';
import { Chip, Empty, Icon, IconButton, Row } from '../ui/kit';
import { font, radius, space, TAP, useTheme } from '../ui/theme';

const ago = (ms: number) => {
  const d = Date.now() - ms;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)} min ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function Library() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SongStatus | null>(null);
  const [folder, setFolder] = useState<string | null | 'all'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [trash, setTrash] = useState(false);
  const [songs, setSongs] = useState<repo.SongListItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [counts, setCounts] = useState({ inbox: 0, scraps: 0 });
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    setSongs(await repo.listSongs(db, { query, status, folderId: folder, tag, trash }));
    setFolders(await repo.listFolders(db));
    setTags(await repo.allTags(db));
    setCounts({ inbox: (await repo.listIdeas(db)).length, scraps: (await repo.listScraps(db, '', 10000)).length });
  }, [query, status, folder, tag, trash]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  useEffect(() => {
    void load();
  }, [load]);

  const newSong = async () => {
    const db = await getDb();
    const doc = await repo.createSong(db, { folderId: folder && folder !== 'all' ? folder : null });
    openSong(doc.song.id);
  };

  const songMenu = async (s: repo.SongListItem) => {
    const db = await getDb();
    if (trash) {
      const v = await choose(s.title || 'Untitled', [
        { label: 'Restore', value: 'restore' },
        { label: 'Delete forever', value: 'purge', danger: true },
      ]);
      if (v === 'restore') await repo.restoreSong(db, s.id);
      if (v === 'purge' && (await confirm('Delete forever?', 'The song and its takes are removed from this device. This cannot be undone.', 'Delete', true))) {
        for (const f of await repo.purgeSong(db, s.id)) await deleteAudio(f);
      }
      return load();
    }
    const v = await choose(s.title || 'Untitled', [
      { label: s.pinned ? 'Unpin' : 'Pin to top', value: 'pin' },
      { label: 'Move to folder', value: 'folder' },
      { label: 'Duplicate', value: 'dup' },
      { label: 'Move to Trash', value: 'trash', danger: true },
    ]);
    if (v === 'pin') await repo.updateSong(db, s.id, { pinned: !s.pinned });
    if (v === 'dup') await repo.duplicateSong(db, s.id);
    if (v === 'trash') {
      await repo.trashSong(db, s.id);
      toast('Moved to Trash', { label: 'Undo', run: () => void repo.restoreSong(db, s.id).then(load) });
    }
    if (v === 'folder') {
      const f = await choose('Move to folder', [{ label: 'No folder', value: '' }, ...folders.map((x) => ({ label: x.name, value: x.id }))]);
      if (f !== null) await repo.updateSong(db, s.id, { folderId: f || null });
    }
    void load();
  };

  const folderMenu = async (f: Folder) => {
    const db = await getDb();
    const v = await choose(f.name, [
      { label: 'Rename', value: 'rename' },
      { label: 'Delete folder (songs stay)', value: 'delete', danger: true },
    ]);
    if (v === 'rename') {
      const n = await askText('Folder name', f.name);
      if (n?.trim()) await repo.renameFolder(db, f.id, n);
    }
    if (v === 'delete') {
      await repo.deleteFolder(db, f.id);
      if (folder === f.id) setFolder('all');
    }
    void load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <IconButton icon="arrow-back" label="Back to song" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={[styles.h1, { color: t.text }]} accessibilityRole="header">
          {trash ? 'Trash' : 'Library'}
        </Text>
        <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} testID="open-settings" />
      </View>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <View style={[styles.search, { backgroundColor: t.surface2 }]}>
          <Icon name="search" size={18} color={t.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search lyrics, titles, transcripts"
            placeholderTextColor={t.textFaint}
            style={{ flex: 1, color: t.text, fontSize: font.body, minHeight: TAP }}
            testID="library-search"
            autoCorrect={false}
          />
          {!!query && <IconButton icon="close" label="Clear search" size={18} onPress={() => setQuery('')} />}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
          {SONG_STATUSES.map((s) => (
            <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={status === s} onPress={() => setStatus(status === s ? null : s)} />
          ))}
          {tags.map((x) => (
            <Chip key={x.tag} label={`#${x.tag}`} selected={tag === x.tag} onPress={() => setTag(tag === x.tag ? null : x.tag)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
          <Chip label="All songs" selected={folder === 'all'} onPress={() => setFolder('all')} />
          {folders.map((f) => (
            <Chip key={f.id} label={f.name} selected={folder === f.id} onPress={() => setFolder(f.id)} onLongPress={() => folderMenu(f)} />
          ))}
          <Chip
            label="+ Folder"
            onPress={async () => {
              const n = await askText('New folder');
              if (n?.trim()) {
                const f = await repo.createFolder(await getDb(), n);
                setFolder(f.id);
              }
            }}
          />
        </ScrollView>
      </View>
      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 140 + insets.bottom, gap: space.sm }}
        ListHeaderComponent={
          !trash && !query ? (
            <View>
              <IdeaCard onStart={() => void newSong()} />
              <Row style={{ marginBottom: space.sm }}>
                <Shortcut icon="file-tray-outline" label="Inbox" count={counts.inbox} onPress={() => router.push('/inbox')} testID="open-inbox-screen" />
                <Shortcut icon="trash-bin-outline" label="Scrapyard" count={counts.scraps} onPress={() => router.push('/scrapyard')} testID="open-scrapyard" />
              </Row>
            </View>
          ) : undefined
        }
        ListEmptyComponent={<Empty icon={query ? 'search' : 'musical-notes-outline'} title={query ? 'Nothing matches' : trash ? 'Trash is empty' : 'No songs here yet'} />}
        renderItem={({ item: s }) => (
          <Pressable
            onPress={() => (trash ? songMenu(s) : openSong(s.id))}
            onLongPress={() => songMenu(s)}
            style={({ pressed }) => [styles.card, { backgroundColor: t.surface, borderColor: t.border }, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityHint="Long-press for options"
            testID={`song-${s.title || 'untitled'}`}
          >
            <Row>
              {s.pinned && <Icon name="pin" size={14} color={t.accent} />}
              <Text style={{ color: t.text, fontSize: font.body + 1, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {s.title || 'Untitled'}
              </Text>
              <Text style={{ color: t.textFaint, fontSize: font.small }}>{ago(s.updatedAt)}</Text>
            </Row>
            <Text style={{ color: t.textDim, fontSize: font.body, marginTop: 4 }} numberOfLines={2}>
              {s.match ?? (s.preview || 'Empty')}
            </Text>
            <Row style={{ marginTop: 6 }}>
              <ProgressRing {...(({ done, total }) => ({ done, total }))(songProgress({ title: s.title, ...s.progress }))} size={24} />
              <Text style={[styles.badge, { color: t.textDim, borderColor: t.border }]}>{s.status}</Text>
              {s.tags.slice(0, 3).map((x) => (
                <Text key={x} style={{ color: t.textFaint, fontSize: font.small }}>
                  #{x}
                </Text>
              ))}
            </Row>
          </Pressable>
        )}
      />
      <ImportSheet visible={importing} onClose={() => setImporting(false)} mode="new" />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]} pointerEvents="box-none">
        <Pressable onPress={() => setTrash(!trash)} style={[styles.pill, { backgroundColor: t.surface, borderColor: t.border }]} accessibilityRole="button" testID="toggle-trash">
          <Icon name={trash ? 'musical-notes-outline' : 'trash-outline'} size={18} color={t.textDim} />
          <Text style={{ color: t.textDim }}>{trash ? 'Songs' : 'Trash'}</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            const v = await choose('Import', [
              { label: 'Paste lyrics', value: 'text' },
              { label: 'Project ZIP (.stanza.zip)', value: 'zip' },
            ]);
            if (v === 'text') setImporting(true);
            if (v !== 'zip') return;
            try {
              const id = await importProject();
              if (id) {
                toast('Project imported');
                openSong(id);
              }
            } catch (e) {
              toast(String((e as Error).message ?? e));
            }
          }}
          testID="import"

          style={[styles.pill, { backgroundColor: t.surface, borderColor: t.border }]}
          accessibilityRole="button"
        >
          <Icon name="download-outline" size={18} color={t.textDim} />
          <Text style={{ color: t.textDim }}>Import</Text>
        </Pressable>
        <Pressable onPress={newSong} style={[styles.pill, { backgroundColor: t.accent, borderColor: t.accent }]} accessibilityRole="button" testID="new-song">
          <Icon name="add" size={20} color={t.accentText} />
          <Text style={{ color: t.accentText, fontWeight: '700' }}>New song</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Shortcut({ icon, label, count, onPress, testID }: { icon: 'file-tray-outline' | 'trash-bin-outline'; label: string; count: number; onPress: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.shortcut, { backgroundColor: t.surface2 }]} accessibilityRole="button" testID={testID}>
      <Icon name={icon} size={20} color={t.textDim} />
      <Text style={{ color: t.text, fontSize: font.body, flex: 1 }}>{label}</Text>
      <Text style={{ color: t.textFaint }}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, minHeight: TAP + 4 },
  h1: { flex: 1, fontSize: font.title, fontWeight: '700', paddingHorizontal: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, paddingLeft: space.md, gap: space.sm },
  card: { borderRadius: radius.md, padding: space.lg, borderWidth: StyleSheet.hairlineWidth },
  badge: { fontSize: font.tiny, textTransform: 'uppercase', letterSpacing: 0.6, borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TAP, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  shortcut: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TAP + 4, paddingHorizontal: space.md, borderRadius: radius.md },
});
