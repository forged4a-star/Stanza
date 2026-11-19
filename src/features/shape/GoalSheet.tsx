/** A goal for the song ("two verses and a chorus by Friday"), shown on the Shape page. */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SECTION_KIND_NAMES, type SectionKind } from '../../core/model';
import { bumpReq, dueChoices, describeDue, describeReq, GOAL_PRESETS, goalProgress, statusLine, type Goal, type GoalReq, type GoalReqType } from '../../core/song/goals';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { toast } from '../../ui/Dialogs';
import { alpha } from '../../ui/color';
import { Button, Chip, Icon, Row, SectionTitle } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

const ROWS: { type: GoalReqType; kind?: SectionKind; label: string }[] = [
  { type: 'sections', kind: 'verse', label: 'Verses' },
  { type: 'sections', kind: 'pre', label: 'Pre-choruses' },
  { type: 'sections', kind: 'chorus', label: 'Choruses' },
  { type: 'sections', kind: 'bridge', label: 'Bridges' },
  { type: 'lines', label: 'Lines of words' },
  { type: 'chords', label: 'Sections with chords' },
  { type: 'melody', label: 'Sections with a melody' },
  { type: 'take', label: 'Recorded takes' },
];

const countOf = (reqs: GoalReq[], r: { type: GoalReqType; kind?: SectionKind }) => reqs.find((x) => x.type === r.type && (r.type !== 'sections' || x.kind === r.kind))?.count ?? 0;

export function GoalCard() {
  const t = useTheme();
  const doc = useSong((s) => s.doc);
  const takes = useSong((s) => s.recordings.length);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [open, setOpen] = useState(false);
  const songId = doc?.song.id;
  const load = useCallback(async () => {
    if (songId) setGoal(await repo.getGoal(await getDb(), songId));
  }, [songId]);
  useEffect(() => void load(), [load]);
  if (!doc) return null;
  const p = goal ? goalProgress(goal, doc, takes) : null;
  const tone = p?.status === 'done' ? t.ok : p?.status === 'overdue' ? t.danger : p?.status === 'due-soon' ? t.warn : t.accent;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [{ padding: space.md, borderRadius: t.r.lg, borderWidth: 1, borderColor: goal ? alpha(tone, 0.5) : t.border, borderStyle: goal ? 'solid' : 'dashed', backgroundColor: goal ? alpha(tone, 0.08) : 'transparent', gap: 6 }, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={goal ? 'Edit this song\'s goal' : 'Set a goal for this song'}
        testID="goal-card"
      >
        {!goal || !p ? (
          <Row>
            <Icon name="flag-outline" size={22} color={t.textDim} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: font.body, fontWeight: '700' }}>Set a goal</Text>
              <Text style={{ color: t.textDim, fontSize: font.small }}>For example: two verses and a chorus by Friday.</Text>
            </View>
          </Row>
        ) : (
          <>
            <Row>
              <Icon name={p.status === 'done' ? 'checkmark-circle' : 'flag'} size={22} color={tone} />
              <Text style={{ flex: 1, color: t.text, fontSize: font.body, fontWeight: '700' }} testID="goal-status">
                {statusLine(p)}
              </Text>
            </Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(p.fraction * 100)}%`, height: 6, backgroundColor: tone }} testID="goal-bar" />
            </View>
            <View style={{ gap: 2 }}>
              {p.items.map((i, k) => (
                <Text key={k} style={{ color: i.done ? t.textDim : t.text, fontSize: font.small + 1 }} testID={`goal-item-${k}`}>
                  {i.done ? '✓' : '○'} {i.need} {i.label.replace(/^\d+ /, '')} {i.done ? '' : `(${Math.min(i.have, i.need)} so far)`}
                </Text>
              ))}
            </View>
          </>
        )}
      </Pressable>
      <GoalSheet visible={open} onClose={() => setOpen(false)} goal={goal} onSaved={() => void load()} />
    </>
  );
}

function GoalSheet({ visible, onClose, goal, onSaved }: { visible: boolean; onClose: () => void; goal: Goal | null; onSaved: () => void }) {
  const t = useTheme();
  const songId = useSong((s) => s.doc?.song.id);
  const [reqs, setReqs] = useState<GoalReq[]>([]);
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [due, setDue] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setReqs(goal?.reqs ?? []);
    setDueAt(goal?.dueAt ?? null);
    setDue(goal ? 'kept' : null);
  }, [visible, goal]);
  const choices = dueChoices();
  const now = Date.now();

  const save = async () => {
    if (!songId) return;
    if (!reqs.length) return toast('Pick at least one thing to have');
    await repo.saveGoal(await getDb(), songId, { reqs, dueAt, createdAt: goal?.createdAt ?? Date.now() });
    onSaved();
    onClose();
  };
  const remove = async () => {
    if (!songId) return;
    await repo.clearGoal(await getDb(), songId);
    onSaved();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Goal for this song" height={0.85} testID="goal-sheet">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <SectionTitle>Start from</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {GOAL_PRESETS.map((p) => (
            <Chip key={p.id} label={p.label} onPress={() => setReqs(p.reqs.map((r) => ({ ...r })))} testID={`goal-preset-${p.id}`} />
          ))}
        </Row>
        <SectionTitle>Have by then</SectionTitle>
        {ROWS.map((r) => {
          const n = countOf(reqs, r);
          return (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}>
              <Text style={{ flex: 1, color: n ? t.text : t.textDim, fontSize: font.body }}>{r.label}</Text>
              <Button compact title="−" onPress={() => setReqs(bumpReq(reqs, r.type, r.kind, -1))} testID={`goal-${r.kind ?? r.type}-down`} />
              <Text style={{ minWidth: 34, textAlign: 'center', color: t.text, fontWeight: '700', fontSize: font.body }} testID={`goal-${r.kind ?? r.type}`}>
                {n}
              </Text>
              <Button compact title="+" onPress={() => setReqs(bumpReq(reqs, r.type, r.kind, 1))} testID={`goal-${r.kind ?? r.type}-up`} />
            </View>
          );
        })}
        <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: space.xs }}>
          {reqs.length ? reqs.map(describeReq).join(', ') : 'Nothing picked yet.'} A section counts once it has two lines of words.
        </Text>
        <SectionTitle>By when</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {choices.map((c) => (
            <Chip key={c.label} label={c.label} selected={due === c.label} onPress={() => (setDue(c.label), setDueAt(c.at))} testID={`goal-due-${c.label}`} />
          ))}
        </Row>
        <Text style={{ color: t.textDim, fontSize: font.small, marginTop: space.xs }}>{dueAt === null ? 'No deadline' : describeDue(Math.round((dueAt - now) / 86400000))}</Text>
        <Row style={{ marginTop: space.xl }}>
          <Button kind="primary" title="Save goal" icon="flag" onPress={() => void save()} testID="goal-save" />
          {goal && <Button kind="danger" title="Remove goal" onPress={() => void remove()} testID="goal-remove" />}
        </Row>
      </ScrollView>
    </BottomSheet>
  );
}
