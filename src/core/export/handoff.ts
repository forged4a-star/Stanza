/**
 * A hand-off note for a co-writer: where the song stands, what is still open
 * and what to leave alone. Plain text, so it pastes into any message. It only
 * reports what is in the song; it never writes or suggests words.
 */
import { SECTION_KIND_NAMES, sectionDisplayNames, type SongDoc } from '../model';
import { keyName, parseKey } from '../music/theory';
import { songProgress } from '../song/progress';

export interface HandoffInput {
  doc: SongDoc;
  takes: number;
  /** unresolved comments from co-writers, as plain text */
  comments?: string[];
  /** include the lyrics of locked lines (the ones to leave alone) */
  includeLyrics?: boolean;
}

const lineWord = (n: number) => `${n} line${n === 1 ? '' : 's'}`;

export function handoffSummary({ doc, takes, comments = [], includeLyrics = false }: HandoffInput): string {
  const s = doc.song;
  const names = sectionDisplayNames(doc.sections);
  const written = (i: number) => doc.sections[i].lines.filter((l) => l.text.trim());
  const hasChords = (i: number) => doc.sections[i].bars.length > 0 || doc.sections[i].lines.some((l) => l.chords.length > 0);
  const key = parseKey(s.key);
  const out: string[] = [];

  out.push(s.title.trim() || 'Untitled');
  const facts = [key ? keyName(key, true) : null, `${Math.round(s.bpm)} bpm`, `${s.timeSig[0]}/${s.timeSig[1]}`, s.capo ? `capo ${s.capo}` : null, s.status].filter(Boolean);
  out.push(facts.join(' · '));
  out.push('');

  const progress = songProgress({
    title: s.title,
    lines: doc.sections.reduce((n, _, i) => n + written(i).length, 0),
    chordSections: doc.sections.filter((_, i) => hasChords(i)).length,
    melodySections: doc.sections.filter((x) => x.melody.length > 0).length,
    takes,
  });
  out.push(`WHERE IT STANDS (${progress.done} of ${progress.total} parts)`);
  for (const i of progress.items) out.push(`${i.done ? '[x]' : '[ ]'} ${i.label}`);
  out.push('');

  out.push('SECTIONS');
  if (!doc.sections.length) out.push('(none yet)');
  doc.sections.forEach((sec, i) => {
    const n = written(i).length;
    const bits = [n ? lineWord(n) : 'empty', hasChords(i) ? 'chords' : null, sec.melody.length ? 'melody' : null].filter(Boolean);
    const feel = sec.feeling.trim() ? ` — feels ${sec.feeling.trim()}` : '';
    out.push(`- ${names[i]}: ${bits.join(', ')}${feel}`);
  });
  out.push('');

  const open: string[] = [];
  doc.sections.forEach((_, i) => {
    if (!written(i).length) open.push(`${names[i]} has no words yet`);
  });
  const anyChords = doc.sections.some((_, i) => hasChords(i));
  if (anyChords) doc.sections.forEach((_, i) => written(i).length && !hasChords(i) && open.push(`${names[i]} has words but no chords`));
  for (const i of progress.items) if (!i.done && i.id !== 'lyrics') open.push(i.hint);
  if (!progress.items.find((x) => x.id === 'lyrics')?.done) open.push(progress.items.find((x) => x.id === 'lyrics')!.hint);
  for (const c of comments) open.push(`Comment: ${c.replace(/\s+/g, ' ').trim()}`);
  out.push('STILL OPEN');
  if (!open.length) out.push('Nothing missing.');
  for (const o of open) out.push(`- ${o}`);

  const locked: { name: string; text: string }[] = [];
  doc.sections.forEach((sec, i) => sec.lines.forEach((l) => l.locked && l.text.trim() && locked.push({ name: names[i], text: l.text.trim() })));
  if (locked.length) {
    out.push('');
    out.push(`PLEASE LEAVE ALONE (${lineWord(locked.length)} locked)`);
    if (includeLyrics) for (const l of locked) out.push(`- ${l.name}: "${l.text}"`);
    else out.push('Locked lines are marked with a padlock in the song.');
  }

  const kinds = new Set(doc.sections.map((x) => x.kind));
  if (kinds.size && !kinds.has('chorus') && doc.sections.length >= 2) out.push('', `Note: there is no ${SECTION_KIND_NAMES.chorus.toLowerCase()} yet.`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
