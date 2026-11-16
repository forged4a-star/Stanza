/** Your writing this week: minutes, lines written, lines scrapped, streak. */
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { fmtDuration, summarize } from '../../core/stats/writing';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { useWriting } from '../../store/writing';
import { SectionTitle } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';

export function WritingStats() {
  const t = useTheme();
  const log = useWriting((s) => s.log);
  const [scraps, setScraps] = useState<number[]>([]);
  useEffect(() => {
    void useWriting.getState().load();
    void getDb()
      .then((db) => repo.listScraps(db, '', 5000))
      .then((rows) => setScraps(rows.map((r) => r.createdAt)))
      .catch(() => {});
  }, []);
  const sum = useMemo(() => summarize(log, scraps), [log, scraps]);
  const max = Math.max(60000, sum.bestMs);
  return (
    <View style={{ paddingHorizontal: space.lg }} testID="writing-stats">
      <SectionTitle>Your writing this week</SectionTitle>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 64 }} accessible accessibilityLabel={`Writing time per day: ${sum.days.map((d) => `${d.label} ${fmtDuration(d.ms)}`).join(', ')}`}>
        {sum.days.map((d, i) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ width: '100%', height: Math.max(3, (d.ms / max) * 48), borderRadius: 3, backgroundColor: d.ms ? t.accent : t.border, opacity: i === sum.days.length - 1 ? 1 : 0.7 }} />
            <Text style={{ color: t.textFaint, fontSize: 10 }}>{d.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: t.surface2, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: font.body }} testID="stat-time">
          {fmtDuration(sum.totalMs)} writing
        </Text>
        <Text style={{ color: t.text, fontSize: font.body }} testID="stat-lines">
          {sum.written} {sum.written === 1 ? 'line' : 'lines'} written, {sum.scrapped} sent to the scrapyard
        </Text>
        <Text style={{ color: t.textDim, fontSize: font.small + 1 }} testID="stat-streak">
          {sum.streak > 0 ? `${sum.streak} day${sum.streak > 1 ? 's' : ''} in a row` : 'Write for a minute to start a streak'}
        </Text>
      </View>
      <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: space.xs }}>Counted on this device only. Time counts while you are editing, not while the app sits open.</Text>
    </View>
  );
}
