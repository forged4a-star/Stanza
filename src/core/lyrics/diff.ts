/**
 * Diff for version snapshots: lines first (LCS), then words inside lines
 * that changed, so the view can show exactly which words moved.
 */
import { sectionDisplayNames, type SongDoc } from '../model';

export type DiffOp<T> = { type: 'same' | 'add' | 'del'; value: T };

/** Myers-free simple LCS diff, O(n*m); fine for lyric-sized inputs. */
export function diffSeq<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): DiffOp<T>[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = eq(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffOp<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push({ type: 'same', value: b[j] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ type: 'del', value: a[i++] });
    else out.push({ type: 'add', value: b[j++] });
  }
  while (i < n) out.push({ type: 'del', value: a[i++] });
  while (j < m) out.push({ type: 'add', value: b[j++] });
  return out;
}

export interface WordPiece {
  type: 'same' | 'add' | 'del';
  text: string;
}

export function diffWords(a: string, b: string): WordPiece[] {
  const split = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const ops = diffSeq(split(a), split(b));
  const out: WordPiece[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.value;
    else out.push({ type: op.type, text: op.value });
  }
  return out;
}

const similarity = (a: string, b: string) => {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (!wa.size && !wb.size) return 1;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
};

export type LineDiff =
  | { type: 'header'; text: string; change: 'same' | 'add' | 'del' }
  | { type: 'same'; text: string }
  | { type: 'add'; text: string }
  | { type: 'del'; text: string }
  | { type: 'change'; pieces: WordPiece[] };

/** Flatten a song into "[Section]" header rows and lyric rows. */
function rows(doc: SongDoc): string[] {
  const names = sectionDisplayNames(doc.sections);
  const out: string[] = [];
  doc.sections.forEach((s, i) => {
    out.push('\u0000' + names[i]);
    for (const l of s.lines) out.push(l.text);
  });
  return out;
}

/** Diff two versions of a song (old → new). Adjacent del/add pairs that are similar become word-level changes. */
export function diffSongs(oldDoc: SongDoc, newDoc: SongDoc): LineDiff[] {
  const ops = diffSeq(rows(oldDoc), rows(newDoc));
  const out: LineDiff[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    const isHeader = op.value.startsWith('\u0000');
    if (isHeader) {
      out.push({ type: 'header', text: op.value.slice(1), change: op.type });
      k++;
      continue;
    }
    if (op.type === 'same') {
      out.push({ type: 'same', text: op.value });
      k++;
      continue;
    }
    // gather a run of non-header dels and adds and pair similar ones
    const dels: string[] = [];
    const adds: string[] = [];
    while (k < ops.length && ops[k].type !== 'same' && !ops[k].value.startsWith('\u0000')) {
      (ops[k].type === 'del' ? dels : adds).push(ops[k].value);
      k++;
    }
    let ai = 0;
    for (const d of dels) {
      if (ai < adds.length && similarity(d, adds[ai]) >= 0.3) {
        out.push({ type: 'change', pieces: diffWords(d, adds[ai]) });
        ai++;
      } else out.push({ type: 'del', text: d });
    }
    for (; ai < adds.length; ai++) out.push({ type: 'add', text: adds[ai] });
  }
  return out;
}

export function diffStats(d: LineDiff[]): { added: number; removed: number; changed: number } {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const r of d) {
    if (r.type === 'add') added++;
    else if (r.type === 'del') removed++;
    else if (r.type === 'change') changed++;
  }
  return { added, removed, changed };
}
