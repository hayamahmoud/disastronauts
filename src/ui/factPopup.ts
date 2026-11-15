// "Did you know?" pop-ups: a real NASA fact at the moment it matters
// (a flare starts → how flares are measured; you build a greenhouse →
// astronauts grow lettuce in space…). Each trigger shows at most once per
// round, and pop-ups are spaced out so they never pile up. Facts for a mini
// task you just did skip the spacing (but still wait for an open one to close),
// so each task really teaches its fact.
// It only READS game events and state.

import { BALANCE, type TaskKind } from '../config/balance';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/state';
import { findPlayer } from '../core/state';
import { createIcon, el } from './components';
import { factsFor, type Fact, type FactTrigger } from './facts';
import { setTermText } from './glossary';

export interface FactPopup {
  update(state: GameState, events: GameEvent[]): void;
}

// A trigger that had to wait longer than this (game seconds) is dropped: it's old news.
const MAX_WAIT = 15;

const TASK_TRIGGER: Record<TaskKind, FactTrigger> = { ice: 'taskIce', solar: 'taskSolar', regolith: 'taskRegolith' };
const SKIPS_GAP = new Set<FactTrigger>(Object.values(TASK_TRIGGER));

export function createFactPopup(root: HTMLElement, localPlayerId: string): FactPopup {
  const box = el('aside', 'fact-popup is-hidden');
  box.setAttribute('aria-live', 'polite');
  const head = el('div', 'fact-popup-head');
  head.append(createIcon('icon_fact'), el('span', '', ' Real NASA fact!'));
  const close = el('button', 'fact-popup-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close fact');
  const text = el('div', 'fact-popup-text');
  const link = el('a', 'fact-popup-source');
  link.target = '_blank';
  link.rel = 'noopener';
  box.append(close, head, text, link);
  root.appendChild(box);

  const used = new Set<FactTrigger>(); // triggers already shown this round
  let waiting: { trigger: FactTrigger; at: number } | null = null;
  let shownAt = -Infinity; // game time the current/last pop-up appeared
  let open = false;
  let lastUpdate = 0;
  close.addEventListener('click', hide);

  function hide() {
    open = false;
    box.classList.add('is-hidden');
  }

  function show(fact: Fact, time: number) {
    setTermText(text, fact.text); // glossary words get a bubble
    link.textContent = `Source: ${fact.source}`;
    link.href = fact.url;
    box.classList.remove('is-hidden');
    open = true;
    shownAt = time;
  }

  // Which trigger (if any) this event is for the local player.
  function triggerFor(e: GameEvent, state: GameState): FactTrigger | null {
    const me = findPlayer(state, localPlayerId);
    const myBase = me?.baseId;
    switch (e.type) {
      case 'RoundStarted':
        return 'roundStart';
      case 'DisasterStarted':
        return e.kind; // 'solarFlare' | 'dustStorm' | 'coldNight' are trigger names too
      case 'SupplyDropCalled':
        return e.playerId === localPlayerId ? 'supplyDrop' : null;
      case 'BuildingBuilt':
        return e.baseId === myBase && e.kind === 'greenhouse' ? 'greenhouse' : null;
      case 'CrewSick':
        return e.baseId === myBase ? 'crewSick' : null;
      case 'MissionStarted':
        return e.playerId === localPlayerId && e.kind === 'bringRegolith' ? 'shieldMission' : null;
      case 'TaskCompleted':
        return e.playerId === localPlayerId ? TASK_TRIGGER[e.kind] : null;
      default:
        return null;
    }
  }

  return {
    update(state, events) {
      const F = BALANCE.facts;
      const elapsed = Math.max(0, state.time - lastUpdate);
      lastUpdate = state.time;
      if (state.round.phase === 'ended') {
        if (open) hide();
        return;
      }
      for (const e of events) {
        const t = triggerFor(e, state);
        if (t && !used.has(t) && factsFor(t).length > 0) waiting = { trigger: t, at: state.time };
      }
      // Gameplay messages and the tutorial take priority. Pause the fact's
      // reading time and pending queue until that notification has cleared.
      if (root.querySelector('.message:not(.is-hidden), .tutorial:not(.is-hidden)')) {
        if (open) shownAt += elapsed;
        if (waiting) waiting.at += elapsed;
        return;
      }
      if (open && state.time - shownAt >= F.popupSeconds) hide();
      if (!waiting) return;
      if (state.time - waiting.at > MAX_WAIT) {
        waiting = null;
        return;
      }
      if (open) return;
      if (!SKIPS_GAP.has(waiting.trigger) && state.time - shownAt < F.minGapSeconds) return;
      // Pick one of the trigger's facts; the seed keeps it the same for a replayed map.
      const list = factsFor(waiting.trigger);
      used.add(waiting.trigger);
      show(list[state.seed % list.length], state.time);
      waiting = null;
    },
  };
}
