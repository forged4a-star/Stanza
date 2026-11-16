/**
 * Read-only lookup over a big newline-delimited string of `key\tvalue` lines
 * sorted by key (plain code-unit order). Binary-searches the string in place,
 * so the only memory cost is the string itself.
 */
export class SortedLines {
  private offsets: Int32Array | null = null;

  constructor(private readonly s: string) {}

  /** Position of the first line whose key is >= `key`. */
  private lowerBound(key: string): number {
    const s = this.s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const ls = mid === 0 ? 0 : s.lastIndexOf('\n', mid - 1) + 1;
      let le = s.indexOf('\n', mid);
      if (le < 0) le = s.length;
      let tab = s.indexOf('\t', ls);
      if (tab < 0 || tab > le) tab = le;
      const k = s.slice(ls, tab);
      if (k < key) lo = le + 1;
      else hi = ls;
    }
    return lo;
  }

  /** Value for an exact key, or null. */
  get(key: string): string | null {
    const s = this.s;
    const pos = this.lowerBound(key);
    if (pos >= s.length) return null;
    if (!s.startsWith(key + '\t', pos)) return null;
    let le = s.indexOf('\n', pos);
    if (le < 0) le = s.length;
    return s.slice(pos + key.length + 1, le);
  }

  has(key: string): boolean {
    const pos = this.lowerBound(key);
    return pos < this.s.length && this.s.startsWith(key + '\t', pos);
  }

  /** Visit every line whose key starts with `prefix`. Return false from `fn` to stop. */
  scanPrefix(prefix: string, fn: (key: string, value: string) => boolean | void): void {
    const s = this.s;
    let pos = this.lowerBound(prefix);
    while (pos < s.length) {
      let le = s.indexOf('\n', pos);
      if (le < 0) le = s.length;
      if (!s.startsWith(prefix, pos)) return;
      const tab = s.indexOf('\t', pos);
      if (fn(s.slice(pos, tab), s.slice(tab + 1, le)) === false) return;
      pos = le + 1;
    }
  }

  /** Visit every line. */
  scanAll(fn: (key: string, value: string) => boolean | void): void {
    this.scanPrefix('', fn);
  }

  /** The n-th line (0-based), whole. Builds a line-offset table on first use. */
  lineAt(n: number): string | null {
    const s = this.s;
    if (!this.offsets) {
      let count = 1;
      for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) count++;
      const off = new Int32Array(count);
      let k = 1;
      for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) off[k++] = i + 1;
      this.offsets = off;
    }
    if (n < 0 || n >= this.offsets.length) return null;
    const start = this.offsets[n];
    const end = n + 1 < this.offsets.length ? this.offsets[n + 1] - 1 : s.length;
    return s.slice(start, end);
  }
}
