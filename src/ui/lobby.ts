// The lobby: everyone has landed and a countdown runs. Shows while the round is in its 'lobby' phase, flashes "GO!" when
// it starts, then gets out of the way. Reads the state only.

import type { GameEvent } from '../core/events';
import type { GameState } from '../core/state';
import { el } from './components';

export interface Lobby {
  update(state: GameState, events: GameEvent[]): void;
}

export function createLobby(root: HTMLElement, state: GameState): Lobby {
  const box = el('div', 'lobby');
  const title = el('div', 'lobby-title', 'Get ready!');
  const count = el('div', 'lobby-count');
  box.append(title, count);
  root.appendChild(box);

  let lastCount = -1;
  let hideTimer = 0;
  if (state.round.phase !== 'lobby') box.classList.add('is-hidden');

  return {
    update(state, events) {
      if (events.some((e) => e.type === 'RoundStarted')) {
        // Flash "GO!" for a moment, then hide.
        box.classList.add('is-go');
        title.textContent = '';
        count.textContent = 'GO!';
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => box.classList.add('is-hidden'), 900);
        return;
      }
      // Started without us seeing the event (e.g. the dev ?skip helper): just hide.
      if (state.round.phase !== 'lobby') {
        if (!hideTimer) box.classList.add('is-hidden');
        return;
      }
      const n = Math.ceil(state.round.countdown);
      if (n === lastCount) return;
      lastCount = n;
      count.textContent = String(n);
      // Restart the "pop" animation on every new number.
      count.classList.remove('is-pop');
      void count.offsetWidth;
      count.classList.add('is-pop');
    },
  };
}
