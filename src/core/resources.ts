// Power, Life Support and Shielding: what makes them, what uses them.
// The key rule: growth is never free. Every crew member uses Life Support,
// every building uses Power, and a bigger base needs more Shielding.

import { BALANCE, type BuildingKind, type PowerPriority } from '../config/balance';
import { sunlight } from './dayNight';
import { heatPerShelterPerSol, solarFactor } from './disasters';
import { solarModifier } from './powerups';
import type { GameEvent } from './events';
import type { BaseState, GameState } from './state';

const R = BALANCE.resources;

// --- Simple helpers the HUD and tests also use ---

export function storageCapacity(base: BaseState, kind: 'power' | 'lifeSupport'): number {
  const s = R.storage[kind];
  return s.base + s.perBuilding * base.buildings.length;
}

export function countBuildings(base: BaseState, kind: BuildingKind, onlyPowered = false): number {
  let n = 0;
  for (const b of base.buildings) if (b.kind === kind && (!onlyPowered || b.powered)) n++;
  return n;
}

// How much shielding this base needs to be fully covered.
export function shieldNeeded(base: BaseState): number {
  return base.crew * R.shieldNeededPerCrew + base.buildings.length * R.shieldNeededPerBuilding;
}

// Piled-up regolith plus powered shield generators.
export function shieldTotal(base: BaseState): number {
  return base.stored.shielding + countBuildings(base, 'shield_generator', true) * R.shieldGeneratorAmount;
}

// 0 to 1: how much of the base is protected from radiation.
export function shieldCoverage(base: BaseState): number {
  const need = shieldNeeded(base);
  if (need <= 0) return 1;
  return Math.min(1, shieldTotal(base) / need);
}

export function healthyCrew(base: BaseState): number {
  return Math.max(0, base.crew - base.sick);
}

// Solar output per sol right now (changes with the time of day, dust storms
// block it, and the owner's solar upgrade / Solar Boost change it).
export function solarPerSol(state: GameState, base: BaseState): number {
  const panels = countBuildings(base, 'solar_panel');
  const full = (R.landerSolarPerSol + panels * R.solarPanelPerSol) * R.marsSunlight;
  return full * sunlight(state.time) * solarFactor(state) * solarModifier(state, base);
}

// Power a building (or the lander) uses per sol right now. On a cold night,
// shelters (lander + habitats) need extra Power for their heaters.
export function powerUse(state: GameState, kind: BuildingKind | 'lander'): number {
  const heat = kind === 'lander' || kind === 'habitat' ? heatPerShelterPerSol(state) : 0;
  return R.powerUsePerSol[kind] + heat;
}

// --- The per-step update ---

export function updateResources(state: GameState, dt: number, events: GameEvent[]): void {
  for (const base of state.bases) {
    if (base.status !== 'active' || base.crew <= 0) continue; // a wreck does nothing
    updatePower(state, base, dt, events);
    updateLifeSupport(base, dt, events);
  }
}

// Solar charges the battery; buildings draw from it in priority order.
// When there isn't enough, the lowest-priority buildings switch off.
function updatePower(state: GameState, base: BaseState, dt: number, events: GameEvent[]): void {
  const perSol = dt / BALANCE.sol.seconds; // converts a "per sol" rate into this step
  const production = solarPerSol(state, base);
  let available = base.stored.power + production * perSol;
  let usePerSol = 0;
  const wasOut = !base.landerPowered || base.buildings.some((b) => !b.powered);

  // Can we pay `cost` this step? Something already off also needs a small reserve to restart.
  const canPay = (cost: number, wasOn: boolean) => available >= cost + (wasOn ? 0 : R.restartReserve);

  // The lander always gets Power first: it keeps the crew alive.
  const landerUse = powerUse(state, 'lander');
  base.landerPowered = canPay(landerUse * perSol, base.landerPowered);
  if (base.landerPowered) {
    available -= landerUse * perSol;
    usePerSol += landerUse;
  }

  // Then the buildings, in priority order.
  for (const kind of powerOrder(base.powerPriority)) {
    for (const b of base.buildings) {
      if (b.kind !== kind) continue;
      const use = powerUse(state, b.kind);
      b.powered = canPay(use * perSol, b.powered);
      if (b.powered) {
        available -= use * perSol;
        usePerSol += use;
      }
    }
  }

  base.stored.power = Math.min(storageCapacity(base, 'power'), available);
  base.netPerSol.power = production - usePerSol;

  const isOut = !base.landerPowered || base.buildings.some((b) => !b.powered);
  if (isOut && !wasOut) events.push({ type: 'PowerOut', baseId: base.id });
  if (!isOut && wasOut) events.push({ type: 'PowerRestored', baseId: base.id });
}

// Habitats keep the crew alive, so they come right after the lander.
// The player picks which of greenhouse / shield generator comes next.
// Solar panels use no Power, so their place doesn't matter.
export function powerOrder(priority: PowerPriority): BuildingKind[] {
  const other: BuildingKind = priority === 'greenhouse' ? 'shield_generator' : 'greenhouse';
  return ['habitat', priority, other, 'solar_panel'];
}

// Crew use Life Support; powered greenhouses make it (if the crew is healthy enough to farm).
function updateLifeSupport(base: BaseState, dt: number, events: GameEvent[]): void {
  const perSol = dt / BALANCE.sol.seconds;
  const workingFraction = base.crew > 0 ? healthyCrew(base) / base.crew : 0;
  const made = countBuildings(base, 'greenhouse', true) * R.greenhouseLifeSupportPerSol * workingFraction;
  const used = base.crew * R.lifeSupportPerCrewPerSol;
  base.netPerSol.lifeSupport = made - used;

  const wasEmpty = base.stored.lifeSupport <= 0;
  const next = base.stored.lifeSupport + (made - used) * perSol;
  base.stored.lifeSupport = Math.max(0, Math.min(storageCapacity(base, 'lifeSupport'), next));
  if (base.stored.lifeSupport <= 0 && !wasEmpty) events.push({ type: 'LifeSupportEmpty', baseId: base.id });
}
