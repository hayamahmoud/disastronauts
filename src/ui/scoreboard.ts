// Right side, under the mini-map: the round clock and the live Colony Score
// of every player, best first. Reads the state only.

import { BALANCE } from '../config/balance';
import { roundTimeLeft } from '../core/round';
import { standings } from '../core/scoring';
import type { GameState } from '../core/state';
import { el } from './components';
import { teamCss } from './theme';

export interface Scoreboard {
  update(state: GameState): void;
}

export function createScoreboard(root: HTMLElement, localPlayerId: string): Scoreboard {
  const box = el('details', 'scoreboard');
  box.setAttribute('aria-description',
    'Colony Score: 100 per healthy crew, 50 per building with Power, 1 per stored resource, 25 per mission star. Highest score when time runs out wins!');
  const clock = el('summary', 'scoreboard-clock');
  const rows = el('ol', 'scoreboard-rows');
  box.append(clock, rows);
  root.appendChild(box);

  let lastClock = '';
  let lastRows = '';

  return {
    update(state) {
      // Clock: m:ss, and it turns red for the last 30 seconds.
      const left = roundTimeLeft(state);
      const text = Number.isFinite(left) ? formatTime(left) : '∞';
      const hurry = left <= BALANCE.round.endWarningSeconds;
      const clockKey = `${text}|${hurry}`;
      if (clockKey !== lastClock) {
        lastClock = clockKey;
        clock.classList.toggle('is-hurry', hurry);
        clock.replaceChildren(el('span', 'scoreboard-heading', 'Standings'), el('span', 'scoreboard-time', text));
      }

      const list = standings(state);
      const key = list.map((s) => `${s.playerId}:${s.score.total}`).join('|');
      if (key === lastRows) return;
      lastRows = key;
      rows.replaceChildren(
        ...list.map((s) => {
          const row = el('li', s.playerId === localPlayerId ? 'is-me' : '');
          const dot = el('span', 'scoreboard-dot');
          dot.style.background = teamCss(s.colorIndex);
          row.append(el('span', 'scoreboard-rank', String(s.rank)), dot, el('span', 'scoreboard-name', s.name), el('span', 'scoreboard-score', String(s.score.total)));
          return row;
        }),
      );
    },
  };
}

export function formatTime(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
