/** Shape > Overview: the song's sections drawn to length, with a heat strip for words, chords and melody. */
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { SectionKind } from '../../core/model';
import { songOverview, type HeatRow } from '../../core/song/overview';
import { useSong } from '../../store/song';
import { alpha } from '../../ui/color';
import { Empty } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

/** Which palette colour each kind of section takes, so the same kind is always the same colour. */
const KIND_COLOUR: Record<SectionKind, number> = { verse: 1, chorus: 0, pre: 5, post: 4, bridge: 2, intro: 6, outro: 7, custom: 3 };
const LABEL_W = 58;

export function OverviewTab() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const o = useMemo(() => songOverview(doc), [doc]);
  if (!o.spans.length || o.totalBars === 0)
    return <Empty icon="analytics-outline" title="Nothing to chart yet" hint="Write a few lines or add chords, and your sections appear here, drawn to length." />;

  const colour = (kind: SectionKind) => t.palette[KIND_COLOUR[kind] % t.palette.length];
  // every section gets a little room even when it is tiny, so it stays tappable to read
  const grow = (share: number) => Math.max(share, 0.07);

  return (
    <View style={{ gap: space.md }} testID="overview">
      <Text style={{ color: t.textDim, fontSize: font.small }}>
        {o.totalBars} bars in all. Each block is as wide as its section is long{o.spans.some((s) => s.estimated) ? ' (about, where there are only words)' : ''}.
      </Text>

      <View style={{ flexDirection: 'row', gap: 3 }} testID="overview-timeline" accessibilityRole="image" accessibilityLabel={o.spans.map((s) => `${s.name}: ${s.bars} bars`).join(', ')}>
        <View style={{ width: LABEL_W }} />
        <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
          {o.spans.map((s) => (
            <View
              key={s.index}
              style={{ flexGrow: grow(s.share), flexBasis: 0, minHeight: 58, borderRadius: t.r.sm, backgroundColor: colour(s.kind), padding: 4, justifyContent: 'space-between', opacity: s.bars ? 1 : 0.35 }}
              testID={`overview-span-${s.index}`}
            >
              <Text style={{ color: '#1a1a1a', fontSize: font.tiny, fontWeight: '800' }} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={{ color: '#1a1a1a', fontSize: font.tiny }} numberOfLines={1}>
                {s.bars ? `${s.estimated ? '~' : ''}${s.bars}` : 'empty'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {o.rows.map((row) => (
        <Heat key={row.id} row={row} shares={o.spans.map((s) => grow(s.share))} />
      ))}
      <Text style={{ color: t.textFaint, fontSize: font.tiny }}>Darker means busier. Words: syllables per bar. Chords: chord changes per bar. Melody: how wide the notes range.</Text>

      {o.notes.length > 0 && (
        <View style={{ gap: space.xs, padding: space.md, borderRadius: t.r.md, backgroundColor: t.surface2 }} testID="overview-notes">
          {o.notes.map((n, i) => (
            <Text key={i} style={{ color: t.text, fontSize: font.small + 1 }}>
              {n}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Heat({ row, shares }: { row: HeatRow; shares: number[] }) {
  const t = useTheme();
  const unit = row.id === 'words' ? 'syllables a bar' : row.id === 'chords' ? 'chords a bar' : 'semitones range';
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'stretch' }} testID={`heat-${row.id}`}>
      <Text style={{ width: LABEL_W, color: t.textDim, fontSize: font.small, alignSelf: 'center' }}>{row.label}</Text>
      <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
        {row.cells.map((v, i) => (
          <View
            key={i}
            style={[
              { flexGrow: shares[i], flexBasis: 0, height: 30, borderRadius: t.r.sm, alignItems: 'center', justifyContent: 'center' },
              v === null ? { borderWidth: 1, borderStyle: 'dashed', borderColor: t.border } : { backgroundColor: alpha(t.accent, 0.12 + 0.78 * v) },
            ]}
            accessibilityLabel={v === null ? `${row.label}: none` : `${row.label}: ${Math.round((row.raw[i] ?? 0) * 10) / 10} ${unit}`}
            testID={`heat-${row.id}-${i}`}
          >
            {row.raw[i] !== null && (
              <Text style={{ color: (v ?? 0) > 0.55 ? t.accentText : t.text, fontSize: font.tiny, fontWeight: '700' }} numberOfLines={1}>
                {Math.round((row.raw[i] ?? 0) * 10) / 10}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
