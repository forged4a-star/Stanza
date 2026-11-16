import { describe, expect, it } from 'vitest';
import { decodeStrum, encodeStrum } from './strumCode';
import type { CustomStrum } from './strums';

const strum = (over: Partial<CustomStrum> = {}): CustomStrum => ({ id: 'x', name: 'Campfire', resolution: 'eighth', spread: 'normal', steps: [...'D-DU-UDU'] as CustomStrum['steps'], ...over });

describe('strum codes', () => {
  it('round-trips a strum, with a fresh id', () => {
    const r = decodeStrum(encodeStrum(strum()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.strum).toMatchObject({ name: 'Campfire', resolution: 'eighth', spread: 'normal', steps: [...'D-DU-UDU'] });
      expect(r.strum.id).not.toBe('x');
    }
  });
  it('round-trips sixteenths, soft strokes, mutes and slow sweeps', () => {
    const s = strum({ resolution: 'sixteenth', spread: 'slow', steps: [...'DdXuU---D-d-UuX-'] as CustomStrum['steps'] });
    const r = decodeStrum(encodeStrum(s));
    expect(r.ok && r.strum.steps.join('')).toBe('DdXuU---D-d-UuX-');
    expect(r.ok && r.strum.spread).toBe('slow');
  });
  it('finds the code inside a longer message', () => {
    const r = decodeStrum(`try this one!! ${encodeStrum(strum())} it is great`);
    expect(r.ok).toBe(true);
  });
  it('catches a damaged or cut-off code', () => {
    const code = encodeStrum(strum());
    expect(decodeStrum(code.replace('D-DU', 'D-UD')).ok).toBe(false);
    expect(decodeStrum(code.slice(0, -3)).ok).toBe(false);
    expect(decodeStrum('hello there').ok).toBe(false);
  });
  it('rejects a well-formed code with a bad pattern', () => {
    expect(decodeStrum(encodeStrum(strum({ steps: [...'--------'] as CustomStrum['steps'] }))).ok).toBe(false);
    expect(decodeStrum(encodeStrum(strum({ steps: [...'D-DU'] as CustomStrum['steps'] }))).ok).toBe(false);
  });
  it('keeps names with spaces', () => {
    const r = decodeStrum(encodeStrum(strum({ name: 'My strum' })));
    expect(r.ok && r.strum.name).toBe('My strum');
    expect(decodeStrum(`${encodeStrum(strum({ name: 'Slow summer nights' }))} thanks!`).ok).toBe(true);
  });
  it('cleans odd names', () => {
    const r = decodeStrum(encodeStrum(strum({ name: 'a/b~c\nd '.repeat(5) })));
    expect(r.ok && r.strum.name.length).toBeLessThanOrEqual(24);
    expect(r.ok && /[\/~\n]/.test(r.strum.name)).toBe(false);
  });
});
