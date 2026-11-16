/** A small ring that fills as a song comes together. */
import Svg, { Circle } from 'react-native-svg';
import { Text, View } from 'react-native';
import { useTheme } from './theme';

export function ProgressRing({ done, total, size = 28, label = true }: { done: number; total: number; size?: number; label?: boolean }) {
  const t = useTheme();
  const stroke = Math.max(3, size / 9);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={`${done} of ${total} parts done`}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={stroke} fill="none" />
        {frac > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={frac >= 1 ? t.ok : t.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * frac} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {label && <Text style={{ color: t.textDim, fontSize: Math.max(8, size * 0.34), fontWeight: '700' }}>{done}</Text>}
    </View>
  );
}
