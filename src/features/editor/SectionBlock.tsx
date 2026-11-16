import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type HostInstance } from 'react-native';
import type { SectionWithLines } from '../../core/model';
import { useSong } from '../../store/song';
import { Icon } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { LyricLine, type LineDisplay } from './LyricLine';
import type { SongAnalysis } from './useSongAnalysis';
import { registerDropZone } from './dropZones';
import { SectionInput } from './SectionInput';

interface Props {
  section: SectionWithLines;
  name: string;
  analysis: SongAnalysis | null;
  display: LineDisplay;
  onMenu: (sectionId: string) => void;
  onRecord: (sectionId: string) => void;
  /** extra content under the header (chord grid, melody strip) */
  extra?: React.ReactNode;
  index: number;
}

function SectionBlockImpl({ section, name, analysis, display, onMenu, onRecord, extra, index }: Props) {
  const t = useTheme();
  const ref = useRef<HostInstance>(null);
  const toggle = () => useSong.getState().updateSection(section.id, { collapsed: !section.collapsed });

  useEffect(() => registerDropZone(section.id, ref), [section.id]);

  // tapping a line (or Enter / a new section) puts the whole section into edit mode
  const [editing, setEditing] = useState(false);
  const focusNonce = useSong((st) => (st.focus && section.lines.some((l) => l.id === st.focus!.lineId) ? st.focus.nonce : 0));
  useEffect(() => {
    if (focusNonce) setEditing(true);
  }, [focusNonce]);

  const firstText = section.lines.find((l) => l.text.trim())?.text ?? '';
  return (
    <View ref={ref} style={styles.block} testID={`section-${index}`}>
      <View style={styles.header}>
        <Pressable onPress={toggle} style={styles.headerTitle} accessibilityRole="button" accessibilityLabel={`${name}, ${section.collapsed ? 'collapsed' : 'expanded'}`} accessibilityHint="Tap to collapse or expand">
          <Icon name={section.collapsed ? 'chevron-forward' : 'chevron-down'} size={15} color={t.textFaint} />
          <Text style={[styles.name, { color: t.textDim }]} numberOfLines={1}>
            {name}
          </Text>
          {!!section.feeling && (
            <Text style={[styles.feeling, { color: t.textFaint }]} numberOfLines={1}>
              {section.feeling}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={() => onRecord(section.id)} style={styles.hBtn} accessibilityRole="button" accessibilityLabel={`Record a take of ${name}`} testID={`section-${index}-record`}>
          <Icon name="mic-outline" size={19} color={t.textFaint} />
        </Pressable>
        <Pressable onPress={() => onMenu(section.id)} style={styles.hBtn} accessibilityRole="button" accessibilityLabel={`${name} options`} testID={`section-${index}-menu`}>
          <Icon name="ellipsis-horizontal" size={19} color={t.textFaint} />
        </Pressable>
      </View>
      {section.collapsed ? (
        <Pressable onPress={toggle} style={styles.collapsed}>
          <Text style={{ color: t.textFaint, fontSize: font.body }} numberOfLines={1}>
            {section.lines.length} {section.lines.length === 1 ? 'line' : 'lines'}
            {firstText ? ` · ${firstText}` : ''}
          </Text>
        </Pressable>
      ) : (
        <>
          {extra}
          {editing ? (
            <SectionInput section={section} index={index} analysis={analysis} display={display} onDone={() => setEditing(false)} />
          ) : (
            section.lines.map((l, i) => (
            <LyricLine key={l.id} line={l} meta={analysis?.lines.get(l.id)} display={display} placeholder={i === 0 && section.lines.length === 1 ? 'Start writing…' : undefined} testID={`line-${index}-${i}`} />
            ))
          )}
        </>
      )}
    </View>
  );
}

export const SectionBlock = memo(SectionBlockImpl);

const styles = StyleSheet.create({
  block: { marginBottom: space.xl, borderRadius: radius.md },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 4 },
  name: { fontSize: font.small, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  feeling: { fontSize: font.small, fontStyle: 'italic', flexShrink: 1 },
  hBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  collapsed: { paddingLeft: 22, minHeight: 36, justifyContent: 'center' },
});
