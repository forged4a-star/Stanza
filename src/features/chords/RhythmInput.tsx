/**
 * Play a strum in instead of drawing it: tap it on a pad, or hum / clap it into
 * the mic. A count-in shows the tempo first; two bars are listened to.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { playNote } from '../../audio/engine';
import { startMic } from '../../audio/mic';
import { strumFromAudio, strumFromTaps, type StrumGuess } from '../../core/audio/strumFromRhythm';
import { Button, Row } from '../../ui/kit';
import { font, radius, space, useTheme } from '../../ui/theme';

type Mode = 'tap' | 'hum';
const COUNT_IN = 4;
const BARS = 2;

export function RhythmInput({ bpm, onGuess }: { bpm: number; onGuess: (g: StrumGuess) => void }) {
  const t = useTheme();
  const [mode, setMode] = useState<Mode | null>(null);
  const [beat, setBeat] = useState(0); // 1..COUNT_IN during the count-in, then 1..8 while listening
  const [phase, setPhaseState] = useState<'idle' | 'count' | 'listen'>('idle');
  // read by the touch handler at the instant of the touch, so it must not be a stale render value
  const phaseRef = useRef<'idle' | 'count' | 'listen'>('idle');
  const setPhase = (p: 'idle' | 'count' | 'listen') => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [message, setMessage] = useState('');
  const taps = useRef<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopMicRef = useRef<(() => void) | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const rate = useRef(22050);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    stopMicRef.current?.();
    stopMicRef.current = null;
  };
  useEffect(() => clear, []);

  const finish = (m: Mode, startMs: number) => {
    stopMicRef.current?.();
    stopMicRef.current = null;
    setPhase('idle');
    setBeat(0);
    let guess: StrumGuess | null = null;
    if (m === 'tap') guess = strumFromTaps(taps.current, { bpm, startMs, countInBeats: COUNT_IN });
    else {
      const total = chunks.current.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(total);
      let at = 0;
      for (const c of chunks.current) (all.set(c, at), (at += c.length));
      guess = strumFromAudio(all, rate.current, { bpm });
    }
    if (!guess) {
      setMessage(m === 'tap' ? 'Not enough taps. Tap along with the count and try again.' : 'Could not hear a rhythm. Hum "da" or clap a little louder, close to the phone.');
      return;
    }
    setMessage(
      guess.confidence < 0.6
        ? `Heard ${guess.hits} hits, but the timing was loose. Check the grid and fix any steps.`
        : `Got it: ${guess.hits} hits over ${guess.bars} bar${guess.bars > 1 ? 's' : ''}. Tweak anything below.`
    );
    onGuess(guess);
  };

  const begin = async (m: Mode) => {
    clear();
    setMode(m);
    setMessage('');
    taps.current = [];
    chunks.current = [];
    if (m === 'hum') {
      try {
        stopMicRef.current = await startMic((s, sr) => {
          rate.current = sr;
          chunks.current.push(s);
        });
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Microphone not available.');
        return;
      }
    }
    const beatMs = 60000 / bpm;
    const start = Date.now();
    setPhase('count');
    const total = COUNT_IN + BARS * 4;
    for (let i = 0; i < total; i++) {
      timers.current.push(
        setTimeout(() => {
          playNote(i < COUNT_IN || i % 4 === COUNT_IN % 4 ? 84 : 79, 0.08);
          if (i < COUNT_IN) {
            setPhase('count');
            setBeat(i + 1);
          } else {
            setPhase('listen');
            setBeat(i - COUNT_IN + 1);
          }
        }, i * beatMs)
      );
    }
    // a little after the last beat, so the final hit is still caught
    timers.current.push(setTimeout(() => finish(m, start), total * beatMs + 150));
  };

  const busy = phase !== 'idle';
  return (
    <View testID="rhythm-input">
      <Row style={{ flexWrap: 'wrap' }}>
        <Button compact icon="hand-left-outline" title="Tap it in" onPress={() => void begin('tap')} disabled={busy} testID="rhythm-tap" />
        <Button compact icon="mic-outline" title="Hum or clap it" onPress={() => void begin('hum')} disabled={busy} testID="rhythm-hum" />
        {busy && <Button compact title="Cancel" onPress={() => (clear(), setPhase('idle'), setBeat(0))} testID="rhythm-cancel" />}
      </Row>
      {busy && (
        <View style={{ marginTop: space.sm }}>
          <Text style={{ color: t.textDim, fontSize: font.small }} testID="rhythm-status">
            {phase === 'count' ? `Count-in ${beat} of ${COUNT_IN}…` : mode === 'tap' ? `Tap the strum now. Beat ${beat} of ${BARS * 4}` : `Hum "da" or clap the strum. Beat ${beat} of ${BARS * 4}`}
          </Text>
          {mode === 'tap' && (
            <View
              // touch START, not release: a tap's time is when the finger lands
              onStartShouldSetResponder={() => true}
              onResponderGrant={() => {
                if (phaseRef.current === 'listen') taps.current.push(Date.now());
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Tap pad"
              testID="rhythm-pad"
              style={{ height: 110, marginTop: space.sm, borderRadius: radius.lg, backgroundColor: phase === 'listen' ? t.accent : t.surface2, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: phase === 'listen' ? t.accentText : t.textDim, fontSize: font.title, fontWeight: '700' }}>{phase === 'listen' ? 'TAP' : beat}</Text>
            </View>
          )}
        </View>
      )}
      {!!message && !busy && (
        <Text style={{ color: t.textDim, fontSize: font.small, marginTop: space.sm }} testID="rhythm-message">
          {message}
        </Text>
      )}
    </View>
  );
}
