/** Shared UI pieces: buttons, chips, cards, rows, toggles, segmented control, slider. All follow the look (see looks.ts). */
import { useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { alpha } from './color';
import { font, space, TAP, useTheme, type Theme } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;

/** Style props that React Native supports but its older type definitions do not list. */
const fx = (o: { backgroundImage?: string; boxShadow?: string }) => o as ViewStyle;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

/** Style for a screen's outermost view: the look's background colour and soft gradient. */
export function pageStyle(t: Theme): ViewStyle {
  return { flex: 1, backgroundColor: t.bg, ...(t.pageGradient ? fx({ backgroundImage: t.pageGradient }) : null) };
}

/** A whole screen's background: the look's colour, with its soft gradient if it has one. */
export function Page({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.bg }, t.pageGradient ? fx({ backgroundImage: t.pageGradient }) : null, style]}>{children}</View>;
}

/** A panel. Soft (shadow and hairline), flat (tinted) or outline, following the look. */
export function cardStyle(t: Theme, opts: { accentEdge?: string; padded?: boolean } = {}): ViewStyle {
  const base: ViewStyle = {
    borderRadius: t.r.lg,
    overflow: 'hidden',
    ...(opts.padded ? { padding: t.sp(space.md) } : null),
    ...(opts.accentEdge ? { borderLeftWidth: 3, borderLeftColor: opts.accentEdge } : null),
  };
  if (t.surfaceStyle === 'outline') return { ...base, borderWidth: 1, borderColor: t.border, backgroundColor: 'transparent' };
  if (t.surfaceStyle === 'flat') return { ...base, backgroundColor: t.surface2 };
  return { ...base, backgroundColor: t.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, ...fx({ boxShadow: t.shadow.card }) };
}

export function Card({ children, style, accentEdge, padded = true, onPress, testID, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; accentEdge?: string; padded?: boolean; onPress?: () => void; testID?: string; accessibilityLabel?: string }) {
  const t = useTheme();
  const s = [cardStyle(t, { accentEdge, padded }), style];
  if (!onPress) return <View style={s} testID={testID}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
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
        { borderRadius: t.r.md },
        active && { backgroundColor: alpha(t.accent, 0.16) },
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
  const primary = kind === 'primary';
  const fg = primary ? t.accentText : kind === 'danger' ? t.danger : t.text;
  const bg = primary ? t.accent : kind === 'ghost' ? 'transparent' : kind === 'danger' ? alpha(t.danger, 0.13) : t.surface2;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.btn,
        { borderRadius: t.r.md, minHeight: compact ? t.sp(38) : t.sp(TAP), paddingHorizontal: t.sp(compact ? space.md : space.lg), backgroundColor: bg },
        primary && fx({ backgroundImage: t.gradient, boxShadow: disabled ? undefined : t.shadow.glow }),
        pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] },
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
        { minHeight: t.sp(36), borderColor: selected ? alpha(t.accent, 0.7) : t.border, backgroundColor: selected ? (color ?? alpha(t.accent, 0.15)) : 'transparent' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={{ color: selected ? t.text : t.textDim, fontSize: font.small + 1, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: t.sp(space.sm) }, style]}>{children}</View>;
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
      style={({ pressed }) => [styles.item, { minHeight: t.sp(TAP + 8), borderBottomColor: alpha(t.border, 0.7) }, pressed && onPress && { backgroundColor: alpha(t.accent, 0.08) }]}
    >
      {icon && (
        <View style={[styles.itemIcon, { borderRadius: t.r.sm + 2, backgroundColor: danger ? alpha(t.danger, 0.13) : alpha(t.accent, 0.13) }]}>
          <Ionicons name={icon} size={18} color={danger ? t.danger : t.accent} />
        </View>
      )}
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

/** The on/off switch: a pill that fills with the look's accent. */
export function Toggle({ value }: { value: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.toggle, { borderRadius: 16, backgroundColor: value ? t.accent : t.surface2, borderColor: value ? t.accent : t.border }, value && fx({ backgroundImage: t.gradient })]} pointerEvents="none">
      <View style={[styles.toggleKnob, { backgroundColor: value ? t.accentText : t.textDim, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </View>
  );
}

export function ToggleRow({ label, value, onChange, hint, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.item, { minHeight: t.sp(TAP + 8), borderBottomColor: alpha(t.border, 0.7) }]} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: font.body }}>{label}</Text>
        {!!hint && <Text style={{ color: t.textDim, fontSize: font.small, marginTop: 2 }}>{hint}</Text>}
      </View>
      <Toggle value={value} />
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, testID }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  const t = useTheme();
  // five or more options do not fit side by side on a phone without cutting the words: let the row scroll sideways instead
  const scrolls = options.length >= 5;
  const scroller = useRef<ScrollViewInstance>(null);
  const spots = useRef<Record<string, { x: number; w: number }>>({});
  const [width, setWidth] = useState(0);
  const items = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable
        key={o.value}
        onPress={() => onChange(o.value)}
        onLayout={(e) => (spots.current[o.value] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width })}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={o.label}
        style={[styles.segItem, scrolls && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: space.md }, { minHeight: t.sp(38), borderRadius: t.r.md }, on && { backgroundColor: t.surface, borderColor: alpha(t.accent, 0.55), borderWidth: 1 }, on && fx({ boxShadow: t.shadow.card })]}
      >
        <Text style={{ color: on ? t.text : t.textDim, fontWeight: on ? '700' : '500', fontSize: font.small + 1 }} numberOfLines={1}>
          {o.label}
        </Text>
      </Pressable>
    );
  });
  const reveal = (v: string) => {
    const s = spots.current[v];
    if (s && width) scroller.current?.scrollTo({ x: Math.max(0, s.x + s.w / 2 - width / 2), animated: true });
  };
  if (!scrolls)
    return (
      <View testID={testID} style={[styles.seg, { backgroundColor: t.surface2, borderRadius: t.r.md + 2 }]} accessibilityRole="tablist">
        {items}
      </View>
    );
  return (
    <View testID={testID} style={{ backgroundColor: t.surface2, borderRadius: t.r.md + 2 }} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.seg}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => reveal(value)}
      >
        {items}
      </ScrollView>
    </View>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      {label && <Text style={{ color: t.textDim, fontSize: font.small, fontWeight: '600' }}>{label}</Text>}
      <TextInput
        placeholderTextColor={t.textFaint}
        {...rest}
        onFocus={(e) => (setFocused(true), onFocus?.(e))}
        onBlur={(e) => (setFocused(false), onBlur?.(e))}
        style={[styles.field, { minHeight: t.sp(TAP), borderRadius: t.r.md, color: t.text, backgroundColor: t.surface2, borderColor: focused ? t.accent : t.border }, style]}
      />
    </View>
  );
}

/** A simple slider (0..1) with large touch area. */
export function Slider({ value, onChange, label, testID, rainbow }: { value: number; onChange: (v: number) => void; label: string; testID?: string; rainbow?: boolean }) {
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
  const v = Math.max(0, Math.min(1, value));
  return (
    <View
      testID={testID}
      accessible
      role="slider"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(1, v + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height: TAP, justifyContent: 'center' }}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={[{ height: 6, borderRadius: 3, backgroundColor: t.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }, rainbow ? fx({ backgroundImage: 'linear-gradient(90deg, #ff4d4d, #ffb84d, #f0e84a, #4dd97a, #4dc3ff, #6b6bff, #c24dff, #ff4da6, #ff4d4d)' }) : null]}>
        {!rainbow && <View style={[{ height: 6, marginTop: -StyleSheet.hairlineWidth, marginLeft: -StyleSheet.hairlineWidth, borderRadius: 3, width: `${v * 100}%`, backgroundColor: t.accent }, fx({ backgroundImage: t.gradient })]} />}
      </View>
      <View pointerEvents="none" style={[styles.knob, { left: v * w - 13, backgroundColor: t.surface, borderColor: t.accent }, fx({ boxShadow: t.shadow.glow })]} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: t.sp(space.lg), marginBottom: space.xs }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: t.accent }} />
      <Text style={{ color: t.textDim, fontSize: font.tiny + 1, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{children}</Text>
    </View>
  );
}

export function Empty({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(t.accent, 0.12) }}>
        <Ionicons name={icon} size={30} color={t.accent} />
      </View>
      <Text style={{ color: t.text, fontSize: font.body, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      {!!hint && <Text style={{ color: t.textDim, fontSize: font.small, textAlign: 'center', maxWidth: 280 }}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  btn: { paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  btnText: { fontSize: font.body, fontWeight: '700' },
  chip: { paddingHorizontal: space.md, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  itemIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 50, height: 30, padding: 3, borderWidth: 1, justifyContent: 'center' },
  toggleKnob: { width: 22, height: 22, borderRadius: 11 },
  seg: { flexDirection: 'row', padding: 3, gap: 3 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  field: { paddingHorizontal: space.md, fontSize: font.body, borderWidth: 1 },
  knob: { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 3, top: (TAP - 26) / 2 },
});
