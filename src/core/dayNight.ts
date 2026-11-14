// Day and night on Mars. One sol (Mars day) is squeezed into
// BALANCE.sol.seconds of game time. Solar power follows the sun curve below.

import { BALANCE } from '../config/balance';
import type { GameEvent } from './events';
import type { GameState } from './state';

// How far through the sol we are at game time `time`:
// 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
export function timeOfSol(time: number): number {
  const sols = time / BALANCE.sol.seconds + BALANCE.sol.startTimeOfSol;
  return sols - Math.floor(sols);
}

// Which sol it is, starting at Sol 1.
export function solNumber(time: number): number {
  return Math.floor(time / BALANCE.sol.seconds + BALANCE.sol.startTimeOfSol) + 1;
}

// Sun strength from 0 (night) to 1 (noon). A simple sine curve:
// it rises at sunrise, peaks at noon and is 0 for the whole night.
export function sunlight(time: number): number {
  const f = timeOfSol(time);
  return Math.max(0, Math.sin(2 * Math.PI * (f - 0.25)));
}

export function isNight(time: number): boolean {
  return sunlight(time) <= 0;
}

// Emit an event when the sun rises (a new sol) or sets, between now and now + dt.
export function updateDayNight(state: GameState, dt: number, events: GameEvent[]): void {
  const before = timeOfSol(state.time);
  const after = timeOfSol(state.time + dt);
  if (crossed(before, after, 0.25)) events.push({ type: 'Sunrise', sol: solNumber(state.time + dt) });
  if (crossed(before, after, 0.75)) events.push({ type: 'Sunset', sol: solNumber(state.time + dt) });
}

// Did time-of-sol pass `mark` going from `a` to `b`? (Handles wrapping past midnight.)
function crossed(a: number, b: number, mark: number): boolean {
  if (b >= a) return a < mark && b >= mark;
  return a < mark || b >= mark;
}
