import { describe, expect, it } from 'vitest';
import { CARD_THEMES, CARD_WIDTH, cardSvg, layoutCard, wrapLine } from './lyricCard';

describe('lyric card', () => {
  it('wraps at spaces and never splits short words', () => {
    const out = wrapLine('the river runs along the edge of town tonight', 60, 600);
    expect(out.length).toBeGreaterThan(1);
    expect(out.join(' ')).toBe('the river runs along the edge of town tonight');
    for (const l of out) expect(l.length * 60 * 0.5).toBeLessThanOrEqual(600);
  });
  it('breaks a word longer than the line', () => {
    const out = wrapLine('supercalifragilisticexpialidocious', 60, 300);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((l) => l.length * 30 <= 300 + 30)).toBe(true);
  });
  it('a short verse gets large type; a long one shrinks to fit', () => {
    const short = layoutCard(['down by the river', 'I lost my stone'], { title: 'Rivers' });
    const long = layoutCard(Array.from({ length: 14 }, (_, i) => `this is line number ${i} of a rather long verse`), { title: 'Rivers' });
    expect(short.size).toBeGreaterThan(long.size);
    expect(short.truncated).toBe(false);
    expect(long.lines.every((l) => l.y <= long.height)).toBe(true);
  });
  it('truncates with an ellipsis when it cannot fit', () => {
    const l = layoutCard(Array.from({ length: 80 }, (_, i) => `line ${i} with a few words in it`), { title: 'x' });
    expect(l.truncated).toBe(true);
    expect(l.lines.at(-1)!.text.endsWith('…')).toBe(true);
    expect(Math.max(...l.lines.map((x) => x.y))).toBeLessThan(l.height);
  });
  it('story is taller than square', () => {
    expect(layoutCard(['a'], { title: 't', ratio: 'story' }).height).toBe(1920);
    expect(layoutCard(['a'], { title: 't' }).height).toBe(1080);
    expect(layoutCard(['a'], { title: 't' }).width).toBe(CARD_WIDTH);
  });
  it('text is vertically centred in the space between header and footer', () => {
    const l = layoutCard(['one', 'two'], { title: 't' });
    const mid = (l.lines[0].y + l.lines[1].y) / 2;
    expect(Math.abs(mid - l.height / 2)).toBeLessThan(120);
  });
  it('writes valid, escaped SVG in the chosen theme', () => {
    const svg = cardSvg(layoutCard(['Tom & Jerry <3', 'say "hi"'], { title: 'A & B', theme: CARD_THEMES[2] }));
    expect(svg.startsWith('<svg xmlns=')).toBe(true);
    expect(svg).toContain('Tom &amp; Jerry &lt;3');
    expect(svg).toContain('say &quot;hi&quot;');
    expect(svg).toContain(CARD_THEMES[2].bg);
    expect(svg).not.toContain('<3');
  });
  it('skips blank lines when drawing but keeps their space', () => {
    const l = layoutCard(['one', '', 'two'], { title: 't' });
    expect(l.lines).toHaveLength(3);
    expect(cardSvg(l).match(/<text /g)!.length).toBe(2 + 2); // two lines + title + footer
  });
});
