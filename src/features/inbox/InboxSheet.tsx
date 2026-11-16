/**
 * Inbox over the lyric page. Drag an idea (by its handle) onto a section to
 * drop it into the song; or tap "Add" to put it in the section you're on.
 */
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Idea, Recording } from '../../core/model';
import { deleteAudio } from '../../audio/storage';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { flushSaves, useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { askText, choose, toast } from '../../ui/Dialogs';
import { Button, Empty, Icon, IconButton, Row } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { measureZones, zoneAt } from '../editor/dropZones';
import { NO_SELECT } from '../../ui/DraggableList';
import { startCapture } from '../capture/capture';
import { TakeRow, useTakePlayer } from '../takes/TakesSheet';

type Item = Idea & { recording: Recording | null };

export async function addTextIdea(kind: 'text' | 'chords') {
  const v = await askText(kind === 'text' ? 'New idea' : 'Chord loop', '', {
    placeholder: kind === 'text' ? 'A line, a title, an image…' : 'e.g. Am F C G',
    multiline: kind === 'text',
    ok: 'Add to Inbox',
  });
  if (!v?.trim()) return false;
  await repo.addIdea(await getDb(), kind, v.trim());
  toast('Added to Inbox');
  return true;
}

export function InboxSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ text: string; x: number; y: number } | null>(null);
  const player = useTakePlayer();

  const load = async () => setItems(await repo.listIdeas(await getDb()));
  useEffect(() => {
    if (visible) void load();
    else player.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const place = async (idea: Item, sectionId: string | null) => {
    if (!doc) return;
    await flushSaves();
    await repo.useIdea(await getDb(), idea.id, doc.song.id, sectionId);
    await useSong.getState().reload();
    toast(idea.kind === 'audio' ? 'Take added to the song' : 'Added to the song');
    void load();
  };

  const addHere = (idea: Item) => {
    const st = useSong.getState();
    const sec = st.activeLineId ? st.doc?.sections.find((s) => s.lines.some((l) => l.id === st.activeLineId)) : null;
    void place(idea, sec?.id ?? null);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Inbox"
      height={0.6}
      light={!!dragging}
      testID="inbox-sheet"
      overlay={
        ghost ? (
          <View pointerEvents="none" style={[styles.ghost, { left: Math.max(8, ghost.x - 120), top: ghost.y - 28, backgroundColor: t.surface, borderColor: t.accent }]}>
            <Text style={{ color: t.text, fontSize: font.body }} numberOfLines={1}>
              {ghost.text}
            </Text>
            <Text style={{ color: t.textDim, fontSize: font.tiny }}>Drop on a section</Text>
          </View>
        ) : null
      }
    >
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Row>
          <Button compact title="Line" icon="add" onPress={async () => (await addTextIdea('text')) && load()} style={{ flex: 1 }} />
          <Button compact title="Chords" icon="add" onPress={async () => (await addTextIdea('chords')) && load()} style={{ flex: 1 }} />
          <Button
            compact
            title="Hum"
            icon="mic"
            onPress={() => {
              onClose();
              startCapture({ songId: null, label: 'Idea' });
            }}
            style={{ flex: 1 }}
          />
        </Row>
        {items.length > 0 && <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: space.sm }}>Drag an idea by its handle onto a section, or tap Add.</Text>}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} scrollEnabled={!dragging}>
        {items.length === 0 && <Empty icon="file-tray-outline" title="Inbox is empty" hint="Loose lines, hums and chord loops land here until they find a song." />}
        {items.map((it) => (
          <IdeaRow
            key={it.id}
            item={it}
            player={player}
            onDragState={(d) => {
              setDragging(d ? it.id : null);
              if (!d) setGhost(null);
            }}
            onDragMove={(x, y) => setGhost({ text: it.kind === 'audio' ? (it.recording?.title ?? 'Take') : it.text, x, y })}
            onDrop={(sectionId) => void place(it, sectionId)}
            onAdd={() => addHere(it)}
            onChanged={load}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function IdeaRow({
  item,
  player,
  onDragState,
  onDragMove,
  onDrop,
  onAdd,
  onChanged,
}: {
  item: Item;
  player: ReturnType<typeof useTakePlayer>;
  onDragState: (d: boolean) => void;
  onDragMove: (x: number, y: number) => void;
  onDrop: (sectionId: string) => void;
  onAdd: () => void;
  onChanged: () => void;
}) {
  const t = useTheme();
  const [active, setActive] = useState(false);
  const cb = useRef({ onDragState, onDrop, onDragMove });
  cb.current = { onDragState, onDrop, onDragMove };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        setActive(true);
        cb.current.onDragState(true);
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (e) => cb.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: async (e, g) => {
        const y = e.nativeEvent.pageY;
        setActive(false);
        cb.current.onDragState(false);
        if (Math.abs(g.dy) < 40) return;
        const zones = await measureZones();
        const id = zoneAt(zones, y);
        if (id) cb.current.onDrop(id);
      },
      onPanResponderTerminate: () => {
        setActive(false);
        cb.current.onDragState(false);
      },
    })
  ).current;

  const menu = async () => {
    const v = await choose('Idea', [...(item.kind !== 'audio' ? [{ label: 'Edit', value: 'edit' }] : []), { label: 'Delete', value: 'delete', danger: true }]);
    const db = await getDb();
    if (v === 'edit') {
      const nv = await askText('Edit idea', item.text, { multiline: item.kind === 'text' });
      if (nv !== null) await repo.updateIdea(db, item.id, nv);
    } else if (v === 'delete') {
      const file = await repo.deleteIdea(db, item.id);
      if (file) await deleteAudio(file);
      toast('Idea deleted');
    }
    onChanged();
  };

  return (
    <View style={[styles.idea, { borderBottomColor: t.border, backgroundColor: active ? t.surface2 : t.surface, opacity: active ? 0.5 : 1 }]} testID={`idea-${item.id}`}>
      <View {...pan.panHandlers} style={[styles.handle, NO_SELECT]} accessibilityLabel="Drag onto a section" accessibilityRole="adjustable">
        <Icon name="reorder-three" size={24} color={t.textDim} />
      </View>
      {item.kind === 'audio' && item.recording ? (
        <View style={{ flex: 1 }}>
          <TakeRow rec={item.recording} player={player} onChanged={onChanged} />
        </View>
      ) : (
        <View style={{ flex: 1, paddingVertical: space.sm }}>
          <Text style={{ color: t.textDim, fontSize: font.tiny, fontWeight: '700', letterSpacing: 0.8 }}>{item.kind === 'chords' ? 'CHORDS' : 'LINE'}</Text>
          <Text style={{ color: t.text, fontSize: item.kind === 'chords' ? font.body : font.lyric - 1, fontWeight: item.kind === 'chords' ? '700' : '400' }}>{item.text}</Text>
        </View>
      )}
      <Button compact kind="ghost" title="Add" onPress={onAdd} />
      {item.kind !== 'audio' && <IconButton icon="ellipsis-horizontal" label="Idea options" color={t.textDim} onPress={menu} />}
    </View>
  );
}

const styles = StyleSheet.create({
  idea: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: space.sm, minHeight: 64 },
  handle: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  ghost: { position: 'absolute', width: 240, borderRadius: radius.md, borderWidth: 2, padding: space.sm, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 10 },
});
