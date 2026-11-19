import { describe, expect, it } from 'vitest';
import { newId } from '../core/util/id';
import { openTestDb } from '../test/nodeDb';
import * as repo from './repo';
import { SaveQueue } from './saveQueue';

describe('songs', () => {
  it('creates, loads, edits, lists and searches', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, {
      title: 'Night Drive',
      sections: [
        { kind: 'verse', lines: ['headlights on the wet road', 'radio low'] },
        { kind: 'chorus', lines: ['drive all night'] },
      ],
    });
    expect(doc.sections.map((s) => s.lines.length)).toEqual([2, 1]);
    await repo.updateLine(db, doc.sections[1].lines[0].id, { text: 'we drive all night till the morning' });
    await repo.refreshSearchText(db, doc.song.id);
    await repo.setSongTags(db, doc.song.id, ['Synth', 'sad', 'synth']);
    const other = await repo.createSong(db, { title: 'Garden' });
    const list = await repo.listSongs(db);
    expect(list.map((s) => s.title)).toEqual(['Garden', 'Night Drive']);
    const hits = await repo.listSongs(db, { query: 'MORNING drive' });
    expect(hits.map((s) => s.id)).toEqual([doc.song.id]);
    expect(hits[0].match).toContain('morning');
    expect((await repo.listSongs(db, { tag: 'synth' })).length).toBe(1);
    expect(await repo.allTags(db)).toEqual([{ tag: 'sad', count: 1 }, { tag: 'synth', count: 1 }]);
    await repo.updateSong(db, other.song.id, { pinned: true, status: 'draft' });
    expect((await repo.listSongs(db))[0].id).toBe(other.song.id);
    expect((await repo.listSongs(db, { status: 'draft' })).length).toBe(1);
  });

  it('trashes, restores and purges', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'Temp' });
    await repo.trashSong(db, doc.song.id);
    expect(await repo.listSongs(db)).toHaveLength(0);
    expect(await repo.listSongs(db, { trash: true })).toHaveLength(1);
    await repo.restoreSong(db, doc.song.id);
    expect(await repo.listSongs(db)).toHaveLength(1);
    await repo.addRecording(db, { songId: doc.song.id, title: 't', file: 'a.m4a', mime: 'audio/mp4', durationMs: 10 });
    expect(await repo.purgeSong(db, doc.song.id)).toEqual(['a.m4a']);
    expect(await repo.loadSong(db, doc.song.id)).toBeNull();
    expect(db.raw.prepare('select count(*) n from lines').get()).toEqual({ n: 0 });
  });
});

describe('sections and lines', () => {
  it('inserts, reorders, duplicates and deletes into the scrapyard', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'S', sections: [{ kind: 'verse', lines: ['one', 'two'] }] });
    const sid = doc.song.id;
    const ch = await repo.insertSection(db, sid, 1, { kind: 'chorus', lines: [{ text: 'hook' }] });
    const v2 = await repo.insertSection(db, sid, 1, { kind: 'verse', lines: [{ text: 'three' }] });
    let loaded = (await repo.loadSong(db, sid))!;
    expect(loaded.sections.map((s) => s.kind)).toEqual(['verse', 'verse', 'chorus']);
    await repo.reorderSections(db, sid, [doc.sections[0].id, ch.id, v2.id]);
    loaded = (await repo.loadSong(db, sid))!;
    expect(loaded.sections.map((s) => s.id)).toEqual([doc.sections[0].id, ch.id, v2.id]);

    const line = { id: newId(), sectionId: doc.sections[0].id, sort: 1, text: 'middle', locked: false, alts: ['other middle'], chords: [] };
    await repo.insertLine(db, line);
    loaded = (await repo.loadSong(db, sid))!;
    expect(loaded.sections[0].lines.map((l) => l.text)).toEqual(['one', 'middle', 'two']);
    await repo.deleteLine(db, line.id);
    loaded = (await repo.loadSong(db, sid))!;
    expect(loaded.sections[0].lines.map((l) => [l.text, l.sort])).toEqual([['one', 0], ['two', 1]]);
    await repo.deleteSection(db, v2.id);
    const scraps = await repo.listScraps(db);
    expect(scraps.map((s) => s.text).sort()).toEqual(['middle', 'other middle', 'three']);
    expect(scraps.find((s) => s.text === 'three')!.sectionLabel).toBe('Verse 2');
    expect((await repo.listScraps(db, 'other')).map((s) => s.text)).toEqual(['other middle']);
    loaded = (await repo.loadSong(db, sid))!;
    expect(loaded.sections.map((s) => s.sort)).toEqual([0, 1]);
  });
});

describe('snapshots', () => {
  it('snapshots, skips identical auto snapshots, and restores reversibly', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'V', sections: [{ kind: 'verse', lines: ['first draft'] }] });
    const s1 = await repo.createSnapshot(db, doc.song.id, 'Draft 1');
    expect(await repo.createSnapshot(db, doc.song.id, '', true)).toBeNull();
    await repo.updateLine(db, doc.sections[0].lines[0].id, { text: 'second draft' });
    await repo.insertSection(db, doc.song.id, 1, { kind: 'chorus', lines: [{ text: 'new chorus' }] });
    const restored = (await repo.restoreSnapshot(db, s1!.id))!;
    expect(restored.sections.map((s) => s.lines.map((l) => l.text))).toEqual([['first draft']]);
    const snaps = await repo.listSnapshots(db, doc.song.id);
    expect(snaps.map((s) => s.label)).toEqual(['Before restore', 'Draft 1']);
    const undo = (await repo.restoreSnapshot(db, snaps[0].id))!;
    expect(undo.sections.map((s) => s.lines.map((l) => l.text))).toEqual([['second draft'], ['new chorus']]);
  });
});

describe('recordings and inbox', () => {
  it('numbers takes per target and moves inbox ideas into songs', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'R', sections: [{ kind: 'verse', lines: [''] }] });
    const sec = doc.sections[0].id;
    const a = await repo.addRecording(db, { songId: doc.song.id, sectionId: sec, title: 'a', file: 'a', mime: 'audio/mp4', durationMs: 1 });
    const b = await repo.addRecording(db, { songId: doc.song.id, sectionId: sec, title: 'b', file: 'b', mime: 'audio/mp4', durationMs: 1 });
    const c = await repo.addRecording(db, { songId: doc.song.id, title: 'c', file: 'c', mime: 'audio/mp4', durationMs: 1 });
    expect([a.takeNo, b.takeNo, c.takeNo]).toEqual([1, 2, 1]);
    await repo.updateRecording(db, a.id, { transcript: 'la la moonlight', bpm: 92, key: 'A minor' });
    expect((await repo.listSongs(db, { query: 'moonlight' })).length).toBe(1);

    const loose = await repo.addRecording(db, { songId: null, title: 'hum', file: 'h', mime: 'audio/mp4', durationMs: 1 });
    const hum = await repo.addIdea(db, 'audio', '', loose.id);
    const line = await repo.addIdea(db, 'text', 'a line from the bus\nand another');
    const loop = await repo.addIdea(db, 'chords', 'Am F C G');
    expect((await repo.listIdeas(db)).length).toBe(3);
    await repo.useIdea(db, line.id, doc.song.id, sec);
    await repo.useIdea(db, loop.id, doc.song.id, sec);
    await repo.useIdea(db, hum.id, doc.song.id, null);
    const loaded = (await repo.loadSong(db, doc.song.id))!;
    expect(loaded.sections[0].lines.map((l) => l.text)).toEqual(['a line from the bus', 'and another']);
    expect(loaded.sections[0].bars.map((b) => b.chords[0])).toEqual(['Am', 'F', 'C', 'G']);
    expect((await repo.getRecording(db, loose.id))!.songId).toBe(doc.song.id);
    expect(await repo.listIdeas(db)).toHaveLength(0);
    expect(await repo.listIdeas(db, true)).toHaveLength(3);
  });
});

describe('autosave queue', () => {
  it('saves every keystroke in order, merging rapid edits to the same line', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'Q' });
    const lineId = doc.sections[0].lines[0].id;
    const q = new SaveQueue(db);
    let batches = 0;
    q.afterBatch = async () => void batches++;
    const typed = 'hello there world';
    for (let i = 1; i <= typed.length; i++) {
      const text = typed.slice(0, i);
      q.push((d) => repo.updateLine(d, lineId, { text }), 'line:' + lineId, doc.song.id);
    }
    const newLine = { id: newId(), sectionId: doc.sections[0].id, sort: 1, text: '', locked: false, alts: [], chords: [] };
    q.push((d) => repo.insertLine(d, newLine));
    q.push((d) => repo.updateLine(d, newLine.id, { text: 'second' }), 'line:' + newLine.id, doc.song.id);
    await q.flush();
    const loaded = (await repo.loadSong(db, doc.song.id))!;
    expect(loaded.sections[0].lines.map((l) => l.text)).toEqual([typed, 'second']);
    expect(batches).toBeLessThan(typed.length);
    expect(q.size).toBe(0);
  });

  it('retries failed batches without losing writes', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'Q' });
    const lineId = doc.sections[0].lines[0].id;
    const q = new SaveQueue(db);
    let fail = 2;
    q.push(async (d) => {
      if (fail-- > 0) throw new Error('disk busy');
      await repo.updateLine(d, lineId, { text: 'survived' });
    });
    const states: string[] = [];
    q.onState((s) => states.push(s));
    await q.flush();
    expect((await repo.loadSong(db, doc.song.id))!.sections[0].lines[0].text).toBe('survived');
    expect(states).toContain('error');
    expect(states[states.length - 1]).toBe('saved');
  });
});

describe('backup', () => {
  it('dumps and re-imports a library', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'Dump', sections: [{ kind: 'verse', lines: ['x'] }] });
    const dump = await repo.dumpLibrary(db);
    expect(dump.songs).toHaveLength(1);
    const db2 = await openTestDb();
    const copy = await repo.importSongDoc(db2, dump.songs[0], { keepIds: true });
    expect(copy.song.id).toBe(doc.song.id);
    expect(repo.sameContent(copy, doc)).toBe(true);
  });
});

describe('writing history', () => {
  const ev = (at: number, text: string) => ({ at, kind: 'sec' as const, id: 'a', text });
  it('saves, lists in time order, and goes away with the song', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'H' });
    await repo.addEditEvents(db, doc.song.id, [ev(30, 'three'), ev(10, 'one'), { at: 20, kind: 'title', title: 'Hi' }]);
    const list = await repo.listEditEvents(db, doc.song.id);
    expect(list.map((e) => e.at)).toEqual([10, 20, 30]);
    expect(list[1]).toEqual({ at: 20, kind: 'title', title: 'Hi' });
    expect(list[0]).toMatchObject({ kind: 'sec', id: 'a', text: 'one' });
    expect(await repo.countEditEvents(db, doc.song.id)).toBe(3);
    await repo.purgeSong(db, doc.song.id);
    expect(await repo.countEditEvents(db, doc.song.id)).toBe(0);
  });
  it('histories of different songs do not mix, and can be cleared', async () => {
    const db = await openTestDb();
    const a = await repo.createSong(db, { title: 'A' });
    const b = await repo.createSong(db, { title: 'B' });
    await repo.addEditEvents(db, a.song.id, [ev(1, 'x')]);
    await repo.addEditEvents(db, b.song.id, [ev(2, 'y'), ev(3, 'yy')]);
    expect(await repo.countEditEvents(db, a.song.id)).toBe(1);
    await repo.clearEditEvents(db, b.song.id);
    expect(await repo.countEditEvents(db, b.song.id)).toBe(0);
    expect(await repo.countEditEvents(db, a.song.id)).toBe(1);
  });
  it('a long history is folded so it stays small, without losing the end result', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'Long' });
    const base = { at: 0, kind: 'base' as const, state: { title: '', sections: [{ id: 'a', kind: 'verse' as const, label: '', lines: [''] }] } };
    await repo.addEditEvents(db, doc.song.id, [base, ...Array.from({ length: 60 }, (_, i) => ev(i + 1, 'y'.repeat(i + 1)))]);
    expect(await repo.compactEditEvents(db, doc.song.id, 50, 20)).toBe(true);
    const list = await repo.listEditEvents(db, doc.song.id);
    expect(list.length).toBe(21);
    expect(list[0].kind).toBe('base');
    expect((list.at(-1) as { text: string }).text.length).toBe(60);
    expect(await repo.compactEditEvents(db, doc.song.id, 50, 20)).toBe(false); // already small
  });
  it('the database migrates to the new version', async () => {
    const db = await openTestDb();
    const row = await db.first<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBeGreaterThanOrEqual(3);
  });
});

describe('song goals', () => {
  it('saves, replaces and clears one goal per song', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'G' });
    expect(await repo.getGoal(db, doc.song.id)).toBeNull();
    await repo.saveGoal(db, doc.song.id, { reqs: [{ type: 'take', count: 1 }], dueAt: 123, createdAt: 1 });
    await repo.saveGoal(db, doc.song.id, { reqs: [{ type: 'sections', kind: 'verse', count: 2 }], dueAt: null, createdAt: 1 });
    expect(await repo.getGoal(db, doc.song.id)).toEqual({ reqs: [{ type: 'sections', kind: 'verse', count: 2 }], dueAt: null, createdAt: 1 });
    await repo.clearGoal(db, doc.song.id);
    expect(await repo.getGoal(db, doc.song.id)).toBeNull();
  });
  it('goes away with its song', async () => {
    const db = await openTestDb();
    const doc = await repo.createSong(db, { title: 'G' });
    await repo.saveGoal(db, doc.song.id, { reqs: [{ type: 'take', count: 1 }], dueAt: null, createdAt: 1 });
    await db.run('DELETE FROM songs WHERE id = ?', [doc.song.id]);
    expect((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM song_goals'))?.n).toBe(0);
  });
});

describe('setlists', () => {
  it('builds, reorders, edits and deletes a set', async () => {
    const db = await openTestDb();
    const a = await repo.createSong(db, { title: 'A' });
    const b = await repo.createSong(db, { title: 'B' });
    const id = await repo.createSetlist(db, '  Friday ');
    const i1 = await repo.addToSetlist(db, id, a.song.id);
    const i2 = await repo.addToSetlist(db, id, b.song.id);
    const i3 = await repo.addToSetlist(db, id, a.song.id); // an encore of the same song
    let set = (await repo.getSetlist(db, id))!;
    expect(set.name).toBe('Friday');
    expect(set.items.map((i) => i.songId)).toEqual([a.song.id, b.song.id, a.song.id]);
    await repo.reorderSetlist(db, id, [i3, i1, i2]);
    set = (await repo.getSetlist(db, id))!;
    expect(set.items.map((i) => i.id)).toEqual([i3, i1, i2]);
    await repo.updateSetlistItem(db, i1, { transpose: 40, note: 'capo up' });
    expect((await repo.getSetlist(db, id))!.items.find((i) => i.id === i1)).toMatchObject({ transpose: 11, note: 'capo up' });
    await repo.removeFromSetlist(db, i3);
    expect((await repo.getSetlist(db, id))!.items).toHaveLength(2);
    expect(await repo.listSetlists(db)).toMatchObject([{ id, name: 'Friday', songs: 2 }]);
    await repo.renameSetlist(db, id, 'Saturday');
    expect((await repo.getSetlist(db, id))!.name).toBe('Saturday');
    await repo.deleteSetlist(db, id);
    expect(await repo.getSetlist(db, id)).toBeNull();
    expect((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM setlist_items'))?.n).toBe(0);
  });
  it('hides songs in the Trash and shows them again once restored', async () => {
    const db = await openTestDb();
    const a = await repo.createSong(db, { title: 'A' });
    const b = await repo.createSong(db, { title: 'B' });
    const id = await repo.createSetlist(db, 'Set');
    await repo.addToSetlist(db, id, a.song.id);
    await repo.addToSetlist(db, id, b.song.id);
    await repo.trashSong(db, a.song.id);
    expect((await repo.getSetlist(db, id))!.items.map((i) => i.songId)).toEqual([b.song.id]);
    expect((await repo.listSetlists(db))[0].songs).toBe(1);
    await db.run('UPDATE songs SET deleted_at = NULL WHERE id = ?', [a.song.id]);
    expect((await repo.getSetlist(db, id))!.items).toHaveLength(2);
  });
  it('returns null for a missing set', async () => {
    expect(await repo.getSetlist(await openTestDb(), 'nope')).toBeNull();
  });
});
