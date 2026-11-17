/**
 * Write to the tune. A melody becomes a skeleton: phrases of notes, each note
 * strong, medium or weak (by the beat it sits on and how long it lasts). As you
 * type words, each syllable is laid on its note and checked: a strongly spoken
 * syllable wants a strong note, a weak one wants a weak note.
 */
import { metricWeight } from '../lyrics/checks';
import type { Note } from '../model';
import { analyzeLine } from '../phonetics/line';

export type SlotClass = 'strong' | 'medium' | 'weak';

export interface Slot {
  noteId: string;
  pitch: number;
  start: number;
  length: number;
  cls: SlotClass;
  /** 0..1, how much weight the note carries */
  strength: number;
}

export interface Phrase {
  index: number;
  slots: Slot[];
  startStep: number;
  endStep: number;
}

const tierUp = (c: SlotClass): SlotClass => (c === 'weak' ? 'medium' : 'strong');

/** Notes grouped into phrases: a new phrase starts after a rest of a beat or more. */
export function phrasesOf(melody: Note[], timeSig: [number, number]): Phrase[] {
  const notes = [...melody].filter((n) => n.length > 0).sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  if (!notes.length) return [];
  const beat = 16 / timeSig[1];
  const groups: Note[][] = [];
  let cur: Note[] = [];
  for (const n of notes) {
    const prev = cur[cur.length - 1];
    if (prev && n.start - (prev.start + prev.length) >= beat) {
      groups.push(cur);
      cur = [];
    }
    cur.push(n);
  }
  groups.push(cur);
  return groups.map((g, index) => ({
    index,
    startStep: g[0].start,
    endStep: Math.max(...g.map((n) => n.start + n.length)),
    slots: g.map((n) => {
      const w = metricWeight(n.start, timeSig);
      let cls: SlotClass = w >= 0.75 ? 'strong' : w >= 0.5 ? 'medium' : 'weak';
      // a long note carries weight wherever it sits
      if (n.length >= beat * 1.5) cls = tierUp(cls);
      return { noteId: n.id, pitch: n.pitch, start: n.start, length: n.length, cls, strength: Math.min(1, w + (n.length >= beat * 1.5 ? 0.25 : 0)) };
    }),
  }));
}

export type FitStatus = 'good' | 'ok' | 'bad';

export interface SyllableFit {
  text: string;
  /** how strongly the word is spoken in this line: 0 weak, 1 medium, 2 strong */
  level: 0 | 1 | 2;
  /** the note it lands on, or null if the phrase has run out of notes */
  slot: number | null;
  status: FitStatus;
}

export interface Fit {
  syllables: SyllableFit[];
  slots: number;
  /** syllables minus notes: positive means too many words, negative means notes left empty */
  delta: number;
  bad: number;
  /** one plain sentence for the writer */
  summary: string;
  /** the words fit the tune: right count and no clash */
  fits: boolean;
}

function judge(cls: SlotClass, level: 0 | 1 | 2): FitStatus {
  if (cls === 'strong') return level === 2 ? 'good' : level === 1 ? 'ok' : 'bad';
  if (cls === 'medium') return level === 2 ? 'ok' : 'good';
  return level === 0 ? 'good' : level === 1 ? 'ok' : 'bad';
}

/** Lay the syllables of `text` on the phrase's notes, in order, and judge each one. */
export function fitWords(phrase: Phrase, text: string): Fit {
  const info = analyzeLine(text);
  const slots = phrase.slots.length;
  const syllables: SyllableFit[] = info.syllables.map((s, i) => {
    const level = s.level as 0 | 1 | 2;
    const slot = i < slots ? i : null;
    return { text: text.slice(s.start, s.end).trim() || '·', level, slot, status: slot === null ? 'bad' : judge(phrase.slots[slot].cls, level) };
  });
  const placed = syllables.filter((s) => s.slot !== null);
  const bad = placed.filter((s) => s.status === 'bad').length;
  const delta = syllables.length - slots;
  const parts: string[] = [];
  if (!syllables.length) parts.push(`${slots} notes waiting for words`);
  else {
    parts.push(`${syllables.length} syllable${syllables.length === 1 ? '' : 's'} for ${slots} note${slots === 1 ? '' : 's'}`);
    if (delta > 0) parts.push(`${delta} too many`);
    else if (delta < 0) parts.push(`${-delta} note${-delta === 1 ? '' : 's'} left empty`);
    if (bad > 0 && delta <= 0) parts.push(`${bad} stress${bad === 1 ? '' : 'es'} fight the beat`);
    else if (bad > 0) parts.push(`${bad} stress${bad === 1 ? '' : 'es'} fight the beat`);
  }
  return { syllables, slots, delta, bad: bad + (delta > 0 ? 0 : 0), summary: parts.join(' · '), fits: syllables.length > 0 && delta === 0 && bad === 0 };
}
