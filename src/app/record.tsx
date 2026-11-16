/**
 * Deep link target for one-tap capture from outside the app:
 *   stanza://record            → record a loose idea into the Inbox
 *   stanza://record?song=<id>  → record a take for that song
 * Used by the home-screen widget, lock-screen widget / control, and the
 * app-icon quick action.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getDb } from '../db/client';
import * as repo from '../db/repo';
import { startCapture } from '../features/capture/capture';
import { useTheme } from '../ui/theme';

export default function RecordLink() {
  const t = useTheme();
  const { song } = useLocalSearchParams<{ song?: string }>();
  useEffect(() => {
    (async () => {
      const db = await getDb();
      const target = song ? await repo.loadSong(db, song) : null;
      const home = target?.song.id ?? (await repo.lastOpenedSongId(db));
      router.replace(home ? `/song/${home}` : '/library');
      // start once the page is up; loose ideas go to the Inbox
      setTimeout(() => startCapture(target ? { songId: target.song.id, label: target.song.title || 'Song' } : { songId: null, label: 'Idea' }), 400);
    })();
  }, [song]);
  return <View style={{ flex: 1, backgroundColor: t.bg }} />;
}
