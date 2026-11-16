/**
 * Chord sheet mode: the whole song laid out like a printed chord sheet. Chords
 * sit above the words they belong to. Tap a word to put a chord on it (long-
 * press a multi-syllable word to pick the syllable); tap a chord to change or
 * remove it. Lyrics aren't edited here, so nothing moves by accident.
 */
import { memo, useMemo } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chordSheetText } from '../../core/export/chordSheet';
import type { Line, SectionWithLines, SongDoc } from '../../core/model';
import { analyzeLine } from '../../core/phonetics/line';
import { keyName, parseKey } from '../../core/music/theory';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';
import { choose, toast } from '../../ui/Dialogs';
import { Button, Chip, Row } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { exportSong } from '../export/exportActions';
import { ChordGrid } from './ChordGrid';
import { openChordPicker } from './ChordPicker';

interface Piece {
  /** syllable this piece starts on */
  syl: number;
  text: string;
  chord?: string;
  /** syllables in the word this piece belongs to (for the long-press picker) */
  wordSyls: { syl: number; text: string }[];
}

/** Split a line into pieces: one per word, plus one for each later syllable that carries a chord. */
export function piecesOf(line: Line): Piece[] {
  const info = analyzeLine(line.text);
  const n = info.syllables.length;
  if (!n) return [];
  const chordAt = new Map<number, string>();
  for (const c of line.chords) chordAt.set(Math.min(c.syl, n - 1), c.chord);
  const points: { syl: number; at: number }[] = [];
  info.words.forEach((w, wi) => {
    if (!w.sylCount) return;
    points.push({ syl: w.firstSyl, at: points.length === 0 ? 0 : info.syllables[w.firstSyl].start });
    for (let k = 1; k < w.sylCount; k++) if (chordAt.has(w.firstSyl + k)) points.push({ syl: w.firstSyl + k, at: info.syllables[w.firstSyl + k].start });
  });
  const wordOf = (syl: number) => info.words.find((w) => syl >= w.firstSyl && syl < w.firstSyl + w.sylCount)!;
  return points.map((p, i) => {
    const w = wordOf(p.syl);
    return {
      syl: p.syl,
      text: line.text.slice(p.at, i + 1 < points.length ? points[i + 1].at : line.text.length),
      chord: chordAt.get(p.syl),
      wordSyls: Array.from({ length: w.sylCount }, (_, k) => ({ syl: w.firstSyl + k, text: line.text.slice(info.syllables[w.firstSyl + k].start, info.syllables[w.firstSyl + k].end).trim() })),
    };
  });
}

const LineView = memo(function LineView({ line, size, label }: { line: Line; size: number; label: (c: string) => string }) {
  const t = useTheme();
  const pieces = useMemo(() => piecesOf(line), [line]);
  if (!line.text.trim()) return <View style={{ height: size }} />;
  if (!pieces.length) return <Text style={{ color: t.text, fontSize: size, lineHeight: size * 1.4 }}>{line.text}</Text>;
  return (
    <View style={styles.line}>
      {pieces.map((p, i) => (
        <Pressable
          key={i}
          onPress={() => openChordPicker({ kind: 'syl', lineId: line.id, syl: p.syl })}
          onLongPress={async () => {
            if (p.wordSyls.length < 2) return;
            const v = await choose('Put the chord on which part?', p.wordSyls.map((s) => ({ label: s.text, value: String(s.syl) })));
            if (v !== null) openChordPicker({ kind: 'syl', lineId: line.id, syl: Number(v) });
          }}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={p.chord ? `${p.text.trim()}, chord ${p.chord}` : `Add a chord on ${p.text.trim()}`}
          style={styles.cell}
          testID={`sheet-word-${p.text.trim()}`}
        >
          <Text style={{ color: t.chord, fontWeight: '700', fontSize: size * 0.85, minHeight: size * 1.25 }} numberOfLines={1}>
            {p.chord ? label(p.chord) : ' '}
          </Text>
          <Text style={{ color: t.text, fontSize: size, lineHeight: size * 1.35 }}>{p.text}</Text>
        </Pressable>
      ))}
    </View>
  );
});

export function ChordSheetView({ doc, names, label }: { doc: SongDoc; names: string[]; label: (chord: string) => string }) {
  const t = useTheme();
  const settings = useSettings();
  const size = settings.sheetSize;
  const key = parseKey(doc.song.key);
  const hasChords = doc.sections.some((s) => s.bars.length || s.lines.some((l) => l.chords.length));
  return (
    <View testID="chord-sheet">
      <View style={[styles.controls, { backgroundColor: t.surface2 }]}>
        <Row style={{ flexWrap: 'wrap' }}>
          <Text style={{ color: t.textDim, fontSize: font.small }}>Key {key ? keyName(key) : '—'}</Text>
          <Button compact title="−1" onPress={() => useSong.getState().transposeSong(-1)} testID="sheet-down" />
          <Button compact title="+1" onPress={() => useSong.getState().transposeSong(1)} testID="sheet-up" />
          <Text style={{ color: t.textDim, fontSize: font.small, marginLeft: space.sm }}>Capo {doc.song.capo || '–'}</Text>
          <Button compact title="−" onPress={() => useSong.getState().setMeta({ capo: Math.max(0, doc.song.capo - 1) })} />
          <Button compact title="+" onPress={() => useSong.getState().setMeta({ capo: Math.min(11, doc.song.capo + 1) })} />
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip label="Numerals" selected={settings.romanChords} onPress={() => settings.set({ romanChords: !settings.romanChords })} testID="sheet-roman" />
          <Button compact title="A−" onPress={() => settings.set({ sheetSize: Math.max(14, size - 2) })} testID="sheet-smaller" />
          <Button compact title="A+" onPress={() => settings.set({ sheetSize: Math.min(34, size + 2) })} testID="sheet-larger" />
          <Button compact icon="tv-outline" title="Stage view" onPress={() => router.push(`/perform/${doc.song.id}`)} testID="open-stage" />
          <Button
            compact
            icon="share-outline"
            title="Share as text"
            onPress={() => exportSong(useSong.getState().doc!, 'chordsheet', { roman: settings.romanChords }).catch(() => toast('Could not share'))}
            testID="sheet-share"
          />
        </Row>
      </View>
      {!hasChords && <Text style={{ color: t.textDim, fontSize: font.small, marginVertical: space.sm }}>Tap any word to put a chord on it. Long-press a longer word to choose the syllable.</Text>}
      {doc.sections.map((s: SectionWithLines, i) => (
        <View key={s.id} style={{ marginTop: space.lg }}>
          <Text style={{ color: t.textDim, fontSize: font.small, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 4 }}>{names[i]}</Text>
          {s.bars.length > 0 && <ChordGrid section={s} index={i} label={label} />}
          {s.lines.map((l) => (
            <LineView key={l.id} line={l} size={size} label={label} />
          ))}
        </View>
      ))}
    </View>
  );
}

export { chordSheetText };

const styles = StyleSheet.create({
  controls: { borderRadius: radius.md, padding: space.sm, gap: space.sm },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 2 },
  cell: { alignItems: 'flex-start', minHeight: 44, justifyContent: 'flex-end' },
});
