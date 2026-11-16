/**
 * Prosody, singability and range checks over a section's melody and lyrics.
 * Each issue points at a note (and its syllable) so the UI can mark both.
 */
import type { Line, Note } from '../model';
import { CLOSED_VOWELS, PHONES } from '../phonetics/arpabet';
import { linkedSyllable, stepsPerBar, type SyllableRef } from '../music/melody';
import { midiName } from '../music/theory';

export type IssueKind = 'prosody' | 'closed-vowel' | 'consonants' | 'range';

export interface Issue {
  kind: IssueKind;
  noteId: string;
  lineId: string | null;
  syl: number | null;
  message: string;
  /** 1 = worth a look, 2 = likely a problem */
  severity: 1 | 2;
}

/**
 * Metric weight of a step within the bar (0..1): downbeat 1, the middle of a
 * 4/4 bar 0.75, other beats 0.5, off-beat eighths 0.25, sixteenths 0.1.
 * Compound meters (6/8, 12/8) group eighths in threes.
 */
export function metricWeight(step: number, timeSig: [number, number]): number {
  const per = stepsPerBar(timeSig);
  const s = ((step % per) + per) % per;
  if (s === 0) return 1;
  const [beats, unit] = timeSig;
  if (unit === 8 && beats % 3 === 0) {
    // dotted-quarter beats of 6 sixteenths
    if (s % 6 === 0) return beats === 12 && s === 12 ? 0.75 : 0.5;
    if (s % 2 === 0) return 0.25;
    return 0.1;
  }
  const beat = 16 / unit;
  if (beats === 4 && s === 2 * beat) return 0.75;
  if (s % beat === 0) return 0.5;
  if (s % (beat / 2) === 0) return 0.25;
  return 0.1;
}

/** Stressed syllables on weak metric positions (and weak ones crowding a strong beat). */
export function prosodyIssues(melody: Note[], lines: Line[], timeSig: [number, number]): Issue[] {
  const linked = melody
    .map((n) => ({ n, s: linkedSyllable(n, lines) }))
    .filter((x): x is { n: Note; s: SyllableRef } => !!x.s)
    .sort((a, b) => a.n.start - b.n.start);
  const issues: Issue[] = [];
  linked.forEach(({ n, s }, i) => {
    const w = metricWeight(n.start, timeSig);
    const prev = linked[i - 1];
    const next = linked[i + 1];
    if (s.stress === 2 && w <= 0.25) {
      // only a problem if a neighbouring weak syllable got the stronger beat
      const neighbourStronger = [prev, next].some((x) => x && x.s.stress < 2 && metricWeight(x.n.start, timeSig) > w);
      if (neighbourStronger || w <= 0.1)
        issues.push({ kind: 'prosody', noteId: n.id, lineId: s.lineId, syl: s.syl, severity: neighbourStronger ? 2 : 1, message: `“${s.text}” is stressed but falls on a weak ${w <= 0.1 ? 'sixteenth' : 'off-beat'}` });
    }
    if (s.stress === 0 && w >= 0.75 && next && next.s.stress === 2 && metricWeight(next.n.start, timeSig) < w) {
      issues.push({ kind: 'prosody', noteId: n.id, lineId: s.lineId, syl: s.syl, severity: 1, message: `Weak “${s.text}” takes the strong beat; “${next.s.text}” wants it` });
    }
  });
  return issues;
}

const CONSONANT_COST = (c: string) => (c ? c.length : 0);

/**
 * Long held notes on closed vowels (ee, ih, oo, uh-r…) are hard to sustain,
 * especially high; consonant clusters between syllables are hard to fit into
 * short notes at tempo.
 */
export function singabilityIssues(melody: Note[], lines: Line[], opts: { bpm: number; timeSig: [number, number]; vocalHigh: number }): Issue[] {
  const stepSec = 60 / opts.bpm / 4;
  const linked = melody
    .map((n) => ({ n, s: linkedSyllable(n, lines) }))
    .filter((x): x is { n: Note; s: SyllableRef } => !!x.s)
    .sort((a, b) => a.n.start - b.n.start);
  const issues: Issue[] = [];
  linked.forEach(({ n, s }, i) => {
    const sec = n.length * stepSec;
    const high = n.pitch >= opts.vocalHigh - 4;
    if (CLOSED_VOWELS.includes(s.vowel) && (sec >= 1.0 || (high && sec >= 0.6))) {
      issues.push({
        kind: 'closed-vowel',
        noteId: n.id,
        lineId: s.lineId,
        syl: s.syl,
        severity: high ? 2 : 1,
        message: `Long ${high ? 'high ' : ''}note on the closed “${PHONES[s.vowel].example}” vowel of “${s.text}” (${sec.toFixed(1)} s)`,
      });
    }
    const next = linked[i + 1];
    if (next) {
      const cluster = CONSONANT_COST(s.coda) + CONSONANT_COST(next.s.onset);
      const gap = (next.n.start - n.start) * stepSec;
      // roughly: each consonant needs ~60–80 ms; flag when they eat most of the note
      if (cluster >= 3 && gap < cluster * 0.09 + 0.08) {
        issues.push({
          kind: 'consonants',
          noteId: n.id,
          lineId: s.lineId,
          syl: s.syl,
          severity: cluster >= 4 ? 2 : 1,
          message: `${cluster} consonants between “${s.text}” and “${next.s.text}” in ${Math.round(gap * 1000)} ms`,
        });
      }
    }
  });
  return issues;
}

export function rangeIssues(melody: Note[], lines: Line[], low: number, high: number): Issue[] {
  return melody
    .filter((n) => n.pitch < low || n.pitch > high)
    .map((n) => {
      const s = linkedSyllable(n, lines);
      return {
        kind: 'range' as const,
        noteId: n.id,
        lineId: s?.lineId ?? null,
        syl: s?.syl ?? null,
        severity: 2 as const,
        message: `${midiName(n.pitch)} is ${n.pitch < low ? 'below' : 'above'} your range (${midiName(low)}–${midiName(high)})`,
      };
    });
}

export function allIssues(melody: Note[], lines: Line[], opts: { bpm: number; timeSig: [number, number]; vocalLow: number; vocalHigh: number }): Issue[] {
  return [...rangeIssues(melody, lines, opts.vocalLow, opts.vocalHigh), ...prosodyIssues(melody, lines, opts.timeSig), ...singabilityIssues(melody, lines, opts)];
}
