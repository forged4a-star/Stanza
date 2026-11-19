/**
 * Performance mode: big type, screen stays awake, auto-scroll paced by the
 * song's tempo and structure, chords over the words. Touch the page to pause.
 *
 * With `?mic=1` it runs as open-mic mode (a count-in, then it scrolls to the
 * end). With `&set=<setlist>&i=<n>` it steps through a setlist.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SongDoc } from '../../core/model';
import { playedKey } from '../../core/song/setlist';
import { getDb } from '../../db/client';
import * as repo from '../../db/repo';
import { StagePage, type OpenMic } from '../../features/chords/StageView';
import { openSong } from '../../features/nav/openSong';
import { useTheme } from '../../ui/theme';

interface SetInfo {
  index: number;
  total: number;
  transpose: number;
  next: { songId: string; title: string; detail: string } | null;
}

export default function Perform() {
  const { id, mic, set, i } = useLocalSearchParams<{ id: string; mic?: string; set?: string; i?: string }>();
  const t = useTheme();
  const [doc, setDoc] = useState<SongDoc | null>(null);
  const [info, setInfo] = useState<SetInfo | null>(null);
  useEffect(() => {
    let dead = false;
    setDoc(null);
    setInfo(null);
    void (async () => {
      const db = await getDb();
      const d = await repo.loadSong(db, id!);
      let si: SetInfo | null = null;
      if (set) {
        const list = await repo.getSetlist(db, set);
        if (list) {
          const index = Math.max(0, Math.min(list.items.length - 1, Number(i) || 0));
          const cur = list.items[index];
          const nextItem = list.items[index + 1];
          let next: SetInfo['next'] = null;
          if (nextItem) {
            const nd = await repo.loadSong(db, nextItem.songId);
            if (nd) {
              const k = playedKey({ key: nd.song.key, transpose: nextItem.transpose });
              next = { songId: nextItem.songId, title: nd.song.title || 'Untitled', detail: [k ? `key ${k}` : null, nd.song.capo ? `capo ${nd.song.capo}` : null, nextItem.note || null].filter(Boolean).join(' · ') };
            }
          }
          si = { index, total: list.items.length, transpose: cur?.transpose ?? 0, next };
        }
      }
      if (!dead) {
        setInfo(si);
        setDoc(d);
      }
    })();
    return () => {
      dead = true;
    };
  }, [id, set, i]);

  if (!doc) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const close = () => (router.canGoBack() ? router.back() : set ? router.replace(`/setlist/${set}`) : openSong(id));
  const openMic: OpenMic | undefined =
    mic === '1'
      ? {
          next: info?.next ? { title: info.next.title, detail: info.next.detail } : null,
          onNext: info?.next ? () => router.replace(`/perform/${info.next!.songId}?mic=1&set=${set}&i=${info.index + 1}`) : undefined,
          position: info ? `Song ${info.index + 1} of ${info.total}` : undefined,
        }
      : undefined;
  return <StagePage key={`${id}-${info?.index ?? 0}`} doc={doc} onClose={close} openMic={openMic} initialTranspose={info?.transpose ?? 0} />;
}
