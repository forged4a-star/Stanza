import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { transcriptionAvailable } from '../audio/transcribe';
import { dumpLibrary } from '../db/repo';
import { getDb } from '../db/client';
import { shareFile } from '../platform/share';
import { useSettings } from '../store/settings';
import { toast } from '../ui/Dialogs';
import { useEffect, useState } from 'react';
import { loadSyncConfig, runSync, saveSyncConfig, startAutoSync, useSync } from '../sync/runner';
import { Button, Field } from '../ui/kit';
import { IconButton, ListItem, Row, SectionTitle, Segmented, ToggleRow } from '../ui/kit';
import { font, space, TAP, useTheme } from '../ui/theme';

export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <Row style={{ minHeight: TAP + 4, paddingHorizontal: space.xs }}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={{ flex: 1, color: t.text, fontSize: font.title, fontWeight: '700' }} accessibilityRole="header">
          Settings
        </Text>
      </Row>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionTitle>Appearance</SectionTitle>
          <Segmented
            value={s.theme}
            onChange={(v) => s.set({ theme: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            testID="theme-picker"
          />
          <SectionTitle>Lyric page</SectionTitle>
        </View>
        <ToggleRow label="Syllable counts" value={s.showSyllables} onChange={(v) => s.set({ showSyllables: v })} />
        <ToggleRow label="Stress pattern" value={s.showStress} onChange={(v) => s.set({ showStress: v })} />
        <ToggleRow label="Rhyme scheme letters" value={s.showScheme} onChange={(v) => s.set({ showScheme: v })} />
        <ToggleRow label="Sound highlighting" value={s.highlight} onChange={(v) => s.set({ highlight: v })} />
        <ToggleRow label="Cliché and repetition flags" hint="Off by default" value={s.clicheFlags} onChange={(v) => s.set({ clicheFlags: v })} />
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionTitle>Capture</SectionTitle>
        </View>
        <ToggleRow
          label="Transcribe takes on this device"
          hint={transcriptionAvailable() ? 'Uses on-device speech recognition; nothing leaves your phone.' : 'Not available on this device.'}
          value={s.transcribe}
          onChange={(v) => s.set({ transcribe: v })}
        />
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionTitle>Help from the app</SectionTitle>
          <Text style={{ color: t.textDim, fontSize: font.small, lineHeight: 19 }}>
            By default the app only looks things up (rhymes, words, chords), transcribes your takes and asks questions to help you say what you mean. It never writes or finishes lyrics for you.
          </Text>
        </View>
        <ToggleRow
          label="Let AI write or complete lyrics"
          hint="Off. No lyric-writing model is installed in this version, so turning this on changes nothing yet."
          value={s.aiWritesLyrics}
          onChange={(v) => s.set({ aiWritesLyrics: v })}
          testID="ai-writes-toggle"
        />
        <SyncSettings />
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionTitle>Your data</SectionTitle>
        </View>
        <ListItem
          icon="cloud-download-outline"
          title="Back up all songs (JSON)"
          subtitle="Everything except audio. Use Project ZIP per song for takes."
          onPress={async () => {
            const dump = await dumpLibrary(await getDb());
            await shareFile(`stanza-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(dump));
            toast(`Backed up ${dump.songs.length} songs`);
          }}
        />
        <Text style={{ color: t.textFaint, fontSize: font.small, padding: space.lg }}>
          Everything is stored on this device and works without internet. Rhyme and pronunciation data: CMU Pronouncing Dictionary. Thesaurus and definitions: Princeton WordNet.
        </Text>
      </ScrollView>
    </View>
  );
}

function SyncSettings() {
  const t = useTheme();
  const sync = useSync();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    void loadSyncConfig().then((c) => {
      setUrl(c.url);
      setToken(c.token);
      setName(c.name);
    });
  }, []);
  const save = async () => {
    await saveSyncConfig({ url: url.trim().replace(/\/+$/, ''), token: token.trim(), name: name.trim() });
    await startAutoSync();
  };
  const when = sync.config.lastSyncAt ? new Date(sync.config.lastSyncAt).toLocaleString() : 'never';
  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
      <SectionTitle>Backup, sync and co-writing (optional)</SectionTitle>
      <Text style={{ color: t.textDim, fontSize: font.small }}>Everything works offline. To back up, sync between devices and share songs for co-writing, run a Stanza server (see server/README) and enter it here.</Text>
      <Field label="Server address" value={url} onChangeText={setUrl} onBlur={save} placeholder="https://songs.example.com" autoCapitalize="none" autoCorrect={false} testID="sync-url" />
      <Field label="Sync key" value={token} onChangeText={setToken} onBlur={save} placeholder="the server's STANZA_TOKEN" autoCapitalize="none" autoCorrect={false} secureTextEntry testID="sync-token" />
      <Field label="Your name for co-writers" value={name} onChangeText={setName} onBlur={save} placeholder="e.g. Sam" testID="sync-name" />
      <ToggleRow label="Sync automatically" hint="On start, every 5 minutes and when you leave the app" value={sync.config.enabled} onChange={async (v) => (await saveSyncConfig({ enabled: v }), await startAutoSync())} testID="sync-auto" />
      <Row>
        <Button title="Sync now" icon="sync" busy={sync.status === 'syncing'} onPress={async () => (await save(), await runSync())} disabled={!url || !token} testID="sync-now" />
        <Text style={{ color: sync.status === 'error' ? t.danger : t.textDim, fontSize: font.small, flex: 1 }} testID="sync-status">
          {sync.status === 'ok' ? `Synced: ${sync.message}` : sync.message || `Last sync: ${when}`}
        </Text>
      </Row>
    </View>
  );
}
