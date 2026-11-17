import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { openSong } from '../nav/openSong';
import { router } from 'expo-router';
import { SONG_STATUSES, type Folder } from '../../core/model';
import { parseKey } from '../../core/music/theory';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { flushSaves, useSong } from '../../store/song';
import { useSettings } from '../../store/settings';
import { BottomSheet } from '../../ui/BottomSheet';
import { askText, choose, confirm, toast } from '../../ui/Dialogs';
import { Button, Chip, Field, ListItem, Row, SectionTitle, Segmented, ToggleRow } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';
import { exportSong, type ExportKind } from '../export/exportActions';
import { Share, Platform } from 'react-native';
import { roomFor, shareSong, stopSharing, useCollab } from '../../collab/collab';

export type SongSheetAction = 'versions' | 'sound' | 'image' | 'replay';

export function SongSheet({ visible, onClose, onOpen }: { visible: boolean; onClose: () => void; onOpen: (a: SongSheetAction) => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const st = useSong.getState();
  const settings = useSettings();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tab, setTab] = useState<'song' | 'view' | 'export'>('song');
  const [bpmText, setBpmText] = useState('');
  const [keyText, setKeyText] = useState('');
  const [transpose, setTranspose] = useState(0);
  const [roman, setRoman] = useState(false);
  const [busy, setBusy] = useState<ExportKind | null>(null);

  useEffect(() => {
    if (!visible || !doc) return;
    void getDb().then(repo.listFolders).then(setFolders);
    setBpmText(String(Math.round(doc.song.bpm)));
    setKeyText(doc.song.key ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!doc) return null;
  const s = doc.song;

  const run = async (kind: ExportKind) => {
    setBusy(kind);
    try {
      await exportSong(useSong.getState().doc!, kind, { transpose, roman });
    } catch (e) {
      console.warn(e);
      toast('Export failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Song" height={0.82} testID="song-sheet">
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'song', label: 'Details' },
            { value: 'view', label: 'View' },
            { value: 'export', label: 'Export' },
          ]}
          testID="song-sheet-tabs"
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        {tab === 'song' && (
          <View style={{ paddingHorizontal: space.lg }}>
            <SectionTitle>Status</SectionTitle>
            <Row>
              {SONG_STATUSES.map((x) => (
                <Chip key={x} label={x[0].toUpperCase() + x.slice(1)} selected={s.status === x} onPress={() => st.setMeta({ status: x })} testID={`status-${x}`} />
              ))}
              <Chip label={s.pinned ? 'Pinned' : 'Pin'} selected={s.pinned} onPress={() => st.setMeta({ pinned: !s.pinned })} />
            </Row>
            <SectionTitle>Music</SectionTitle>
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Key"
                  value={keyText}
                  onChangeText={setKeyText}
                  onBlur={() => {
                    const k = keyText.trim();
                    if (!k) st.setMeta({ key: null });
                    else if (parseKey(k)) st.setMeta({ key: k });
                    else {
                      toast('Try a key like C, F#m or Bb');
                      setKeyText(s.key ?? '');
                    }
                  }}
                  placeholder="e.g. G or Em"
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Tempo (bpm)"
                  value={bpmText}
                  onChangeText={setBpmText}
                  keyboardType="numeric"
                  onBlur={() => {
                    const n = Number(bpmText);
                    if (n >= 30 && n <= 300) st.setMeta({ bpm: n });
                    else setBpmText(String(Math.round(s.bpm)));
                  }}
                />
              </View>
            </Row>
            <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
              {(['4/4', '3/4', '6/8', '2/4', '12/8'] as const).map((ts) => (
                <Chip key={ts} label={ts} selected={s.timeSig.join('/') === ts} onPress={() => st.setMeta({ timeSig: ts.split('/').map(Number) as [number, number] })} />
              ))}
            </Row>
            <Row style={{ marginTop: space.md }}>
              <Text style={{ color: t.textDim, fontSize: font.body, flex: 1 }}>Capo {s.capo ? s.capo : 'none'}</Text>
              <Button compact title="−" onPress={() => st.setMeta({ capo: Math.max(0, s.capo - 1) })} />
              <Button compact title="+" onPress={() => st.setMeta({ capo: Math.min(11, s.capo + 1) })} />
            </Row>
            <SectionTitle>Organise</SectionTitle>
          </View>
        )}
        {tab === 'song' && (
          <>
            <ListItem
              icon="folder-outline"
              title={folders.find((f) => f.id === s.folderId)?.name ?? 'No folder'}
              subtitle="Folder"
              onPress={async () => {
                const v = await choose('Move to folder', [{ label: 'No folder', value: '' }, ...folders.map((f) => ({ label: f.name, value: f.id })), { label: 'New folder…', value: '__new' }]);
                if (v === null) return;
                if (v === '__new') {
                  const name = await askText('New folder');
                  if (!name?.trim()) return;
                  const f = await repo.createFolder(await getDb(), name);
                  setFolders([...folders, f]);
                  st.setMeta({ folderId: f.id });
                } else st.setMeta({ folderId: v || null });
              }}
            />
            <ListItem
              icon="pricetag-outline"
              title={s.tags.length ? s.tags.join(', ') : 'No tags'}
              subtitle="Tags"
              onPress={async () => {
                const v = await askText('Tags', s.tags.join(', '), { message: 'Separate tags with commas.' });
                if (v !== null) st.setTags(v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
              }}
              testID="edit-tags"
            />
            <View style={{ paddingHorizontal: space.lg }}>
              <SectionTitle>Share and perform</SectionTitle>
            </View>
            <ShareItem />
            <ListItem
              icon="easel-outline"
              title="Stage view"
              subtitle="Big words and chords that scroll with the tempo"
              onPress={async () => {
                await flushSaves();
                router.push(`/perform/${s.id}`);
              }}
              testID="open-stage"
            />
            <View style={{ paddingHorizontal: space.lg }}>
              <SectionTitle>History</SectionTitle>
            </View>
            <ListItem icon="time-outline" title="Versions" subtitle="Snapshots, compare, restore" onPress={() => onOpen('versions')} testID="open-versions" />
            <ListItem icon="play-circle-outline" title="Watch it being written" subtitle="Replay how the words came together" onPress={() => onOpen('replay')} testID="open-replay" />
            <View style={{ paddingHorizontal: space.lg }}>
              <SectionTitle>This song</SectionTitle>
            </View>
            <ListItem
              icon="copy-outline"
              title="Duplicate song"
              onPress={async () => {
                await flushSaves();
                const copy = await repo.duplicateSong(await getDb(), s.id);
                if (copy) openSong(copy.song.id);
              }}
            />
            <ListItem
              icon="trash-outline"
              title="Move song to Trash"
              danger
              onPress={async () => {
                if (!(await confirm('Move this song to the Trash?', 'You can restore it from the Library.', 'Move to Trash', true))) return;
                await flushSaves();
                await repo.trashSong(await getDb(), s.id);
                await useSong.getState().close();
                router.replace('/library');
              }}
            />
          </>
        )}
        {tab === 'view' && (
          <>
            <ToggleRow label="Syllable counts" hint="In the margin; amber when a line differs from its twin in the previous section" value={settings.showSyllables} onChange={(v) => settings.set({ showSyllables: v })} testID="toggle-syllables" />
            <ToggleRow label="Stress pattern" hint="Dots under each syllable: big = strong, small = weak" value={settings.showStress} onChange={(v) => settings.set({ showStress: v })} testID="toggle-stress" />
            <ToggleRow label="Rhyme scheme letters" value={settings.showScheme} onChange={(v) => settings.set({ showScheme: v })} />
            <ToggleRow label="Sound highlighting" value={settings.highlight} onChange={(v) => settings.set({ highlight: v })} testID="toggle-highlight" />
            <ToggleRow label="Cliché and repetition flags" hint="Dotted underline on well-worn phrases, tired rhymes and over-used words" value={settings.clicheFlags} onChange={(v) => settings.set({ clicheFlags: v })} testID="toggle-cliches" />
            <ListItem icon="color-palette-outline" title="Highlight settings" subtitle="Rhyme types, sensitivity, colours" onPress={() => onOpen('sound')} />
            <View style={{ padding: space.lg }}>
              <SectionTitle>Theme</SectionTitle>
              <Segmented
                value={settings.theme}
                onChange={(v) => settings.set({ theme: v })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </View>
          </>
        )}
        {tab === 'export' && (
          <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
            <SectionTitle>Lyrics</SectionTitle>
            <Button title="Text file (.txt)" icon="document-text-outline" onPress={() => run('txt')} busy={busy === 'txt'} testID="export-txt" />
            <Button title="PDF lyric sheet" icon="document-outline" onPress={() => run('pdf-lyrics')} busy={busy === 'pdf-lyrics'} />
            <Button title="Lyric card (picture)" icon="image-outline" onPress={() => onOpen('image')} testID="open-card-image" />
            <SectionTitle>Chords and melody</SectionTitle>
            <Row>
              <Text style={{ color: t.textDim, flex: 1 }}>Transpose {transpose > 0 ? `+${transpose}` : transpose}</Text>
              <Button compact title="−" onPress={() => setTranspose(Math.max(-11, transpose - 1))} />
              <Button compact title="+" onPress={() => setTranspose(Math.min(11, transpose + 1))} />
            </Row>
            <ToggleRow label="Roman numerals on the chart" value={roman} onChange={setRoman} />
            <Button title="Chord sheet as text (.txt)" icon="document-text-outline" onPress={() => run('chordsheet')} busy={busy === 'chordsheet'} testID="export-chordsheet" />
            <Button title="PDF chord chart" icon="musical-notes-outline" onPress={() => run('pdf-chords')} busy={busy === 'pdf-chords'} />
            <Button title="ChordPro (.cho)" icon="code-slash-outline" onPress={() => run('chordpro')} busy={busy === 'chordpro'} testID="export-chordpro" />
            <Button title="MIDI (chords + melody)" icon="musical-note-outline" onPress={() => run('midi')} busy={busy === 'midi'} />
            <SectionTitle>Everything</SectionTitle>
            <Button title="Project ZIP (lyrics, chords, melody, all takes)" icon="archive-outline" onPress={() => run('zip')} busy={busy === 'zip'} testID="export-zip" />
            <Text style={{ color: t.textFaint, fontSize: font.small }}>Single takes can be shared from the Takes sheet.</Text>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function ShareItem() {
  const status = useCollab((c) => c.status);
  const [busy, setBusy] = useState(false);
  const doc = useSong((s) => s.doc);
  const showLink = async (link: string) => {
    if (Platform.OS !== 'web') {
      try {
        await Share.share({ message: link });
        return;
      } catch {
        // fall through to the dialog
      }
    }
    await askText('Share this link with co-writers', link, { ok: 'Done', message: 'Anyone with the link can edit and comment.' });
  };
  if (status !== 'off')
    return (
      <ListItem
        icon="people-outline"
        title="Shared for co-writing"
        subtitle="Copy the link again, or stop sharing on this device"
        onPress={async () => {
          const v = await choose('Co-writing', [
            { label: 'Show the share link', value: 'link' },
            { label: 'Stop sharing on this device', value: 'stop', danger: true },
          ]);
          const room = doc ? await roomFor(doc.song.id) : null;
          if (v === 'link' && room) await showLink(`${room.server}/join/${room.roomId}?k=${room.key}`);
          if (v === 'stop') await stopSharing();
        }}
        testID="share-song"
      />
    );
  return (
    <ListItem
      icon="people-outline"
      title={busy ? 'Creating link…' : 'Share for co-writing'}
      subtitle="Live editing and comments by link (needs your Stanza server)"
      onPress={async () => {
        setBusy(true);
        try {
          await showLink(await shareSong());
        } catch (e) {
          toast(String((e as Error).message ?? e));
        } finally {
          setBusy(false);
        }
      }}
      testID="share-song"
    />
  );
}
