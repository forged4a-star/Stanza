/** Chord player volume: moves the engine live, saves once you let go, and plays a short note so you can hear the level. */
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { playNote, setVolume } from '../../audio/engine';
import { useSettings } from '../../store/settings';
import { Icon, Slider } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';
import { usePlayer } from './player';

export function VolumeSlider({ compact }: { compact?: boolean }) {
  const t = useTheme();
  const volume = useSettings((s) => s.volume);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const change = (v: number) => {
    const vol = Math.round(v * 100) / 100;
    setVolume(vol); // the engine follows the finger at once
    useSettings.setState({ volume: vol });
    if (timer.current) clearTimeout(timer.current);
    // save and give audible feedback once the finger rests
    timer.current = setTimeout(() => {
      useSettings.getState().set({ volume: vol });
      if (!usePlayer.getState().playing) playNote(60, 0.5, useSettings.getState().instrument);
    }, 350);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: compact ? 40 : 52 }}>
      <Icon name={volume === 0 ? 'volume-mute' : 'volume-low'} size={20} color={t.textDim} />
      <View style={{ flex: 1 }}>
        <Slider value={volume} onChange={change} label="Volume" testID="volume" />
      </View>
      <Icon name="volume-high" size={20} color={t.textDim} />
      {!compact && <Text style={{ color: t.textDim, fontSize: font.small, width: 40, textAlign: 'right' }}>{Math.round(volume * 100)}%</Text>}
    </View>
  );
}
