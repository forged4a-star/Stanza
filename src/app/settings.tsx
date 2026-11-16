import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { transcriptionAvailable } from '../audio/transcribe';
import { dumpLibrary } from '../db/repo';
import { getDb } from '../db/client';
import { shareFile } from '../platform/share';
import { useSettings } from '../store/settings';
import { toast } from '../ui/Dialogs';
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
