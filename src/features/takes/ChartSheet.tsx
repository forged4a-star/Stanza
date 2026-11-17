/**
 * Chords from a recording: listens to a take, shows when the chords change and
 * snaps them to bars at the tempo, then puts them into a section. The tempo
 * can be nudged until the bars line up with how the song feels.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { decodeStored } from '../../audio/decode';
import { chordTimelineAsync, chordsToBars, type ChartResult } from '../../core/music/chart';
import { sectionDisplayNames, type ChordBar, type Recording, type SongDoc } from '../../core/model';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { useSong } from '../../store/song';
import { BottomSheet } from '../../ui/BottomSheet';
import { alpha } from '../../ui/color';
import { confirm, toast } from '../../ui/Dialogs';
import { Button, Card, Chip, Row, SectionTitle } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** "C major" becomes "C", "A minor" becomes "Am". */
export const shortKey = (name: string | null): string | null => {
  const m = name?.match(/^([A-G][#b]?) (major|minor)$/);
  return m ? m[1] + (m[2] === 'minor' ? 'm' : '') : null;
};

/** Put bars into a section of a song, whether or not that song is the one open in the editor. */
async function applyBars(doc: SongDoc, sectionId: string, bars: ChordBar[], key: string | null) {
  const st = useSong.getState();
  if (st.doc?.song.id === doc.song.id) {
    st.setBars(sectionId, bars);
    if (key && !st.doc.song.key) st.setMeta({ key });
    return;
  }
  const db = await getDb();
  await repo.updateSection(db, sectionId, { bars });
  if (key && !doc.song.key) await repo.updateSong(db, doc.song.id, { key });
}

export function ChartSheet({ take, doc, onClose }: { take: Recording | null; doc: SongDoc; onClose: () => void }) {
  const t = useTheme();
  const [phase, setPhase] = useState<'listening' | 'ready' | 'error'>('listening');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ChartResult | null>(null);
  const [bpm, setBpm] = useState(Math.round(doc.song.bpm));
  const [target, setTarget] = useState(0);
  const names = sectionDisplayNames(doc.sections);
  const [beats, unit] = doc.song.timeSig;
  const beatsPerBar = Math.max(2, Math.round((beats * 4) / unit));

  useEffect(() => {
    if (!take) return;
    let live = true;
    setPhase('listening');
    setProgress(0);
    setResult(null);
    setBpm(Math.round(take.bpm ?? doc.song.bpm));
    // start with the first section that has no chords yet
    const empty = doc.sections.findIndex((s) => !s.bars.length);
    setTarget(empty >= 0 ? empty : 0);
    (async () => {
      try {
        const pcm = await decodeStored(take.file, 22050);
        const r = await chordTimelineAsync(pcm.samples, pcm.sampleRate, {}, (f) => live && setProgress(f));
        if (live) {
          setResult(r);
          setPhase('ready');
        }
      } catch {
        if (live) setPhase('error');
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take?.id]);

  const bars = useMemo(() => (result ? chordsToBars(result.segments, { bpm, beatsPerBar }) : []), [result, bpm, beatsPerBar]);
  const key = shortKey(result?.key ?? null);

  const apply = async () => {
    const s = doc.sections[target];
    if (!s || !bars.length) return;
    if (s.bars.length && !(await confirm(`Replace the chords in ${names[target]}?`, 'The chords you have now will be replaced.', 'Replace'))) return;
    await applyBars(doc, s.id, bars, key);
    toast(`Chords added to ${names[target]}`);
    onClose();
  };

  const total = result?.seconds ?? 1;
  return (
    <BottomSheet visible={!!take} onClose={onClose} title="Chords from this take" height={0.88} light testID="chart-sheet">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }}>
        {phase === 'listening' && (
          <View style={{ gap: space.sm }} testID="chart-listening">
            <Text style={{ color: t.text, fontWeight: '600' }}>Listening to your take…</Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(progress * 100)}%`, height: 8, backgroundColor: t.accent }} />
            </View>
          </View>
        )}
        {phase === 'error' && <Text style={{ color: t.danger }}>Could not read this recording.</Text>}
        {phase === 'ready' && result && (
          <>
            {!result.segments.length ? (
              <Text style={{ color: t.textDim }} testID="chart-empty">
                No clear chords were heard. This works best with a guitar or piano, played a little louder and close to the phone.
              </Text>
            ) : (
              <>
                <Text style={{ color: t.textDim, fontSize: font.small }} testID="chart-summary">
                  {result.segments.length} chord{result.segments.length === 1 ? '' : 's'} heard over {fmt(result.seconds)}
                  {result.key ? ` · sounds like ${result.key}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', height: 44, borderRadius: t.r.md, overflow: 'hidden', backgroundColor: t.surface2 }} testID="chart-timeline">
                  {result.segments.map((s, i) => (
                    <View key={i} style={{ flex: Math.max(0.2, (s.end - s.start) / total), alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(t.accent, i % 2 ? 0.18 : 0.3), borderRightWidth: 1, borderRightColor: t.surface }}>
                      <Text style={{ color: t.text, fontWeight: '700', fontSize: font.small }} numberOfLines={1}>
                        {s.chord}
                      </Text>
                    </View>
                  ))}
                </View>

                <SectionTitle>Bars</SectionTitle>
                <Row>
                  <Button compact title="−5" onPress={() => setBpm((b) => Math.max(40, b - 5))} testID="chart-bpm-down5" />
                  <Button compact title="−1" onPress={() => setBpm((b) => Math.max(40, b - 1))} testID="chart-bpm-down" />
                  <Text style={{ color: t.text, fontWeight: '700', minWidth: 74, textAlign: 'center' }} testID="chart-bpm">
                    {bpm} bpm
                  </Text>
                  <Button compact title="+1" onPress={() => setBpm((b) => Math.min(240, b + 1))} testID="chart-bpm-up" />
                  <Button compact title="+5" onPress={() => setBpm((b) => Math.min(240, b + 5))} testID="chart-bpm-up5" />
                </Row>
                <Card testID="chart-bars">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {bars.map((b, i) => (
                      <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: t.r.md, backgroundColor: alpha(t.accent, 0.13) }}>
                        <Text style={{ color: t.chord, fontWeight: '700' }}>{b.chords.join(' ')}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: t.textFaint, fontSize: font.small, marginTop: space.sm }}>
                    {bars.length} bar{bars.length === 1 ? '' : 's'} at {bpm} bpm. If the bars drift from the music, nudge the tempo.
                  </Text>
                </Card>

                <SectionTitle>Put them in</SectionTitle>
                <Row style={{ flexWrap: 'wrap' }}>
                  {doc.sections.map((s, i) => (
                    <Chip key={s.id} label={names[i]} selected={target === i} onPress={() => setTarget(i)} testID={`chart-target-${i}`} />
                  ))}
                </Row>
                {key && !doc.song.key && <Text style={{ color: t.textDim, fontSize: font.small }}>The song has no key yet, so it will be set to {key}.</Text>}
                <Button kind="primary" title={`Add to ${names[target] ?? 'the song'}`} icon="checkmark" onPress={() => void apply()} testID="chart-apply" />
              </>
            )}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
