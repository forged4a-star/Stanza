import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { diffSongs, diffStats, type LineDiff } from '../../core/lyrics/diff';
import type { Snapshot, SnapshotWithData } from '../../core/model';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { flushSaves, useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { askText, confirm, toast } from '../../ui/Dialogs';
import { Button, Empty, IconButton, ListItem, Row } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function VersionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [open, setOpen] = useState<SnapshotWithData | null>(null);

  const load = async () => {
    if (!doc) return;
    setSnaps(await repo.listSnapshots(await getDb(), doc.song.id));
  };
  useEffect(() => {
    if (visible) void load();
    else setOpen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!doc) return null;

  const saveNow = async () => {
    const label = await askText('Save a version', '', { placeholder: 'e.g. "before rewriting verse 2"', ok: 'Save' });
    if (label === null) return;
    await flushSaves();
    await repo.createSnapshot(await getDb(), doc.song.id, label.trim() || 'Saved version');
    toast('Version saved');
    void load();
  };

  const restore = async (s: SnapshotWithData) => {
    if (!(await confirm('Restore this version?', 'Your current lyrics are saved as a version first, so you can come back.', 'Restore'))) return;
    await flushSaves();
    await repo.restoreSnapshot(await getDb(), s.id);
    await useSong.getState().reload();
    toast('Version restored');
    setOpen(null);
    void load();
  };

  let diff: LineDiff[] = [];
  if (open) diff = diffSongs(open.data, doc);
  const stats = diffStats(diff);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={open ? open.label || `Auto · ${when(open.createdAt)}` : 'Versions'}
      height={0.8}
      headerRight={open ? <IconButton icon="arrow-back" label="Back to versions" onPress={() => setOpen(null)} /> : undefined}
      testID="versions-sheet"
    >
      {open ? (
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.textDim, fontSize: font.small, paddingHorizontal: space.lg }}>
            Changes from this version to now: {stats.changed} changed, {stats.added} added, {stats.removed} removed.
          </Text>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} testID="diff-view">
            {diff.map((r, i) => (
              <DiffRow key={i} row={r} />
            ))}
          </ScrollView>
          <Row style={{ padding: space.lg }}>
            <Button title="Restore this version" icon="arrow-undo-outline" kind="primary" onPress={() => restore(open)} style={{ flex: 1 }} testID="restore-version" />
          </Row>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
          <View style={{ padding: space.lg, paddingTop: 0 }}>
            <Button title="Save this version" icon="bookmark-outline" kind="primary" onPress={saveNow} testID="save-version" />
            <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: space.sm }}>Versions are also saved automatically when you open a song and when you leave the app.</Text>
          </View>
          {snaps.length === 0 && <Empty icon="time-outline" title="No versions yet" />}
          {snaps.map((s) => (
            <ListItem
              key={s.id}
              icon={s.auto ? 'time-outline' : 'bookmark'}
              title={s.label || 'Automatic'}
              subtitle={when(s.createdAt)}
              onPress={async () => setOpen(await repo.getSnapshot(await getDb(), s.id))}
              right={
                <IconButton
                  icon="trash-outline"
                  label="Delete version"
                  color={t.textFaint}
                  onPress={async () => {
                    if (await confirm('Delete this version?', undefined, 'Delete', true)) {
                      await repo.deleteSnapshot(await getDb(), s.id);
                      void load();
                    }
                  }}
                />
              }
            />
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function DiffRow({ row }: { row: LineDiff }) {
  const t = useTheme();
  const add = t.ok + '30';
  const del = t.danger + '26';
  if (row.type === 'header')
    return (
      <Text style={[styles.header, { color: row.change === 'add' ? t.ok : row.change === 'del' ? t.danger : t.textDim, textDecorationLine: row.change === 'del' ? 'line-through' : 'none' }]}>
        {row.text}
      </Text>
    );
  if (row.type === 'same') return <Text style={[styles.line, { color: t.textDim }]}>{row.text || ' '}</Text>;
  if (row.type === 'add')
    return (
      <Text style={[styles.line, { color: t.text, backgroundColor: add }]} testID="diff-add">
        + {row.text}
      </Text>
    );
  if (row.type === 'del')
    return (
      <Text style={[styles.line, { color: t.textDim, backgroundColor: del, textDecorationLine: 'line-through' }]} testID="diff-del">
        − {row.text}
      </Text>
    );
  return (
    <Text style={[styles.line, { color: t.text }]} testID="diff-change">
      ~{' '}
      {row.pieces.map((p, i) => (
        <Text key={i} style={p.type === 'add' ? { backgroundColor: add } : p.type === 'del' ? { backgroundColor: del, textDecorationLine: 'line-through', color: t.textDim } : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: space.md, marginBottom: 2 },
  line: { fontSize: font.body + 1, lineHeight: 26, borderRadius: 4, paddingHorizontal: 4 },
});
