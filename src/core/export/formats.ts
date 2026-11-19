/**
 * Export formats that are pure text/bytes: plain text, ChordPro, printable
 * HTML (lyric sheet and chord chart, turned into PDF by the platform), and
 * Standard MIDI (chords + melody).
 */
import { sectionDisplayNames, type SectionWithLines, type SongDoc } from '../model';
import { analyzeLine } from '../phonetics/line';
import { chordVoicing, parseChord, parseKey, romanNumeral, transposeChord } from '../music/theory';

export interface ExportOptions {
  /** semitones to transpose chords by */
  transpose?: number;
  /** show Roman numerals instead of chord names (chord chart only) */
  roman?: boolean;
  /** hand-off note: quote the locked lines (otherwise only say how many there are) */
  handoffLyrics?: boolean;
}

const titleOf = (doc: SongDoc) => doc.song.title.trim() || 'Untitled';

export function safeFileName(s: string): string {
  return (s.trim() || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').slice(0, 80);
}

// ------------------------------------------------------------------ text

export function toPlainText(doc: SongDoc): string {
  const names = sectionDisplayNames(doc.sections);
  const out = [titleOf(doc), ''];
  doc.sections.forEach((s, i) => {
    out.push(`[${names[i]}]`);
    for (const l of s.lines) out.push(l.text);
    // drop trailing blank lines inside a section
    while (out.length && out[out.length - 1] === '') out.pop();
    out.push('');
  });
  return out.join('\n').replace(/\n+$/, '\n');
}

// ------------------------------------------------------------------ chords on lines

export interface ChordSegment {
  chord: string | null;
  text: string;
}

/** Split a line into segments, each starting at a chord (if any). */
export function lineSegments(text: string, chords: { syl: number; chord: string }[], transpose = 0): ChordSegment[] {
  if (!chords.length) return [{ chord: null, text }];
  const info = analyzeLine(text);
  const placed = chords
    .map((c) => {
      const syl = info.syllables[Math.min(c.syl, info.syllables.length - 1)];
      return { at: syl ? syl.start : text.length, chord: transpose ? transposeChord(c.chord, transpose) : c.chord };
    })
    .sort((a, b) => a.at - b.at);
  const segs: ChordSegment[] = [];
  if (placed[0].at > 0) segs.push({ chord: null, text: text.slice(0, placed[0].at) });
  placed.forEach((p, i) => {
    const end = i + 1 < placed.length ? placed[i + 1].at : text.length;
    segs.push({ chord: p.chord, text: text.slice(p.at, end) });
  });
  return segs;
}

function barsText(s: SectionWithLines, transpose: number, roman: ((c: string) => string) | null): string[] {
  if (!s.bars.length) return [];
  const cells = s.bars.map((b) => b.chords.map((c) => (roman ? roman(c) : transpose ? transposeChord(c, transpose) : c)).join(' '));
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 4) rows.push('| ' + cells.slice(i, i + 4).join(' | ') + ' |');
  return rows;
}

// ------------------------------------------------------------------ ChordPro

const CP_ENV: Record<string, string> = { verse: 'verse', chorus: 'chorus', bridge: 'bridge', pre: 'verse', post: 'chorus' };

export function toChordPro(doc: SongDoc, opts: ExportOptions = {}): string {
  const t = opts.transpose ?? 0;
  const { song } = doc;
  const out: string[] = [`{title: ${titleOf(doc)}}`];
  if (song.key) out.push(`{key: ${t ? transposeChord(song.key, t) : song.key}}`);
  out.push(`{tempo: ${Math.round(song.bpm)}}`, `{time: ${song.timeSig.join('/')}}`);
  if (song.capo) out.push(`{capo: ${song.capo}}`);
  const names = sectionDisplayNames(doc.sections);
  doc.sections.forEach((s, i) => {
    out.push('');
    const env = CP_ENV[s.kind];
    out.push(env ? `{start_of_${env}: ${names[i]}}` : `{comment: ${names[i]}}`);
    const grid = barsText(s, t, null);
    if (grid.length) {
      out.push('{start_of_grid}', ...grid, '{end_of_grid}');
    }
    for (const l of s.lines) {
      out.push(
        lineSegments(l.text, l.chords, t)
          .map((seg) => (seg.chord ? `[${seg.chord}]` : '') + seg.text)
          .join('')
      );
    }
    while (out[out.length - 1] === '') out.pop();
    if (env) out.push(`{end_of_${env}}`);
  });
  return out.join('\n') + '\n';
}

// ------------------------------------------------------------------ HTML / PDF

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; font-size: 12pt; line-height: 1.45; }
  h1 { font-size: 22pt; margin: 0 0 2pt; font-weight: 600; }
  .meta { color: #666; font-size: 10pt; margin-bottom: 14pt; }
  .section { break-inside: avoid; margin-bottom: 12pt; }
  .label { font-size: 9pt; text-transform: uppercase; letter-spacing: .08em; color: #777; margin-bottom: 3pt; font-weight: 600; }
  .line { min-height: 1.45em; white-space: pre-wrap; }
  .cl { display: flex; flex-wrap: wrap; align-items: flex-end; min-height: 2.6em; }
  .seg { display: inline-flex; flex-direction: column; white-space: pre; }
  .ch { font-weight: 700; color: #a3401c; font-size: 10.5pt; min-height: 1.2em; padding-right: 4pt; }
  .grid { font-family: Menlo, Consolas, monospace; font-size: 11pt; color: #a3401c; margin-bottom: 4pt; white-space: pre; }
  .two { columns: 2; column-gap: 28pt; }
`;

function metaLine(doc: SongDoc, t: number): string {
  const s = doc.song;
  const bits: string[] = [];
  if (s.key) bits.push('Key ' + (t ? transposeChord(s.key, t) : s.key));
  bits.push(`${Math.round(s.bpm)} bpm`, s.timeSig.join('/'));
  if (s.capo) bits.push(`Capo ${s.capo}`);
  return bits.join(' · ');
}

export function lyricSheetHtml(doc: SongDoc): string {
  const names = sectionDisplayNames(doc.sections);
  const body = doc.sections
    .map((s, i) => {
      const lines = s.lines.map((l) => `<div class="line">${esc(l.text) || '&nbsp;'}</div>`).join('');
      return `<div class="section"><div class="label">${esc(names[i])}</div>${lines}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titleOf(doc))}</title><style>${PRINT_CSS}</style></head><body><h1>${esc(
    titleOf(doc)
  )}</h1><div class="meta">${esc(metaLine(doc, 0))}</div>${body}</body></html>`;
}

export function chordChartHtml(doc: SongDoc, opts: ExportOptions = {}): string {
  const t = opts.transpose ?? 0;
  const key = parseKey(doc.song.key);
  const roman = opts.roman && key ? (c: string) => romanNumeral(c, key) : null;
  const names = sectionDisplayNames(doc.sections);
  const body = doc.sections
    .map((s, i) => {
      const grid = barsText(s, t, roman);
      const gridHtml = grid.length ? `<div class="grid">${esc(grid.join('\n'))}</div>` : '';
      const lines = s.lines
        .map((l) => {
          if (!l.chords.length) return `<div class="line">${esc(l.text) || '&nbsp;'}</div>`;
          const segs = lineSegments(l.text, l.chords, t)
            .map((seg) => {
              const label = seg.chord ? (roman ? roman(transposeChord(seg.chord, -t)) : seg.chord) : '';
              return `<span class="seg"><span class="ch">${esc(label)}</span><span>${esc(seg.text) || '&nbsp;'}</span></span>`;
            })
            .join('');
          return `<div class="cl">${segs}</div>`;
        })
        .join('');
      return `<div class="section"><div class="label">${esc(names[i])}</div>${gridHtml}${lines}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titleOf(doc))} — chords</title><style>${PRINT_CSS}</style></head><body><h1>${esc(
    titleOf(doc)
  )}</h1><div class="meta">${esc(metaLine(doc, t))}</div>${body}</body></html>`;
}

// ------------------------------------------------------------------ MIDI

const TPQ = 480;

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

interface MidiEvent {
  tick: number;
  /** sort order at equal ticks: note-offs before note-ons */
  order: number;
  data: number[];
}

function trackChunk(events: MidiEvent[], name: string): number[] {
  const nameBytes = Array.from(new TextEncoder().encode(name));
  const all: MidiEvent[] = [{ tick: 0, order: -1, data: [0xff, 0x03, ...vlq(nameBytes.length), ...nameBytes] }, ...events];
  all.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const bytes: number[] = [];
  let last = 0;
  for (const e of all) {
    bytes.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  bytes.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, (bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255, ...bytes];
}

/** Length of a section in sixteenth steps: chord bars or melody, whichever is longer, whole bars. */
export function sectionSteps(s: SectionWithLines, timeSig: [number, number]): number {
  const barSteps = (timeSig[0] * 16) / timeSig[1];
  const fromBars = s.bars.length * barSteps;
  const fromMelody = s.melody.reduce((m, n) => Math.max(m, n.start + n.length), 0);
  const steps = Math.max(fromBars, fromMelody);
  return Math.ceil(steps / barSteps) * barSteps;
}

/** Standard MIDI File (format 1): tempo map, chords (piano) and melody tracks. */
export function toMidi(doc: SongDoc, opts: ExportOptions = {}): Uint8Array {
  const t = opts.transpose ?? 0;
  const { song } = doc;
  const [beats, unit] = song.timeSig;
  const stepTicks = TPQ / 4;
  const barSteps = (beats * 16) / unit;
  const usPerQuarter = Math.round(60000000 / Math.max(20, song.bpm));
  const meta: MidiEvent[] = [
    { tick: 0, order: 0, data: [0xff, 0x51, 3, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] },
    { tick: 0, order: 0, data: [0xff, 0x58, 4, beats, Math.log2(unit), 24, 8] },
  ];
  const chordEv: MidiEvent[] = [{ tick: 0, order: 0, data: [0xc0, 0] }];
  const melEv: MidiEvent[] = [{ tick: 0, order: 0, data: [0xc1, 0] }];
  let offset = 0;
  doc.sections.forEach((s) => {
    const steps = sectionSteps(s, song.timeSig);
    if (!steps) return;
    meta.push({ tick: offset * stepTicks, order: 0, data: [0xff, 0x06, ...vlq(new TextEncoder().encode(s.kind).length), ...new TextEncoder().encode(s.kind)] });
    s.bars.forEach((bar, bi) => {
      const n = Math.max(1, bar.chords.length);
      bar.chords.forEach((name, ci) => {
        const c = parseChord(t ? transposeChord(name, t) : name);
        if (!c) return;
        const start = (offset + bi * barSteps + (ci * barSteps) / n) * stepTicks;
        const end = start + (barSteps / n) * stepTicks;
        for (const note of chordVoicing(c)) {
          chordEv.push({ tick: Math.round(start), order: 1, data: [0x90, note, 72] });
          chordEv.push({ tick: Math.round(end), order: 0, data: [0x80, note, 0] });
        }
      });
    });
    for (const n of s.melody) {
      const pitch = Math.max(0, Math.min(127, n.pitch + t));
      melEv.push({ tick: (offset + n.start) * stepTicks, order: 1, data: [0x91, pitch, 96] });
      melEv.push({ tick: (offset + n.start + n.length) * stepTicks, order: 0, data: [0x81, pitch, 0] });
    }
    offset += steps;
  });
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, (TPQ >> 8) & 255, TPQ & 255];
  return new Uint8Array([...header, ...trackChunk(meta, titleOf(doc)), ...trackChunk(chordEv, 'Chords'), ...trackChunk(melEv, 'Melody')]);
}

/** Minimal MIDI reader for tests and import: notes per track as [tick, pitch, durationTicks]. */
export function readMidiNotes(bytes: Uint8Array): { tpq: number; tracks: [number, number, number][][] } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tpq = dv.getUint16(12);
  const ntracks = dv.getUint16(10);
  let p = 14;
  const tracks: [number, number, number][][] = [];
  for (let t = 0; t < ntracks; t++) {
    const len = dv.getUint32(p + 4);
    let q = p + 8;
    const end = q + len;
    let tick = 0;
    let status = 0;
    const open = new Map<number, number>();
    const notes: [number, number, number][] = [];
    const readVlq = () => {
      let v = 0;
      let b: number;
      do {
        b = bytes[q++];
        v = (v << 7) | (b & 0x7f);
      } while (b & 0x80);
      return v;
    };
    while (q < end) {
      tick += readVlq();
      let b = bytes[q];
      if (b & 0x80) {
        status = b;
        q++;
      }
      b = status;
      if (b === 0xff) {
        q++;
        const l = readVlq();
        q += l;
      } else if ((b & 0xf0) === 0x90 || (b & 0xf0) === 0x80) {
        const pitch = bytes[q++];
        const vel = bytes[q++];
        if ((b & 0xf0) === 0x90 && vel > 0) open.set(pitch, tick);
        else if (open.has(pitch)) {
          notes.push([open.get(pitch)!, pitch, tick - open.get(pitch)!]);
          open.delete(pitch);
        }
      } else if ((b & 0xf0) === 0xc0 || (b & 0xf0) === 0xd0) q += 1;
      else q += 2;
    }
    tracks.push(notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    p = end;
  }
  return { tpq, tracks };
}
