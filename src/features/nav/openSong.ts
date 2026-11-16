import { router } from 'expo-router';

/**
 * Go to a song's lyric page: pops back to it if it's already in the stack,
 * otherwise replaces the current screen (so the stack doesn't pile up).
 */
export function openSong(id: string) {
  router.dismissTo(`/song/${id}`);
}
