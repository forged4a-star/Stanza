/**
 * The lyric page — home. Everything else opens as a sheet over it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { scrollBus } from '../../features/editor/scrollBus';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SECTION_KIND_NAMES, sectionDisplayNames, type SectionKind } from '../../core/model';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { startCapture, useCapturePhase } from '../../features/capture/capture';
import { SectionBlock } from '../../features/editor/SectionBlock';
import { ArrangeSheet, CompareSheet, LineSheet, sectionMenu } from '../../features/editor/sheets';
import { useSongAnalysis } from '../../features/editor/useSongAnalysis';
import { caret, type LineDisplay } from '../../features/editor/LyricLine';
import { SoundSheet } from '../../features/sound/SoundSheet';
import { ChordGrid } from '../../features/chords/ChordGrid';
import { ChordSheetView } from '../../features/chords/ChordSheetView';
import { prepareFor } from '../../audio/engine';
import { ChordPicker, openChordPicker } from '../../features/chords/ChordPicker';
import { ChordsSheet } from '../../features/chords/ChordsSheet';
import { stopPlayer } from '../../features/chords/player';
import { ShapeSheet } from '../../features/shape/ShapeSheet';
import { RhymeWebSheet } from '../../features/shape/RhymeWebSheet';
import { CardSheet } from '../../features/cards/CardSheet';
import { ImportSheet } from '../../features/import/ImportSheet';
import { connectSong, disconnect, sendPresence, useCollab } from '../../collab/collab';
import { CommentsSheet } from '../../collab/CommentsSheet';
import { MelodyChip, MelodyRoll, useMelodyUI } from '../../features/melody/MelodyRoll';
import { parseKey, romanNumeral } from '../../core/music/theory';
import { WordSheet, type WordTarget } from '../../features/words/WordSheet';
import { analyzeLine, wordAtOffset } from '../../core/phonetics/line';
import { InboxSheet } from '../../features/inbox/InboxSheet';
import { SongSheet, type SongSheetAction } from '../../features/song/SongSheet';
import { TakesSheet } from '../../features/takes/TakesSheet';
import { VersionsSheet } from '../../features/versions/VersionsSheet';
import { useSettings } from '../../store/settings';
import { findLine, flushSaves, useSong } from '../../store/song';
import { choose, toast } from '../../ui/Dialogs';
import { Icon, IconButton } from '../../ui/kit';
import { font, radius, space, TAP, useTheme } from '../../ui/theme';

type Sheet = null | 'song' | 'takes' | 'versions' | 'arrange' | 'inbox' | 'sound' | 'words' | 'chords' | 'shape' | 'web' | 'cards' | 'comments' | 'import';

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
  const [wordTarget, setWordTarget] = useState<WordTarget | null>(null);
  const melodyOpen = useMelodyUI((s) => s.open);

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

  const analysis = useSongAnalysis(doc, { highlight: settings.highlight, modes: settings.soundModes, sensitivity: settings.sensitivity, scope: settings.scope, flags: settings.clicheFlags });
  const names = useMemo(() => (doc ? sectionDisplayNames(doc.sections) : []), [doc]);

  const songKey = doc?.song.key ?? null;
  const chordLabel = useCallback(
    (c: string) => {
      const k = settings.romanChords ? parseKey(songKey) : null;
      return k ? romanNumeral(c, k) : c;
    },
    [settings.romanChords, songKey]
  );
  const display: LineDisplay = useMemo(
    () => ({
      showSyllables: settings.showSyllables,
      showStress: settings.showStress,
      showScheme: settings.showScheme,
      showChords: settings.showChords,
      onMenu: (lineId) => setLineMenu(lineId),
      onWord: (word, lineId) => word && setWordTarget({ word, lineId }),
      onChordTap: (lineId, syl) => openChordPicker({ kind: 'syl', lineId, syl }),
      chordLabel,
    }),
    [settings.showSyllables, settings.showStress, settings.showScheme, settings.showChords, chordLabel]
  );

  // keyboard: know where it is, lift the toolbar above it, and let editors scroll the caret into view
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const [kbTop, setKbTop] = useState<number | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbTop(e.endCoordinates.screenY));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // how much of the window the keyboard covers (0 when the system already resized the window)
  const kbCover = kbTop === null ? 0 : Math.max(0, winH - kbTop);
  useEffect(() => {
    scrollBus.by = (dy) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: true });
    scrollBus.visibleBottom = () => (kbTop ?? winH) - 84;
  }, [kbTop, winH]);

  // stop the chord player when leaving the song
  useEffect(() => () => stopPlayer(), []);

  // co-writing: join the song's room while it's open
  const collabStatus = useCollab((c) => c.status);
  const peers = useCollab((c) => c.peers);
  const openComments = useCollab((c) => c.comments.filter((x) => !x.resolved).length);
  const activeLineId = useSong((x) => x.activeLineId);
  // warm the sounds this song uses, once, so the first play doesn't stall
  const warmKey = doc ? `${doc.song.id}:${settings.instrument}:${doc.song.capo}` : '';
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => void prepareFor(doc.sections.flatMap((s) => s.bars), settings.instrument, doc.song.capo), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmKey]);
  useEffect(() => {
    if (!id) return;
    void connectSong(id);
    return () => disconnect();
  }, [id]);
  useEffect(() => {
    if (collabStatus === 'live') sendPresence(activeLineId);
  }, [activeLineId, collabStatus]);

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

  const openFromSongSheet = (a: SongSheetAction) => {
    if (a === 'compare') {
      setSheet(null);
      openCompare();
    } else setSheet(a);
  };

  /** Look up the word under the caret (or the last word of the active line). */
  const openWords = () => {
    const st = useSong.getState();
    const d = st.doc!;
    const lineId = caret.lineId ?? st.activeLineId;
    const at = lineId ? findLine(d, lineId) : null;
    let word = '';
    if (at) {
      const info = analyzeLine(at.line.text);
      const w = caret.lineId === at.line.id ? wordAtOffset(info, caret.pos) : info.words[info.words.length - 1];
      word = w?.norm.replace(/^'+|'+$/g, '') ?? '';
    }
    setWordTarget({ word, lineId: at?.line.id ?? null });
  };

  const openCompare = () => {
    const d = useSong.getState().doc!;
    if (d.sections.length < 2) return toast('Add another section to compare');
    const st = useSong.getState();
    const at = st.activeLineId ? findLine(d, st.activeLineId) : null;
    const b = at ? at.s : 1;
    setCompare([b === 0 ? 1 : 0, b]);
  };

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
        <IconButton
          icon="musical-notes"
          label={settings.chordSheet ? 'Back to the lyric editor' : 'Chord sheet view'}
          active={settings.chordSheet}
          onPress={() => {
            Keyboard.dismiss();
            // a stale "focus this line" request would reopen the editor with the keyboard
            useSong.setState({ focus: null });
            settings.set({ chordSheet: !settings.chordSheet });
          }}
          testID="toggle-sheet"
        />
        <IconButton icon="ellipsis-horizontal" label="Song options" onPress={() => setSheet('song')} testID="open-song-sheet" />
      </View>

      {collabStatus !== 'off' && (
        <Pressable onPress={() => setSheet('comments')} style={[styles.live, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel="Co-writers and comments" testID="live-bar">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: collabStatus === 'live' ? t.ok : t.warn }} />
          <Text style={{ color: t.textDim, fontSize: font.small, flex: 1 }} numberOfLines={1}>
            {collabStatus === 'live' ? `Live · ${peers.map((p) => p.name).join(', ')}` : collabStatus === 'connecting' ? 'Connecting…' : 'Offline · your edits are kept here'}
          </Text>
          <Icon name="chatbubble-ellipses-outline" size={16} color={t.textDim} />
          <Text style={{ color: t.textDim, fontSize: font.small }} testID="comment-count">{openComments}</Text>
        </Pressable>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
          contentContainerStyle={[styles.page, { paddingBottom: 140 + insets.bottom + (Platform.OS === 'ios' ? 0 : kbCover) }]} keyboardShouldPersistTaps={Platform.OS === "web" ? "always" : "handled"} keyboardDismissMode="interactive" testID="lyric-page">
          {settings.chordSheet ? (
            <ChordSheetView doc={doc} names={names} label={chordLabel} />
          ) : (
            doc.sections.map((s, i) => (
            <SectionBlock
              key={s.id}
              section={s}
              index={i}
              name={names[i]}
              analysis={analysis}
              display={display}
              onMenu={onSectionMenu}
              onRecord={recordSection}
              extra={
                s.bars.length || s.melody.length || melodyOpen[s.id] ? (
                  <>
                    {s.bars.length > 0 && <ChordGrid section={s} index={i} label={chordLabel} />}
                    {melodyOpen[s.id] ? <MelodyRoll section={s} index={i} /> : <MelodyChip section={s} />}
                  </>
                ) : null
              }
            />
            ))
          )}
          {!settings.chordSheet && <Pressable onPress={addSection} style={[styles.addSection, { borderColor: t.border }]} accessibilityRole="button" testID="add-section">
            <Icon name="add" size={18} color={t.textDim} />
            <Text style={{ color: t.textDim, fontSize: font.body }}>Section</Text>
          </Pressable>}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* bottom: a few quiet tools within thumb reach, and the record button */}
      {capturePhase === 'idle' && (
        <View style={[styles.bottom, { paddingBottom: (kbCover ? 0 : insets.bottom) + space.sm, bottom: kbCover }]} pointerEvents="box-none">
          <View style={[styles.tools, { backgroundColor: t.surface, borderColor: t.border }]}>
            <IconButton icon="albums-outline" label={`Takes (${recordingsCount})`} onPress={() => setSheet('takes')} testID="open-takes" />
            <IconButton icon="file-tray-outline" label={`Inbox (${inboxCount})`} onPress={() => setSheet('inbox')} testID="open-inbox" />

            <IconButton icon="book-outline" label="Words: rhymes, thesaurus, dictionary" onPress={openWords} testID="open-words" />
            <IconButton icon="color-palette-outline" label="Sound: highlighting and counts" active={settings.highlight} onPress={() => setSheet('sound')} testID="open-sound" />
            <IconButton icon="musical-notes-outline" label="Chords: play, circle of fifths, ideas, shapes" onPress={() => setSheet('chords')} testID="open-chords" />
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
      <LineSheet lineId={lineMenu} onClose={() => setLineMenu(null)} onLookup={(w) => setWordTarget({ word: w, lineId: lineMenu })} />
      <CompareSheet pair={compare} onClose={() => setCompare(null)} />
      <SoundSheet visible={sheet === 'sound'} onClose={() => setSheet(null)} analysis={analysis} />
      <WordSheet target={wordTarget} onClose={() => setWordTarget(null)} />
      <ChordsSheet visible={sheet === 'chords'} onClose={() => setSheet(null)} />
      <ChordPicker />
      <ImportSheet visible={sheet === 'import'} onClose={() => setSheet(null)} mode="append" />
      <ShapeSheet visible={sheet === 'shape'} onClose={() => setSheet(null)} />
      <RhymeWebSheet visible={sheet === 'web'} onClose={() => setSheet(null)} />
      <CardSheet visible={sheet === 'cards'} onClose={() => setSheet(null)} />
      <CommentsSheet visible={sheet === 'comments'} onClose={() => setSheet(null)} lineId={activeLineId} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: TAP + 4 },
  title: { flex: 1, minWidth: 0, width: 0, fontSize: font.body + 2, fontWeight: '600', paddingHorizontal: space.sm, minHeight: TAP },
  saveDot: { width: 20, alignItems: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 34 },
  page: { paddingHorizontal: space.md, paddingTop: space.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  addSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: TAP, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, marginLeft: 22, marginRight: 46 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, gap: space.md },
  tools: { flexDirection: 'row', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.xs, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  rec: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
});
