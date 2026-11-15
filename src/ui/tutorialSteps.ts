// The first-round tutorial's steps, as plain logic (no DOM), so it can be
// tested. It only WATCHES the game (the player's position and the sim's
// events); it never changes the game state.
//
//   move  → walk a few steps
//   grab  → grab 3 pickups
//   home  → walk home and unload your backpack
//   bars  → "keep these bars full" (shows for a few seconds)
//   done  → "you're ready!" (shows for a few seconds)
//   finished → the tutorial is over

import { BALANCE } from '../config/balance';
import type { GameEvent } from '../core/events';
import type { Vec2 } from '../core/state';

export type TutorialStep = 'move' | 'grab' | 'home' | 'bars' | 'done' | 'finished';

export interface TutorialProgress {
  step: TutorialStep;
  startPos: Vec2 | null; // where you stood when the tutorial began
  grabbed: number; // pickups grabbed since the start
  deposited: boolean; // unloaded at your base at least once
  stepStartedAt: number; // game time the current step began
}

export function createTutorialProgress(): TutorialProgress {
  return { step: 'move', startPos: null, grabbed: 0, deposited: false, stepStartedAt: 0 };
}

// Moves the tutorial forward. Returns true if the step changed this frame.
// `time` is the game clock (state.time); `pos` is the local player's position.
export function advanceTutorial(p: TutorialProgress, pos: Vec2, events: GameEvent[], localPlayerId: string, time: number): boolean {
  const T = BALANCE.tutorial;
  if (p.step === 'finished') return false;
  if (!p.startPos) {
    p.startPos = { x: pos.x, z: pos.z };
    p.stepStartedAt = time;
  }

  // Count what happened, whatever step we're on (so fast players skip ahead).
  for (const e of events) {
    if ((e.type === 'PickupCollected' || e.type === 'TaskCompleted') && e.playerId === localPlayerId) p.grabbed++;
    if (e.type === 'CargoDeposited' && e.playerId === localPlayerId) p.deposited = true;
  }

  const walked = Math.hypot(pos.x - p.startPos.x, pos.z - p.startPos.z);
  const stepTime = time - p.stepStartedAt;
  let next: TutorialStep | null = null;
  switch (p.step) {
    case 'move':
      if (walked >= T.walkDistance || p.grabbed > 0) next = 'grab';
      break;
    case 'grab':
      if (p.grabbed >= T.grabCount || p.deposited) next = 'home';
      break;
    case 'home':
      if (p.deposited) next = 'bars';
      break;
    case 'bars':
      if (stepTime >= T.barsSeconds) next = 'done';
      break;
    case 'done':
      if (stepTime >= T.doneSeconds) next = 'finished';
      break;
  }
  if (!next) return false;
  p.step = next;
  p.stepStartedAt = time;
  return true;
}
