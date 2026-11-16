/** Prosody, singability and range checks across the song, plus the singer's range. */
import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { startMic } from '../../audio/mic';
import { allIssues, type Issue } from '../../core/lyrics/checks';
import { sungRange } from '../../core/music/melody';
import { sectionDisplayNames } from '../../core/model';
import { midiName } from '../../core/music/theory';
import { useSettings } from '../../store/settings';
import { useSong } from '../../store/song';
import { toast } from '../../ui/Dialogs';
import { Button, Row, SectionTitle } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';
import { PianoKeys } from '../chords/ChordDiagram';
import { openMelody } from './MelodyRoll';

const KIND_LABEL: Record<Issue['kind'], string> = { prosody: 'Prosody', 'closed-vowel': 'Singability', consonants: 'Singability', range: 'Range' };

export function ChecksPanel({ onJump }: { onJump?: () => void }) {
  const t = useTheme();
  const doc = useSong((s) => s.doc)!;
  const settings = useSettings();
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const buf = useRef<Float32Array[]>([]);
  const rate = useRef(22050);
  const names = sectionDisplayNames(doc.sections);
  const groups = useMemo(
    () =>
      doc.sections
        .map((s, i) => ({ s, i, issues: allIssues(s.melody, s.lines, { bpm: doc.song.bpm, timeSig: doc.song.timeSig, vocalLow: settings.vocalLow, vocalHigh: settings.vocalHigh }) }))
        .filter((g) => g.s.melody.length),
    [doc, settings.vocalLow, settings.vocalHigh]
  );
  const total = groups.reduce((n, g) => n + g.issues.length, 0);

  const findRange = async () => {
    if (listening) {
      stopRef.current?.();
      stopRef.current = null;
      setListening(false);
      const all = new Float32Array(buf.current.reduce((n, b) => n + b.length, 0));
      let o = 0;
      for (const b of buf.current) {
        all.set(b, o);
        o += b.length;
      }
      const r = sungRange(all, rate.current);
      if (!r || r.high - r.low < 3) return toast('Sing a slow slide from your lowest to your highest comfortable note.');
      settings.set({ vocalLow: r.low, vocalHigh: r.high });
      toast(`Range set: ${midiName(r.low)}–${midiName(r.high)}`);
      return;
    }
    try {
      buf.current = [];
      stopRef.current = await startMic((f, sr) => {
        rate.current = sr;
        buf.current.push(f);
      });
      setListening(true);
    } catch (e) {
      toast(String((e as Error).message ?? e));
    }
  };

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <SectionTitle>Your vocal range</SectionTitle>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: t.text, fontSize: font.body + 2, fontWeight: '700' }} testID="vocal-range">
          {midiName(settings.vocalLow)} – {midiName(settings.vocalHigh)}
        </Text>
        <Button compact title={listening ? 'Done singing' : 'Find it by singing'} icon={listening ? 'stop' : 'mic'} onPress={findRange} testID="find-range" />
      </Row>
      <Row style={{ marginTop: space.sm }}>
        <Text style={{ color: t.textDim, width: 44 }}>Low</Text>
        <Button compact title="−" onPress={() => settings.set({ vocalLow: settings.vocalLow - 1 })} />
        <Button compact title="+" onPress={() => settings.set({ vocalLow: Math.min(settings.vocalHigh - 3, settings.vocalLow + 1) })} />
        <Text style={{ color: t.textDim, width: 44, marginLeft: space.md }}>High</Text>
        <Button compact title="−" onPress={() => settings.set({ vocalHigh: Math.max(settings.vocalLow + 3, settings.vocalHigh - 1) })} testID="range-high-down" />
        <Button compact title="+" onPress={() => settings.set({ vocalHigh: settings.vocalHigh + 1 })} />
      </Row>
      <View style={{ marginTop: space.sm }}>
        <PianoKeys notes={Array.from({ length: settings.vocalHigh - settings.vocalLow + 1 }, (_, i) => settings.vocalLow + i)} from={36} octaves={4} width={330} />
      </View>
      {listening && <Text style={{ color: t.record, marginTop: space.sm }}>Listening… slide from your lowest to your highest comfortable note.</Text>}

      <SectionTitle>Checks · {total}</SectionTitle>
      {groups.length === 0 && <Text style={{ color: t.textDim }}>Write a melody in a section (section menu → Melody) and its prosody and singability are checked here.</Text>}
      {groups.length > 0 && total === 0 && <Text style={{ color: t.ok }}>No problems found.</Text>}
      {groups.map((g) =>
        g.issues.length ? (
          <View key={g.s.id} style={{ marginBottom: space.sm }} testID={`checks-${g.i}`}>
            <Text style={{ color: t.textDim, fontWeight: '700', fontSize: font.small, marginBottom: 4 }}>{names[g.i]}</Text>
            {g.issues.map((iss, k) => (
              <Pressable
                key={k}
                onPress={() => {
                  openMelody(g.s.id, true, iss.noteId);
                  onJump?.();
                }}
                style={({ pressed }) => [{ flexDirection: 'row', gap: space.sm, paddingVertical: 6, opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
              >
                <View style={{ width: 4, borderRadius: 2, backgroundColor: iss.severity === 2 ? t.danger : t.warn }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.textDim, fontSize: font.tiny, fontWeight: '700' }}>{KIND_LABEL[iss.kind].toUpperCase()}</Text>
                  <Text style={{ color: t.text, fontSize: font.body }}>{iss.message}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null
      )}
      <View style={{ height: space.md, borderRadius: radius.sm }} />
    </View>
  );
}
