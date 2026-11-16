/**
 * Custom strumming patterns. A pattern is one bar of steps (eighths or
 * sixteenths) that repeats; each step is a rest, a down or up stroke (normal or
 * soft "ghost"), or a muted chuck.
 */
import { newId } from '../util/id';

/** - rest · D down · d soft down · U up · u soft up · X muted chuck */
export type StrumStep = '-' | 'D' | 'd' | 'U' | 'u' | 'X';
export const STRUM_STEPS: StrumStep[] = ['-', 'D', 'd', 'U', 'u', 'X'];

export type StrumSpread = 'tight' | 'normal' | 'slow';
export const SPREAD_SECONDS: Record<StrumSpread, number> = { tight: 0.007, normal: 0.014, slow: 0.03 };

export interface CustomStrum {
  id: string;
  name: string;
  resolution: 'eighth' | 'sixteenth';
  steps: StrumStep[];
  spread: StrumSpread;
}

/** The pattern id stored in settings for a custom strum. */
export const customPatternId = (s: Pick<CustomStrum, 'id'>) => `custom:${s.id}`;
export const isCustomPattern = (p: string) => p.startsWith('custom:');

export const stepsFor = (resolution: CustomStrum['resolution']) => (resolution === 'sixteenth' ? 16 : 8);

/** Next state when a step is tapped: rest → down → soft down → up → soft up → mute → rest. */
export function nextStep(s: StrumStep): StrumStep {
  return STRUM_STEPS[(STRUM_STEPS.indexOf(s) + 1) % STRUM_STEPS.length];
}

/** "D-DU-UDU" style text for a pattern (rests as "-"). */
export const stepsToText = (steps: StrumStep[]) => steps.join('');

export function stepsFromText(text: string): StrumStep[] {
  return [...text].filter((c): c is StrumStep => STRUM_STEPS.includes(c as StrumStep));
}

/** Change resolution, keeping the hits where they fall in time. */
export function changeResolution(s: CustomStrum, to: CustomStrum['resolution']): CustomStrum {
  if (s.resolution === to) return s;
  if (to === 'sixteenth') {
    const steps: StrumStep[] = [];
    for (const st of s.steps) steps.push(st, '-');
    return { ...s, resolution: to, steps };
  }
  // 16 → 8: keep the strokes on the beat and the "and"; off-grid sixteenths fold onto the step before
  const steps: StrumStep[] = [];
  for (let i = 0; i < s.steps.length; i += 2) {
    const a = s.steps[i];
    const b = s.steps[i + 1] ?? '-';
    steps.push(a !== '-' ? a : b);
  }
  return { ...s, resolution: to, steps };
}

export interface StrumTemplate {
  name: string;
  resolution: CustomStrum['resolution'];
  steps: string;
  spread?: StrumSpread;
}

/** Starting points to edit (written one bar of 4/4). */
export const STRUM_TEMPLATES: StrumTemplate[] = [
  { name: 'Folk', resolution: 'eighth', steps: 'D-DU-UDU' },
  { name: 'Pop', resolution: 'eighth', steps: 'D-D--UDU' },
  { name: 'Down only', resolution: 'eighth', steps: 'D-D-D-D-' },
  { name: 'Ballad', resolution: 'eighth', steps: 'D---DuDu', spread: 'slow' },
  { name: 'Reggae chop', resolution: 'eighth', steps: '-U-U-U-U', spread: 'tight' },
  { name: 'Country boom-chick', resolution: 'eighth', steps: 'D-X-D-X-' },
  { name: 'Driving 16ths', resolution: 'sixteenth', steps: 'D-dUdUD-dUdUD-dU' },
  { name: 'Funk scratch', resolution: 'sixteenth', steps: 'DXXdXUXuDXXdXUXu' },
];

export function strumFromTemplate(t: StrumTemplate): CustomStrum {
  const steps = stepsFromText(t.steps);
  const want = stepsFor(t.resolution);
  while (steps.length < want) steps.push('-');
  return { id: newId(), name: t.name, resolution: t.resolution, steps: steps.slice(0, want), spread: t.spread ?? 'normal' };
}

export function emptyStrum(name = 'My strum'): CustomStrum {
  return { id: newId(), name, resolution: 'eighth', steps: Array<StrumStep>(8).fill('-'), spread: 'normal' };
}

export interface StrokeEvent {
  /** seconds from the start of the chord's span */
  at: number;
  kind: 'down' | 'up' | 'mute';
  /** 0..1 relative strength */
  vel: number;
  /** how long it rings (seconds): until the next stroke, within limits */
  dur: number;
}

/**
 * The strokes of a strum pattern across a span of time. Steps are true eighth
 * or sixteenth notes of the song's quarter-note tempo, whatever the time
 * signature. The pattern is tied to the bar: `offsetSeconds` says how far into
 * the bar the span starts (a second chord in a bar carries on from where the
 * first left off), and a stroke is forced on a chord change that would
 * otherwise land on a rest.
 */
export function strokesFor(strum: CustomStrum, quarterSeconds: number, spanSeconds: number, offsetSeconds = 0): StrokeEvent[] {
  const step = strum.resolution === 'sixteenth' ? quarterSeconds / 4 : quarterSeconds / 2;
  const n = strum.steps.length || 1;
  const startStep = Math.round(offsetSeconds / step);
  const total = Math.ceil(spanSeconds / step - 1e-6);
  const kinds: { k: number; s: StrumStep }[] = [];
  for (let k = 0; k < total; k++) {
    const s = strum.steps[(startStep + k) % n];
    if (s !== '-') kinds.push({ k, s });
  }
  // a chord change mid-bar always gets a stroke
  if (startStep > 0 && (kinds.length === 0 || kinds[0].k > 0)) kinds.unshift({ k: 0, s: 'd' });
  return kinds.map(({ k, s }, i) => {
    const nextAt = i + 1 < kinds.length ? kinds[i + 1].k * step : spanSeconds;
    const gap = Math.max(0.05, nextAt - k * step);
    if (s === 'X') return { at: k * step, kind: 'mute' as const, vel: 0.5, dur: 0.07 };
    const soft = s === 'd' || s === 'u';
    const down = s === 'D' || s === 'd';
    // the downbeat of each bar lands a touch harder
    const accent = (startStep + k) % n === 0 && !soft ? 1 : 0.85;
    return { at: k * step, kind: down ? ('down' as const) : ('up' as const), vel: (soft ? 0.5 : 0.8) * accent, dur: Math.min(gap + 0.05, 1.6) };
  });
}
