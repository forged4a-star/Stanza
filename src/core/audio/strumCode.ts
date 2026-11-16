/**
 * Strum codes: a custom strum as a short line of text you can send in a
 * message and paste into another phone. Example:
 *   stanza-strum/1/e/n/D-DU-UDU/Campfire~k
 * The last character is a checksum so a damaged paste is caught.
 */
import { newId } from '../util/id';
import type { CustomStrum, StrumStep } from './strums';

const PREFIX = 'stanza-strum/1/';
const STEP_CHARS = '-DdUuX';

const checksum = (body: string) => {
  let n = 0;
  for (let i = 0; i < body.length; i++) n = (n * 31 + body.charCodeAt(i)) % 36;
  return n.toString(36);
};

const cleanName = (s: string) => s.replace(/[\/~\r\n_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24).trim();

export function encodeStrum(s: CustomStrum): string {
  const body = `${PREFIX}${s.resolution === 'eighth' ? 'e' : 's'}/${s.spread[0]}/${s.steps.join('')}/${(cleanName(s.name) || 'Strum').replace(/ /g, '_')}`;
  return `${body}~${checksum(body)}`;
}

export type DecodeResult = { ok: true; strum: CustomStrum } | { ok: false; error: string };

export function decodeStrum(text: string): DecodeResult {
  // allow the code to sit inside a longer message
  const m = text.match(/stanza-strum\/1\/[^\s]*~[0-9a-z]/i);
  if (!m) return { ok: false, error: 'That does not look like a strum code. It starts with "stanza-strum/".' };
  const code = m[0];
  const tilde = code.lastIndexOf('~');
  const body = code.slice(0, tilde);
  if (checksum(body) !== code.slice(tilde + 1).toLowerCase()) return { ok: false, error: 'The code was changed or cut off. Ask for it again.' };
  const [res, spread, steps, ...rest] = body.slice(PREFIX.length).split('/');
  const resolution = res === 'e' ? 'eighth' : res === 's' ? 'sixteenth' : null;
  const sp = ({ t: 'tight', n: 'normal', s: 'slow' } as const)[spread as 't'];
  if (!resolution || !sp || !steps) return { ok: false, error: 'The code is missing parts.' };
  if (steps.length !== (resolution === 'eighth' ? 8 : 16) || [...steps].some((c) => !STEP_CHARS.includes(c))) return { ok: false, error: 'The pattern in this code is not valid.' };
  if (![...steps].some((c) => c !== '-')) return { ok: false, error: 'This pattern has no strokes.' };
  return { ok: true, strum: { id: newId(), name: cleanName(rest.join('/').replace(/_/g, ' ')) || 'Shared strum', resolution, steps: [...steps] as StrumStep[], spread: sp } };
}
