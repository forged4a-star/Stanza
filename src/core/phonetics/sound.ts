/**
 * Sound analysis of a lyric: which syllables rhyme (perfect, slant,
 * multisyllabic), which share vowels (assonance) or consonants (consonance,
 * alliteration), the rhyme scheme letters and the rhyme families.
 *
 * Everything is per syllable. The result is plain data; the UI decides how
 * to colour it.
 */
import { CONSONANT_CODES, VOWEL_CODES, clusterSimilarity, vowelSimilarity } from './arpabet';
import { analyzeLine, type LineInfo, type Syllable } from './line';
import { pronounce, rhymeKey } from './pronounce';

export type SoundMode = 'perfect' | 'slant' | 'multi' | 'assonance' | 'consonance' | 'alliteration' | 'iambic';
export const SOUND_MODES: SoundMode[] = ['perfect', 'slant', 'multi', 'assonance', 'consonance', 'alliteration', 'iambic'];

export interface SoundSettings {
  modes: SoundMode[];
  /** 0 = strict (only the obvious), 1 = loose (everything that could be heard) */
  sensitivity: number;
  /** 'end' = only line endings rhyme; 'all' = internal rhymes too */
  scope: 'end' | 'all';
}

export interface InputLine {
  id: string;
  sectionId: string;
  text: string;
}

export interface Mark {
  mode: SoundMode;
  /** stable identity of the group this syllable belongs to within the mode */
  group: string;
  /** palette index (the UI wraps it around the palette length) */
  color: number;
}

export interface FamilyMember {
  lineIndex: number;
  /** syllable range within the line [from, to) */
  from: number;
  to: number;
  text: string;
  atLineEnd: boolean;
}

export interface RhymeFamily {
  id: number;
  color: number;
  /** 'perfect' when every link in the family is a perfect rhyme */
  kind: 'perfect' | 'slant';
  members: FamilyMember[];
  /** a few member words, for display */
  label: string;
}

export interface SoundAnalysis {
  lines: LineInfo[];
  /** marks[lineIndex][syllableIndex] */
  marks: Mark[][][];
  /** rhyme scheme letter per line (null for empty lines) */
  scheme: (string | null)[];
  families: RhymeFamily[];
}

interface TailSyl {
  v: string;
  c: string;
}

interface Unit {
  line: number;
  from: number;
  to: number;
  tail: TailSyl[];
  /** tails of the word's other pronunciations ("again": -en / -ain) */
  alts: TailSyl[][];
  text: string;
  end: boolean;
  section: string;
  /** index of the line within its section */
  row: number;
}

const REDUCED = 'AIR';

function sylSim(a: TailSyl, b: TailSyl, stressed: boolean): number {
  let vs = vowelSimilarity(a.v, b.v);
  if (!stressed && vs < 0.85 && REDUCED.includes(a.v) && REDUCED.includes(b.v)) vs = 0.85;
  return 0.62 * vs + 0.38 * clusterSimilarity(a.c, b.c);
}

/** 0..1 similarity of two rhyme tails; 1 means a perfect rhyme. */
export function tailScore(a: TailSyl[], b: TailSyl[]): number {
  const la = a.length;
  const lb = b.length;
  if (!la || !lb || Math.abs(la - lb) > 1) return 0;
  const n = Math.min(la, lb);
  const s0 = sylSim(a[0], b[0], true);
  let score = s0;
  if (n > 1) {
    let rest = 0;
    for (let i = 1; i < n; i++) rest += sylSim(a[i], b[i], false);
    score = 0.65 * s0 + 0.35 * (rest / (n - 1));
  }
  if (la !== lb) score *= 0.72;
  return score;
}

export function tailsEqual(a: TailSyl[], b: TailSyl[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].v !== b[i].v || a[i].c !== b[i].c) return false;
  return true;
}

/** Parse a rhyme key ("YR", "IrAkAl") into tail syllables. */
export function parseTail(key: string): TailSyl[] {
  const out: TailSyl[] = [];
  for (const ch of key) {
    if (VOWEL_CODES.includes(ch)) out.push({ v: ch, c: '' });
    else if (out.length) out[out.length - 1].c += ch;
  }
  return out;
}

function buildTail(syls: Syllable[], from: number, to: number): TailSyl[] {
  const out: TailSyl[] = [];
  for (let i = from; i < to; i++) out.push({ v: syls[i].vowel, c: syls[i].coda + (i + 1 < to ? syls[i + 1].onset : '') });
  return out;
}

const tailKey = (t: TailSyl[]) => t.map((s) => s.v + s.c).join('.');

class UnionFind {
  parent: number[] = [];
  make(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** Index of the syllable a word's rhyme starts on: its last stressed syllable. */
function anchorOf(syls: Syllable[], first: number, count: number): number {
  for (let k = count - 1; k >= 0; k--) if (syls[first + k].stress >= 1) return first + k;
  return count === 1 ? first : first + count - 1;
}

const lineSlice = (info: LineInfo, from: number, to: number) =>
  info.text.slice(info.syllables[from].start, info.syllables[to - 1].end).toLowerCase();

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { modes: ['perfect', 'slant'], sensitivity: 0.5, scope: 'all' };

export function analyzeSound(input: InputLine[], settings: SoundSettings = DEFAULT_SOUND_SETTINGS): SoundAnalysis {
  const sens = Math.min(1, Math.max(0, settings.sensitivity));
  const modes = new Set(settings.modes);
  const lines = input.map((l) => analyzeLine(l.text));
  const marks: Mark[][][] = lines.map((l) => l.syllables.map(() => []));
  const addMark = (line: number, syl: number, mark: Mark) => {
    const list = marks[line][syl];
    if (!list.some((m) => m.mode === mark.mode && m.group === mark.group)) list.push(mark);
  };

  // row = position of the line within its section (blank lines count: distance is distance)
  const rows: number[] = [];
  {
    let prev: string | null = null;
    let r = 0;
    input.forEach((l, i) => {
      r = l.sectionId === prev ? r + 1 : 0;
      prev = l.sectionId;
      rows[i] = r;
    });
  }

  // ------------------------------------------------------------ rhyme units
  const units: Unit[] = [];
  lines.forEach((info, li) => {
    const { words, syllables: syls } = info;
    let lastWord = -1;
    for (let w = words.length - 1; w >= 0; w--) {
      if (words[w].sylCount > 0) {
        lastWord = w;
        break;
      }
    }
    if (lastWord < 0) return;
    const section = input[li].sectionId;
    words.forEach((word, wi) => {
      if (!word.sylCount) return;
      const isLast = wi === lastWord;
      if (!isLast && (settings.scope === 'end' || word.functionWord)) return;
      const anchor = anchorOf(syls, word.firstSyl, word.sylCount);
      const to = word.firstSyl + word.sylCount;
      const tail = buildTail(syls, anchor, to);
      const alts: TailSyl[][] = [];
      for (const enc of pronounce(word.norm).prons.slice(1)) {
        const k = rhymeKey(enc);
        if (k) {
          const t = parseTail(k);
          if (t.length === tail.length) alts.push(t);
        }
      }
      units.push({ line: li, from: anchor, to, tail, alts, text: lineSlice(info, anchor, to), end: isLast, section, row: rows[li] });
      // mosaic ending: "hold me" / "told me" — rhyme from the last strong word through the weak tail
      if (isLast && word.sylCount === 1 && syls[word.firstSyl].level === 0) {
        for (let pw = wi - 1; pw >= Math.max(0, wi - 2); pw--) {
          const prev = words[pw];
          if (!prev.sylCount) continue;
          if (prev.functionWord && prev.sylCount === 1) continue;
          const a = anchorOf(syls, prev.firstSyl, prev.sylCount);
          if (to - a <= 4) units.push({ line: li, from: a, to, tail: buildTail(syls, a, to), alts: [], text: lineSlice(info, a, to), end: true, section, row: rows[li] });
          break;
        }
      }
    });
  });

  // ------------------------------------------------------------ rhyme edges
  const useSlant = modes.has('slant') || !modes.has('perfect');
  const slantThreshold = 0.88 - 0.3 * sens;
  const endWindow = 4 + Math.round(sens * 2);
  const innerWindow = sens > 0.7 ? 2 : 1;
  const uf = new UnionFind();
  units.forEach(() => uf.make());
  const hasPerfect = new Array<boolean>(units.length).fill(false);
  const hasAny = new Array<boolean>(units.length).fill(false);
  const maxWindow = Math.max(endWindow, innerWindow);
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const gap = b.line - a.line;
      if (gap > maxWindow) break;
      if (a.section !== b.section) continue;
      const bothEnd = a.end && b.end;
      if (gap > (bothEnd ? endWindow : innerWindow)) continue;
      if (a.line === b.line && a.from < b.to && b.from < a.to) continue; // overlapping
      const same = a.text === b.text;
      if (same && !bothEnd) continue; // a repeated word mid-line is repetition, not rhyme
      let kind: 'perfect' | 'slant' | null = null;
      const ta = [a.tail, ...a.alts];
      const tb = [b.tail, ...b.alts];
      if (ta.some((x) => tb.some((y) => tailsEqual(x, y)))) kind = 'perfect';
      else if (useSlant && Math.max(...ta.flatMap((x) => tb.map((y) => tailScore(x, y)))) >= slantThreshold) kind = 'slant';
      if (!kind) continue;
      uf.union(i, j);
      hasAny[i] = hasAny[j] = true;
      if (kind === 'perfect') hasPerfect[i] = hasPerfect[j] = true;
    }
  }
  // the same perfect rhyme in different sections is one family (one colour across the song)
  {
    const byKey = new Map<string, number>();
    units.forEach((u, i) => {
      if (!hasAny[i]) return;
      const k = tailKey(u.tail);
      const seen = byKey.get(k);
      if (seen === undefined) byKey.set(k, i);
      else uf.union(seen, i);
    });
  }

  // ------------------------------------------------------------ families
  const rootToFamily = new Map<number, RhymeFamily>();
  const families: RhymeFamily[] = [];
  const unitFamily = new Array<number>(units.length).fill(-1);
  units.forEach((u, i) => {
    if (!hasAny[i]) return;
    const root = uf.find(i);
    let fam = rootToFamily.get(root);
    if (!fam) {
      fam = { id: families.length, color: families.length, kind: 'perfect', members: [], label: '' };
      rootToFamily.set(root, fam);
      families.push(fam);
    }
    unitFamily[i] = fam.id;
    fam.members.push({ lineIndex: u.line, from: u.from, to: u.to, text: u.text, atLineEnd: u.end });
  });
  // a family is 'perfect' only if all its tails are identical
  {
    const firstTail = new Map<number, string>();
    units.forEach((u, i) => {
      const f = unitFamily[i];
      if (f < 0) return;
      const k = tailKey(u.tail);
      if (!firstTail.has(f)) firstTail.set(f, k);
      else if (firstTail.get(f) !== k) families[f].kind = 'slant';
    });
  }
  for (const fam of families) {
    const seen: string[] = [];
    for (const m of fam.members) if (!seen.includes(m.text)) seen.push(m.text);
    fam.label = seen.slice(0, 4).join(' · ') + (seen.length > 4 ? ' …' : '');
  }
  units.forEach((u, i) => {
    const f = unitFamily[i];
    if (f < 0) return;
    const mode: SoundMode = hasPerfect[i] ? 'perfect' : 'slant';
    if (!modes.has(mode)) return;
    for (let s = u.from; s < u.to; s++) addMark(u.line, s, { mode, group: 'r' + f, color: families[f].color });
  });

  // ------------------------------------------------------------ rhyme scheme
  const scheme: (string | null)[] = lines.map(() => null);
  {
    let section: string | null = null;
    let letters = new Map<number, string>();
    let next = 0;
    const endCount = new Map<string, number>(); // section|family -> end members
    units.forEach((u, i) => {
      if (u.end && unitFamily[i] >= 0) {
        const k = u.section + '|' + unitFamily[i];
        endCount.set(k, (endCount.get(k) ?? 0) + 1);
      }
    });
    const letterFor = (n: number) => String.fromCharCode(65 + (n % 26)) + (n >= 26 ? "'" : '');
    lines.forEach((info, li) => {
      if (input[li].sectionId !== section) {
        section = input[li].sectionId;
        letters = new Map();
        next = 0;
      }
      if (!info.syllables.length) return;
      let fam = -1;
      let best = 1;
      units.forEach((u, i) => {
        if (u.line !== li || !u.end || unitFamily[i] < 0) return;
        const c = endCount.get(u.section + '|' + unitFamily[i]) ?? 0;
        if (c > best) {
          best = c;
          fam = unitFamily[i];
        }
      });
      if (fam < 0) {
        scheme[li] = letterFor(next++);
        return;
      }
      if (!letters.has(fam)) letters.set(fam, letterFor(next++));
      scheme[li] = letters.get(fam)!;
    });
  }

  // ------------------------------------------------------------ multisyllabic
  if (modes.has('multi')) {
    interface Anchor {
      line: number;
      syl: number;
      end: boolean;
    }
    const anchors: Anchor[] = [];
    lines.forEach((info, li) => {
      const { words, syllables: syls } = info;
      words.forEach((w) => {
        if (!w.sylCount || (w.functionWord && w.sylCount === 1)) return;
        for (let k = 0; k < w.sylCount; k++) {
          if (syls[w.firstSyl + k].level >= 1) anchors.push({ line: li, syl: w.firstSyl + k, end: false });
        }
      });
    });
    const wordEnds = lines.map((info) => new Set(info.words.filter((w) => w.sylCount).map((w) => w.firstSyl + w.sylCount)));
    const muf = new UnionFind();
    const nodeOf = new Map<string, number>();
    const nodeLen: number[] = [];
    const nodePos: Anchor[] = [];
    const node = (a: Anchor, len: number) => {
      const k = a.line + ':' + a.syl;
      let n = nodeOf.get(k);
      if (n === undefined) {
        n = muf.make();
        nodeOf.set(k, n);
        nodeLen[n] = len;
        nodePos[n] = a;
      } else nodeLen[n] = Math.max(nodeLen[n], len);
      return n;
    };
    const bridgeT = 0.62 - 0.25 * sens;
    const closeT = 0.5 - 0.25 * sens;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const sa = lines[a.line].syllables;
      for (let j = i + 1; j < anchors.length; j++) {
        const b = anchors[j];
        if (b.line - a.line > innerWindow + 1) break;
        if (input[a.line].sectionId !== input[b.line].sectionId) continue;
        const sb = lines[b.line].syllables;
        if (sa[a.syl].vowel !== sb[b.syl].vowel) continue;
        let best = 0;
        for (let k = 0; ; k++) {
          const x = sa[a.syl + k];
          const y = sb[b.syl + k];
          if (!x || !y) break;
          if (a.line === b.line && a.syl + k >= b.syl) break;
          const vOk = k === 0 ? x.vowel === y.vowel : x.vowel === y.vowel || (REDUCED.includes(x.vowel) && REDUCED.includes(y.vowel));
          if (!vOk) break;
          const endsOnWord = wordEnds[a.line].has(a.syl + k + 1) || wordEnds[b.line].has(b.syl + k + 1);
          if (endsOnWord && clusterSimilarity(x.coda, y.coda) >= closeT) best = k + 1;
          const nx = sa[a.syl + k + 1];
          const ny = sb[b.syl + k + 1];
          if (!nx || !ny) break;
          if (clusterSimilarity(x.coda + nx.onset, y.coda + ny.onset) < bridgeT) break;
        }
        if (best < 2) continue;
        const ta = lineSlice(lines[a.line], a.syl, a.syl + best);
        const tb = lineSlice(lines[b.line], b.syl, b.syl + best);
        if (ta === tb) continue; // plain repetition
        muf.union(node(a, best), node(b, best));
      }
    }
    const groupIds = new Map<number, number>();
    for (let n = 0; n < nodePos.length; n++) {
      const root = muf.find(n);
      if (!groupIds.has(root)) groupIds.set(root, groupIds.size);
      const g = groupIds.get(root)!;
      const p = nodePos[n];
      for (let k = 0; k < nodeLen[n]; k++) addMark(p.line, p.syl + k, { mode: 'multi', group: 'm' + g, color: families.length + g });
    }
  }

  // ------------------------------------------------------------ assonance
  if (modes.has('assonance')) {
    const need = sens >= 0.75 ? 2 : sens >= 0.3 ? 3 : 4;
    const collect = (from: number, to: number, min: number) => {
      const byVowel = new Map<string, [number, number, string][]>();
      for (let li = from; li <= to && li < lines.length; li++) {
        if (input[li].sectionId !== input[from].sectionId) break;
        const info = lines[li];
        info.syllables.forEach((s, si) => {
          const w = info.words[s.wordIndex];
          if (s.level < 1 || w.functionWord) return;
          if (!byVowel.has(s.vowel)) byVowel.set(s.vowel, []);
          byVowel.get(s.vowel)!.push([li, si, w.norm]);
        });
      }
      for (const [v, hits] of byVowel) {
        if (hits.length < min || new Set(hits.map((h) => h[2])).size < 2) continue;
        for (const [li, si] of hits) addMark(li, si, { mode: 'assonance', group: 'v' + v, color: VOWEL_CODES.indexOf(v) });
      }
    };
    for (let li = 0; li < lines.length; li++) {
      collect(li, li, Math.max(2, need - 1));
      collect(li, li + 1, need + 1);
    }
  }

  // ------------------------------------------------------------ consonance
  if (modes.has('consonance')) {
    const need = sens >= 0.75 ? 3 : sens >= 0.3 ? 4 : 5;
    lines.forEach((info, li) => {
      const hits = new Map<string, number[]>();
      info.syllables.forEach((s, si) => {
        if (info.words[s.wordIndex].functionWord) return;
        const seen = new Set<string>();
        for (const ch of s.onset + s.coda) {
          if (seen.has(ch)) continue;
          seen.add(ch);
          if (!hits.has(ch)) hits.set(ch, []);
          hits.get(ch)!.push(si);
        }
      });
      for (const [c, list] of hits) {
        if (list.length < need) continue;
        for (const si of list) addMark(li, si, { mode: 'consonance', group: 'c' + c, color: CONSONANT_CODES.indexOf(c) });
      }
    });
  }

  // ------------------------------------------------------------ alliteration
  if (modes.has('alliteration')) {
    const reach = sens >= 0.67 ? 3 : sens >= 0.33 ? 2 : 1;
    lines.forEach((info, li) => {
      const content = info.words.filter((w) => w.sylCount && !w.functionWord);
      const initial = (w: (typeof content)[number]) => info.syllables[w.firstSyl].onset[0] ?? '';
      for (let i = 0; i < content.length; i++) {
        const ci = initial(content[i]);
        if (!ci) continue;
        for (let j = i + 1; j <= i + reach && j < content.length; j++) {
          if (initial(content[j]) !== ci || content[j].norm === content[i].norm) continue;
          const mark: Mark = { mode: 'alliteration', group: 'a' + ci, color: CONSONANT_CODES.indexOf(ci) };
          addMark(li, content[i].firstSyl, mark);
          addMark(li, content[j].firstSyl, mark);
        }
      }
    });
  }

  // ------------------------------------------------------------ iambic feet
  // weak–STRONG pairs (da-DUM). Each foot is one group; feet alternate two
  // colours so the pulse is visible, and syllables that break the pattern
  // are simply left unmarked.
  if (modes.has('iambic')) {
    lines.forEach((info, li) => {
      const syls = info.syllables;
      let foot = 0;
      for (let i = 0; i + 1 < syls.length; ) {
        // a medium syllable can serve as the weak half next to a strong one
        const weak = syls[i].level === 0 || (syls[i].level === 1 && syls[i + 1].level === 2);
        const strong = syls[i + 1].level >= 1 && syls[i + 1].level >= syls[i].level && !(syls[i].level === syls[i + 1].level);
        if (weak && strong) {
          const mark: Mark = { mode: 'iambic', group: 'i' + li + ':' + foot, color: foot % 2 };
          addMark(li, i, mark);
          addMark(li, i + 1, mark);
          foot++;
          i += 2;
        } else i++;
      }
    });
  }

  return { lines, marks, scheme, families };
}

/** How iambic a line is: the share of its syllables that fall into weak–strong feet (0..1). */
export function iambicShare(marks: Mark[][]): number {
  if (!marks.length) return 0;
  return marks.filter((m) => m.some((x) => x.mode === 'iambic')).length / marks.length;
}

// ---------------------------------------------------------------- counts

export interface PhonemeCount {
  code: string;
  count: number;
}

export function phonemeCounts(lines: LineInfo[]): PhonemeCount[] {
  const counts = new Map<string, number>();
  for (const info of lines) {
    for (const s of info.syllables) {
      for (const ch of s.onset + s.vowel + s.coda) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

/** One row of vowel counts (ordered as VOWEL_CODES) per group of lines. */
export function vowelHeatmap(groups: LineInfo[][]): number[][] {
  return groups.map((lines) => {
    const row = new Array<number>(VOWEL_CODES.length).fill(0);
    for (const info of lines) for (const s of info.syllables) row[VOWEL_CODES.indexOf(s.vowel)]++;
    return row;
  });
}

export interface WordCount {
  word: string;
  count: number;
}

export function repeatedWords(lines: LineInfo[], includeFunctionWords = false, min = 2): WordCount[] {
  const counts = new Map<string, number>();
  for (const info of lines) {
    for (const w of info.words) {
      if (!w.sylCount || (!includeFunctionWords && w.functionWord)) continue;
      const k = w.norm.replace(/^'+|'+$/g, '');
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= min)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1));
}
