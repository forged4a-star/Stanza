/**
 * Sections register themselves as drop targets so things (Inbox ideas) can be
 * dragged from a sheet onto the lyric page.
 */
import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';

const zones = new Map<string, RefObject<HostInstance | null>>();

export function registerDropZone(id: string, ref: RefObject<HostInstance | null>): () => void {
  zones.set(id, ref);
  return () => {
    if (zones.get(id) === ref) zones.delete(id);
  };
}

interface Rect {
  id: string;
  y: number;
  h: number;
}

export async function measureZones(): Promise<Rect[]> {
  const out: Rect[] = [];
  await Promise.all(
    [...zones.entries()].map(
      ([id, ref]) =>
        new Promise<void>((resolve) => {
          const v = ref.current;
          if (!v) return resolve();
          v.measureInWindow((_x, y, _w, h) => {
            out.push({ id, y, h });
            resolve();
          });
        })
    )
  );
  return out.sort((a, b) => a.y - b.y);
}

/** The section under a window y position (nearest if between sections). */
export function zoneAt(rects: Rect[], y: number): string | null {
  if (!rects.length) return null;
  let best = rects[0];
  let bestD = Infinity;
  for (const r of rects) {
    if (y >= r.y && y <= r.y + r.h) return r.id;
    const d = Math.min(Math.abs(y - r.y), Math.abs(y - (r.y + r.h)));
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best.id;
}
