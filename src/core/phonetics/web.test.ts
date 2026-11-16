import { describe, expect, it } from 'vitest';
import type { SectionWithLines } from '../model';
import { layoutWeb, rhymeWeb } from './web';

const sec = (lines: string[]): SectionWithLines => ({
  id: 's', songId: 'x', kind: 'verse', label: '', sort: 0, collapsed: false, feeling: '', intensity: null, bars: [], melody: [],
  lines: lines.map((t, i) => ({ id: 'l' + i, sectionId: 's', sort: i, text: t, locked: false, alts: [], chords: [] })),
});

describe('rhyme web', () => {
  const song = [sec(['I walked along the river in the rain', 'and felt the weight of every little pain', 'the lights were low, the street was bare', 'I left a little piece of me back there', 'and then a stranger told me the time'])];
  it('groups rhyming line endings into families', () => {
    const w = rhymeWeb(song);
    const words = w.families.map((f) => f.words.map((x) => x.text).sort().join('/'));
    expect(words.some((x) => x.includes('rain') && x.includes('pain'))).toBe(true);
    expect(words.some((x) => x.includes('bare') && x.includes('there'))).toBe(true);
  });
  it('lists the line ending that rhymes with nothing', () => {
    const w = rhymeWeb(song);
    expect(w.orphans.map((o) => o.text)).toContain('time');
    expect(w.notes.join(' ')).toMatch(/rhyme with nothing/);
  });
  it('flags one sound carrying the song', () => {
    const w = rhymeWeb([sec(['the night', 'the light', 'a sight', 'my fight', 'so bright', 'in flight'])]);
    expect(w.notes.join(' ')).toMatch(/One sound/);
  });
  it('flags a worn-out pair', () => {
    expect(rhymeWeb([sec(['I felt the fire', 'it was desire', 'we sat apart', 'with a heart'])]).notes.join(' ')).toMatch(/well-worn/);
  });
  it('handles empty and tiny songs', () => {
    expect(rhymeWeb([sec([])])).toMatchObject({ families: [], orphans: [], lineCount: 0 });
    expect(rhymeWeb([sec(['just one line'])]).notes).toEqual([]);
  });
  it('lays out every word inside the width', () => {
    const lay = layoutWeb(rhymeWeb(song), 360);
    for (const f of lay.families) for (const w of f.words) expect(w.x).toBeGreaterThanOrEqual(0), expect(w.x).toBeLessThanOrEqual(360);
    expect(lay.height).toBeGreaterThan(0);
  });
});
