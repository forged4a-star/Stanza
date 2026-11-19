/** Music > Practice: loop a few bars, starting slow and stepping up to the song's tempo. */
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { cleanPlan, defaultPlan, describePlan, type RampPlan } from '../../core/audio/practice';
import { sectionDisplayNames } from '../../core/model';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';
import { toast } from '../../ui/Dialogs';
import { Button, Chip, Row, SectionTitle, ToggleRow } from '../../ui/kit';
import { alpha } from '../../ui/color';
import { font, space, useTheme } from '../../ui/theme';
import { startPractice, stopPractice, usePractice } from './practice';
import { Stepper } from './Stepper';

export function PracticeTab() {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const settings = useSettings();
  const practice = usePractice();
  const names = sectionDisplayNames(doc.sections);
  const withBars = doc.sections.map((s, i) => ({ s, i })).filter(({ s }) => s.bars.length > 0);
  const [sectionId, setSectionId] = useState<string | null>(withBars[0]?.s.id ?? null);
  const section = doc.sections.find((s) => s.id === sectionId) ?? withBars[0]?.s ?? null;
  const barCount = section?.bars.length ?? 0;
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(4, barCount || 4));
  const [plan, setPlan] = useState<RampPlan>(() => defaultPlan(doc.song.bpm));
  const [endless, setEndless] = useState(true);
  const [clickOn, setClickOn] = useState(true);

  // follow the song's tempo and the section's length
  useEffect(() => setPlan((p) => cleanPlan({ ...p, target: doc.song.bpm, start: Math.min(p.start, doc.song.bpm) })), [doc.song.bpm]);
  useEffect(() => {
    setFrom((f) => Math.min(Math.max(1, f), Math.max(1, barCount)));
    setTo((x) => Math.min(Math.max(1, x), Math.max(1, barCount)));
  }, [barCount, sectionId]);
  useEffect(() => () => stopPractice(), []);

  const chords = useMemo(() => (section ? section.bars.slice(from - 1, to).map((b) => b.chords.join(' ') || '·').join('  ') : ''), [section, from, to]);
  const clean = cleanPlan(plan);

  if (!withBars.length)
    return (
      <Text style={{ color: t.textDim }} testID="practice-empty">
        Add chords to a section first (tap + under its name, or use Circle / Ideas). Then you can loop a few bars of it here, slowly, and speed up.
      </Text>
    );

  return (
    <View testID="practice-tab">
      <Text style={{ color: t.textDim, fontSize: font.small, marginBottom: space.sm }}>Loop a few bars. It starts slow and steps up to the song's tempo, so a hard change becomes easy.</Text>
      {practice.active && (
        <View style={{ marginTop: space.md, padding: space.md, borderRadius: t.r.md, backgroundColor: alpha(t.accent, 0.12) }} testID="practice-status">
          <Text style={{ color: t.text, fontSize: font.body, fontWeight: '700' }}>{`${practice.bpm} bpm`}</Text>
          <Text style={{ color: t.textDim, fontSize: font.small }}>{practice.holding ? `At full speed · play ${practice.pass + 1} of ${practice.total}` : `Play ${practice.pass + 1} of ${practice.total}`}</Text>
        </View>
      )}
      <Row style={{ marginTop: space.md, justifyContent: 'center' }}>
        {practice.active ? (
          <Button kind="primary" icon="stop" title="Stop practice" onPress={stopPractice} testID="practice-stop" />
        ) : (
          <Button
            kind="primary"
            icon="play"
            title="Start practice"
            onPress={() => {
              if (!section) return;
              if (!startPractice({ sectionId: section.id, from, to, plan: clean, metronome: clickOn || settings.metronome, endless })) toast('Could not start the practice loop');
            }}
            testID="practice-start-btn"
          />
        )}
      </Row>
      <Row style={{ flexWrap: 'wrap', marginTop: space.md }}>
        {withBars.map(({ s, i }) => (
          <Chip key={s.id} label={names[i]} selected={section?.id === s.id} onPress={() => setSectionId(s.id)} testID={`practice-section-${i}`} />
        ))}
      </Row>
      <SectionTitle>Bars</SectionTitle>
      <Stepper label="From bar" value={from} onChange={(v) => (setFrom(v), v > to && setTo(v))} min={1} max={barCount} testID="practice-from" />
      <Stepper label="To bar" value={to} onChange={(v) => (setTo(v), v < from && setFrom(v))} min={1} max={barCount} testID="practice-to" />
      <Text style={{ color: t.chord, fontSize: font.body + 2, fontWeight: '700', marginTop: space.xs }} testID="practice-chords">
        {chords}
      </Text>
      <SectionTitle>Speed</SectionTitle>
      <Stepper label="Start at" value={clean.start} onChange={(v) => setPlan({ ...clean, start: v })} min={30} max={clean.target} step={5} suffix=" bpm" testID="practice-start" />
      <Stepper label="Step up by" value={clean.step} onChange={(v) => setPlan({ ...clean, step: v })} min={1} max={30} suffix=" bpm" testID="practice-step" />
      <Stepper label="Plays per step" value={clean.passesPerStep} onChange={(v) => setPlan({ ...clean, passesPerStep: v })} min={1} max={8} testID="practice-passes" />
      <Text style={{ color: t.textFaint, fontSize: font.small }}>Goal: the song's {clean.target} bpm. {describePlan(clean)}.</Text>
      <ToggleRow label="Keep going at full speed" hint="Otherwise it stops after a couple of plays at the song's tempo" value={endless} onChange={setEndless} testID="practice-endless" />
      <ToggleRow label="Click track" value={clickOn} onChange={setClickOn} testID="practice-click" />

    </View>
  );
}
