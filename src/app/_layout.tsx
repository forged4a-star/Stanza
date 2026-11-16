import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import * as QuickActions from 'expo-quick-actions';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { processPendingRecordings } from '../audio/analysisJob';
import { startAutoSync } from '../sync/runner';
import { getDb } from '../db/client';
import { CaptureHost } from '../features/capture/capture';
import { useSettings } from '../store/settings';
import { DialogHost } from '../ui/Dialogs';
import { useTheme } from '../ui/theme';

/** App-icon long-press → "Record idea" (iOS and Android). */
function setupQuickActions() {
  if (Platform.OS === 'web') return;
  const go = (a: QuickActions.Action | undefined) => {
    const href = a?.params?.href;
    if (typeof href === 'string') setTimeout(() => router.push(href as '/record'), 300);
  };
  void QuickActions.setItems([{ id: 'record', title: 'Record idea', icon: Platform.OS === 'ios' ? 'symbol:mic.fill' : null, params: { href: '/record' } }]).catch(() => {});
  go(QuickActions.initial);
  QuickActions.addListener(go);
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTheme();

  useEffect(() => {
    (async () => {
      try {
        await getDb();
        await useSettings.getState().load();
        setReady(true);
        setupQuickActions();
        void startAutoSync();
        // finish analysing any takes left over from last time
        void processPendingRecordings();
      } catch (e) {
        console.error(e);
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') document.body.style.backgroundColor = t.bg;
  }, [t.bg]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaProvider>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        {ready ? (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'fade' }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            {error ? <Text style={{ color: t.danger, textAlign: 'center' }}>Could not open your songs: {error}</Text> : <ActivityIndicator color={t.accent} />}
          </View>
        )}
        {ready && <CaptureHost />}
        <DialogHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
