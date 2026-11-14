// The lobby: everyone has landed, a big countdown runs, and you meet your
// rivals. Shows while the round is in its 'lobby' phase, flashes "GO!" when
// it starts, then gets out of the way. Reads the state only.

import { BALANCE } from '../config/balance';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/state';
import { el } from './components';
import { teamCss } from './theme';

export interface Lobby {
  update(state: GameState, events: GameEvent[]): void;
}

export function createLobby(root: HTMLElement, state: GameState, localPlayerId: string): Lobby {
  const box = el('div', 'lobby');
  const title = el('div', 'lobby-title', 'Get ready!');
  const count = el('div', 'lobby-count');
  const goal = el('div', 'lobby-goal', `Grow the best colony in ${Math.round(state.round.length / 60)} minutes!`);
  const cards = el('div', 'lobby-cards');

  // One card per player: team color, name, and how the rivals like to play.
  for (const p of state.players) {
    const card = el('div', p.id === localPlayerId ? 'lobby-card is-me' : 'lobby-card');
    card.style.setProperty('--team', teamCss(p.colorIndex));
    const style = p.bot ? BALANCE.bots.personalities[p.bot.personality].style : 'That’s you!';
    card.append(el('span', 'lobby-card-dot'), el('div', 'lobby-card-name', p.name), el('div', 'lobby-card-style', style));
    cards.appendChild(card);
  }
  box.append(title, count, goal, cards);
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
        goal.textContent = '';
        cards.remove();
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
