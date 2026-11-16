/**
 * The lyric page — home. Everything else opens as a sheet over it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SECTION_KIND_NAMES, sectionDisplayNames, type SectionKind } from '../../core/model';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { startCapture, useCapturePhase } from '../../features/capture/capture';
import { SectionBlock } from '../../features/editor/SectionBlock';
import { ArrangeSheet, CompareSheet, LineSheet, sectionMenu } from '../../features/editor/sheets';
import { useSongAnalysis } from '../../features/editor/useSongAnalysis';
import type { LineDisplay } from '../../features/editor/LyricLine';
import { InboxSheet } from '../../features/inbox/InboxSheet';
import { SongSheet, type SongSheetAction } from '../../features/song/SongSheet';
import { TakesSheet } from '../../features/takes/TakesSheet';
import { VersionsSheet } from '../../features/versions/VersionsSheet';
import { useSettings } from '../../store/settings';
import { findLine, flushSaves, useSong } from '../../store/song';
import { choose, toast } from '../../ui/Dialogs';
import { Icon, IconButton } from '../../ui/kit';
import { font, radius, space, TAP, useTheme } from '../../ui/theme';

type Sheet = null | 'song' | 'takes' | 'versions' | 'arrange' | 'inbox' | 'sound' | 'words';

export default function SongPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const doc = useSong((s) => s.doc);
  const saveState = useSong((s) => s.saveState);
  const recordingsCount = useSong((s) => s.recordings.length);
  const settings = useSettings();
  const capturePhase = useCapturePhase();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [lineMenu, setLineMenu] = useState<string | null>(null);
  const [compare, setCompare] = useState<[number, number] | null>(null);
  const [inboxCount, setInboxCount] = useState(0);

  // (re)open on focus: this page may be revealed again by going back to it
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      useSong
        .getState()
        .open(id)
        .catch(() => router.replace('/library'));
    }, [id])
  );

  useEffect(() => {
    void getDb()
      .then((db) => repo.listIdeas(db))
      .then((l) => setInboxCount(l.length));
  }, [sheet, capturePhase]);

  const analysis = useSongAnalysis(doc, { highlight: settings.highlight, modes: settings.soundModes, sensitivity: settings.sensitivity, scope: settings.scope });
  const names = useMemo(() => (doc ? sectionDisplayNames(doc.sections) : []), [doc]);

  const display: LineDisplay = useMemo(
    () => ({
      showSyllables: settings.showSyllables,
      showStress: settings.showStress,
      showScheme: settings.showScheme,
      showChords: false,
      onMenu: (lineId) => setLineMenu(lineId),
    }),
    [settings.showSyllables, settings.showStress, settings.showScheme]
  );

  const recordHere = useCallback(() => {
    const st = useSong.getState();
    const d = st.doc;
    if (!d) return;
    const at = st.activeLineId ? findLine(d, st.activeLineId) : null;
    const nm = sectionDisplayNames(d.sections);
    if (at) startCapture({ songId: d.song.id, sectionId: at.section.id, label: nm[at.s] });
    else startCapture({ songId: d.song.id, label: d.song.title.trim() || 'Song' });
  }, []);

  const recordSection = useCallback((sectionId: string) => {
    const d = useSong.getState().doc!;
    const i = d.sections.findIndex((s) => s.id === sectionId);
    startCapture({ songId: d.song.id, sectionId, label: sectionDisplayNames(d.sections)[i] });
  }, []);

  const onSectionMenu = useCallback((sectionId: string) => void sectionMenu(sectionId, (a, b) => setCompare([a, b])), []);

  const addSection = async () => {
    const d = useSong.getState().doc!;
    // suggest the most likely next section
    const last = d.sections[d.sections.length - 1]?.kind;
    const order: SectionKind[] = last === 'verse' ? ['chorus', 'pre', 'verse', 'bridge'] : last === 'chorus' ? ['verse', 'bridge', 'outro', 'chorus'] : ['verse', 'chorus', 'bridge', 'pre'];
    const rest = (['intro', 'post', 'outro', 'custom'] as SectionKind[]).filter((k) => !order.includes(k));
    const k = await choose('Add a section', [...order, ...rest].map((x) => ({ label: SECTION_KIND_NAMES[x], value: x })));
    if (k) useSong.getState().addSection(k as SectionKind);
  };

  const openFromSongSheet = (a: SongSheetAction) => setSheet(a);

  if (!doc || doc.song.id !== id) {
    return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {/* top bar: library, title, save state, song menu */}
      <View style={[styles.top, { borderBottomColor: t.border }]}>
        <IconButton
          icon="library-outline"
          label="Library"
          onPress={async () => {
            await flushSaves();
            router.push('/library');
          }}
          testID="open-library"
        />
        <TextInput
          value={doc.song.title}
          onChangeText={(v) => useSong.getState().setTitle(v)}
          placeholder="Untitled"
          placeholderTextColor={t.textFaint}
          style={[styles.title, { color: t.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
          accessibilityLabel="Song title"
          testID="song-title"
          returnKeyType="done"
        />
        <View style={styles.saveDot} accessibilityLabel={saveState === 'saved' ? 'All changes saved' : saveState === 'saving' ? 'Saving' : 'Save failed, retrying'} testID={`save-${saveState}`}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: saveState === 'saved' ? t.ok : saveState === 'saving' ? t.textFaint : t.danger, opacity: saveState === 'saved' ? 0.6 : 1 }} />
        </View>
        <IconButton icon="ellipsis-horizontal" label="Song options" onPress={() => setSheet('song')} testID="open-song-sheet" />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 140 + insets.bottom }]} keyboardShouldPersistTaps={Platform.OS === "web" ? "always" : "handled"} keyboardDismissMode="interactive" testID="lyric-page">
          {doc.sections.map((s, i) => (
            <SectionBlock key={s.id} section={s} index={i} name={names[i]} analysis={analysis} display={display} onMenu={onSectionMenu} onRecord={recordSection} />
          ))}
          <Pressable onPress={addSection} style={[styles.addSection, { borderColor: t.border }]} accessibilityRole="button" testID="add-section">
            <Icon name="add" size={18} color={t.textDim} />
            <Text style={{ color: t.textDim, fontSize: font.body }}>Section</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* bottom: a few quiet tools within thumb reach, and the record button */}
      {capturePhase === 'idle' && (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.sm }]} pointerEvents="box-none">
          <View style={[styles.tools, { backgroundColor: t.surface, borderColor: t.border }]}>
            <IconButton icon="albums-outline" label={`Takes (${recordingsCount})`} onPress={() => setSheet('takes')} testID="open-takes" />
            <IconButton icon="file-tray-outline" label={`Inbox (${inboxCount})`} onPress={() => setSheet('inbox')} testID="open-inbox" />
            <IconButton icon="reorder-three" label="Arrange sections" onPress={() => setSheet('arrange')} testID="open-arrange" />
            <IconButton
              icon="git-compare-outline"
              label="Compare sections"
              onPress={() => {
                const d = useSong.getState().doc!;
                if (d.sections.length < 2) return toast('Add another section to compare');
                const st = useSong.getState();
                const at = st.activeLineId ? findLine(d, st.activeLineId) : null;
                const b = at ? at.s : 1;
                setCompare([b === 0 ? 1 : 0, b]);
              }}
              testID="open-compare"
            />
          </View>
          <Pressable
            onPress={recordHere}
            onLongPress={() => startCapture({ songId: null, label: 'Idea' })}
            style={({ pressed }) => [styles.rec, { backgroundColor: t.record }, pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Record"
            accessibilityHint="Records a take for the section you're on. Long-press to record a loose idea to the Inbox."
            testID="record"
          >
            <Icon name="mic" size={28} color="#fff" />
          </Pressable>
        </View>
      )}

      <SongSheet visible={sheet === 'song'} onClose={() => setSheet(null)} onOpen={openFromSongSheet} />
      <TakesSheet visible={sheet === 'takes'} onClose={() => setSheet(null)} />
      <VersionsSheet visible={sheet === 'versions'} onClose={() => setSheet(null)} />
      <ArrangeSheet visible={sheet === 'arrange'} onClose={() => setSheet(null)} />
      <InboxSheet visible={sheet === 'inbox'} onClose={() => setSheet(null)} />
      <LineSheet lineId={lineMenu} onClose={() => setLineMenu(null)} />
      <CompareSheet pair={compare} onClose={() => setCompare(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: TAP + 4 },
  title: { flex: 1, minWidth: 0, width: 0, fontSize: font.body + 2, fontWeight: '600', paddingHorizontal: space.sm, minHeight: TAP },
  saveDot: { width: 20, alignItems: 'center' },
  page: { paddingHorizontal: space.md, paddingTop: space.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  addSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: TAP, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, marginLeft: 22, marginRight: 46 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, gap: space.md },
  tools: { flexDirection: 'row', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.xs, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  rec: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
});
