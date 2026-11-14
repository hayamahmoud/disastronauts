// The in-game HUD ("HUD 3" from the D1 design checkpoint):
//   top middle:   chips for Power, Air & Food, Shield, Health and the backpack
//   under them:   one helmet per crew member (sick ones go green and wobble)
//   top right:    the Sol pill with a day/night track (the mini-map sits under it)
//   bottom left:  keyboard keys; bottom right: Call Earth + the Power-first button
//   left:         the mission card (one goal at a time, with stars)
//   middle:       the disaster banner (warning countdown, then what's happening)
// It only READS the game state; things a player can do here (switch power
// priority, call Earth) go back through callbacks as input.

import { PICKUP_ICON, type UiIconId } from '../assets/manifest';
import type { DisasterKind, FlareClass, PowerPriority } from '../config/balance';
import { BALANCE } from '../config/balance';
import { crewDamagePerSol, flareCoverage, isOwnerOutside } from '../core/crew';
import { isNight, solNumber, timeOfSol } from '../core/dayNight';
import { flareShieldNeed, secondsUntilNextDisaster } from '../core/disasters';
import type { GameEvent } from '../core/events';
import { cargoCapacity } from '../core/growth';
import { MISSION_PICKUP } from '../core/missions';
import { shieldCoverage, shieldNeeded, shieldTotal, storageCapacity } from '../core/resources';
import type { BaseState, GameState, MissionState, PlayerState } from '../core/state';
import { distance, findBase, findPlayer } from '../core/state';
import { supplyDropDelay } from '../core/supplyDrop';
import { canAbsorb } from '../core/wrecks';
import { createBadge, createButton, createChip, createIcon, createMessage, el, levelFor } from './components';

// Disaster names and one-line "what it does", in kid words.
const DISASTER: Record<DisasterKind, { icon: UiIconId; name: string; does: string; prepare: string }> = {
  dustStorm: {
    icon: 'icon_dust_storm',
    name: 'Dust storm',
    does: 'Dust blocks the sun: solar panels barely work. The wind slows you down!',
    prepare: 'Fill up on Power and head home!',
  },
  solarFlare: {
    icon: 'icon_solar_flare',
    name: 'Solar flare',
    does: 'Radiation from the Sun! Your shield needs extra soil. Stay home!',
    prepare: 'Bring soil home for your Shield!',
  },
  coldNight: {
    icon: 'icon_cold_night',
    name: 'Cold night',
    does: 'Freezing! Heaters burn lots of Power until sunrise.',
    prepare: 'Fill up on Power before sunset!',
  },
};

// Flares are graded by strength: C (weak), M (medium), X (strongest).
const FLARE_NAME: Record<FlareClass, string> = { C: 'C-class (weak)', M: 'M-class', X: 'X-class (strong!)' };

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
  onCallEarth: () => void,
): Hud {
  // --- Top left: the game's name ---
  // Full-screen tint during a disaster (added first, so it sits under everything else).
  const overlay = el('div', 'hud-overlay');
  root.appendChild(overlay);

  root.appendChild(el('div', 'hud-logo', 'Disastronauts'));

  // --- Left: the mission card ---
  const mission = el('div', 'hud-mission is-empty');
  mission.title = 'Your mission. Finish it fast for 3 stars!';
  const missionHead = el('div', 'hud-mission-head');
  const missionText = el('div', 'hud-mission-text');
  const missionProgress = el('div', 'hud-mission-progress');
  const missionTime = el('div', 'hud-mission-time');
  const missionTimeFill = el('span');
  missionTime.appendChild(missionTimeFill);
  const missionStars = el('div', 'hud-mission-stars');
  mission.append(missionHead, missionText, missionProgress, missionTime, missionStars);
  root.appendChild(mission);

  // --- Middle: disaster banner (warning countdown, then "happening now") ---
  const alert = el('div', 'hud-alert is-hidden');
  const alertTitle = el('div', 'hud-alert-title');
  const alertText = el('div', 'hud-alert-text');
  alert.append(alertTitle, alertText);
  root.appendChild(alert);

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
  keyGroup(['Space'], 'Call Earth');
  root.appendChild(keys);

  // --- Bottom right, above Power-first: call Earth for a supply drop ---
  const callButton = createButton(root, onCallEarth);
  callButton.classList.add('hud-call');

  // --- Bottom right: which building gets Power first ---
  const priorityButton = createButton(root, onTogglePriority);
  priorityButton.classList.add('hud-priority');
  priorityButton.title = 'When Power runs low, this building stays on and the other switches off. (Key: P)';

  if (terrainIsPlaceholder) {
    createBadge(root, 'Placeholder map: real Mars terrain coming soon', { right: '14px', bottom: '130px' });
  }

  const message = createMessage(root);
  // Same icons as the badges over pickups and the HUD chips.
  const OPENING = 'Grab ⚡ 🫁 🛡️ to fill your bars, 🔨 to build. Then walk home!';

  // Only rebuild things when they actually change.
  let lastSol = '';
  let lastCrew = '';
  let lastPriority: PowerPriority | null = null;
  let lastTip = '';
  let lastMission = '';
  let lastAlert = '';
  let lastCall = '';
  let lastOverlay = '';
  let shownOpening = false;

  return {
    update(state, events) {
      const me = findPlayer(state, localPlayerId);
      if (!me) return;
      // Untimed games have no lobby, so show the opening tip on the first frame.
      if (!shownOpening && state.round.phase === 'playing') {
        shownOpening = true;
        message.show(OPENING, 6);
      }
      const base = findBase(state, me.baseId);
      const cap = cargoCapacity(state, me);
      const full = me.cargoCount >= cap;
      cargo.set(me.cargoCount / cap, full ? 'FULL' : `${me.cargoCount}/${cap}`, 0, full ? 'bad' : 'good');

      updateMission(me);
      updateAlert(state);
      updateCallButton(me, base, state);

      if (base) {
        updateChips(state, base);
        updateCrew(base);
        const t = tipFor(state, me, base);
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
        } else if (e.type === 'DisasterEnded') {
          message.show(`The ${DISASTER[e.kind].name.toLowerCase()} is over. Phew!`, 3);
        } else if (e.type === 'MissionEnded' && e.playerId === localPlayerId) {
          const stars = e.stars > 0 ? '⭐'.repeat(e.stars) : 'no stars';
          message.show(e.completed ? `Mission complete! ${stars}` : `Out of time! ${stars}`, 3.5);
        } else if (e.type === 'BaseWrecked' && e.playerId === localPlayerId) {
          message.show('💥 Your base was wrecked! A new lander is on its way…', 5);
        } else if (e.type === 'BaseWrecked') {
          message.show('💥 A base nearby was wrecked! Grab its supplies.', 3);
        } else if (e.type === 'BaseRelaunched' && e.playerId === localPlayerId) {
          message.show('New lander touched down! Start again here.', 4);
        } else if (e.type === 'WreckAbsorbed' && e.playerId === localPlayerId) {
          message.show(`You rebuilt a wreck: +${e.buildPoints} 🔨!`, 3);
        } else if (e.type === 'SupplyDropCalled' && e.playerId === localPlayerId) {
          message.show(`📡 Message sent! Radio takes ${e.lightMinutes.toFixed(1)} minutes to reach Earth…`, 4);
        } else if (e.type === 'SupplyDropDenied' && e.playerId === localPlayerId) {
          const why = { cooldown: 'Earth is still packing the next one.', noPower: `The radio needs ${BALANCE.supplyDrop.powerCost} ⚡.`, noBase: 'You need a base first.' };
          message.show(why[e.reason], 2.5);
        } else if (e.type === 'SupplyDropLanded' && e.playerId === localPlayerId) {
          message.show('📦 Your supply drop landed near your base!', 3);
        } else if (e.type === 'RoundEndingSoon') {
          message.show(`⏱️ ${e.secondsLeft} seconds left! Make every point count!`, 4);
        }
      }
    },
  };

  function updateChips(state: GameState, base: BaseState) {
    const pCap = storageCapacity(base, 'power');
    power.set(base.stored.power / pCap, String(Math.floor(base.stored.power)), base.netPerSol.power);
    const lCap = storageCapacity(base, 'lifeSupport');
    life.set(base.stored.lifeSupport / lCap, String(Math.floor(base.stored.lifeSupport)), base.netPerSol.lifeSupport);

    // Shielding shows coverage: how much of what the base needs is there.
    // Any gap lets radiation in, so it turns yellow as soon as it's below 100%.
    // When a flare is coming or happening, it shows coverage against the
    // flare's (bigger) need, so you can see your shield isn't enough yet.
    const flareClass = flareShowing(state);
    const need = shieldNeeded(base) * flareShieldNeed(flareClass);
    const coverage = flareClass ? flareCoverage(base, flareClass) : shieldCoverage(base);
    shield.set(Math.min(1, coverage), `${Math.round(coverage * 100)}%`, 0, coverage >= 1 ? 'good' : coverage >= 0.6 ? 'warn' : 'bad');
    const flareNote = flareClass ? ' A solar flare needs extra!' : '';
    shield.setTitle(`${EXPLAIN.shield} (You have ${Math.floor(shieldTotal(base))} of ${Math.ceil(need)} needed.${flareNote})`);

    // Pulse the chips a disaster is hitting right now, with a tiny badge.
    const kind = state.disaster?.kind;
    const solarCut = Math.round((1 - BALANCE.disasters.dustStorm.solarFactor) * 100);
    power.setHit(kind === 'dustStorm' ? `-${solarCut}% ☀️` : kind === 'coldNight' ? 'Heaters!' : null);
    shield.setHit(flareClass ? `need ×${flareShieldNeed(flareClass)}` : null);
    health.setHit(kind === 'solarFlare' && crewDamagePerSol(state, base).flare > 0 ? 'Radiation!' : null);

    const h = base.health / BALANCE.crew.maxHealth;
    health.set(h, String(Math.ceil(base.health)), 0, levelFor(h));
  }

  // The flare class to measure the shield against: the flare happening now,
  // or the one the warning banner is counting down to.
  function flareShowing(state: GameState): FlareClass | null {
    if (state.disaster) return state.disaster.flareClass;
    const next = state.nextDisaster;
    return next && next.warned ? next.flareClass : null;
  }

  // The mission card: what to do, how far along, time left and total stars.
  function updateMission(me: PlayerState) {
    const m = me.mission;
    const key = m ? `${m.kind}|${m.target}|${m.progress}|${m.disaster}|${me.stars}` : `none|${me.stars}`;
    if (m) missionTimeFill.style.width = `${Math.max(0, (m.timeLeft / m.duration) * 100).toFixed(1)}%`;
    if (key === lastMission) return;
    lastMission = key;
    mission.classList.toggle('is-empty', !m);
    missionStars.replaceChildren(createIcon('icon_star'), el('span', '', ` ${me.stars} ${me.stars === 1 ? 'star' : 'stars'}`));
    if (!m) {
      missionHead.replaceChildren(createIcon('icon_mission'), el('span', '', ' Mission'));
      missionText.textContent = 'New mission coming…';
      missionProgress.textContent = '';
      return;
    }
    const icon: UiIconId = m.disaster ? DISASTER[m.disaster].icon : 'icon_mission';
    missionHead.replaceChildren(createIcon(icon), el('span', '', m.disaster ? ' Get ready!' : ' Mission'));
    missionText.textContent = missionGoal(m);
    const goalIcon: UiIconId = m.kind === 'storePower' ? 'icon_power' : PICKUP_ICON[MISSION_PICKUP[m.kind]];
    missionProgress.replaceChildren(createIcon(goalIcon), el('span', '', ` ${Math.min(m.progress, m.target)} / ${m.target}`));
  }

  // Warning banner with a countdown, then "happening now" with time left.
  function updateAlert(state: GameState) {
    let key = '';
    let title: [UiIconId, string] | null = null;
    let text = '';
    const now = state.disaster;
    const next = state.nextDisaster;
    if (now) {
      const d = DISASTER[now.kind];
      const left = Math.ceil(now.endsAt - state.time);
      const flare = now.flareClass ? ` ${FLARE_NAME[now.flareClass]}` : '';
      title = [d.icon, `${d.name}!${flare} ${left}s`];
      text = d.does;
      key = `now|${title[1]}`;
    } else if (next && next.warned) {
      const d = DISASTER[next.kind];
      const left = Math.max(0, Math.ceil(secondsUntilNextDisaster(state)));
      title = ['icon_warning', `${d.name} in ${left}s!`];
      text = d.prepare;
      key = `warn|${title[1]}`;
    }
    const overlayKind = now?.kind ?? '';
    if (overlayKind !== lastOverlay) {
      lastOverlay = overlayKind;
      overlay.dataset.kind = overlayKind;
    }
    if (key === lastAlert) return;
    lastAlert = key;
    alert.classList.toggle('is-hidden', !title);
    alert.classList.toggle('is-active', !!now);
    if (!title) return;
    alertTitle.replaceChildren(createIcon(title[0]), el('span', '', ' ' + title[1]));
    alertText.textContent = text;
  }

  // "📡 Call Earth (20⚡)", or how long until the drop arrives / you can call again.
  function updateCallButton(me: PlayerState, base: BaseState | undefined, state: GameState) {
    const S = BALANCE.supplyDrop;
    const drop = state.supplyDrops.find((d) => d.playerId === me.id);
    let label: string;
    let ready = false;
    if (drop) label = `Signal travelling… ${Math.ceil(drop.landsAt - state.time)}s`;
    else if (me.supplyCooldown > 0) label = `Next call in ${Math.ceil(me.supplyCooldown)}s`;
    else {
      label = `Call Earth (${S.powerCost}⚡)`;
      ready = !!base && base.status === 'active' && base.stored.power >= S.powerCost;
    }
    const key = `${label}|${ready}`;
    if (key === lastCall) return;
    lastCall = key;
    callButton.classList.toggle('is-waiting', !ready);
    callButton.replaceChildren(createIcon('icon_radio'), el('span', '', ` ${label}`));
    callButton.title =
      `Ask Earth for a supply drop (Key: Space). Radio is not instant: Earth and Mars are so far apart that ` +
      `your message takes ${supplyDropDelay(state).toFixed(1)} minutes to arrive this game (here: 1 minute = 1 second).`;
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

// The sentence on the mission card.
function missionGoal(m: MissionState): string {
  const coming = m.disaster ? `A ${DISASTER[m.disaster].name.toLowerCase()} is coming! ` : '';
  switch (m.kind) {
    case 'bringRegolith':
      return `${coming}Bring ${m.target} soil home for your shield.`;
    case 'bringIce':
      return `Air & Food is low! Bring ${m.target} ice home.`;
    case 'bringSolar':
      return `${coming || 'Power is low! '}Bring ${m.target} solar panels home.`;
    case 'bringCrates':
      return `Grow your base! Bring ${m.target} supply crates home.`;
    case 'storePower':
      return `${coming}Charge your battery to ${m.target} Power.`;
  }
}

// One short hint about the biggest thing that needs doing right now.
function tipFor(state: GameState, me: PlayerState, base: BaseState): { icon: UiIconId; text: string } | null {
  if (base.status !== 'active') {
    return { icon: 'icon_wreck', text: `New lander in ${Math.ceil(base.relaunchTimer)}s…` };
  }
  // Standing by a wreck: can we absorb it?
  for (const w of state.wrecks) {
    if (distance(me.pos, w.pos) > BALANCE.wrecks.absorbRadius * 2) continue;
    if (!canAbsorb(base, w.buildingCount)) {
      return { icon: 'icon_wreck', text: `Grow to ${w.buildingCount} buildings to rebuild this wreck!` };
    }
  }
  if (base.crew <= 0) return null;
  const d = crewDamagePerSol(state, base);
  if (d.flare > 0 && isOwnerOutside(state, base)) return { icon: 'icon_solar_flare', text: 'Solar flare! Get home, fast!' };
  const worst = Math.max(d.radiation, d.noLifeSupport, d.noPower, d.flare);
  if (worst <= 0) return null;
  if (worst === d.flare) return { icon: 'icon_regolith', text: 'Flare! More regolith = stronger shield!' };
  if (worst === d.noLifeSupport) return { icon: 'icon_ice', text: 'Need ice for Life Support!' };
  if (worst === d.noPower) return { icon: 'icon_solar', text: 'Need solar for Power!' };
  return { icon: 'icon_regolith', text: 'Need regolith for Shielding!' };
}
