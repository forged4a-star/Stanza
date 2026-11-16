import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { diffSongs, diffStats, type LineDiff } from '../../core/lyrics/diff';
import { describeStep, goneLines, stepSummary } from '../../core/lyrics/timeline';
import type { Snapshot, SnapshotWithData } from '../../core/model';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { flushSaves, useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { askText, confirm, toast } from '../../ui/Dialogs';
import { Button, Empty, IconButton, ListItem, Row, Segmented, Slider } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function VersionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [open, setOpen] = useState<SnapshotWithData | null>(null);
  const [mode, setMode] = useState<'list' | 'travel'>('list');

  const load = async () => {
    if (!doc) return;
    setSnaps(await repo.listSnapshots(await getDb(), doc.song.id));
  };
  useEffect(() => {
    if (visible) void load();
    else (setOpen(null), setMode('list'));
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
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'list', label: 'List' },
                { value: 'travel', label: 'Time travel' },
              ]}
              testID="versions-mode"
            />
          </View>
          {mode === 'travel' ? (
            <Travel snaps={snaps} onRestored={() => void load()} />
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
        </View>
      )}
    </BottomSheet>
  );
}

/** Scrub through the song's history. Each step shows what changed; lines that are gone now can be pulled back. */
function Travel({ snaps, onRestored }: { snaps: Snapshot[]; onRestored: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const [timeline, setTimeline] = useState<SnapshotWithData[] | null>(null);
  const [pos, setPos] = useState(-1);

  useEffect(() => {
    let live = true;
    (async () => {
      const db = await getDb();
      const recent = [...snaps].sort((a, b) => a.createdAt - b.createdAt).slice(-40);
      const loaded: SnapshotWithData[] = [];
      for (const sn of recent) {
        const full = await repo.getSnapshot(db, sn.id);
        if (full) loaded.push(full);
      }
      if (live) {
        setTimeline(loaded);
        setPos(loaded.length); // start at Now
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps.length]);

  if (!timeline) return <Text style={{ color: t.textDim, padding: space.lg }}>Loading history…</Text>;
  if (timeline.length === 0) return <Empty icon="time-outline" title="No history yet" hint="Versions appear as you write and when you save one." />;
  const n = timeline.length; // index n is "Now"
  const at = Math.min(Math.max(pos, 0), n);
  const isNow = at === n;
  const cur = isNow ? doc : timeline[at].data;
  const prev = at === 0 ? null : at - 1 === n ? doc : timeline[at - 1].data;
  const snap = isNow ? null : timeline[at];
  const rows = prev ? diffSongs(prev, cur).filter((r) => r.type !== 'same') : [];
  const gone = isNow ? [] : goneLines(cur, doc);

  const pull = (g: ReturnType<typeof goneLines>[number]) => {
    const st = useSong.getState();
    const target = g.sectionId ?? st.doc!.sections[st.doc!.sections.length - 1]?.id;
    if (!target) return;
    st.appendLine(target, g.text);
    toast(g.sectionId ? `Added back to ${g.sectionName}` : 'Added to the last section');
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }} testID="travel">
      <Text style={{ color: t.text, fontSize: font.body + 1, fontWeight: '700' }} testID="travel-label">
        {isNow ? 'Now' : snap!.label || `Auto · ${when(snap!.createdAt)}`}
      </Text>
      <Text style={{ color: t.textDim, fontSize: font.small }} testID="travel-when">
        {isNow ? 'The song as it is' : when(snap!.createdAt)} · version {at + 1} of {n + 1}
      </Text>
      <Row>
        <IconButton icon="chevron-back" label="Earlier version" onPress={() => setPos(Math.max(0, at - 1))} disabled={at === 0} testID="travel-earlier" />
        <View style={{ flex: 1 }}>
          <Slider value={n ? at / n : 1} onChange={(v) => setPos(Math.round(v * n))} label="Scrub through versions" testID="travel-slider" />
        </View>
        <IconButton icon="chevron-forward" label="Later version" onPress={() => setPos(Math.min(n, at + 1))} disabled={isNow} testID="travel-later" />
      </Row>
      <Text style={{ color: t.textDim, fontSize: font.small + 1, marginBottom: space.sm }} testID="travel-step">
        {at === 0 ? 'Earliest saved version' : `Since the version before: ${describeStep(stepSummary(prev, cur))}`}
      </Text>
      {rows.length > 0 && (
        <View testID="travel-diff">
          {rows.map((r, i) => (
            <DiffRow key={i} row={r} />
          ))}
        </View>
      )}
      {gone.length > 0 && (
        <View style={{ marginTop: space.lg }} testID="travel-gone">
          <Text style={{ color: t.textDim, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 0.8 }}>IN THIS VERSION, GONE NOW</Text>
          {gone.map((g, i) => (
            <Row key={i} style={{ marginTop: space.xs }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: font.body }}>{g.text}</Text>
                <Text style={{ color: t.textFaint, fontSize: font.small }}>{g.sectionName}</Text>
              </View>
              <Button compact title="Pull back" onPress={() => pull(g)} testID={`pull-${i}`} />
            </Row>
          ))}
        </View>
      )}
      {!isNow && (
        <Button
          title="Restore this version"
          icon="arrow-undo-outline"
          onPress={async () => {
            if (!(await confirm('Restore this version?', 'Your current lyrics are saved as a version first, so you can come back.', 'Restore'))) return;
            await flushSaves();
            await repo.restoreSnapshot(await getDb(), snap!.id);
            await useSong.getState().reload();
            toast('Version restored');
            onRestored();
          }}
          style={{ marginTop: space.lg }}
          testID="travel-restore"
        />
      )}
    </ScrollView>
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
