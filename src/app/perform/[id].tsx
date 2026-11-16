/**
 * Performance mode: big type, screen stays awake, auto-scroll paced by the
 * song's tempo and structure, chords over the words. Touch the page to pause.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SongDoc } from '../../core/model';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { StagePage } from '../../features/chords/StageView';
import { openSong } from '../../features/nav/openSong';
import { useTheme } from '../../ui/theme';

export default function Perform() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const [doc, setDoc] = useState<SongDoc | null>(null);
  useEffect(() => {
    void getDb().then((db) => repo.loadSong(db, id!)).then(setDoc);
  }, [id]);
  if (!doc) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  return <StagePage doc={doc} onClose={() => (router.canGoBack() ? router.back() : openSong(id))} />;
}
