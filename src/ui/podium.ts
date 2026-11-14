// The podium: shown when the round ends. Top 3 on the steps (2nd, 1st, 3rd),
// your place and how your score was made, the full list, one "What you
// learned" fact, and buttons to play again or go back to the menu.
// Built once from state.round.results (saved by the sim when time ran out).

import type { GameState, Standing } from '../core/state';
import { createIcon, el } from './components';
import { factForRound } from './roundFacts';
import { teamCss } from './theme';

export interface Podium {
  update(state: GameState): void;
}

const PLACE = ['1st', '2nd', '3rd', '4th'];

export function createPodium(
  root: HTMLElement,
  localPlayerId: string,
  onPlayAgain: () => void,
  onMenu: () => void,
): Podium {
  let shown = false;

  return {
    update(state) {
      const results = state.round.results;
      if (shown || state.round.phase !== 'ended' || !results) return;
      shown = true;
      root.appendChild(build(state, results));
    },
  };

  function build(state: GameState, results: Standing[]): HTMLElement {
    const box = el('div', 'podium');
    const card = el('div', 'podium-card');
    box.appendChild(card);

    card.appendChild(el('div', 'podium-title', 'Time’s up!'));

    // The steps, in 2nd / 1st / 3rd order so the winner stands in the middle.
    const steps = el('div', 'podium-steps');
    for (const place of [2, 1, 3]) {
      const s = results.find((r) => r.rank === place);
      if (!s) continue;
      const step = el('div', `podium-step is-place-${place}`);
      step.style.setProperty('--team', teamCss(s.colorIndex));
      if (s.playerId === localPlayerId) step.classList.add('is-me');
      const top = el('div', 'podium-step-top');
      if (place === 1) top.appendChild(createIcon('icon_trophy'));
      top.append(el('span', 'podium-step-dot'), el('div', 'podium-step-name', s.name), el('div', 'podium-step-score', String(s.score.total)));
      step.append(top, el('div', 'podium-step-block', PLACE[place - 1]));
      steps.appendChild(step);
    }
    card.appendChild(steps);

    // Your result, and where your points came from.
    const me = results.find((r) => r.playerId === localPlayerId);
    if (me) {
      const line = me.rank === 1 ? 'You won! 🎉' : `You came ${PLACE[me.rank - 1]}!`;
      card.appendChild(el('div', 'podium-me', line));
      const parts = el('div', 'podium-breakdown');
      const part = (label: string, value: number) => {
        const row = el('span', 'podium-part');
        row.append(el('b', '', String(value)), el('span', '', ` ${label}`));
        parts.appendChild(row);
      };
      part('healthy crew', me.score.crew);
      part('powered buildings', me.score.buildings);
      part('stored supplies', me.score.stored);
      part('mission stars', me.score.missions);
      card.appendChild(parts);
    }

    // Everyone, best first.
    const list = el('ol', 'podium-list');
    for (const s of results) {
      const row = el('li', s.playerId === localPlayerId ? 'is-me' : '');
      const dot = el('span', 'scoreboard-dot');
      dot.style.background = teamCss(s.colorIndex);
      row.append(el('span', 'scoreboard-rank', String(s.rank)), dot, el('span', 'scoreboard-name', s.name), el('span', 'scoreboard-score', String(s.score.total)));
      list.appendChild(row);
    }
    card.appendChild(list);

    // One real NASA fact to take away.
    const fact = factForRound(state.seed);
    const factBox = el('div', 'podium-fact');
    const head = el('div', 'podium-fact-head');
    head.append(createIcon('icon_fact'), el('span', '', ' What you learned'));
    const link = el('a', 'podium-fact-source', `Source: ${fact.source}`);
    link.href = fact.url;
    link.target = '_blank';
    link.rel = 'noopener';
    factBox.append(head, el('div', 'podium-fact-text', fact.text), link);
    card.appendChild(factBox);

    // Buttons (in the card's flow, not pinned to a screen corner).
    const buttons = el('div', 'podium-buttons');
    const again = el('button', 'button podium-button is-main', 'Play again');
    again.type = 'button';
    again.addEventListener('click', onPlayAgain);
    const menu = el('button', 'button podium-button', 'Menu');
    menu.type = 'button';
    menu.addEventListener('click', onMenu);
    buttons.append(again, menu);
    card.appendChild(buttons);
    window.setTimeout(() => again.focus(), 0);

    return box;
  }
}
