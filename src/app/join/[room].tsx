/** Opened from a share link: stanza://join/<room>?k=<key>&s=<server> (or /join/<room>… on web). */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { joinRoom } from '../../collab/collab';
import { openSong } from '../../features/nav/openSong';
import { Button } from '../../ui/kit';
import { font, space, useTheme } from '../../ui/theme';

export default function Join() {
  const t = useTheme();
  const { room, k, s } = useLocalSearchParams<{ room: string; k?: string; s?: string }>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const server = s || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
        const id = await joinRoom(server, room!, k ?? '');
        openSong(id);
      } catch (e) {
        setError(String((e as Error).message ?? e));
      }
    })();
  }, [room, k, s]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>
      {error ? (
        <>
          <Text style={{ color: t.text, fontSize: font.body + 1, textAlign: 'center' }}>Couldn't open the shared song: {error}</Text>
          <Button title="Back to my songs" onPress={() => router.replace('/library')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={t.accent} />
          <Text style={{ color: t.textDim }}>Joining the song…</Text>
        </>
      )}
    </View>
  );
}
