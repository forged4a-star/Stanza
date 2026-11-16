/**
 * One lyric line. Shows highlights, stress and chords when idle; becomes a
 * text field when tapped. Swipe left stashes the current wording as an
 * alternate; swipe right flips to the next alternate. Long-press for more.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance, type TextInputKeyPressEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Line } from '../../core/model';
import type { Mark } from '../../core/phonetics/sound';
import { useSong } from '../../store/song';
import { toast } from '../../ui/Dialogs';
import { Icon } from '../../ui/kit';
import { font, space, useTheme, type Theme } from '../../ui/theme';
import type { LineMeta } from './useSongAnalysis';

/** Where the caret is, for tools that act on "the word I'm on". */
export const caret = { lineId: null as string | null, pos: 0 };

export interface LineDisplay {
  showSyllables: boolean;
  showStress: boolean;
  showScheme: boolean;
  showChords: boolean;
  /** called when a word is tapped while not editing (word tools) */
  onWord?: (word: string, lineId: string) => void;
  onMenu: (lineId: string) => void;
  /** chord tapped/placed above a syllable */
  onChordTap?: (lineId: string, syl: number) => void;
  chordLabel?: (name: string) => string;
}

interface Props {
  line: Line;
  meta: LineMeta | undefined;
  display: LineDisplay;
  placeholder?: string;
  testID?: string;
}

function markColors(t: Theme, marks: Mark[] | undefined): { bg?: string; underline?: string } {
  if (!marks || !marks.length) return {};
  const pal = t.palette;
  const rhyme = marks.find((m) => m.mode === 'perfect' || m.mode === 'slant' || m.mode === 'multi');
  const other = marks.find((m) => m !== rhyme);
  return {
    bg: rhyme ? pal[rhyme.color % pal.length] + (rhyme.mode === 'slant' ? '99' : '') : undefined,
    underline: other ? t.paletteInk[other.color % t.paletteInk.length] : undefined,
  };
}

function LyricLineImpl({ line, meta, display, placeholder, testID }: Props) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [height, setHeight] = useState(font.lyricLine);
  const inputRef = useRef<TextInputInstance>(null);
  const selection = useRef({ start: 0, end: 0 });
  const focus = useSong((s) => (s.focus?.lineId === line.id ? s.focus : null));
  const setLineText = useSong((s) => s.setLineText);
  const translate = useRef(new Animated.Value(0)).current;

  // focus requests from the store (tap, Enter, merge, new section …)
  const pendingCaret = useRef<number | null>(null);
  const applyCaret = () => {
    const c = pendingCaret.current;
    if (c === null) return;
    pendingCaret.current = null;
    requestAnimationFrame(() => inputRef.current?.setSelection?.(c, c));
  };
  useEffect(() => {
    if (!focus || line.locked) return;
    const caret = focus.caret < 0 ? line.text.length : Math.min(focus.caret, line.text.length);
    pendingCaret.current = caret;
    selection.current = { start: caret, end: caret };
    if (editing && inputRef.current) {
      inputRef.current.focus();
      applyCaret();
    } else setEditing(true); // the TextInput mounts with autoFocus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const startEdit = () => {
    if (line.locked) {
      toast('This line is locked', { label: 'Unlock', run: () => useSong.getState().toggleLock(line.id) });
      return;
    }
    useSong.getState().requestFocus(line.id, -1);
  };

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    if (e.nativeEvent.key !== 'Backspace') return;
    const sel = selection.current;
    if (sel.start !== 0 || sel.end !== 0) return;
    const st = useSong.getState();
    // we handle it: don't let the same keystroke delete a character in the line we move to
    e.preventDefault?.();
    if (!line.text) st.removeLine(line.id);
    else st.mergeWithPrevious(line.id);
  };

  // swipe gestures on the idle line
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_, g) => translate.setValue(Math.max(-90, Math.min(90, g.dx))),
        onPanResponderRelease: (_, g) => {
          Animated.spring(translate, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
          const st = useSong.getState();
          const cur = st.doc ? findLineNow(line.id) : null;
          if (!cur || cur.locked) return;
          if (g.dx < -70) {
            if (!cur.text.trim()) return;
            st.stashAlternate(line.id);
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
            toast('Kept as an alternate. Write another version.', { label: 'Edit', run: () => st.requestFocus(line.id, -1) });
          } else if (g.dx > 70) {
            if (!cur.alts.length) {
              toast('No alternates yet. Swipe left to keep this version.');
              return;
            }
            st.cycleAlternate(line.id, 1);
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
          }
        },
        onPanResponderTerminate: () => Animated.spring(translate, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(),
      }),
    [line.id, translate]
  );

  const count = meta?.syllables ?? 0;
  const mismatch = meta?.mismatch;
  const lyricStyle = [styles.lyric, { color: t.text }];

  let body;
  if (editing) {
    body = (
      <TextInput
        testID={testID ? testID + '-input' : undefined}
        ref={inputRef}
        value={line.text}
        onChangeText={(v) => setLineText(line.id, v)}
        onSelectionChange={(e) => {
          selection.current = e.nativeEvent.selection;
          caret.lineId = line.id;
          caret.pos = e.nativeEvent.selection.start;
        }}
        onKeyPress={onKeyPress}
        autoFocus
        onFocus={() => {
          useSong.getState().setActiveLine(line.id);
          applyCaret();
        }}
        onBlur={() => {
          // let the tap that caused the blur finish before the layout changes,
          // or react-native-web cancels it (it sees the shift as a scroll)
          setTimeout(() => {
            if (!inputRef.current?.isFocused?.()) setEditing(false);
          }, Platform.OS === 'web' ? 250 : 0);
        }}
        multiline
        scrollEnabled={false}
        blurOnSubmit={false}
        autoCapitalize="sentences"
        autoCorrect
        placeholder={placeholder}
        placeholderTextColor={t.textFaint}
        onContentSizeChange={(e) => setHeight(Math.max(font.lyricLine, e.nativeEvent.contentSize.height))}
        style={[lyricStyle, styles.input, { height: Platform.OS === 'web' ? undefined : height, minHeight: font.lyricLine }]}
        accessibilityLabel="Lyric line"
      />
    );
  } else if (display.showStress || (display.showChords && (line.chords.length || display.onChordTap))) {
    body = <SyllableGrid line={line} meta={meta} display={display} t={t} />;
  } else {
    body = (
      <Text style={lyricStyle} testID={testID ? testID + '-text' : undefined}>
        {line.text ? <HighlightedText line={line} meta={meta} display={display} t={t} /> : <Text style={{ color: t.textFaint }}>{placeholder ?? ' '}</Text>}
      </Text>
    );
  }

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.left}>
        {line.locked ? <Icon name="lock-closed" size={13} color={t.textFaint} /> : line.alts.length ? <Text style={[styles.badge, { color: t.textDim, borderColor: t.border }]}>{line.alts.length + 1}</Text> : null}
      </View>
      <Animated.View style={{ flex: 1, transform: [{ translateX: translate }] }} {...(editing ? {} : pan.panHandlers)}>
        {editing ? (
          body
        ) : (
          <Pressable onPress={startEdit} onLongPress={() => display.onMenu(line.id)} delayLongPress={380} accessibilityRole="button" accessibilityHint="Tap to edit, long-press for line options, swipe to keep or flip alternates">
            {body}
          </Pressable>
        )}
      </Animated.View>
      <Pressable style={styles.margin} onPress={() => mismatch && toast(`${count} syllables here, ${mismatch.other} in ${mismatch.where}`)} accessibilityLabel={`${count} syllables${mismatch ? `, differs from ${mismatch.where}` : ''}`}>
        {display.showSyllables && count > 0 && (
          <Text style={[styles.count, { color: mismatch ? t.warn : t.textFaint, fontWeight: mismatch ? '700' : '400' }]} testID={testID ? testID + '-count' : undefined}>
            {count}
            {mismatch ? '•' : ''}
          </Text>
        )}
        {display.showScheme && meta?.scheme && <Text style={[styles.scheme, { color: t.textDim }]}>{meta.scheme}</Text>}
      </Pressable>
    </View>
  );
}

function findLineNow(id: string): Line | null {
  const doc = useSong.getState().doc;
  if (!doc) return null;
  for (const s of doc.sections) for (const l of s.lines) if (l.id === id) return l;
  return null;
}

/** Inline text with per-syllable highlight spans (fast path). */
function HighlightedText({ line, meta, display, t }: { line: Line; meta: LineMeta | undefined; display: LineDisplay; t: Theme }) {
  if (!meta || !meta.marks.some((m) => m.length)) {
    return <WordTapText text={line.text} lineId={line.id} display={display} />;
  }
  const out: React.ReactNode[] = [];
  let pos = 0;
  meta.info.syllables.forEach((s, i) => {
    if (s.start > pos) out.push(<Text key={'g' + i}>{line.text.slice(pos, s.start)}</Text>);
    const { bg, underline } = markColors(t, meta.marks[i]);
    const word = meta.info.words[s.wordIndex];
    out.push(
      <Text
        key={'s' + i}
        onLongPress={display.onWord ? () => display.onWord!(word.text, line.id) : undefined}
        style={[bg ? { backgroundColor: bg, borderRadius: 3 } : null, underline ? { textDecorationLine: 'underline', textDecorationColor: underline, textDecorationStyle: 'solid' } : null]}
      >
        {line.text.slice(s.start, s.end)}
      </Text>
    );
    pos = s.end;
  });
  if (pos < line.text.length) out.push(<Text key="tail">{line.text.slice(pos)}</Text>);
  return <>{out}</>;
}

function WordTapText({ text, lineId, display }: { text: string; lineId: string; display: LineDisplay }) {
  if (!display.onWord) return <>{text}</>;
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((p, i) =>
        /\S/.test(p) ? (
          <Text key={i} onLongPress={() => display.onWord!(p.replace(/^[^\w']+|[^\w']+$/g, ''), lineId)}>
            {p}
          </Text>
        ) : (
          p
        )
      )}
    </>
  );
}

/**
 * Word-by-word layout with a row above for chords and a row below for stress
 * dots, aligned to each syllable.
 */
function SyllableGrid({ line, meta, display, t }: { line: Line; meta: LineMeta | undefined; display: LineDisplay; t: Theme }) {
  if (!meta || !line.text) return <Text style={[styles.lyric, { color: t.textFaint }]}> </Text>;
  const { info } = meta;
  const chordAt = new Map(line.chords.map((c) => [c.syl, c.chord]));
  const words: React.ReactNode[] = [];
  let pos = 0;
  info.words.forEach((w, wi) => {
    const lead = line.text.slice(pos, w.start);
    const sylViews: React.ReactNode[] = [];
    for (let k = 0; k < w.sylCount; k++) {
      const si = w.firstSyl + k;
      const s = info.syllables[si];
      const end = k === w.sylCount - 1 ? (info.words[wi + 1]?.start ?? line.text.length) : info.syllables[si + 1].start;
      const textPart = (k === 0 ? lead : '') + line.text.slice(s.start, end);
      const { bg, underline } = markColors(t, meta.marks[si]);
      const chord = chordAt.get(si);
      sylViews.push(
        <View key={si} style={styles.sylCol}>
          {display.showChords && (
            <Pressable onPress={display.onChordTap ? () => display.onChordTap!(line.id, si) : undefined} hitSlop={4} style={styles.chordCell} accessibilityLabel={chord ? `Chord ${chord}` : 'Add chord here'}>
              <Text style={[styles.chord, { color: t.chord }]} numberOfLines={1}>
                {chord ? (display.chordLabel ? display.chordLabel(chord) : chord) : ' '}
              </Text>
            </Pressable>
          )}
          <Text style={[styles.lyric, { color: t.text }]}>
            {k === 0 && lead ? lead : null}
            <Text style={[bg ? { backgroundColor: bg, borderRadius: 3 } : null, underline ? { textDecorationLine: 'underline', textDecorationColor: underline } : null]}>
              {line.text.slice(s.start, end).replace(/\s+$/, '')}
            </Text>
            {/\s$/.test(line.text.slice(s.start, end)) ? ' ' : ''}
          </Text>
          {display.showStress && (
            <View style={styles.stressRow}>
              <View
                style={[
                  styles.stressDot,
                  s.level === 2 ? { backgroundColor: t.text, width: 7, height: 7 } : s.level === 1 ? { backgroundColor: t.textDim, width: 5, height: 5 } : { backgroundColor: t.textFaint, width: 3, height: 3 },
                ]}
              />
            </View>
          )}
        </View>
      );
    }
    words.push(
      <View key={wi} style={styles.word}>
        {sylViews}
      </View>
    );
    pos = (info.words[wi + 1]?.start ?? line.text.length);
  });
  if (!info.words.length) return <Text style={[styles.lyric, { color: t.text }]}>{line.text}</Text>;
  return <View style={styles.grid}>{words}</View>;
}

export const LyricLine = memo(LyricLineImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: font.lyricLine + 6 },
  left: { width: 22, alignItems: 'center', paddingTop: 9 },
  badge: { fontSize: 10, borderWidth: 1, borderRadius: 7, paddingHorizontal: 3, lineHeight: 13, overflow: 'hidden' },
  lyric: { fontSize: font.lyric, lineHeight: font.lyricLine, paddingVertical: 3 },
  input: { padding: 0, paddingVertical: 3, margin: 0, textAlignVertical: 'top', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  margin: { width: 46, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, paddingTop: 7, minHeight: font.lyricLine },
  count: { fontSize: font.small, fontVariant: ['tabular-nums'] },
  scheme: { fontSize: font.small, fontWeight: '700', width: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', paddingVertical: 2 },
  word: { flexDirection: 'row' },
  sylCol: { alignItems: 'flex-start' },
  chordCell: { minHeight: 18, minWidth: 14, justifyContent: 'flex-end' },
  chord: { fontSize: font.small, fontWeight: '700' },
  stressRow: { height: 9, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  stressDot: { borderRadius: 4 },
});

export const LINE_MARGIN_LEFT = 22;
export const LINE_SPACE = space.xs;
