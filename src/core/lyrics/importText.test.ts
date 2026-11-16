import { describe, expect, it } from 'vitest';
import { importLyrics } from './importText';

const kinds = (t: string) => importLyrics(t).sections.map((s) => s.kind);

describe('importing pasted lyrics', () => {
  it('reads section headers in common styles', () => {
    const r = importLyrics('[Verse 1]\nline a\nline b\n\nCHORUS:\nhook line\n\n(Bridge)\nturn\n\nOutro\nbye');
    expect(r.sections.map((s) => [s.kind, s.lines.length])).toEqual([['verse', 2], ['chorus', 1], ['bridge', 1], ['outro', 1]]);
  });
  it('labels a repeated block as the chorus and a late new block as the bridge', () => {
    const v1 = 'walking down the road\nthinking of you';
    const ch = 'oh oh carry me home\ncarry me home';
    const v2 = 'another day goes by\nstill on my mind';
    const br = 'and if the night should fall\nI will not be afraid';
    const r = importLyrics([v1, ch, v2, ch, br, ch].join('\n\n'));
    expect(r.sections.map((s) => s.kind)).toEqual(['verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus']);
    expect(r.sections[1].why).toBe('repeats');
  });
  it('handles double-spaced pastes from notes apps', () => {
    const t = 'line one\n\nline two\n\nline three\n\n\n\nchorus a\n\nchorus b';
    const r = importLyrics(t);
    expect(r.sections.map((s) => s.lines.map((l) => l.text))).toEqual([['line one', 'line two', 'line three'], ['chorus a', 'chorus b']]);
  });
  it('puts chord lines over the syllables beneath them', () => {
    const r = importLyrics('G           Em\ndown by the river\nC  G\n');
    expect(r.sections[0].lines[0]).toEqual({ text: 'down by the river', chords: [{ syl: 0, chord: 'G' }, { syl: 3, chord: 'Em' }] });
    expect(r.sections[0].bars).toEqual(['C', 'G']);
    const cp = importLyrics('[Am]Hello [F]there my friend');
    expect(cp.sections[0].lines[0]).toEqual({ text: 'Hello there my friend', chords: [{ syl: 0, chord: 'Am' }, { syl: 2, chord: 'F' }] });
  });
  it('does not mistake ordinary lines for headers or chords', () => {
    expect(kinds('A day in the life\nBridge over troubled water was playing')).toEqual(['verse']);
    expect(importLyrics('Am I the only one\nA').sections[0].lines[0].text).toBe('Am I the only one');
    expect(importLyrics('Title: My Song\n\nfirst line').title).toBe('My Song');
    expect(importLyrics('   \n\n').sections).toEqual([]);
  });
});
