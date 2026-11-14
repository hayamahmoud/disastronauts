// The in-game HUD ("HUD 3" from the D1 design checkpoint):
//   top middle:   chips for Power, Air & Food, Shield, Health and the backpack
//   under them:   one helmet per crew member (sick ones go green and wobble)
//   top right:    the Sol pill with a day/night track (the mini-map sits under it)
//   bottom left:  keyboard keys; bottom right: the Power-first button
// It only READS the game state; the one thing a player can do here (switch
// power priority) goes back through a callback as input.

import type { UiIconId } from '../assets/manifest';
import type { PowerPriority } from '../config/balance';
import { BALANCE } from '../config/balance';
import { crewDamagePerSol } from '../core/crew';
import { isNight, solNumber, timeOfSol } from '../core/dayNight';
import type { GameEvent } from '../core/events';
import { cargoCapacity } from '../core/growth';
import { shieldCoverage, shieldNeeded, shieldTotal, storageCapacity } from '../core/resources';
import type { BaseState, GameState } from '../core/state';
import { findBase, findPlayer } from '../core/state';
import { createBadge, createButton, createChip, createIcon, createMessage, el, levelFor } from './components';

export interface Hud {
  update(state: GameState, events: GameEvent[]): void;
}

const BUILDING_NAMES: Record<string, string> = {
  habitat: 'Habitat',
  solar_panel: 'Solar panel',
  greenhouse: 'Greenhouse',
  shield_generator: 'Shield generator',
};

// Hover text for each chip, in kid-friendly words.
const EXPLAIN = {
  power: 'Power: made by solar panels. Every building needs it. No Power = buildings switch off and your crew get hurt.',
  life: 'Air & Food: your crew use it up every sol (day). Greenhouses make more. If it runs out, your crew get hurt.',
  shield: 'Shield: protects your crew from space radiation. Under 100% = your crew slowly get hurt. More crew and buildings need more shield.',
  health: 'Health: how well your crew are. Goes down when Power, Air or Shield run short, heals when all are OK. Too low = crew get sick.',
  cargo: 'Backpack: holds the supplies you pick up. Bring them home to grow your base!',
};

export function createHud(
  root: HTMLElement,
  localPlayerId: string,
  terrainIsPlaceholder: boolean,
  onTogglePriority: () => void,
): Hud {
  // --- Top left: the game's name ---
  root.appendChild(el('div', 'hud-logo', 'Disastronauts'));

  // --- Top middle: one chip per resource, then the backpack ---
  const chips = el('div', 'hud-chips');
  root.appendChild(chips);
  const power = createChip(chips, 'power', 'icon_power', EXPLAIN.power);
  const life = createChip(chips, 'life', 'icon_life_support', EXPLAIN.life);
  const shield = createChip(chips, 'shield', 'icon_shielding', EXPLAIN.shield);
  const health = createChip(chips, 'health', 'icon_health', EXPLAIN.health);
  const cargo = createChip(chips, 'cargo', 'icon_cargo', EXPLAIN.cargo);

  // --- Under the chips: the crew, then a hint about what's hurting them ---
  const crew = el('div', 'hud-crew');
  crew.title = 'Your crew. Green helmets are sick and can’t work.';
  root.appendChild(crew);
  const tip = el('div', 'hud-tip');
  root.appendChild(tip);

  // --- Top right: which sol it is, and a dot moving across day and night ---
  const sol = el('div', 'hud-sol');
  sol.title = 'A sol is one day on Mars: 24 hours 39 minutes. Here it lasts one minute.';
  const solIcon = el('span', 'hud-sol-icon');
  const solText = el('span');
  const solTrack = el('span', 'hud-sol-track');
  const solDot = el('span', 'hud-sol-dot');
  solTrack.appendChild(solDot);
  sol.append(solIcon, solText, solTrack);
  root.appendChild(sol);

  // --- Bottom left: the keys, drawn as little keyboard keys ---
  const keys = el('div', 'hud-keys');
  const keyGroup = (caps: string[], label: string) => {
    const g = el('span', 'hud-key-group');
    for (const c of caps) g.appendChild(el('kbd', '', c));
    g.append(` ${label}`);
    keys.appendChild(g);
  };
  keyGroup(['W', 'S'], 'Walk');
  keyGroup(['A', 'D'], 'Turn');
  keyGroup(['C'], 'View');
  keyGroup([], '🖱️ Drag');
  keyGroup(['P'], 'Power');
  root.appendChild(keys);

  // --- Bottom right: which building gets Power first ---
  const priorityButton = createButton(root, onTogglePriority);
  priorityButton.classList.add('hud-priority');
  priorityButton.title = 'When Power runs low, this building stays on and the other switches off. (Key: P)';

  if (terrainIsPlaceholder) {
    createBadge(root, 'Placeholder map: real Mars terrain coming soon', { right: '14px', bottom: '72px' });
  }

  const message = createMessage(root);
  // Same icons as the badges over pickups and the HUD chips.
  message.show('Grab ⚡ 🫁 🛡️ to fill your bars, 🔨 to build. Then walk home!', 6);

  // Only rebuild things when they actually change.
  let lastSol = '';
  let lastCrew = '';
  let lastPriority: PowerPriority | null = null;
  let lastTip = '';

  return {
    update(state, events) {
      const me = findPlayer(state, localPlayerId);
      if (!me) return;
      const base = findBase(state, me.baseId);
      const cap = cargoCapacity(state, me);
      const full = me.cargoCount >= cap;
      cargo.set(me.cargoCount / cap, full ? 'FULL' : `${me.cargoCount}/${cap}`, 0, full ? 'bad' : 'good');

      if (base) {
        updateChips(base);
        updateCrew(base);
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
      const solKey = `${night}-${solNumber(state.time)}`;
      if (solKey !== lastSol) {
        lastSol = solKey;
        solIcon.replaceChildren(createIcon(night ? 'icon_night' : 'icon_day'));
        solText.textContent = `Sol ${solNumber(state.time)}`;
      }
      solDot.style.left = `${(timeOfSol(state.time) * 100).toFixed(1)}%`;

      // One short sentence at a time, only about the local player.
      for (const e of events) {
        const mine = base && 'baseId' in e && e.baseId === base.id;
        if (e.type === 'CargoFull' && e.playerId === localPlayerId) {
          message.show('Backpack full! Walk back to your base.');
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

  function updateChips(base: BaseState) {
    const pCap = storageCapacity(base, 'power');
    power.set(base.stored.power / pCap, String(Math.floor(base.stored.power)), base.netPerSol.power);
    const lCap = storageCapacity(base, 'lifeSupport');
    life.set(base.stored.lifeSupport / lCap, String(Math.floor(base.stored.lifeSupport)), base.netPerSol.lifeSupport);

    // Shielding shows coverage: how much of what the base needs is there.
    // Any gap lets radiation in, so it turns yellow as soon as it's below 100%.
    const coverage = shieldCoverage(base);
    shield.set(Math.min(1, coverage), `${Math.round(coverage * 100)}%`, 0, coverage >= 1 ? 'good' : coverage >= 0.6 ? 'warn' : 'bad');
    shield.setTitle(`${EXPLAIN.shield} (You have ${Math.floor(shieldTotal(base))} of ${shieldNeeded(base)} needed.)`);

    const h = base.health / BALANCE.crew.maxHealth;
    health.set(h, String(Math.ceil(base.health)), 0, levelFor(h));
  }

  // One helmet per crew member; the sick ones are the last few.
  function updateCrew(base: BaseState) {
    const key = `${base.crew}/${base.sick}`;
    if (key === lastCrew) return;
    lastCrew = key;
    const healthy = base.crew - base.sick;
    const helmets = Array.from({ length: base.crew }, (_, i) => {
      const helmet = el('i', i >= healthy ? 'helmet sick' : 'helmet');
      helmet.appendChild(createIcon('icon_crew'));
      return helmet;
    });
    const label = el('span', 'hud-crew-label', base.sick > 0 ? `${base.sick} sick!` : `Crew ${base.crew}`);
    crew.classList.toggle('has-sick', base.sick > 0);
    crew.replaceChildren(...helmets, label);
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
