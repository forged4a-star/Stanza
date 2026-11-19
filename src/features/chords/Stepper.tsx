import { Text, View } from 'react-native';
import { Button } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

/** A labelled number with − and + buttons. */
export function Stepper({ label, value, onChange, min, max, step = 1, suffix = '', testID }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string; testID?: string }) {
  const t = useTheme();
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}>
      <Text style={{ color: t.textDim, fontSize: font.body, flex: 1 }}>{label}</Text>
      <Button compact title="−" onPress={() => set(value - step)} testID={testID ? `${testID}-down` : undefined} />
      <Text style={{ color: t.text, fontSize: font.body, fontWeight: '700', minWidth: 64, textAlign: 'center' }} testID={testID}>
        {value}
        {suffix}
      </Text>
      <Button compact title="+" onPress={() => set(value + step)} testID={testID ? `${testID}-up` : undefined} />
    </View>
  );
}
