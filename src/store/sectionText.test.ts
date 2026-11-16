import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openTestDb } from '../test/nodeDb';
import * as repo from '../db/repo';

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'web' } }));
let testDb: Awaited<ReturnType<typeof openTestDb>>;
vi.mock('../db/client', () => ({ getDb: async () => testDb }));

import { flushSaves, useSong } from './song';

describe('editing a section as one block of text', () => {
  let ids: string[];
  let sec: string;
  beforeEach(async () => {
    testDb ??= await openTestDb();
    for (const x of await repo.listScraps(testDb)) await repo.deleteScrap(testDb, x.id);
    const doc = await repo.createSong(testDb, { title: 'T', sections: [{ kind: 'verse', lines: ['one', 'two', 'three'] }] });
    await useSong.getState().close();
    await useSong.getState().open(doc.song.id);
    sec = doc.sections[0].id;
    ids = doc.sections[0].lines.map((l) => l.id);
  });
  const lines = () => useSong.getState().doc!.sections[0].lines;
  const saved = async () => {
    await flushSaves();
    return (await repo.loadSong(testDb, useSong.getState().doc!.song.id))!.sections[0].lines.map((l) => [l.id, l.text, l.sort]);
  };

  it('typing changes only that line; Enter adds exactly one line; ids survive', async () => {
    const st = useSong.getState();
    st.setSectionText(sec, 'one\ntwo!\nthree');
    expect(lines().map((l) => l.id)).toEqual(ids);
    st.setSectionText(sec, 'one\ntwo!\n\nthree');
    expect(lines().map((l) => l.text)).toEqual(['one', 'two!', '', 'three']);
    expect([lines()[0].id, lines()[1].id, lines()[3].id]).toEqual(ids);
    expect(await saved()).toEqual(lines().map((l, i) => [l.id, l.text, i]));
  });

  it('backspace across line breaks merges lines without stopping, and big deletes work', async () => {
    const st = useSong.getState();
    st.setSectionText(sec, 'onetwo\nthree');
    expect(lines().map((l) => l.text)).toEqual(['onetwo', 'three']);
    expect(lines()[0].id).toBe(ids[0]);
    st.setSectionText(sec, 'on');
    expect(lines().map((l) => l.text)).toEqual(['on']);
    expect(await saved()).toEqual([[ids[0], 'on', 0]]);
    // the cut line went to the scrapyard, the merged one did not
    expect((await repo.listScraps(testDb)).map((x) => x.text)).toEqual(['three']);
  });

  it('pasting several lines inserts them in order', async () => {
    const st = useSong.getState();
    st.setSectionText(sec, 'one\na\nb\nc\ntwo\nthree');
    expect(lines().map((l) => l.text)).toEqual(['one', 'a', 'b', 'c', 'two', 'three']);
    expect(await saved()).toEqual(lines().map((l, i) => [l.id, l.text, i]));
  });

  it('refuses edits that touch a locked line', () => {
    const st = useSong.getState();
    st.toggleLock(ids[1]);
    expect(st.setSectionText(sec, 'one\ntwo changed\nthree')).toBe(false);
    expect(st.setSectionText(sec, 'one\nthree')).toBe(false);
    expect(lines().map((l) => l.text)).toEqual(['one', 'two', 'three']);
    expect(st.setSectionText(sec, 'one more\ntwo\nthree')).toBe(true);
  });
});
