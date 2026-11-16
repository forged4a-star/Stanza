/**
 * A section's chord blocks on a bar grid: four bars per row, up to four chords
 * per bar. Tap a chord to change it, tap + to add a bar, long-press a bar to
 * split it, play to loop the section.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SectionWithLines } from '../../core/model';
import { useSong } from '../../store/song';
import { choose } from '../../ui/Dialogs';
import { Icon } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { openChordPicker } from './ChordPicker';
import { stopPlayer, togglePlay, usePlayer } from './player';

interface Props {
  section: SectionWithLines;
  label: (chord: string) => string;
  index: number;
}

function ChordGridImpl({ section, label, index }: Props) {
  const t = useTheme();
  const playing = usePlayer((p) => p.playing && (p.scope === section.id || (p.scope === 'song' && p.sectionId === section.id)));
  const playingBar = usePlayer((p) => (p.sectionId === section.id ? p.bar : null));
  // the button shows Stop whenever this section is sounding (alone or as part of the song)
  const onPlay = () => (playing ? stopPlayer() : togglePlay(section.id));
  const barMenu = async (bi: number) => {
    const bar = section.bars[bi];
    const v = await choose(`Bar ${bi + 1}`, [
      ...(bar.chords.length < 4 ? [{ label: 'Add a chord to this bar', value: 'split' }] : []),
      { label: 'Duplicate bar', value: 'dup' },
      { label: 'Delete bar', value: 'del', danger: true },
    ]);
    const bars = section.bars.map((b) => ({ chords: [...b.chords] }));
    if (v === 'split') openChordPicker({ kind: 'bar', sectionId: section.id, bar: bi, slot: bar.chords.length });
    else if (v === 'dup') {
      bars.splice(bi + 1, 0, { chords: [...bar.chords] });
      useSong.getState().setBars(section.id, bars);
    } else if (v === 'del') {
      bars.splice(bi, 1);
      useSong.getState().setBars(section.id, bars);
    }
  };
  return (
    <View style={styles.wrap} testID={`chord-grid-${index}`}>
      <Pressable onPress={onPlay} style={[styles.play, { backgroundColor: t.surface2 }]} accessibilityRole="button" accessibilityLabel={playing ? 'Stop' : 'Loop this section'} testID={`play-section-${index}`}>
        <Icon name={playing ? 'stop' : 'play'} size={16} color={t.accent} />
      </Pressable>
      <View style={styles.bars}>
        {section.bars.map((bar, bi) => (
          <Pressable
            key={bi}
            onLongPress={() => barMenu(bi)}
            delayLongPress={350}
            style={[styles.bar, { borderColor: playingBar === bi ? t.accent : t.border, backgroundColor: playingBar === bi ? t.accent + '22' : 'transparent' }]}
            accessibilityLabel={`Bar ${bi + 1}: ${bar.chords.join(', ')}. Long-press for options.`}
            testID={`bar-${index}-${bi}`}
          >
            {bar.chords.map((c, ci) => (
              <Pressable key={ci} onPress={() => openChordPicker({ kind: 'bar', sectionId: section.id, bar: bi, slot: ci })} hitSlop={4} style={styles.slot} accessibilityRole="button">
                <Text style={{ color: t.chord, fontWeight: '700', fontSize: bar.chords.length > 2 ? font.small : font.body }} numberOfLines={1}>
                  {label(c)}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        ))}
        <Pressable onPress={() => openChordPicker({ kind: 'bar', sectionId: section.id, bar: null, slot: 0 })} style={[styles.bar, styles.add, { borderColor: t.border }]} accessibilityRole="button" accessibilityLabel="Add a bar" testID={`add-bar-${index}`}>
          <Icon name="add" size={18} color={t.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

export const ChordGrid = memo(ChordGridImpl);

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', marginLeft: 22, marginRight: 46, marginBottom: space.sm, gap: space.sm },
  play: { width: 36, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  bar: { width: '23.5%', minHeight: 40, borderWidth: 1, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  add: { justifyContent: 'center', borderStyle: 'dashed' },
});
