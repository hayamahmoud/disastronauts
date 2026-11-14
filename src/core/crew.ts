// Crew health. The whole crew of a base shares one health meter (0–100).
// It drops when crew have no Life Support, no Power (no heat), or aren't
// covered by Shielding (radiation). It slowly recovers when all is well.
// Low health → some crew get sick (they don't work). Health 0 → a crew member is lost.

import { BALANCE, type FlareClass } from '../config/balance';
import type { GameEvent } from './events';
import { depositRadius } from './growth';
import { flareShieldNeed } from './disasters';
import { countBuildings, shieldCoverage, shieldNeeded, shieldTotal } from './resources';
import type { BaseState, GameState } from './state';
import { distance, findPlayer } from './state';

const C = BALANCE.crew;

export interface CrewDamage {
  radiation: number;
  noLifeSupport: number;
  noPower: number;
  flare: number; // only during a solar flare
}

// Damage per sol right now, split by cause (the HUD uses this to explain why).
export function crewDamagePerSol(state: GameState, base: BaseState): CrewDamage {
  // Shelters = lander + habitats. The unpowered share of them hurts the crew.
  const shelters = 1 + countBuildings(base, 'habitat');
  const poweredShelters = (base.landerPowered ? 1 : 0) + countBuildings(base, 'habitat', true);
  const unshielded = 1 - shieldCoverage(base);
  return {
    radiation: C.radiationDamagePerSol * unshielded,
    noLifeSupport: base.stored.lifeSupport <= 0 ? C.noLifeSupportDamagePerSol : 0,
    noPower: C.noPowerDamagePerSol * (1 - poweredShelters / shelters),
    flare: flareDamagePerSol(state, base),
  };
}

// A solar flare hurts crew the shielding doesn't cover, and hurts more while
// your astronaut is out on the surface (outside the base's unload circle).
function flareDamagePerSol(state: GameState, base: BaseState): number {
  const d = state.disaster;
  if (!d || d.kind !== 'solarFlare') return 0;
  const F = BALANCE.disasters.solarFlare;
  let damage = F.damagePerSol * (1 - flareCoverage(base, d.flareClass));
  if (isOwnerOutside(state, base)) damage += F.outsideDamagePerSol;
  return damage * d.strength;
}

// 0 to 1: how much of the base its Shielding covers during a flare of this class.
// A flare needs extra Shielding (e.g. 2x for M-class), so a base that's fine
// on a normal day can be only half covered when a flare hits.
export function flareCoverage(base: BaseState, flareClass: FlareClass | null): number {
  const need = shieldNeeded(base) * flareShieldNeed(flareClass);
  if (need <= 0) return 1;
  return Math.min(1, shieldTotal(base) / need);
}

// Is the base's astronaut outside the base's unload circle?
export function isOwnerOutside(state: GameState, base: BaseState): boolean {
  const owner = findPlayer(state, base.ownerId);
  return owner !== undefined && distance(owner.pos, base.pos) > depositRadius(base);
}

export function updateCrew(state: GameState, dt: number, events: GameEvent[]): void {
  const perSol = dt / BALANCE.sol.seconds;
  for (const base of state.bases) {
    if (base.status !== 'active' || base.crew <= 0) continue;

    const d = crewDamagePerSol(state, base);
    const damage = d.radiation + d.noLifeSupport + d.noPower + d.flare;
    const change = damage > 0 ? -damage : C.healPerSol;
    base.health = Math.min(C.maxHealth, base.health + change * perSol);

    // Health ran out: one crew member is lost, the rest get a fresh start.
    if (base.health <= 0) {
      base.crew -= 1;
      base.health = base.crew > 0 ? C.healthAfterLoss : 0;
      events.push({ type: 'CrewLost', baseId: base.id, crewLeft: base.crew });
    }

    const sickBefore = base.sick;
    base.sick = sickCount(base);
    if (base.sick > sickBefore) events.push({ type: 'CrewSick', baseId: base.id, sick: base.sick });
  }
}

// Below `sickBelow` health, a growing share of the crew is sick.
export function sickCount(base: BaseState): number {
  if (base.crew <= 0 || base.health >= C.sickBelow) return 0;
  const share = (C.sickBelow - base.health) / C.sickBelow;
  return Math.min(base.crew, Math.ceil(base.crew * share));
}
