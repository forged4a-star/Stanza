/** Small shared UI pieces: buttons, chips, rows, toggles, segmented control, slider. */
import { useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { font, radius, space, TAP, useTheme } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 22,
  active,
  style,
  onLongPress,
  disabled,
  testID,
}: {
  icon: IconName;
  onPress?: () => void;
  onLongPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconBtn,
        active && { backgroundColor: t.surface2 },
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? (active ? t.accent : t.text)} />
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  icon,
  kind = 'plain',
  disabled,
  busy,
  style,
  testID,
  compact,
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  kind?: 'primary' | 'plain' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  compact?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'ghost' ? 'transparent' : t.surface2;
  const fg = kind === 'primary' ? t.accentText : kind === 'danger' ? t.danger : t.text;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.btn,
        compact && { minHeight: 38, paddingHorizontal: space.md },
        { backgroundColor: bg },
        pressed && { opacity: 0.7 },
        (disabled || busy) && { opacity: 0.45 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.btnText, { color: fg }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color, onLongPress, testID }: { label: string; selected?: boolean; onPress?: () => void; color?: string; onLongPress?: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? (color ?? t.surface2) : 'transparent' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={{ color: selected ? t.text : t.textDim, fontSize: font.small + 1, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
}

export function ListItem({
  title,
  subtitle,
  icon,
  onPress,
  right,
  onLongPress,
  danger,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.item, { borderBottomColor: t.border }, pressed && onPress && { backgroundColor: t.surface2 }]}
    >
      {icon && <Ionicons name={icon} size={20} color={danger ? t.danger : t.textDim} style={{ width: 26 }} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? t.danger : t.text, fontSize: font.body }} numberOfLines={2}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ color: t.textDim, fontSize: font.small, marginTop: 2 }} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </Pressable>
  );
}

export function ToggleRow({ label, value, onChange, hint, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.item, { borderBottomColor: t.border }]} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: font.body }}>{label}</Text>
        {!!hint && <Text style={{ color: t.textDim, fontSize: font.small, marginTop: 2 }}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent, false: t.border }} />
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, testID }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.seg, { backgroundColor: t.surface2 }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[styles.segItem, on && { backgroundColor: t.surface, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}
          >
            <Text style={{ color: on ? t.text : t.textDim, fontWeight: on ? '600' : '400', fontSize: font.small + 1 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 4 }}>
      {label && <Text style={{ color: t.textDim, fontSize: font.small }}>{label}</Text>}
      <TextInput
        placeholderTextColor={t.textFaint}
        {...rest}
        style={[styles.field, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }, style]}
      />
    </View>
  );
}

/** A simple slider (0..1) with large touch area. */
export function Slider({ value, onChange, label, testID }: { value: number; onChange: (v: number) => void; label: string; testID?: string }) {
  const t = useTheme();
  const [w, setW] = useState(1);
  const wRef = useRef(1);
  wRef.current = w;
  const startX = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        onChangeRef.current(Math.max(0, Math.min(1, startX.current / wRef.current)));
      },
      onPanResponderMove: (_, g) => onChangeRef.current(Math.max(0, Math.min(1, (startX.current + g.dx) / wRef.current))),
    })
  ).current;
  return (
    <View
      testID={testID}
      accessible
      role="slider"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(1, value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height: TAP, justifyContent: 'center' }}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: t.border }}>
        <View style={{ height: 4, borderRadius: 2, width: `${value * 100}%`, backgroundColor: t.accent }} />
      </View>
      <View pointerEvents="none" style={[styles.knob, { left: value * w - 12, backgroundColor: t.surface, borderColor: t.accent }]} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.textDim, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: space.lg, marginBottom: space.xs }}>{children}</Text>;
}

export function Empty({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <Ionicons name={icon} size={36} color={t.textFaint} />
      <Text style={{ color: t.textDim, fontSize: font.body, textAlign: 'center' }}>{title}</Text>
      {!!hint && <Text style={{ color: t.textFaint, fontSize: font.small, textAlign: 'center' }}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: TAP, height: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btn: { minHeight: TAP, paddingHorizontal: space.lg, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  btnText: { fontSize: font.body, fontWeight: '600' },
  chip: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  item: { minHeight: TAP + 8, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  seg: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: space.sm },
  field: { minHeight: TAP, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: font.body, borderWidth: StyleSheet.hairlineWidth },
  knob: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 2, top: (TAP - 24) / 2 },
});
