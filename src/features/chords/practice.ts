/**
 * The practice loop: a few bars of a section, over and over, starting slow
 * and stepping the tempo up to the song's tempo. Each pass is its own short
 * run, so a new tempo needs no rebuilding of anything long.
 */
import { create } from 'zustand';
import { cleanPlan, defaultPlan, rampTempos, sliceBars, type RampPlan } from '../../core/audio/practice';
import { useSong } from '../../store/song';
import { playerStopHooks, playScope, stopPlayer, usePlayer } from './player';

interface PracticeState {
  active: boolean;
  /** 0-based pass being played, and how many there are */
  pass: number;
  total: number;
  bpm: number;
  /** true once the target tempo has been reached and the loop is holding there */
  holding: boolean;
}

export const usePractice = create<PracticeState>(() => ({ active: false, pass: 0, total: 0, bpm: 0, holding: false }));

export interface PracticeSetup {
  sectionId: string;
  /** 1-based, inclusive */
  from: number;
  to: number;
  plan: RampPlan;
  metronome: boolean;
  /** keep looping at the target tempo after the last pass, until stopped */
  endless: boolean;
}

let token = 0;

export function startPractice(setup: PracticeSetup): boolean {
  const doc = useSong.getState().doc;
  const sec = doc?.sections.find((s) => s.id === setup.sectionId);
  if (!doc || !sec) return false;
  const bars = sliceBars(sec.bars, setup.from, setup.to);
  if (!bars.length) return false;
  const plan = cleanPlan(setup.plan);
  const tempos = rampTempos(plan);
  const mine = ++token;

  const run = (k: number) => {
    if (mine !== token) return;
    const endlessHold = k >= tempos.length;
    const bpm = endlessHold ? plan.target : tempos[k];
    usePractice.setState({ active: true, pass: Math.min(k, tempos.length - 1), total: tempos.length, bpm, holding: endlessHold || bpm >= plan.target });
    playScope(setup.sectionId, {
      bars,
      bpm,
      loop: false,
      melody: false,
      metronome: setup.metronome,
      highlight: { sectionId: setup.sectionId, offset: Math.max(1, Math.floor(setup.from)) - 1 },
      keepHooks: true,
      onEnd: () => {
        if (mine !== token) return;
        if (k + 1 < tempos.length || setup.endless) run(k + 1);
        else finish();
      },
    });
  };
  const finish = () => {
    token++;
    usePractice.setState({ active: false, pass: 0, total: 0, bpm: 0, holding: false });
    stopPlayer();
  };
  // anything else that starts or stops the player ends the practice
  const hook = () => {
    if (mine !== token) return;
    token++;
    usePractice.setState({ active: false, pass: 0, total: 0, bpm: 0, holding: false });
  };
  playerStopHooks.add(hook);
  const unsub = usePractice.subscribe((st) => {
    if (!st.active) {
      playerStopHooks.delete(hook);
      unsub();
    }
  });
  run(0);
  return usePlayer.getState().playing;
}

export function stopPractice() {
  if (!usePractice.getState().active) return;
  stopPlayer();
}

export { defaultPlan };
