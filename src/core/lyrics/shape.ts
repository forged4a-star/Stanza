/**
 * Song-level shape: how sections contrast (melodic range, register, line
 * length, chord rate, rhythm density), clichés and over-repeated words, and
 * questions that help the writer say what they mean (never lyrics).
 */
import { sectionDisplayNames, type SectionKind, type SectionWithLines } from '../model';
import { analyzeLine, FUNCTION_WORDS } from '../phonetics/line';
import { stepsPerBar } from '../music/melody';

// ------------------------------------------------------------------ contrast

export interface SectionStats {
  /** semitones between lowest and highest melody note (null without melody) */
  range: number | null;
  /** average melody pitch (MIDI) */
  register: number | null;
  /** average syllables per non-empty line */
  lineLength: number;
  /** chords per bar */
  chordRate: number | null;
  /** melody notes per bar */
  density: number | null;
}

export function sectionStats(s: SectionWithLines, timeSig: [number, number]): SectionStats {
  const lines = s.lines.filter((l) => l.text.trim());
  const lineLength = lines.length ? lines.reduce((n, l) => n + analyzeLine(l.text).syllables.length, 0) / lines.length : 0;
  const pitches = s.melody.map((n) => n.pitch);
  const per = stepsPerBar(timeSig);
  const melBars = s.melody.length ? Math.max(1, Math.ceil(Math.max(...s.melody.map((n) => n.start + n.length)) / per)) : 0;
  return {
    range: pitches.length ? Math.max(...pitches) - Math.min(...pitches) : null,
    register: pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : null,
    lineLength,
    chordRate: s.bars.length ? s.bars.reduce((n, b) => n + b.chords.length, 0) / s.bars.length : null,
    density: melBars ? s.melody.length / melBars : null,
  };
}

export interface ContrastRow {
  metric: 'range' | 'register' | 'lineLength' | 'chordRate' | 'density';
  label: string;
  a: number | null;
  b: number | null;
  /** b relative to a, as a signed fraction or semitone difference */
  diff: number | null;
  /** plain-language reading */
  note: string;
  /** 0..1 how much contrast this metric shows */
  strength: number;
}

export interface Contrast {
  rows: ContrastRow[];
  /** 0..1 overall */
  score: number;
  verdict: string;
}

const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString();

/** Compare section b (usually the chorus) against section a (usually the verse). */
export function compareSections(a: SectionWithLines, b: SectionWithLines, timeSig: [number, number], names: [string, string] = ['Verse', 'Chorus']): Contrast {
  const A = sectionStats(a, timeSig);
  const B = sectionStats(b, timeSig);
  const rows: ContrastRow[] = [];
  const [na, nb] = names;
  if (A.range !== null && B.range !== null) {
    const d = B.range - A.range;
    rows.push({ metric: 'range', label: 'Melodic range', a: A.range, b: B.range, diff: d, strength: Math.min(1, Math.abs(d) / 7), note: d === 0 ? 'same span' : `${nb} spans ${Math.abs(d)} semitones ${d > 0 ? 'more' : 'less'}` });
  }
  if (A.register !== null && B.register !== null) {
    const d = B.register - A.register;
    rows.push({ metric: 'register', label: 'Register', a: A.register, b: B.register, diff: d, strength: Math.min(1, Math.abs(d) / 5), note: Math.abs(d) < 1 ? 'sits at the same height' : `${nb} sits ${fmt(Math.abs(d))} semitones ${d > 0 ? 'higher' : 'lower'}` });
  }
  if (A.lineLength && B.lineLength) {
    const d = (B.lineLength - A.lineLength) / A.lineLength;
    rows.push({ metric: 'lineLength', label: 'Line length', a: A.lineLength, b: B.lineLength, diff: d, strength: Math.min(1, Math.abs(d) / 0.4), note: Math.abs(d) < 0.1 ? 'lines about as long' : `${nb} lines are ${Math.round(Math.abs(d) * 100)}% ${d > 0 ? 'longer' : 'shorter'}` });
  }
  if (A.chordRate !== null && B.chordRate !== null) {
    const d = B.chordRate - A.chordRate;
    rows.push({ metric: 'chordRate', label: 'Chord changes', a: A.chordRate, b: B.chordRate, diff: d, strength: Math.min(1, Math.abs(d) / 1), note: Math.abs(d) < 0.25 ? 'chords change at the same pace' : `${nb} changes chords ${d > 0 ? 'faster' : 'slower'} (${fmt(B.chordRate)} vs ${fmt(A.chordRate)} per bar)` });
  }
  if (A.density !== null && B.density !== null) {
    const d = (B.density - A.density) / A.density;
    rows.push({ metric: 'density', label: 'Rhythm', a: A.density, b: B.density, diff: d, strength: Math.min(1, Math.abs(d) / 0.5), note: Math.abs(d) < 0.15 ? 'similar rhythm' : `${nb} is ${d > 0 ? 'busier' : 'more spacious'} (${fmt(B.density)} vs ${fmt(A.density)} notes per bar)` });
  }
  const score = rows.length ? rows.reduce((n, r) => n + r.strength, 0) / rows.length : 0;
  const verdict = !rows.length
    ? `Add lyrics, chords or melody to both sections to compare them.`
    : score < 0.2
      ? `${na} and ${nb} feel very alike. A change in height, line length or chord pace would help the ${nb.toLowerCase()} stand out.`
      : score < 0.45
        ? `Some contrast between ${na} and ${nb}; one bolder change would make it obvious.`
        : `Clear contrast: the ${nb.toLowerCase()} feels different from the ${na.toLowerCase()}.`;
  return { rows, score, verdict };
}

/** Default pair to compare: first verse and first chorus (or first two different kinds). */
export function defaultContrastPair(sections: { kind: SectionKind }[]): [number, number] | null {
  const v = sections.findIndex((s) => s.kind === 'verse');
  const c = sections.findIndex((s) => s.kind === 'chorus');
  if (v >= 0 && c >= 0) return [v, c];
  for (let i = 1; i < sections.length; i++) if (sections[i].kind !== sections[0].kind) return [0, i];
  return sections.length >= 2 ? [0, 1] : null;
}

// ------------------------------------------------------------------ clichés

/** Common song clichés (lower case; matched on word boundaries). */
export const CLICHES = [
  'heart of gold', 'heart of stone', 'break my heart', 'broken heart', 'tear me apart', 'set me free', 'end of the road', 'end of time',
  'till the end of time', 'time after time', 'all night long', 'dance the night away', 'tears like rain', 'tears fall like rain', 'like a bird',
  'fly away', 'burning desire', 'fire in my soul', 'light up the sky', 'touch the sky', 'reach for the stars', 'shine like the sun', 'shining star',
  'you complete me', 'meant to be', 'written in the stars', 'the rest of my life', 'never let you go', 'never let me go', 'hold me tight', 'by my side',
  'stand by me', 'one more time', 'lost without you', 'can\'t live without you', 'in my dreams', 'dream come true', 'my everything', 'cold as ice',
  'heart on my sleeve', 'storm inside', 'into the night', 'through the fire', 'face the music', 'against all odds', 'take my breath away',
  'skin and bone', 'chasing dreams', 'walk away', 'like a prayer', 'baby baby', 'hearts collide', 'souls collide', 'love is blind',
  'when the sun goes down', 'under the stars', 'on fire', 'save me', 'only you', 'deep inside', 'feel alive', 'come alive',
];

/** Rhyme pairs heard too often to surprise anyone. */
export const CLICHE_RHYMES: [string, string][] = [
  ['fire', 'desire'], ['heart', 'apart'], ['love', 'above'], ['pain', 'rain'], ['night', 'light'], ['eyes', 'skies'], ['soul', 'whole'],
  ['me', 'free'], ['you', 'true'], ['baby', 'maybe'], ['cry', 'goodbye'], ['heart', 'start'], ['forever', 'never'], ['dance', 'romance'],
];

export interface Flag {
  lineId: string;
  start: number;
  end: number;
  kind: 'cliche' | 'cliche-rhyme' | 'repeat';
  message: string;
}

export function findFlags(sections: SectionWithLines[]): Flag[] {
  const flags: Flag[] = [];
  const names = sectionDisplayNames(sections);
  for (const s of sections) {
    for (const l of s.lines) {
      const low = l.text.toLowerCase().replace(/[‘’]/g, "'");
      for (const c of CLICHES) {
        const re = new RegExp(`(^|[^a-z'])(${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^a-z'])`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(low))) {
          const start = m.index + m[1].length;
          flags.push({ lineId: l.id, start, end: start + c.length, kind: 'cliche', message: `“${c}” is a well-worn phrase` });
        }
      }
    }
    // clichéd rhyme pairs at line ends within a section
    const ends = s.lines.map((l) => {
      const ws = analyzeLine(l.text).words;
      const w = ws[ws.length - 1];
      return w ? { l, w } : null;
    });
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < Math.min(ends.length, i + 4); j++) {
        const a = ends[i];
        const b = ends[j];
        if (!a || !b) continue;
        const pair = CLICHE_RHYMES.find(([x, y]) => (a.w.norm === x && b.w.norm === y) || (a.w.norm === y && b.w.norm === x));
        if (pair) flags.push({ lineId: b.l.id, start: b.w.start, end: b.w.end, kind: 'cliche-rhyme', message: `${pair[0]} / ${pair[1]} is a very familiar rhyme` });
      }
    }
  }
  // words leaned on too often outside choruses (choruses repeat by design)
  const counts = new Map<string, { n: number; where: { lineId: string; start: number; end: number }[] }>();
  sections.forEach((s) => {
    if (s.kind === 'chorus' || s.kind === 'post') return;
    for (const l of s.lines) {
      for (const w of analyzeLine(l.text).words) {
        if (w.functionWord || w.norm.length < 4) continue;
        const e = counts.get(w.norm) ?? { n: 0, where: [] };
        e.n++;
        e.where.push({ lineId: l.id, start: w.start, end: w.end });
        counts.set(w.norm, e);
      }
    }
  });
  for (const [word, e] of counts) {
    if (e.n < 3) continue;
    for (const w of e.where.slice(1)) flags.push({ ...w, kind: 'repeat', message: `“${word}” appears ${e.n} times outside the chorus` });
  }
  void names;
  // reading order: by line, then position
  const order = new Map(sections.flatMap((s) => s.lines).map((l, i) => [l.id, i]));
  return flags.sort((a, b) => (order.get(a.lineId)! - order.get(b.lineId)!) || a.start - b.start);
}

// ------------------------------------------------------------------ questions

const ABSTRACT = new Set('love heart soul pain feel feeling feelings hope dream dreams lost free freedom forever never always everything nothing life world time fire light dark darkness alone lonely broken'.split(' '));
const PRONOUNS = /\b(you|she|he|they|it)\b/i;

/**
 * Questions that help the writer say what they mean. Rule-based and offline;
 * they point at the writer's own words and never suggest lyrics.
 */
export function questionsFor(section: SectionWithLines, opts: { name: string; songTitle?: string } = { name: '' }): string[] {
  const qs: string[] = [];
  const text = section.lines.map((l) => l.text).join(' ').trim();
  const words = analyzeLine(text).words.filter((w) => !w.functionWord);
  const abstract = [...new Set(words.map((w) => w.norm).filter((w) => ABSTRACT.has(w)))];
  if (!text) {
    const starters: Record<SectionKind, string> = {
      verse: 'Where are you, and what can you see, as this starts?',
      pre: 'What is about to give way?',
      chorus: 'If someone remembers one sentence from this song, what should it say?',
      post: 'What do you want left ringing after the chorus?',
      bridge: 'What do you know now that you didn’t at the start?',
      intro: 'What mood should be set before a word is sung?',
      outro: 'How has the person in the song changed by the end?',
      custom: 'What is this part for?',
    };
    return [starters[section.kind]];
  }
  if (abstract.length) qs.push(`You use “${abstract.slice(0, 2).join('” and “')}”. What would that look like, as one thing someone could film?`);
  if (PRONOUNS.test(text)) qs.push(`Who is “${PRONOUNS.exec(text)![1].toLowerCase()}” here? What one detail would make them a specific person?`);
  if (section.feeling.trim()) qs.push(`You said this part feels “${section.feeling.trim()}”. Which line carries that most, and which line works against it?`);
  if (section.kind === 'verse') qs.push('What happened just before this verse begins?');
  if (section.kind === 'chorus') qs.push('Is the chorus saying the main thing plainly, or still circling it?');
  if (section.kind === 'bridge') qs.push('What turns here: a new fact, a new place, or a new admission?');
  if (section.kind === 'pre') qs.push('What tension builds here that the chorus will answer?');
  const senses = /\b(see|saw|hear|heard|smell|taste|touch|cold|warm|hot|red|blue|green|gold|grey|gray|loud|quiet|rough|soft)\b/i;
  if (!senses.test(text)) qs.push('Which of the five senses is missing here? What would one of them notice?');
  if (opts.songTitle && !text.toLowerCase().includes(opts.songTitle.toLowerCase()) && section.kind === 'chorus') qs.push(`The title is “${opts.songTitle}”. Does the chorus earn it, or point somewhere else?`);
  return qs.slice(0, 5);
}

// ------------------------------------------------------------------ energy map

export type EnergyLever = 'register' | 'range' | 'density' | 'chordRate' | 'lineLength';

export interface EnergyPoint {
  index: number;
  /** what the writer wants, 0..1 relative to the other sections (null if no intensity was set on enough sections) */
  intended: number | null;
  /** what the section's melody, chords and lines actually do, 0..1 relative to the others (null without data) */
  measured: number | null;
  /** intended minus measured; positive = the section should be bigger than it is */
  gap: number | null;
  /** plain-language suggestion about what to change; never lyrics */
  advice: string | null;
}

const LEVER_UP: Record<EnergyLever, string> = {
  register: 'sing it higher',
  range: 'widen the melody',
  density: 'make the rhythm busier',
  chordRate: 'change chords more often',
  lineLength: 'use shorter, punchier lines',
};
const LEVER_DOWN: Record<EnergyLever, string> = {
  register: 'sit lower',
  range: 'narrow the melody',
  density: 'leave more space in the rhythm',
  chordRate: 'let chords last longer',
  lineLength: 'use longer, calmer lines',
};

const spread = (vals: (number | null)[]): (number | null)[] => {
  const real = vals.filter((v): v is number => v !== null);
  if (real.length < 2) return vals.map((v) => (v === null ? null : 0.5));
  const lo = Math.min(...real);
  const hi = Math.max(...real);
  if (hi - lo < 1e-9) return vals.map((v) => (v === null ? null : 0.5));
  return vals.map((v) => (v === null ? null : (v - lo) / (hi - lo)));
};

/**
 * Compare the arc the writer drew (section intensity) with what each section
 * does. Both are scaled 0..1 across the song, so this reads as "the shape of
 * the energy", not an absolute loudness. Needs at least two sections.
 */
export function energyMap(sections: SectionWithLines[], timeSig: [number, number], threshold = 0.3): EnergyPoint[] {
  const stats = sections.map((s) => sectionStats(s, timeSig));
  const levers: Record<EnergyLever, (number | null)[]> = {
    register: spread(stats.map((s) => s.register)),
    range: spread(stats.map((s) => s.range)),
    density: spread(stats.map((s) => s.density)),
    chordRate: spread(stats.map((s) => s.chordRate)),
    // shorter lines read as more energetic, so flip it
    lineLength: spread(stats.map((s) => (s.lineLength ? s.lineLength : null))).map((v) => (v === null ? null : 1 - v)),
  };
  const weight: Record<EnergyLever, number> = { register: 1, range: 0.7, density: 1, chordRate: 0.8, lineLength: 0.5 };
  const intendedRaw = sections.map((s) => s.intensity);
  const intended = intendedRaw.filter((v) => v !== null).length >= 2 ? spread(intendedRaw) : intendedRaw.map(() => null);
  return sections.map((_, i) => {
    let sum = 0;
    let w = 0;
    const present: { lever: EnergyLever; v: number }[] = [];
    for (const k of Object.keys(levers) as EnergyLever[]) {
      const v = levers[k][i];
      if (v === null) continue;
      sum += v * weight[k];
      w += weight[k];
      present.push({ lever: k, v });
    }
    const measured = w ? sum / w : null;
    const want = intended[i];
    const gap = want !== null && measured !== null ? want - measured : null;
    let advice: string | null = null;
    if (gap !== null && Math.abs(gap) >= threshold && present.length) {
      if (gap > 0) {
        const low = present.reduce((a, b) => (b.v < a.v ? b : a));
        advice = `Meant to be bigger than it plays: ${LEVER_UP[low.lever]}.`;
      } else {
        const high = present.reduce((a, b) => (b.v > a.v ? b : a));
        advice = `Plays bigger than you meant: ${LEVER_DOWN[high.lever]}.`;
      }
    }
    return { index: i, intended: want, measured, gap, advice };
  });
}
