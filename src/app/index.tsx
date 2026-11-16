/** Home is the lyric page of the song you were last working on (or a fresh one). */
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { useTheme } from '../ui/theme';

export default function Index() {
  const t = useTheme();
  useEffect(() => {
    (async () => {
      const db = await getDb();
      let id = await repo.lastOpenedSongId(db);
      if (!id) id = (await repo.createSong(db)).song.id;
      router.replace(`/song/${id}`);
    })();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}
