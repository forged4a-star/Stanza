/**
 * The song screen's layout: a tab bar along the bottom (Write, Music, Takes,
 * Shape, Song), a row of writing tools on the Write tab, and the headers that
 * sit on top of the Takes and Shape pages.
 */
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { progressFromDoc } from '../../core/song/progress';
import { flushSaves, useSong } from '../../store/song';
import { alpha } from '../../ui/color';
import { Icon } from '../../ui/kit';
import { ProgressRing } from '../../ui/ProgressRing';
import { font, space, TAP, useTheme } from '../../ui/theme';
import { useCardBreaks } from '../cards/CardSheet';

type IconName = ComponentProps<typeof Icon>['name'];
export type SongTab = 'write' | 'music' | 'takes' | 'shape' | 'song';

const TABS: { id: SongTab; label: string; icon: IconName; on: IconName; testID: string; hint: string }[] = [
  { id: 'write', label: 'Write', icon: 'create-outline', on: 'create', testID: 'tab-write', hint: 'Lyrics, chords over words, writing tools' },
  { id: 'music', label: 'Music', icon: 'musical-notes-outline', on: 'musical-notes', testID: 'open-chords', hint: 'Play the chords, circle of fifths, ideas, shapes' },
  { id: 'takes', label: 'Takes', icon: 'mic-outline', on: 'mic', testID: 'open-takes', hint: 'Recordings, the full-song take, the Inbox' },
  { id: 'shape', label: 'Shape', icon: 'pulse-outline', on: 'pulse', testID: 'open-shape', hint: 'How the song is coming together' },
  { id: 'song', label: 'Song', icon: 'disc-outline', on: 'disc', testID: 'open-song-sheet', hint: 'Details, view options, history, export' },
];

export function SongTabBar({ tab, onTab, takes, bottomInset }: { tab: SongTab; onTab: (t: SongTab) => void; takes: number; bottomInset: number }) {
  const t = useTheme();
  return (
    <View
      style={[styles.bar, { backgroundColor: alpha(t.surface, 0.98), borderTopColor: t.border, paddingBottom: bottomInset }, { boxShadow: '0 -6px 24px rgba(0,0,0,0.18)' } as object]}
      accessibilityRole="tablist"
      testID="song-tabs"
    >
      {TABS.map((x) => {
        const on = tab === x.id;
        return (
          <Pressable
            key={x.id}
            onPress={() => onTab(x.id)}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={x.id === 'takes' && takes ? `${x.label} (${takes})` : x.label}
            accessibilityHint={x.hint}
            testID={x.testID}
          >
            <View style={[styles.pill, on && { backgroundColor: alpha(t.accent, 0.16) }]}>
              <Icon name={on ? x.on : x.icon} size={22} color={on ? t.accent : t.textDim} />
              {x.id === 'takes' && takes > 0 && (
                <View style={[styles.badge, { backgroundColor: t.record }]}>
                  <Text style={styles.badgeText}>{takes > 99 ? '99+' : takes}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: on ? t.text : t.textDim, fontSize: 11, fontWeight: on ? '700' : '500' }}>{x.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One writing tool on the Write tab: icon and a word, so nothing hides behind a symbol. */
export function ToolPill({ icon, label, onPress, active, testID, hint }: { icon: IconName; label: string; onPress: () => void; active?: boolean; testID?: string; hint?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tool,
        { borderColor: active ? alpha(t.accent, 0.7) : t.border, backgroundColor: active ? alpha(t.accent, 0.15) : alpha(t.surface, 0.7), borderRadius: 999 },
        pressed && { opacity: 0.6 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      testID={testID}
    >
      <Icon name={icon} size={16} color={active ? t.accent : t.textDim} />
      <Text style={{ color: active ? t.text : t.textDim, fontSize: font.small + 1, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function ToolStrip({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="always" testID="write-tools">
      {children}
    </ScrollView>
  );
}

/** A big tappable card used for the main action of a page. */
export function ActionCard({ icon, title, subtitle, onPress, testID, color }: { icon: IconName; title: string; subtitle: string; onPress: () => void; testID?: string; color?: string }) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderColor: alpha(c, 0.45), backgroundColor: alpha(c, 0.1), borderRadius: t.r.lg }, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={[styles.cardIcon, { backgroundColor: alpha(c, 0.2) }]}>
        <Icon name={icon} size={22} color={c} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: font.body, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: t.textDim, fontSize: font.small }}>{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={t.textFaint} />
    </Pressable>
  );
}

/** Top of the Takes page: the full-song take and the Inbox, before the list of takes. */
export function TakesHeader({ inboxCount, onInbox }: { inboxCount: number; onInbox: () => void }) {
  const id = useSong((s) => s.doc?.song.id);
  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.xs }}>
      <ActionCard
        icon="radio-button-on"
        title="Record the full song"
        subtitle="One take, with your words and chords scrolling along"
        onPress={async () => {
          await flushSaves();
          if (id) router.push(`/take/${id}`);
        }}
        testID="open-full-take"
        color={useTheme().record}
      />
      <ActionCard icon="file-tray-outline" title={`Inbox (${inboxCount})`} subtitle="Loose ideas you recorded anywhere. Move them into this song." onPress={onInbox} testID="open-inbox" />
    </View>
  );
}

/** Top of the Shape page: how finished the song is, and the structure tools. */
export function ShapeHeader({ onOpen }: { onOpen: (a: 'web' | 'arrange' | 'compare') => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const takes = useSong((s) => s.recordings.length);
  const progress = doc ? progressFromDoc(doc, takes) : null;
  return (
    <View style={{ gap: space.sm, paddingBottom: space.md }}>
      {progress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: t.r.lg, backgroundColor: t.surface2 }} testID="progress">
          <ProgressRing done={progress.done} total={progress.total} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: font.body }} testID="progress-title">
              {progress.next ? `${progress.done} of ${progress.total} parts done` : 'All five parts are in'}
            </Text>
            <Text style={{ color: t.textDim, fontSize: font.small }} testID="progress-next">
              {progress.next ? `Next: ${progress.next.hint}` : 'Nothing missing. Keep polishing.'}
            </Text>
            <Text style={{ color: t.textFaint, fontSize: font.small }} testID="progress-items">
              {progress.items.map((i) => `${i.done ? '✓' : '○'} ${i.label}`).join('   ')}
            </Text>
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <ToolPill icon="reorder-three" label="Arrange sections" onPress={() => onOpen('arrange')} testID="open-arrange" />
        <ToolPill icon="git-compare-outline" label="Compare sections" onPress={() => onOpen('compare')} testID="open-compare" />
        <ToolPill icon="git-network-outline" label="Rhyme web" onPress={() => onOpen('web')} testID="open-web" />
      </View>
    </View>
  );
}

/** The constraint card subtitle for the Write tools. */
export function useCardLabel() {
  const card = useCardBreaks();
  return card ? `${card.title}${card.breaks ? ` · ${card.breaks}` : ' ✓'}` : 'Cards';
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: TAP + 8 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: 6, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, minHeight: 36 },
  strip: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderWidth: 1, minHeight: 64 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
