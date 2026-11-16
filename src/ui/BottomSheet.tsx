/**
 * Bottom sheet over the lyric page. Opens at `height` (fraction of the
 * screen), can be dragged taller or down to dismiss. No native dependency.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, TAP, useTheme } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** starting height as a fraction of the window (0.3 - 0.95) */
  height?: number;
  /** element shown at the right of the title row */
  headerRight?: ReactNode;
  children: ReactNode;
  /** let the page behind stay interactive-looking (lighter backdrop) */
  light?: boolean;
  contentStyle?: ViewStyle;
  testID?: string;
  /** rendered above the sheet, unclipped (drag ghosts) */
  overlay?: ReactNode;
}

export function BottomSheet({ visible, onClose, title, height = 0.55, headerRight, children, light, contentStyle, testID, overlay }: Props) {
  const t = useTheme();
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [h, setH] = useState(height);
  const translate = useRef(new Animated.Value(winH)).current;
  const sheetH = Math.round(winH * h);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setH(height);
      translate.setValue(winH);
      Animated.spring(translate, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 0, speed: 18 }).start();
    } else if (mounted) {
      Animated.timing(translate, { toValue: winH, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => translate.setValue(Math.max(-winH * 0.3, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 1.2) {
          onCloseRef.current();
          return;
        }
        if (g.dy < -60) setH((cur) => Math.min(0.95, cur + 0.35));
        Animated.spring(translate, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 0 }).start();
      },
    })
  ).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  if (!mounted) return null;
  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <KeyboardAvoidingView style={StyleSheet.absoluteFill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: light ? 'rgba(0,0,0,0.12)' : t.backdrop }]} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          testID={testID}
          style={[
            styles.sheet,
            {
              height: sheetH,
              backgroundColor: t.surface,
              borderColor: t.border,
              paddingBottom: insets.bottom,
              transform: [{ translateY: translate }],
            },
          ]}
        >
          <View {...pan.panHandlers} style={styles.grabArea}>
            <View style={[styles.grabber, { backgroundColor: t.border }]} />
            {(title || headerRight) && (
              <View style={styles.header}>
                <Text style={[styles.title, { color: t.text }]} numberOfLines={1} accessibilityRole="header">
                  {title}
                </Text>
                {headerRight}
                <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close sheet" accessibilityRole="button">
                  <Ionicons name="close" size={22} color={t.textDim} />
                </Pressable>
              </View>
            )}
          </View>
          <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
        </Animated.View>
        {overlay}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxWidth: 760,
    alignSelf: 'center',
    width: '100%',
  },
  grabArea: { paddingTop: space.sm },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, minHeight: TAP - 4, gap: space.sm },
  title: { flex: 1, fontSize: font.body + 1, fontWeight: '600' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
