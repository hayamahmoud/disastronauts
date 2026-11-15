// Combo counter: grab pickups quickly one after another to build a combo.
// Plain logic (no DOM), used by the HUD (the "Combo ×5!" badge) and by the
// sound (each step plays a slightly higher note). Feedback only: combos
// don't change the game.

import { BALANCE } from '../config/balance';

export interface Combo {
  // A pickup was grabbed at `time` (seconds). Returns the combo count (1 = no combo yet).
  hit(time: number): number;
  // The combo still going at `time` (0 once the window has passed).
  current(time: number): number;
}

export function createCombo(window: number = BALANCE.juice.comboWindow): Combo {
  let count = 0;
  let last = -Infinity;
  return {
    hit(time) {
      count = time - last <= window ? count + 1 : 1;
      last = time;
      return count;
    },
    current(time) {
      return time - last <= window ? count : 0;
    },
  };
}
