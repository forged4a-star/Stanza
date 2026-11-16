/**
 * Import lyrics: paste text, the app labels the sections, you confirm or fix
 * the labels, then it becomes a new song (or is added to the open one).
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { importLyrics, type ImportedSection } from '../../core/lyrics/importText';
import { SECTION_KIND_NAMES, SECTION_KINDS, sectionDisplayNames, type SectionKind, type SongDoc } from '../../core/model';
import { newId } from '../../core/util/id';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { choose, toast } from '../../ui/Dialogs';
import { Button, Chip, Field, IconButton, Row } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { openSong } from '../nav/openSong';
import { lyricsFromImage, ocrAvailable } from './ocr';

const WHY: Record<ImportedSection['why'], string> = {
  header: 'from its heading',
  repeats: 'it repeats',
  position: 'new part late in the song',
  default: 'a guess',
};

export function ImportSheet({ visible, onClose, mode }: { visible: boolean; onClose: () => void; mode: 'new' | 'append' }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<ImportedSection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (visible) {
      setText('');
      setTitle('');
      setSections(null);
    }
  }, [visible]);

  const analyse = () => {
    const r = importLyrics(text);
    if (!r.sections.length) return toast('Paste some lyrics first.');
    setSections(r.sections);
    setTitle(r.title ?? '');
  };

  const names = sections ? sectionDisplayNames(sections) : [];
  const patch = (i: number, p: Partial<ImportedSection>) => setSections((cur) => cur!.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const mergeUp = (i: number) =>
    setSections((cur) => {
      const next = [...cur!];
      const [s] = next.splice(i, 1);
      next[i - 1] = { ...next[i - 1], lines: [...next[i - 1].lines, ...s.lines], bars: [...next[i - 1].bars, ...s.bars] };
      return next;
    });

  const finish = async () => {
    if (!sections) return;
    setBusy(true);
    try {
      if (mode === 'append' && useSong.getState().doc) {
        const st = useSong.getState();
        for (const s of sections) {
          const id = st.addSection(s.kind, undefined, s.lines.length ? s.lines.map((l) => l.text) : ['']);
          if (s.label) st.updateSection(id, { label: s.label });
          if (s.bars.length) st.setBars(id, s.bars.map((c) => ({ chords: [c] })));
          const made = useSong.getState().doc!.sections.find((x) => x.id === id)!;
          s.lines.forEach((l, i) => l.chords.length && st.setLineChords(made.lines[i].id, l.chords));
        }
        toast(`Added ${sections.length} sections`);
        onClose();
      } else {
        const songId = newId();
        const doc: SongDoc = {
          song: { id: songId, title: title.trim(), folderId: null, status: 'draft', pinned: false, tags: [], key: null, bpm: 90, timeSig: [4, 4], capo: 0, createdAt: Date.now(), updatedAt: Date.now(), openedAt: Date.now(), deletedAt: null },
          sections: sections.map((s, i) => {
            const sid = newId();
            const lines = s.lines.length ? s.lines : [{ text: '', chords: [] }];
            return {
              id: sid,
              songId,
              kind: s.kind,
              label: s.label,
              sort: i,
              collapsed: false,
              feeling: '',
              intensity: null,
              bars: s.bars.map((c) => ({ chords: [c] })),
              melody: [],
              lines: lines.map((l, k) => ({ id: newId(), sectionId: sid, sort: k, text: l.text, locked: false, alts: [], chords: l.chords })),
            };
          }),
        };
        const made = await repo.importSongDoc(await getDb(), doc);
        onClose();
        openSong(made.song.id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={sections ? 'Check the sections' : 'Import lyrics'} height={0.92} testID="import-sheet">
      {!sections ? (
        <View style={{ flex: 1, paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
          <Text style={{ color: t.textDim, fontSize: font.small }}>Paste lyrics from anywhere. Sections are worked out from headings, blank lines and repeats; chord lines are kept above their words. You confirm before anything is saved.</Text>
          {ocrAvailable() && (
            <Button
              title={reading ? 'Reading the image…' : 'From a screenshot or photo'}
              icon="image-outline"
              busy={reading}
              onPress={async () => {
                setReading(true);
                const r = await lyricsFromImage();
                setReading(false);
                if (r.ok) {
                  setText(r.text);
                  toast('Text read. Fix anything that looks wrong, then sort it.');
                } else if (!r.cancelled) toast(r.reason);
              }}
              testID="import-screenshot"
            />
          )}
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Paste here"
            placeholderTextColor={t.textFaint}
            textAlignVertical="top"
            style={[styles.paste, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
            testID="import-text"
            accessibilityLabel="Lyrics to import"
          />
          <Button title="Sort into sections" kind="primary" icon="sparkles-outline" onPress={analyse} disabled={!text.trim()} testID="import-analyse" />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }} keyboardShouldPersistTaps="handled">
            {mode === 'new' && <Field label="Title" value={title} onChangeText={setTitle} placeholder="Untitled" testID="import-title" />}
            {sections.map((s, i) => (
              <View key={i} style={[styles.card, { borderColor: t.border }]} testID={`import-section-${i}`}>
                <Row>
                  <Chip
                    label={names[i]}
                    selected
                    onPress={async () => {
                      const k = await choose('This part is a…', SECTION_KINDS.map((x) => ({ label: SECTION_KIND_NAMES[x], value: x })));
                      if (k) patch(i, { kind: k as SectionKind, label: '', why: 'header' });
                    }}
                    testID={`import-kind-${i}`}
                  />
                  <Text style={{ color: t.textFaint, fontSize: font.small, flex: 1 }}>{WHY[s.why]}</Text>
                  {i > 0 && <IconButton icon="arrow-up" label="Join with the part above" size={18} color={t.textDim} onPress={() => mergeUp(i)} />}
                  <IconButton icon="close" label="Leave this part out" size={18} color={t.textDim} onPress={() => setSections((cur) => cur!.filter((_, k) => k !== i))} />
                </Row>
                {s.bars.length > 0 && <Text style={{ color: t.chord, fontWeight: '700', fontSize: font.small }}>{s.bars.join('  ')}</Text>}
                {s.lines.map((l, k) => (
                  <Text key={k} style={{ color: t.text, fontSize: font.body }}>
                    {l.chords.length > 0 && <Text style={{ color: t.chord, fontSize: font.tiny }}>{l.chords.map((c) => c.chord).join(' ')}  </Text>}
                    {l.text}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
          <Row style={{ padding: space.lg, paddingTop: space.sm }}>
            <Button title="Back" onPress={() => setSections(null)} />
            <Button title={mode === 'append' ? 'Add to this song' : 'Create song'} kind="primary" busy={busy} onPress={finish} style={{ flex: 1 }} disabled={!sections.length} testID="import-confirm" />
          </Row>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  paste: { flex: 1, minHeight: 200, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, fontSize: font.body },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, marginTop: space.md, gap: 2 },
});
