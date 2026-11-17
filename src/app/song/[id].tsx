/**
 * The song screen. A tab bar along the bottom splits it into five places:
 * Write (the lyrics and writing tools), Music (play the chords), Takes
 * (recordings and the Inbox), Shape (structure and how finished it is) and
 * Song (details, history, export). Quick tools still open as sheets.
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
import { CardImageSheet } from '../../features/export/CardImageSheet';
import { ReplaySheet } from '../../features/replay/ReplaySheet';
import { ImportSheet } from '../../features/import/ImportSheet';
import { connectSong, disconnect, sendPresence, useCollab } from '../../collab/collab';
import { CommentsSheet } from '../../collab/CommentsSheet';
import { MelodyChip, MelodyRoll, useMelodyUI } from '../../features/melody/MelodyRoll';
import { parseKey, romanNumeral } from '../../core/music/theory';
import { WordSheet, type WordTarget } from '../../features/words/WordSheet';
import { analyzeLine, wordAtOffset } from '../../core/phonetics/line';
import { InboxSheet } from '../../features/inbox/InboxSheet';
import { SongSheet, type SongSheetAction } from '../../features/song/SongSheet';
import { ShapeHeader, SongTabBar, TakesHeader, ToolPill, ToolStrip, useCardLabel, type SongTab } from '../../features/song/SongTabs';
import { SheetInline } from '../../ui/BottomSheet';
import { TakesSheet } from '../../features/takes/TakesSheet';
import { VersionsSheet } from '../../features/versions/VersionsSheet';
import { useSettings } from '../../store/settings';
import { findLine, flushSaves, useSong } from '../../store/song';
import { choose, toast } from '../../ui/Dialogs';
import { Icon, IconButton, pageStyle } from '../../ui/kit';
import { font, radius, space, TAP, useTheme, displayText } from '../../ui/theme';
import { alpha } from '../../ui/color';

type Sheet = null | 'versions' | 'arrange' | 'inbox' | 'sound' | 'web' | 'cards' | 'image' | 'replay' | 'comments' | 'import';

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
  const [tab, setTab] = useState<SongTab>('write');
  const cardLabel = useCardLabel();
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
  }, [sheet, capturePhase, tab]);

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
    scrollBus.visibleBottom = () => (kbTop !== null ? kbTop - 84 : winH - 150);
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

  const openFromSongSheet = (a: SongSheetAction) => setSheet(a);
  const openFromShape = (a: 'web' | 'arrange' | 'compare') => (a === 'compare' ? openCompare() : setSheet(a));
  const goTab = (x: SongTab) => {
    if (x === tab) return;
    Keyboard.dismiss();
    if (x !== 'write') useSong.setState({ focus: null });
    setTab(x);
  };
  const backToWrite = () => setTab('write');
  const keyboardUp = kbTop !== null;

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
    <View style={[pageStyle(t), { paddingTop: insets.top }]}>
      {/* top bar: library, title, save state, song menu */}
      <View style={[styles.top, { borderBottomColor: 'transparent' }]}>
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
          style={[styles.title, { color: t.text }, displayText(t, 22), Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
          accessibilityLabel="Song title"
          testID="song-title"
          returnKeyType="done"
        />
        <View style={styles.saveDot} accessibilityLabel={saveState === 'saved' ? 'All changes saved' : saveState === 'saving' ? 'Saving' : 'Save failed, retrying'} testID={`save-${saveState}`}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: saveState === 'saved' ? t.ok : saveState === 'saving' ? t.textFaint : t.danger, opacity: saveState === 'saved' ? 0.6 : 1 }} />
        </View>
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
      {/* Write: the lyrics. Kept mounted (only hidden) so scroll position and edits survive tab switches. */}
      <View style={{ flex: 1, display: tab === 'write' ? 'flex' : 'none' }}>
        <ToolStrip>
          <ToolPill icon="book-outline" label="Words" hint="Rhymes, thesaurus and dictionary for the word you're on" onPress={openWords} testID="open-words" />
          <ToolPill icon="color-palette-outline" label="Highlight" hint="Sound highlighting, rhyme types and counts" active={settings.highlight} onPress={() => setSheet('sound')} testID="open-sound" />
          <ToolPill
            icon="musical-notes-outline"
            label="Chord sheet"
            hint={settings.chordSheet ? 'Back to the lyric editor' : 'Read-only chord sheet view'}
            active={settings.chordSheet}
            onPress={() => {
              Keyboard.dismiss();
              // a stale "focus this line" request would reopen the editor with the keyboard
              useSong.setState({ focus: null });
              settings.set({ chordSheet: !settings.chordSheet });
            }}
            testID="toggle-sheet"
          />
          <ToolPill icon="albums-outline" label={cardLabel} hint="Write inside a rule, like only one-syllable words" onPress={() => setSheet('cards')} testID="open-cards" />
          <ToolPill icon="clipboard-outline" label="Import" hint="Paste lyrics; sections are labelled for you to confirm" onPress={() => setSheet('import')} testID="open-import" />
        </ToolStrip>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
            contentContainerStyle={[styles.page, { paddingBottom: 110 + (Platform.OS === 'ios' ? 0 : kbCover) }]} keyboardShouldPersistTaps={Platform.OS === "web" ? "always" : "handled"} keyboardDismissMode="interactive" testID="lyric-page">
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
            {!settings.chordSheet && <Pressable onPress={addSection} style={[styles.addSection, { borderColor: alpha(t.accent, 0.4), borderRadius: t.r.md, backgroundColor: alpha(t.accent, 0.05) }]} accessibilityRole="button" testID="add-section">
              <Icon name="add" size={18} color={t.textDim} />
              <Text style={{ color: t.textDim, fontSize: font.body }}>Section</Text>
            </Pressable>}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* the record button, in thumb reach; it rides above the keyboard */}
        {capturePhase === 'idle' && (
          <Pressable
            onPress={recordHere}
            onLongPress={() => startCapture({ songId: null, label: 'Idea' })}
            style={({ pressed }) => [styles.rec, { bottom: space.md + kbCover, backgroundColor: t.record }, ({ backgroundImage: `linear-gradient(145deg, ${t.record} 0%, ${t.accent2} 140%)`, boxShadow: `0 10px 26px ${alpha(t.record, 0.5)}` } as object), pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Record"
            accessibilityHint="Records a take for the section you're on. Long-press to record a loose idea to the Inbox."
            testID="record"
          >
            <Icon name="mic" size={28} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* the other tabs are full pages */}
      <SheetInline.Provider value>
        <ChordsSheet visible={tab === 'music'} onClose={backToWrite} />
        <TakesSheet visible={tab === 'takes'} onClose={backToWrite} header={<TakesHeader inboxCount={inboxCount} onInbox={() => setSheet('inbox')} />} />
        <ShapeSheet visible={tab === 'shape'} onClose={backToWrite} header={<ShapeHeader onOpen={openFromShape} />} />
        <SongSheet visible={tab === 'song'} onClose={backToWrite} onOpen={openFromSongSheet} />
      </SheetInline.Provider>

      {!keyboardUp && capturePhase === 'idle' && <SongTabBar tab={tab} onTab={goTab} takes={recordingsCount} bottomInset={insets.bottom} />}

      <VersionsSheet visible={sheet === 'versions'} onClose={() => setSheet(null)} />
      <ArrangeSheet visible={sheet === 'arrange'} onClose={() => setSheet(null)} />
      <InboxSheet visible={sheet === 'inbox'} onClose={() => setSheet(null)} />
      <LineSheet lineId={lineMenu} onClose={() => setLineMenu(null)} onLookup={(w) => setWordTarget({ word: w, lineId: lineMenu })} />
      <CompareSheet pair={compare} onClose={() => setCompare(null)} />
      <SoundSheet visible={sheet === 'sound'} onClose={() => setSheet(null)} analysis={analysis} />
      <WordSheet target={wordTarget} onClose={() => setWordTarget(null)} />
      <ChordPicker />
      <ImportSheet visible={sheet === 'import'} onClose={() => setSheet(null)} mode="append" />
      <RhymeWebSheet visible={sheet === 'web'} onClose={() => setSheet(null)} />
      <CardSheet visible={sheet === 'cards'} onClose={() => setSheet(null)} />
      <CardImageSheet visible={sheet === 'image'} onClose={() => setSheet(null)} />
      <ReplaySheet visible={sheet === 'replay'} onClose={() => setSheet(null)} />
      <CommentsSheet visible={sheet === 'comments'} onClose={() => setSheet(null)} lineId={activeLineId} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: TAP + 4 },
  title: { flex: 1, minWidth: 0, width: 0, paddingHorizontal: space.sm, minHeight: TAP },
  saveDot: { width: 20, alignItems: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 34 },
  page: { paddingHorizontal: space.md, paddingTop: space.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  addSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: TAP, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, marginLeft: 22, marginRight: 46 },
  rec: { position: 'absolute', right: space.lg, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
