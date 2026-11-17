import { describe, expect, it } from 'vitest';
import { decodeLook, encodeLook, sanitizeCustom } from './lookCode';

describe('sanitizeCustom', () => {
  it('keeps good values and clamps the rest', () => {
    expect(sanitizeCustom({ accent: '#FF4D8D', radius: 5, lyricSize: 99, lineSpacing: 0.1 })).toEqual({ accent: '#ff4d8d', radius: 1, lyricSize: 30, lineSpacing: 1.25 });
    expect(sanitizeCustom({ accent: 'ff4d8d' }).accent).toBe('#ff4d8d');
  });
  it('drops anything invalid, whatever it is', () => {
    expect(sanitizeCustom({ accent: 'banana', radius: 'wide', density: 'huge', lyricFont: 'comic', bgStyle: 3, surfaceStyle: null, junk: 1 })).toEqual({});
    expect(sanitizeCustom(null)).toEqual({});
    expect(sanitizeCustom('hello')).toEqual({});
    expect(sanitizeCustom({ radius: NaN, lyricSize: Infinity })).toEqual({});
  });
});

describe('look codes', () => {
  const custom = { accent: '#ff4d8d', radius: 0.8, density: 'roomy' as const, lyricFont: 'serif' as const, displayFont: 'hand' as const, lyricSize: 22, lineSpacing: 1.7, bgStyle: 'solid' as const, surfaceStyle: 'outline' as const };
  it('round-trips a look with every tweak', () => {
    const r = decodeLook(encodeLook('neon', 'dark', custom));
    expect(r).toEqual({ ok: true, look: 'neon', mode: 'dark', custom });
  });
  it('round-trips a look with no tweaks', () => {
    const code = encodeLook('paper', 'system', {});
    expect(code).toMatch(/^stanza-look\/1\/paper\/system\/-~/);
    expect(decodeLook(code)).toEqual({ ok: true, look: 'paper', mode: 'system', custom: {} });
  });
  it('finds the code inside a longer message', () => {
    expect(decodeLook(`my new look!! ${encodeLook('forest', 'light', { radius: 0.2 })} try it`).ok).toBe(true);
  });
  it('catches a damaged or cut-off code, and an unknown look', () => {
    const code = encodeLook('neon', 'dark', custom);
    expect(decodeLook(code.replace('serif', 'mono_')).ok).toBe(false);
    expect(decodeLook(code.slice(0, -4)).ok).toBe(false);
    expect(decodeLook('hello').ok).toBe(false);
    const alien = decodeLook(encodeLook('neon', 'dark', {}).replace('neon', 'zzz'));
    expect(alien.ok).toBe(false);
  });
  it('a hand-edited code with out-of-range values is still kept in range', () => {
    // build a valid checksum around bad numbers by encoding then decoding through sanitise
    const r = decodeLook(encodeLook('mono', 'dark', { radius: 9, lyricSize: 1 } as never));
    expect(r.ok && r.custom).toEqual({ radius: 1, lyricSize: 15 });
  });
});
