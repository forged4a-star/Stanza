/** Line options, section arrangement and the side-by-side compare view. */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SECTION_KIND_NAMES, SECTION_KINDS, parallelSectionIndex, sectionDisplayNames, type SectionKind } from '../../core/model';
import { analyzeLine } from '../../core/phonetics/line';
import { findLine, useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { askText, choose, confirm, toast } from '../../ui/Dialogs';
import { DraggableList } from '../../ui/DraggableList';
import { Button, Chip, Icon, IconButton, ListItem, Row, SectionTitle } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { startCapture } from '../capture/capture';

// ------------------------------------------------------------------ line options

export function LineSheet({ lineId, onClose, onLookup }: { lineId: string | null; onClose: () => void; onLookup?: (word: string) => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const st = useSong.getState();
  const at = doc && lineId ? findLine(doc, lineId) : null;
  const names = doc ? sectionDisplayNames(doc.sections) : [];
  if (!at) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const { line } = at;
  const label = `${names[at.s]} · line ${at.l + 1}`;
  const words = line.text.split(/\s+/).map((w) => w.replace(/^[^\w']+|[^\w']+$/g, '')).filter(Boolean);
  return (
    <BottomSheet visible={!!lineId} onClose={onClose} title={label} height={0.62} testID="line-sheet">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <View style={{ paddingHorizontal: space.lg }}>
          <Text style={{ color: t.text, fontSize: font.lyric, lineHeight: font.lyricLine }}>{line.text || '(empty line)'}</Text>
          <SectionTitle>Versions of this line</SectionTitle>
          {line.alts.length === 0 && <Text style={{ color: t.textDim, fontSize: font.small }}>Swipe a line left to keep its wording and try another. Swipe right to flip between versions.</Text>}
        </View>
        {line.alts.map((a, i) => (
          <ListItem
            key={i + a}
            title={a}
            icon="swap-horizontal"
            onPress={() => {
              st.pickAlternate(line.id, i);
              toast('Switched version');
            }}
            right={<IconButton icon="trash-outline" label="Delete this version" color={t.textFaint} onPress={() => st.deleteAlternate(line.id, i)} />}
            testID={`alt-${i}`}
          />
        ))}
        <View style={{ paddingHorizontal: space.lg, gap: space.sm, marginTop: space.md }}>
          <Button title="Keep this wording as a version" icon="copy-outline" disabled={!line.text.trim() || line.locked} onPress={() => st.stashAlternate(line.id)} testID="stash-alt" />
        </View>
        <SectionTitle>{'  '}</SectionTitle>
        <ListItem title={line.locked ? 'Unlock line' : 'Lock line'} subtitle={line.locked ? undefined : 'Prevents accidental edits'} icon={line.locked ? 'lock-open-outline' : 'lock-closed'} onPress={() => st.toggleLock(line.id)} testID="toggle-lock" />
        <ListItem
          title="Record a take of this line"
          icon="mic-outline"
          onPress={() => {
            onClose();
            startCapture({ songId: doc!.song.id, sectionId: at.section.id, lineId: line.id, label: label });
          }}
        />
        {onLookup && words.length > 0 && (
          <ListItem
            title="Look up a word"
            icon="book-outline"
            onPress={async () => {
              const w = words.length === 1 ? words[0] : await choose('Which word?', words.map((x) => ({ label: x, value: x })));
              if (w) {
                onClose();
                onLookup(w);
              }
            }}
          />
        )}
        <ListItem
          title="Delete line"
          subtitle="It goes to the Scrapyard"
          icon="trash-outline"
          danger
          onPress={() => {
            if (line.locked) return toast('Unlock the line first');
            st.removeLine(line.id, false);
            onClose();
            toast('Line moved to the Scrapyard');
          }}
          testID="delete-line"
        />
      </ScrollView>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ section menu

export async function sectionMenu(sectionId: string, onCompare: (a: number, b: number) => void) {
  const st = useSong.getState();
  const doc = st.doc!;
  const idx = doc.sections.findIndex((s) => s.id === sectionId);
  const sec = doc.sections[idx];
  const names = sectionDisplayNames(doc.sections);
  const p = parallelSectionIndex(doc.sections, idx);
  const choice = await choose(names[idx], [
    { label: 'Change type', value: 'kind' },
    { label: 'Rename', value: 'rename' },
    { label: 'Duplicate', value: 'dup' },
    { label: sec.collapsed ? 'Expand' : 'Collapse', value: 'collapse' },
    ...(p !== null ? [{ label: `Compare with ${names[p]}`, value: 'compare' }] : [{ label: 'Compare with…', value: 'compare' }]),
    ...(idx > 0 ? [{ label: 'Move up', value: 'up' }] : []),
    ...(idx < doc.sections.length - 1 ? [{ label: 'Move down', value: 'down' }] : []),
    { label: 'Delete section', value: 'delete', danger: true },
  ]);
  switch (choice) {
    case 'kind': {
      const k = await choose('Section type', SECTION_KINDS.map((x) => ({ label: SECTION_KIND_NAMES[x], value: x })));
      if (k) st.updateSection(sectionId, { kind: k as SectionKind });
      break;
    }
    case 'rename': {
      const name = await askText('Section name', sec.label, { message: 'Leave empty for automatic names like "Verse 2".', placeholder: names[idx] });
      if (name !== null) st.updateSection(sectionId, { label: name.trim() });
      break;
    }
    case 'dup':
      st.duplicateSection(sectionId);
      toast('Section duplicated');
      break;
    case 'collapse':
      st.updateSection(sectionId, { collapsed: !sec.collapsed });
      break;
    case 'compare': {
      if (p !== null) onCompare(p, idx);
      else {
        const other = await choose(
          'Compare with',
          doc.sections.map((s, i) => ({ label: names[i], value: String(i) })).filter((o) => Number(o.value) !== idx)
        );
        if (other !== null) onCompare(Number(other), idx);
      }
      break;
    }
    case 'up':
      st.moveSection(idx, idx - 1);
      break;
    case 'down':
      st.moveSection(idx, idx + 1);
      break;
    case 'delete': {
      const hasWords = sec.lines.some((l) => l.text.trim());
      if (!hasWords || (await confirm(`Delete ${names[idx]}?`, 'Its lines go to the Scrapyard, and a version of the song is saved first.', 'Delete', true))) {
        st.deleteSection(sectionId);
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ arrange

const ROW_H = 60;

export function ArrangeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  if (!doc) return null;
  const names = sectionDisplayNames(doc.sections);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Arrange sections" height={0.7} testID="arrange-sheet">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} scrollEnabled>
        <Text style={{ color: t.textDim, fontSize: font.small, paddingHorizontal: space.lg, marginBottom: space.sm }}>Drag the handle to reorder.</Text>
        <DraggableList
          items={doc.sections}
          keyOf={(s) => s.id}
          rowHeight={ROW_H}
          onMove={(from, to) => useSong.getState().moveSection(from, to)}
          renderHandle={() => (
            <View style={{ width: 52, height: ROW_H, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Drag to reorder">
              <Icon name="reorder-three" size={26} color={t.textDim} />
            </View>
          )}
          renderRow={(s, i, handle, dragging) => {
            const first = s.lines.find((l) => l.text.trim())?.text ?? '';
            return (
              <View style={[styles.arrRow, { borderColor: t.border, backgroundColor: dragging ? t.surface2 : t.surface }]} testID={`arrange-${i}`}>
                {handle}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: font.body, fontWeight: '600' }}>{names[i]}</Text>
                  <Text style={{ color: t.textDim, fontSize: font.small }} numberOfLines={1}>
                    {first || 'empty'}
                  </Text>
                </View>
                <IconButton icon="copy-outline" label={`Duplicate ${names[i]}`} color={t.textDim} onPress={() => useSong.getState().duplicateSection(s.id)} />
              </View>
            );
          }}
        />
        <View style={{ padding: space.lg }}>
          <SectionTitle>Add a section</SectionTitle>
          <Row style={{ flexWrap: 'wrap' }}>
            {SECTION_KINDS.map((k) => (
              <Chip key={k} label={SECTION_KIND_NAMES[k]} onPress={() => useSong.getState().addSection(k)} />
            ))}
          </Row>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ compare

export function CompareSheet({ pair, onClose }: { pair: [number, number] | null; onClose: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const cur = sel ?? pair;
  const names = useMemo(() => (doc ? sectionDisplayNames(doc.sections) : []), [doc]);
  if (!doc || !cur) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const [a, b] = cur.map((i) => doc.sections[Math.min(i, doc.sections.length - 1)]);
  const rows = Math.max(a.lines.length, b.lines.length);
  const pick = async (side: 0 | 1) => {
    const v = await choose('Show section', doc.sections.map((s, i) => ({ label: names[i], value: String(i) })));
    if (v === null) return;
    const next: [number, number] = [...cur] as [number, number];
    next[side] = Number(v);
    setSel(next);
  };
  const stressStr = (text: string) =>
    analyzeLine(text)
      .syllables.map((s) => (s.level === 2 ? '●' : s.level === 1 ? '•' : '·'))
      .join('');
  return (
    <BottomSheet
      visible={!!pair}
      onClose={() => {
        setSel(null);
        onClose();
      }}
      title="Compare"
      height={0.8}
      testID="compare-sheet"
    >
      <View style={[styles.cmpHead, { borderColor: t.border }]}>
        {[0, 1].map((side) => (
          <Pressable key={side} style={styles.cmpCol} onPress={() => pick(side as 0 | 1)} accessibilityRole="button" accessibilityLabel={`Choose section ${side + 1}`}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: font.small + 1 }}>{names[cur[side]]}</Text>
            <Icon name="chevron-down" size={14} color={t.textDim} />
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }}>
        {Array.from({ length: rows }, (_, i) => {
          const la = a.lines[i]?.text ?? '';
          const lb = b.lines[i]?.text ?? '';
          const ca = la.trim() ? analyzeLine(la).syllables.length : null;
          const cb = lb.trim() ? analyzeLine(lb).syllables.length : null;
          const diff = ca !== null && cb !== null && ca !== cb;
          return (
            <View key={i} style={[styles.cmpRow, { borderColor: t.border, backgroundColor: diff ? t.warn + '18' : 'transparent' }]} testID={`compare-row-${i}`}>
              {[la, lb].map((text, side) => {
                const c = side === 0 ? ca : cb;
                return (
                  <View key={side} style={styles.cmpCol}>
                    <Text style={{ color: t.text, fontSize: font.body }}>{text || ' '}</Text>
                    {c !== null && (
                      <Text style={{ color: diff ? t.warn : t.textFaint, fontSize: font.tiny + 1, marginTop: 2 }}>
                        {c} · {stressStr(text)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  arrRow: { flex: 1, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: space.sm },
  cmpHead: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md },
  cmpCol: { flex: 1, paddingHorizontal: space.sm, paddingVertical: space.sm, flexDirection: 'column', gap: 2 },
  cmpRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm },
});
