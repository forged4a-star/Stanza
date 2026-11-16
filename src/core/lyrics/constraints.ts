/**
 * Constraint cards: small writing rules ("only one-syllable words", "no two
 * line endings rhyme") you can pick up like a card. The app checks your own
 * lines against the card and points at the ones that break it. It never
 * suggests or writes words.
 */
import { analyzeLine, FUNCTION_WORDS } from '../phonetics/line';
import { analyzeSound } from '../phonetics/sound';

export interface CardLine {
  id: string;
  text: string;
}
export interface CardSection {
  id: string;
  lines: CardLine[];
}

export interface Violation {
  sectionIndex: number;
  /** line number within its section, from 1 */
  row: number;
  lineId: string;
  message: string;
}

export interface ConstraintCard {
  id: string;
  title: string;
  /** the rule in one plain sentence */
  rule: string;
  check: (sections: CardSection[]) => Violation[];
}

const filled = (s: CardSection) => s.lines.map((l, i) => ({ l, row: i + 1 })).filter((x) => x.l.text.trim());

/** Lines of each section, one analyzeSound pass per section, with the rhyme letter for each line. */
function schemes(sections: CardSection[]): (string | null)[][] {
  return sections.map((s) => {
    const input = s.lines.map((l) => ({ id: l.id, sectionId: s.id, text: l.text }));
    return analyzeSound(input, { modes: ['perfect', 'slant'], sensitivity: 0.5, scope: 'end' }).scheme;
  });
}

const each = (sections: CardSection[], fn: (text: string, ctx: { si: number; row: number; id: string }) => string | null): Violation[] => {
  const out: Violation[] = [];
  sections.forEach((s, si) =>
    filled(s).forEach(({ l, row }) => {
      const m = fn(l.text, { si, row, id: l.id });
      if (m) out.push({ sectionIndex: si, row, lineId: l.id, message: m });
    })
  );
  return out;
};

const lastWord = (text: string) => analyzeLine(text).words.at(-1);

export const CARDS: ConstraintCard[] = [
  {
    id: 'small-words',
    title: 'Small words only',
    rule: 'Every word has one syllable.',
    check: (secs) =>
      each(secs, (text) => {
        const long = analyzeLine(text).words.filter((w) => w.sylCount > 1);
        return long.length ? `“${long[0].text}” has ${long[0].sylCount} syllables${long.length > 1 ? ` (and ${long.length - 1} more)` : ''}` : null;
      }),
  },
  {
    id: 'tight',
    title: 'Tight lines',
    rule: 'Every line is 8 syllables or fewer.',
    check: (secs) =>
      each(secs, (text) => {
        const n = analyzeLine(text).syllables.length;
        return n > 8 ? `${n} syllables (limit 8)` : null;
      }),
  },
  {
    id: 'land-hard',
    title: 'Land hard',
    rule: 'Every line ends on a strong syllable.',
    check: (secs) =>
      each(secs, (text) => {
        const info = analyzeLine(text);
        const last = info.syllables.at(-1);
        return last && last.level === 0 ? `ends softly on “${text.slice(last.start, last.end).trim() || lastWord(text)?.text}”` : null;
      }),
  },
  {
    id: 'no-end-rhyme',
    title: 'No end rhymes',
    rule: 'No two line endings in a section rhyme.',
    check: (secs) => {
      const sc = schemes(secs);
      const out: Violation[] = [];
      secs.forEach((s, si) => {
        const seen = new Map<string, number>();
        s.lines.forEach((l, i) => {
          const letter = sc[si][i];
          if (!letter || !l.text.trim()) return;
          if (seen.has(letter)) out.push({ sectionIndex: si, row: i + 1, lineId: l.id, message: `rhymes with line ${seen.get(letter)}` });
          else seen.set(letter, i + 1);
        });
      });
      return out;
    },
  },
  {
    id: 'all-rhyme',
    title: 'Everything rhymes',
    rule: 'Every line ending rhymes with another in its section.',
    check: (secs) => {
      const sc = schemes(secs);
      const out: Violation[] = [];
      secs.forEach((s, si) => {
        const counts = new Map<string, number>();
        sc[si].forEach((x) => x && counts.set(x, (counts.get(x) ?? 0) + 1));
        if (filled(s).length < 2) return;
        s.lines.forEach((l, i) => {
          const letter = sc[si][i];
          if (l.text.trim() && (!letter || (counts.get(letter) ?? 0) < 2)) out.push({ sectionIndex: si, row: i + 1, lineId: l.id, message: 'rhymes with nothing' });
        });
      });
      return out;
    },
  },
  {
    id: 'no-repeat',
    title: 'Nothing twice',
    rule: 'No word (apart from little ones like “the”) appears twice in a section.',
    check: (secs) => {
      const out: Violation[] = [];
      secs.forEach((s, si) => {
        const seen = new Set<string>();
        filled(s).forEach(({ l, row }) => {
          const again = analyzeLine(l.text)
            .words.filter((w) => !w.functionWord && !FUNCTION_WORDS.has(w.norm) && w.norm.length > 2)
            .filter((w) => seen.has(w.norm));
          if (again.length) out.push({ sectionIndex: si, row, lineId: l.id, message: `“${again[0].text}” was already used` });
          for (const w of analyzeLine(l.text).words) if (!w.functionWord && w.norm.length > 2) seen.add(w.norm);
        });
      });
      return out;
    },
  },
  {
    id: 'questions',
    title: 'Only questions',
    rule: 'Every line is a question.',
    check: (secs) => each(secs, (text) => (/\?\s*$/.test(text.trim()) ? null : 'not a question (no ? at the end)')),
  },
  {
    id: 'no-articles',
    title: 'No articles',
    rule: 'Leave out “a”, “an” and “the”.',
    check: (secs) =>
      each(secs, (text) => {
        const m = text.match(/\b(a|an|the)\b/i);
        return m ? `drop “${m[0]}”` : null;
      }),
  },
  {
    id: 'alliterate',
    title: 'Start alike',
    rule: 'Every line has two words that start with the same sound.',
    check: (secs) =>
      each(secs, (text) => {
        const info = analyzeLine(text);
        if (info.words.length < 3) return null;
        const seen = new Set<string>();
        for (const w of info.words) {
          const onset = info.syllables[w.firstSyl]?.onset;
          if (!onset) continue;
          const head = onset.trim().split(/\s+/)[0];
          if (seen.has(head)) return null;
          seen.add(head);
        }
        return 'no two words start with the same sound';
      }),
  },
];

export const cardById = (id: string | null | undefined) => CARDS.find((c) => c.id === id) ?? null;

export function checkCard(id: string, sections: CardSection[]): Violation[] {
  return cardById(id)?.check(sections) ?? [];
}

/** A card chosen from a seed (so it can be repeatable); never the one you already hold. */
export function drawCard(seed: number, not?: string | null): ConstraintCard {
  const pool = CARDS.filter((c) => c.id !== not);
  let x = (seed >>> 0) || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return pool[(x >>> 0) % pool.length];
}
