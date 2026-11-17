/**
 * App-wide confirm / text prompt / choice / toast, rendered by one host so
 * they look the same on iOS, Android and web (RN's Alert can't prompt on
 * Android and does nothing on web).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { create } from 'zustand';
import { font, radius, space, TAP, useTheme, displayText } from './theme';

type Request =
  | { kind: 'confirm'; title: string; message?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; message?: string; value: string; ok: string; placeholder?: string; multiline?: boolean; resolve: (v: string | null) => void }
  | { kind: 'choose'; title: string; message?: string; options: { label: string; value: string; danger?: boolean }[]; resolve: (v: string | null) => void };

interface DialogStore {
  queue: Request[];
  toast: { text: string; action?: { label: string; run: () => void }; id: number } | null;
}

const useDialogs = create<DialogStore>(() => ({ queue: [], toast: null }));

const enqueue = (r: Request) => {
  // On web a closing modal returns focus to whatever opened it, which would
  // steal focus from a line the action just focused. Let go of it up front.
  if (Platform.OS === 'web' && typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur?.();
  useDialogs.setState((s) => ({ queue: [...s.queue, r] }));
};
const dequeue = () => useDialogs.setState((s) => ({ queue: s.queue.slice(1) }));

export function confirm(title: string, message?: string, ok = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => enqueue({ kind: 'confirm', title, message, ok, danger, resolve }));
}

export function askText(title: string, value = '', opts: { message?: string; ok?: string; placeholder?: string; multiline?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: 'prompt', title, value, ok: opts.ok ?? 'Save', message: opts.message, placeholder: opts.placeholder, multiline: opts.multiline, resolve }));
}

export function choose(title: string, options: { label: string; value: string; danger?: boolean }[], message?: string): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: 'choose', title, options, message, resolve }));
}

let toastId = 0;
export function toast(text: string, action?: { label: string; run: () => void }) {
  const id = ++toastId;
  useDialogs.setState({ toast: { text, action, id } });
  setTimeout(() => {
    if (useDialogs.getState().toast?.id === id) useDialogs.setState({ toast: null });
  }, action ? 4500 : 2600);
}

export function DialogHost() {
  const t = useTheme();
  const req = useDialogs((s) => s.queue[0]);
  const tst = useDialogs((s) => s.toast);
  const [text, setText] = useState('');
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (req?.kind === 'prompt') setText(req.value);
  }, [req]);
  useEffect(() => {
    Animated.timing(fade, { toValue: tst ? 1 : 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [tst, fade]);

  const close = (v: unknown) => {
    if (!req) return;
    (req.resolve as (x: unknown) => void)(v);
    dequeue();
  };

  return (
    <>
      {tst && (
        <Animated.View pointerEvents="box-none" style={[styles.toastWrap, { opacity: fade }]}>
          <View style={[styles.toast, { backgroundColor: t.dark ? '#f1efe9' : '#222' }]} accessibilityLiveRegion="polite">
            <Text style={{ color: t.dark ? '#111' : '#fff', fontSize: font.small + 1, flexShrink: 1 }}>{tst.text}</Text>
            {tst.action && (
              <Pressable
                onPress={() => {
                  tst.action!.run();
                  useDialogs.setState({ toast: null });
                }}
                hitSlop={10}
              >
                <Text style={{ color: t.accent, fontWeight: '700', fontSize: font.small + 1 }}>{tst.action.label}</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
      {/* mounted only while needed so it stacks above any open sheet */}
      {req && (
      <Modal transparent visible animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={() => close(req?.kind === 'confirm' ? false : null)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={() => close(req?.kind === 'confirm' ? false : null)} />
        {req && (
          <View style={styles.center} pointerEvents="box-none">
            <View style={[styles.box, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.r.xl }, ({ boxShadow: '0 20px 60px rgba(0,0,0,0.35)' } as object)]} accessibilityViewIsModal testID="dialog">
              <Text style={[{ color: t.text }, displayText(t, font.body + 3)]} accessibilityRole="header">
                {req.title}
              </Text>
              {!!req.message && <Text style={{ color: t.textDim, fontSize: font.body, marginTop: space.sm }}>{req.message}</Text>}
              {req.kind === 'prompt' && (
                <TextInput
                  testID="dialog-input"
                  autoFocus
                  value={text}
                  onChangeText={setText}
                  placeholder={req.placeholder}
                  placeholderTextColor={t.textFaint}
                  multiline={req.multiline}
                  onSubmitEditing={() => !req.multiline && close(text)}
                  style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.accent, borderRadius: t.r.md }, req.multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: space.md }]}
                />
              )}
              {req.kind === 'choose' ? (
                <View style={{ marginTop: space.md }}>
                  {req.options.map((o) => (
                    <Pressable key={o.value} onPress={() => close(o.value)} style={({ pressed }) => [styles.choice, { borderTopColor: t.border }, pressed && { backgroundColor: t.surface2 }]} accessibilityRole="button">
                      <Text style={{ color: o.danger ? t.danger : t.text, fontSize: font.body }}>{o.label}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => close(null)} style={[styles.choice, { borderTopColor: t.border }]} accessibilityRole="button">
                    <Text style={{ color: t.textDim, fontSize: font.body }}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Pressable testID="dialog-cancel" onPress={() => close(req.kind === 'confirm' ? false : null)} style={styles.action} accessibilityRole="button">
                    <Text style={{ color: t.textDim, fontSize: font.body }}>Cancel</Text>
                  </Pressable>
                  <Pressable testID="dialog-ok" onPress={() => close(req.kind === 'confirm' ? true : text)} style={styles.action} accessibilityRole="button">
                    <Text style={{ color: req.kind === 'confirm' && req.danger ? t.danger : t.accent, fontSize: font.body, fontWeight: '700' }}>{req.ok}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}
      </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  box: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: space.xl, borderWidth: StyleSheet.hairlineWidth },
  input: { marginTop: space.lg, minHeight: TAP, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: font.body, borderWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.lg, gap: space.sm },
  action: { minHeight: TAP, minWidth: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  choice: { minHeight: TAP, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 110, alignItems: 'center', zIndex: 1000, elevation: 20 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.pill, maxWidth: 520, marginHorizontal: space.lg },
});
