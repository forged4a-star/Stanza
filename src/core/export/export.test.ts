import { describe, expect, it } from 'vitest';
import type { SongDoc } from '../model';
import { diffSongs, diffStats } from '../lyrics/diff';
import { chordChartHtml, lineSegments, lyricSheetHtml, readMidiNotes, toChordPro, toMidi, toPlainText } from './formats';
import { buildProjectZip, readProjectZip } from './projectZip';

function doc(): SongDoc {
  const base = { songId: 's', label: '', collapsed: false, feeling: '', intensity: null, melody: [] as SongDoc['sections'][0]['melody'] };
  return {
    song: { id: 's', title: 'River & Stone', folderId: null, status: 'draft', pinned: false, tags: [], key: 'G', bpm: 120, timeSig: [4, 4], capo: 2, createdAt: 0, updatedAt: 0, openedAt: 0, deletedAt: null },
    sections: [
      {
        ...base, id: 'v', kind: 'verse', sort: 0, bars: [{ chords: ['G'] }, { chords: ['Em', 'C'] }],
        melody: [{ id: 'n1', pitch: 67, start: 0, length: 4 }, { id: 'n2', pitch: 69, start: 4, length: 4 }],
        lines: [
          { id: 'l1', sectionId: 'v', sort: 0, text: 'down by the river', locked: false, alts: [], chords: [{ syl: 0, chord: 'G' }, { syl: 3, chord: 'Em' }] },
          { id: 'l2', sectionId: 'v', sort: 1, text: 'I <lost> my stone', locked: false, alts: [], chords: [] },
        ],
      },
      { ...base, id: 'c', kind: 'chorus', sort: 1, bars: [], lines: [{ id: 'l3', sectionId: 'c', sort: 0, text: 'oh river', locked: false, alts: [], chords: [] }] },
    ],
  };
}

describe('text exports', () => {
  it('plain text', () => {
    expect(toPlainText(doc())).toBe('River & Stone\n\n[Verse]\ndown by the river\nI <lost> my stone\n\n[Chorus]\noh river\n');
  });
  it('places chords at syllables', () => {
    const segs = lineSegments('down by the river', [{ syl: 0, chord: 'G' }, { syl: 3, chord: 'Em' }]);
    expect(segs).toEqual([{ chord: 'G', text: 'down by the ' }, { chord: 'Em', text: 'river' }]);
  });
  it('ChordPro with transpose', () => {
    const cp = toChordPro(doc(), { transpose: 2 });
    expect(cp).toContain('{title: River & Stone}');
    expect(cp).toContain('{key: A}');
    expect(cp).toContain('{capo: 2}');
    expect(cp).toContain('{start_of_verse: Verse}');
    expect(cp).toContain('[A]down by the [F#m]river');
    expect(cp).toContain('| A | F#m D |');
    expect(cp).toContain('{start_of_chorus: Chorus}\noh river\n{end_of_chorus}');
  });
  it('printable HTML escapes and shows chords or numerals', () => {
    expect(lyricSheetHtml(doc())).toContain('I &lt;lost&gt; my stone');
    const chart = chordChartHtml(doc());
    expect(chart).toContain('<span class="ch">Em</span>');
    const roman = chordChartHtml(doc(), { roman: true });
    expect(roman).toContain('<span class="ch">vi</span>');
    expect(roman).toContain('| I | vi IV |');
  });
});

describe('MIDI', () => {
  it('writes chords and melody that read back correctly', () => {
    const bytes = toMidi(doc());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    const { tpq, tracks } = readMidiNotes(bytes);
    expect(tpq).toBe(480);
    expect(tracks).toHaveLength(3);
    const chordStarts = [...new Set(tracks[1].map((n) => n[0]))];
    expect(chordStarts).toEqual([0, 1920, 2880]);
    expect(tracks[1].filter((n) => n[0] === 0).map((n) => n[1] % 12).sort((a, b) => a - b)).toEqual([2, 7, 7, 11]);
    expect(tracks[2]).toEqual([[0, 67, 480], [480, 69, 480]]);
  });
});

describe('project zip', () => {
  it('round-trips the song and audio', () => {
    const d = doc();
    const rec = { id: 'r', songId: 's', sectionId: 'v', lineId: null, title: 'Verse take 1', file: 'x.m4a', mime: 'audio/mp4', durationMs: 1000, bpm: 120, key: 'G', transcript: '', takeNo: 1, starred: false, createdAt: 0, analysis: 'done' as const };
    const zip = buildProjectZip(d, [{ rec, bytes: new Uint8Array([1, 2, 3]) }, { rec: { ...rec, id: 'r2' }, bytes: new Uint8Array([4]) }]);
    const { bundle, audio } = readProjectZip(zip);
    expect(bundle.doc).toEqual(d);
    expect(bundle.recordings.map((r) => r.zipPath)).toEqual(['audio/Verse take 1.m4a', 'audio/Verse take 1 (2).m4a']);
    expect([...audio.get('audio/Verse take 1.m4a')!]).toEqual([1, 2, 3]);
  });
});

describe('version diff', () => {
  it('shows word-level changes, additions and removals', () => {
    const a = doc();
    const b = doc();
    b.sections[0].lines[0].text = 'down by the muddy river';
    b.sections[0].lines.splice(1, 1);
    b.sections[1].lines.push({ id: 'l4', sectionId: 'c', sort: 1, text: 'take me home', locked: false, alts: [], chords: [] });
    const d = diffSongs(a, b);
    expect(diffStats(d)).toEqual({ added: 1, removed: 1, changed: 1 });
    const change = d.find((r) => r.type === 'change')!;
    expect(change.type === 'change' && change.pieces.filter((p) => p.type === 'add').map((p) => p.text.trim())).toEqual(['muddy']);
  });
});
