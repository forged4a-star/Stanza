/**
 * Editing a section: one text box for all its lines, so Enter, Backspace
 * (including holding it across line breaks), selection and paste behave like
 * any notes app. A hidden mirror of the lines measures where each one sits,
 * so syllable counts stay aligned and the page can keep the caret above the
 * keyboard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import type { SectionWithLines } from '../../core/model';
import { useSong } from '../../store/song';
import { toast } from '../../ui/Dialogs';
import { Icon } from '../../ui/kit';
import { font, useTheme } from '../../ui/theme';
import { caret, type LineDisplay } from './LyricLine';
import { scrollBus } from './scrollBus';
import type { SongAnalysis } from './useSongAnalysis';

interface Props {
  section: SectionWithLines;
  index: number;
  analysis: SongAnalysis | null;
  display: LineDisplay;
  onDone: () => void;
}

export function SectionInput({ section, index, analysis, display, onDone }: Props) {
  const t = useTheme();
  const ref = useRef<TextInputInstance>(null);
  const lines = section.lines;
  const value = useMemo(() => lines.map((l) => l.text).join('\n'), [lines]);
  const [heights, setHeights] = useState<number[]>([]);
  const [, bump] = useState(0);
  const focus = useSong((s) => (s.focus && lines.some((l) => l.id === s.focus!.lineId) ? s.focus : null));
  const sel = useRef(0);

  // top of each line within the text box
  const tops: number[] = [];
  let total = 0;
  lines.forEach((_, i) => {
    tops.push(total);
    total += heights[i] ?? font.lyricLine;
  });

  const offsetOf = (lineId: string, pos: number) => {
    let off = 0;
    for (const l of lines) {
      if (l.id === lineId) return off + (pos < 0 ? l.text.length : Math.min(pos, l.text.length));
      off += l.text.length + 1;
    }
    return off;
  };
  const lineAt = (offset: number) => {
    let off = 0;
    for (let i = 0; i < lines.length; i++) {
      const end = off + lines[i].text.length;
      if (offset <= end) return { i, pos: offset - off };
      off = end + 1;
    }
    return { i: lines.length - 1, pos: lines[lines.length - 1]?.text.length ?? 0 };
  };

  /** keep the caret's line above the keyboard */
  const reveal = () => {
    const node = ref.current;
    if (!node) return;
    const { i } = lineAt(sel.current);
    node.measureInWindow((_x, y) => {
      const lineTop = y + (tops[i] ?? 0);
      const lineBottom = lineTop + (heights[i] ?? font.lyricLine);
      const limit = scrollBus.visibleBottom() - 16;
      if (lineBottom > limit) scrollBus.by(lineBottom - limit + 40);
      else if (lineTop < 110) scrollBus.by(lineTop - 150);
    });
  };
  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  // place the caret where the tap / new line asked for
  useEffect(() => {
    if (!focus) return;
    const off = offsetOf(focus.lineId, focus.caret);
    sel.current = off;
    const apply = () => {
      ref.current?.focus();
      const node = ref.current as unknown as { setSelection?: (a: number, b: number) => void; setSelectionRange?: (a: number, b: number) => void } | null;
      if (node?.setSelection) node.setSelection(off, off);
      else node?.setSelectionRange?.(off, off); // web textarea
      setTimeout(() => revealRef.current(), 60);
    };
    // straight away: applying it a frame later would move the caret under a fast typist
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => setTimeout(() => revealRef.current(), 50));
    return () => sub.remove();
  }, []);

  const onChange = (text: string) => {
    if (!useSong.getState().setSectionText(section.id, text)) {
      toast('That line is locked. Unlock it from its menu to change it.');
      bump((n) => n + 1); // re-render so the box snaps back
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {lines.map((l, i) => (l.locked ? <View key={l.id} style={[styles.abs, { top: tops[i] + 8 }]}><Icon name="lock-closed" size={13} color={t.textFaint} /></View> : null))}
      </View>
      <View style={{ flex: 1 }}>
        {/* hidden mirror: same text, same width, measures each line's height */}
        <View style={styles.mirror} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {lines.map((l, i) => (
            <Text
              key={l.id}
              style={styles.lyric}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setHeights((cur) => {
                  if (Math.abs((cur[i] ?? 0) - h) < 0.5 && cur.length === lines.length) return cur;
                  const next = lines.map((_, k) => cur[k] ?? font.lyricLine);
                  next[i] = h;
                  return next;
                });
              }}
            >
              {l.text || ' '}
            </Text>
          ))}
        </View>
        <TextInput
          ref={ref}
          testID={`section-${index}-input`}
          value={value}
          onChangeText={onChange}
          onSelectionChange={(e) => {
            const s = e.nativeEvent.selection.start;
            sel.current = s;
            const at = lineAt(s);
            const line = lines[at.i];
            if (line) {
              caret.lineId = line.id;
              caret.pos = at.pos;
              if (useSong.getState().activeLineId !== line.id) useSong.getState().setActiveLine(line.id);
            }
            revealRef.current();
          }}
          onBlur={() => {
            // let the tap that caused the blur finish before the layout changes
            setTimeout(() => {
              if (!ref.current?.isFocused?.()) onDone();
            }, Platform.OS === 'web' ? 250 : 0);
          }}
          multiline
          scrollEnabled={false}
          autoFocus
          autoCapitalize="sentences"
          autoCorrect
          placeholder="Start writing…"
          placeholderTextColor={t.textFaint}
          style={[styles.lyric, styles.input, { color: t.text, height: Math.max(font.lyricLine, total) + 6 }]}
          accessibilityLabel="Lyrics of this section"
        />
      </View>
      <View style={styles.margin}>
        {lines.map((l, i) => {
          const meta = analysis?.lines.get(l.id);
          if (!meta || !meta.syllables) return null;
          return (
            <View key={l.id} style={[styles.abs, styles.marginRow, { top: tops[i] }]}>
              {display.showSyllables && (
                <Text testID={`line-${index}-${i}-count`} style={{ fontSize: font.small, color: meta.mismatch ? t.warn : t.textFaint, fontWeight: meta.mismatch ? '700' : '400' }}>
                  {meta.syllables}
                  {meta.mismatch ? '•' : ''}
                </Text>
              )}
              {display.showScheme && meta.scheme && <Text style={{ fontSize: font.small, fontWeight: '700', width: 12, textAlign: 'center', color: t.textDim }}>{meta.scheme}</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3 },
  left: { width: 22 },
  abs: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  lyric: { fontSize: font.lyric, lineHeight: font.lyricLine },
  mirror: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  input: { padding: 0, margin: 0, textAlignVertical: 'top', includeFontPadding: false, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  margin: { width: 46 },
  marginRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, height: font.lyricLine },
});
