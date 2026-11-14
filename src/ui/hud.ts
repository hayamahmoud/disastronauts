// The in-game HUD: resource bars, crew health, cargo, the sol clock and the
// power priority button. It only READS the game state; the one thing a player
// can do here (switch power priority) goes back through a callback as input.

import type { UiIconId } from '../assets/manifest';
import type { PowerPriority } from '../config/balance';
import { BALANCE } from '../config/balance';
import { crewDamagePerSol } from '../core/crew';
import { isNight, solNumber } from '../core/dayNight';
import type { GameEvent } from '../core/events';
import { cargoCapacity } from '../core/growth';
import { shieldCoverage, shieldNeeded, shieldTotal, storageCapacity } from '../core/resources';
import type { BaseState, GameState } from '../core/state';
import { findBase, findPlayer } from '../core/state';
import { createBadge, createBar, createButton, createIcon, createMessage, createPanel, createStat, el } from './components';

export interface Hud {
  update(state: GameState, events: GameEvent[]): void;
}

const BUILDING_NAMES: Record<string, string> = {
  habitat: 'Habitat',
  solar_panel: 'Solar panel',
  greenhouse: 'Greenhouse',
  shield_generator: 'Shield generator',
};

export function createHud(
  root: HTMLElement,
  localPlayerId: string,
  terrainIsPlaceholder: boolean,
  onTogglePriority: () => void,
): Hud {
  // --- Top left: the 3 core resources, then crew/cargo below ---
  const column = el('div', 'hud-column');
  root.appendChild(column);
  const resources = createPanel(column);
  const power = createBar(resources, 'icon_power', 'Power: runs everything. Solar panels make it in daylight.');
  const life = createBar(resources, 'icon_life_support', 'Life Support: air, water and food. Every crew member uses it.');
  const shield = createBar(resources, 'icon_shielding', 'Shielding: protects your crew from radiation. Bigger bases need more.');

  // --- Below it: crew, cargo, buildings ---
  const crewPanel = createPanel(column);
  const health = createBar(crewPanel, 'icon_health', 'Crew health');
  const crew = createStat(crewPanel, 'icon_crew', 'Crew at your base');
  const cargo = createStat(crewPanel, 'icon_cargo', 'Cargo carried by your rover');
  const buildings = createStat(crewPanel, 'icon_buildings', 'Buildings at your base');
  const tip = el('div', 'hud-tip');
  crewPanel.appendChild(tip);

  // --- Top right: which sol it is, day or night ---
  const clock = createPanel(root);
  clock.classList.add('hud-clock');

  // --- Bottom right: which building gets Power first ---
  const priorityButton = createButton(root, onTogglePriority);
  priorityButton.classList.add('hud-priority');
  priorityButton.title = 'When Power runs low, this building stays on and the other switches off. (Key: P)';

  if (terrainIsPlaceholder) {
    createBadge(root, 'Placeholder map: real Mars terrain coming soon', { right: '12px', bottom: '12px' });
  }
  createBadge(root, 'Move: WASD / arrows · Camera: C · Power: P', { left: '12px', bottom: '12px' });

  const message = createMessage(root);
  message.show('Grab stuff with your magnet, then drive home!', 5);

  // Only rebuild the clock/button content when it actually changes.
  let lastClock = '';
  let lastPriority: PowerPriority | null = null;
  let lastTip = '';

  return {
    update(state, events) {
      const me = findPlayer(state, localPlayerId);
      if (!me) return;
      const base = findBase(state, me.baseId);
      const cap = cargoCapacity(state, me);
      cargo.set(`${me.cargoCount} / ${cap}`, me.cargoCount >= cap);

      if (base) {
        updateBars(base);
        buildings.set(String(base.buildings.length));
        crew.set(base.sick > 0 ? `${base.crew} (${base.sick} sick)` : String(base.crew), base.sick > 0);
        const t = tipFor(base);
        if ((t?.text ?? '') !== lastTip) {
          lastTip = t?.text ?? '';
          tip.replaceChildren(...(t ? [createIcon(t.icon), el('span', '', ' ' + t.text)] : []));
        }

        if (base.powerPriority !== lastPriority) {
          lastPriority = base.powerPriority;
          const icon = lastPriority === 'greenhouse' ? 'icon_greenhouse' : 'icon_shield_generator';
          const name = lastPriority === 'greenhouse' ? 'Greenhouse' : 'Shield';
          priorityButton.replaceChildren(el('span', 'button-label', 'Power first:'), createIcon(icon), el('span', '', ` ${name}`));
        }
      }

      const night = isNight(state.time);
      const clockKey = `${night}-${solNumber(state.time)}`;
      if (clockKey !== lastClock) {
        lastClock = clockKey;
        clock.replaceChildren(createIcon(night ? 'icon_night' : 'icon_day'), el('span', '', ` Sol ${solNumber(state.time)}`));
        clock.title = 'A sol is one day on Mars: 24 hours 39 minutes. Here it lasts one minute.';
      }

      // One short sentence at a time, only about the local player.
      for (const e of events) {
        const mine = base && 'baseId' in e && e.baseId === base.id;
        if (e.type === 'CargoFull' && e.playerId === localPlayerId) {
          message.show('Cargo full! Drive back to your base.');
        } else if (e.type === 'BuildingBuilt' && mine) {
          message.show(`New ${BUILDING_NAMES[e.kind] ?? 'building'}!`, 2);
        } else if (e.type === 'CrewAdded' && mine) {
          message.show(`+${e.added} crew joined your base!`, 2.5);
        } else if (e.type === 'Sunset') {
          message.show('Night is coming: no solar power until sunrise!', 3);
        } else if (e.type === 'Sunrise') {
          message.show(`Sol ${e.sol} begins. The sun is back!`, 2.5);
        } else if (e.type === 'PowerOut' && mine) {
          message.show('Low Power! Some buildings switched off.', 3);
        } else if (e.type === 'PowerRestored' && mine) {
          message.show('Power is back on!', 2);
        } else if (e.type === 'LifeSupportEmpty' && mine) {
          message.show('Out of Life Support! Grab ice, fast!', 3.5);
        } else if (e.type === 'CrewSick' && mine) {
          message.show('Your crew is getting sick!', 3);
        } else if (e.type === 'CrewLost' && mine) {
          message.show(e.crewLeft > 0 ? 'Oh no! You lost a crew member.' : 'Your whole crew is gone!', 4);
        }
      }
    },
  };

  function updateBars(base: BaseState) {
    const pCap = storageCapacity(base, 'power');
    power.set(base.stored.power / pCap, `${Math.floor(base.stored.power)}/${pCap}`, base.netPerSol.power);
    const lCap = storageCapacity(base, 'lifeSupport');
    life.set(base.stored.lifeSupport / lCap, `${Math.floor(base.stored.lifeSupport)}/${lCap}`, base.netPerSol.lifeSupport);

    // Shielding shows coverage: how much of what the base needs is there.
    const coverage = shieldCoverage(base);
    // Any gap in shielding lets radiation in, so it turns yellow as soon as it's below 100%.
    shield.set(coverage, `${Math.round(coverage * 100)}%`, 0, coverage >= 1 ? 'good' : coverage >= 0.6 ? 'warn' : 'bad');
    shield.setTitle(`Shielding: ${Math.floor(shieldTotal(base))} of ${shieldNeeded(base)} needed`);

    const h = base.health / BALANCE.crew.maxHealth;
    health.set(h, `${Math.ceil(base.health)}`, 0);
  }
}

// One short hint about the biggest thing hurting the crew right now.
function tipFor(base: BaseState): { icon: UiIconId; text: string } | null {
  if (base.crew <= 0) return null;
  const d = crewDamagePerSol(base);
  const worst = Math.max(d.radiation, d.noLifeSupport, d.noPower);
  if (worst <= 0) return null;
  if (worst === d.noLifeSupport) return { icon: 'icon_ice', text: 'Need ice for Life Support!' };
  if (worst === d.noPower) return { icon: 'icon_solar', text: 'Need solar for Power!' };
  return { icon: 'icon_regolith', text: 'Need regolith for Shielding!' };
}
