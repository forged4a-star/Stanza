/** Listen > Tuner: a reference drone for the song's key, and a microphone tuner. */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { isDroning, startDrone, stopDrone } from '../../audio/engine';
import { startMic } from '../../audio/mic';
import { droneMidis, type DroneKind } from '../../core/audio/drone';
import { yin } from '../../core/dsp/pitch';
import { readingFor, TunerSmoother, tuneState, type TunerReading } from '../../core/dsp/tuner';
import { midiName, parseKey, keyName } from '../../core/music/theory';
import { useSong } from '../../store/song';
import { toast } from '../../ui/Dialogs';
import { alpha } from '../../ui/color';
import { Button, Row, SectionTitle, Segmented } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

export function TunerPanel({ active }: { active: boolean }) {
  const t = useTheme();
  const songKey = useSong((s) => s.doc?.song.key ?? null);
  const [kind, setKind] = useState<DroneKind>('fifth');
  const [droning, setDroning] = useState(false);
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState<TunerReading | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const smoother = useRef(new TunerSmoother());
  const key = parseKey(songKey);
  const midis = droneMidis(songKey, kind);

  const stopMic = () => {
    stopRef.current?.();
    stopRef.current = null;
    smoother.current.reset();
    setListening(false);
    setReading(null);
  };
  const stopAll = () => {
    stopMic();
    stopDrone();
    setDroning(false);
  };
  useEffect(() => () => stopAll(), []);
  useEffect(() => {
    if (!active) stopAll();
  }, [active]);
  // a different drone while it sounds: switch straight away
  useEffect(() => {
    if (isDroning()) startDrone(midis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, songKey]);

  const startListening = async () => {
    try {
      let last = 0;
      stopRef.current = await startMic((frame, sr) => {
        const now = Date.now();
        if (now - last < 80) return;
        last = now;
        let e = 0;
        for (let i = 0; i < frame.length; i++) e += frame[i] * frame[i];
        const rms = Math.sqrt(e / frame.length);
        let f = 0;
        if (rms > 0.01) {
          const [hz, conf] = yin(frame, sr, 60, 1000);
          if (conf > 0.7) f = hz;
        }
        const smooth = smoother.current.push(f);
        setReading(smooth ? readingFor(smooth) : null);
      });
      setListening(true);
    } catch (e) {
      toast(String((e as Error).message ?? e));
    }
  };

  const cents = reading?.cents ?? 0;
  const state = reading ? tuneState(cents) : null;
  const colour = state === 'in-tune' ? t.ok : state ? t.warn : t.textFaint;

  return (
    <View style={{ gap: space.md }} testID="tuner-panel">
      <SectionTitle>Reference drone</SectionTitle>
      <Text style={{ color: t.textDim, fontSize: font.small }}>
        {key ? `A steady tone on ${keyName(key, true)}. Sing or play against it to hear if you are in tune.` : 'Set the song key (Song tab) to hold its tone. Until then it sounds C.'}
      </Text>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'root', label: 'Root' },
          { value: 'fifth', label: 'Root + fifth' },
          { value: 'open', label: 'Open' },
        ]}
        testID="drone-kind"
      />
      <Text style={{ color: t.textFaint, fontSize: font.small }} testID="drone-notes">
        {midis.map((m) => midiName(m)).join(' · ')}
      </Text>
      <Row>
        <Button
          kind={droning ? 'plain' : 'primary'}
          icon={droning ? 'stop' : 'volume-high'}
          title={droning ? 'Stop drone' : 'Start drone'}
          onPress={() => {
            if (droning) {
              stopDrone();
              setDroning(false);
            } else {
              startDrone(midis);
              setDroning(true);
            }
          }}
          testID="drone-toggle"
        />
      </Row>

      <SectionTitle>Tuner</SectionTitle>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Text style={{ color: reading ? t.text : t.textFaint, fontSize: 56, fontWeight: '700' }} testID="tuner-note">
          {reading?.label ?? (listening ? '…' : '—')}
        </Text>
        <View style={{ width: '100%', height: 36, justifyContent: 'center' }} accessibilityLabel={reading ? `${Math.abs(cents)} cents ${cents < 0 ? 'flat' : cents > 0 ? 'sharp' : 'in tune'}` : 'No note'}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2 }} />
          <View style={{ position: 'absolute', left: '50%', width: 2, height: 22, marginLeft: -1, backgroundColor: alpha(t.text, 0.4) }} />
          {reading && <View style={{ position: 'absolute', left: `${50 + (Math.max(-50, Math.min(50, cents)) / 50) * 45}%`, width: 14, height: 28, marginLeft: -7, borderRadius: 7, backgroundColor: colour }} testID="tuner-needle" />}
        </View>
        <Row style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text style={{ color: t.textFaint, fontSize: font.small }}>flat</Text>
          <Text style={{ color: colour, fontSize: font.body, fontWeight: '700' }} testID="tuner-cents">
            {reading ? (state === 'in-tune' ? 'In tune' : `${Math.abs(cents)} cents ${cents < 0 ? 'flat' : 'sharp'}`) : listening ? 'Play or sing a note' : ''}
          </Text>
          <Text style={{ color: t.textFaint, fontSize: font.small }}>sharp</Text>
        </Row>
        <Button title={listening ? 'Stop tuner' : 'Start tuner'} icon={listening ? 'stop' : 'mic'} kind="primary" onPress={() => (listening ? stopMic() : void startListening())} testID="tuner-toggle" />
        <Text style={{ color: t.textFaint, fontSize: font.small, textAlign: 'center' }}>Turn the drone off while tuning, or the tuner will hear it.</Text>
      </View>
    </View>
  );
}
