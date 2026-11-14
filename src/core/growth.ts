// Base growth: how deposits turn into buildings and crew, and how a bigger
// base makes your rover's magnet and cargo bay bigger (the Hole.io feeling).

import { BALANCE } from '../config/balance';
import type { GameEvent } from './events';
import type { BaseState, GameState, PlayerState, Vec2 } from './state';
import { findBase } from './state';

export function magnetRadius(state: GameState, player: PlayerState): number {
  const n = buildingCount(state, player);
  const M = BALANCE.magnet;
  return Math.min(M.maxRadius, M.baseRadius + M.radiusPerBuilding * n);
}

export function cargoCapacity(state: GameState, player: PlayerState): number {
  const n = buildingCount(state, player);
  const C = BALANCE.cargo;
  return Math.min(C.maxCapacity, C.baseCapacity + C.capacityPerBuilding * n);
}

export function depositRadius(base: BaseState): number {
  return BALANCE.base.depositRadius + BALANCE.base.depositRadiusPerBuilding * base.buildings.length;
}

export function nextBuildingCost(base: BaseState): number {
  return BALANCE.growth.firstBuildingCost + BALANCE.growth.costIncrease * base.buildings.length;
}

// Build as many buildings as the saved-up build points pay for.
export function growBase(state: GameState, base: BaseState, events: GameEvent[]): void {
  const G = BALANCE.growth;
  let cost = nextBuildingCost(base);
  while (base.buildPoints >= cost) {
    base.buildPoints -= cost;
    const index = base.buildings.length;
    const kind = G.buildOrder[index % G.buildOrder.length];
    const id = state.nextId++;
    base.buildings.push({ id, kind, offset: buildingSlot(index), powered: true });
    events.push({ type: 'BuildingBuilt', baseId: base.id, buildingId: id, kind });

    if (kind === 'habitat') {
      base.crew += G.crewPerHabitat;
      events.push({ type: 'CrewAdded', baseId: base.id, added: G.crewPerHabitat, crewTotal: base.crew });
    }
    cost = nextBuildingCost(base);
  }
}

// Buildings fill rings around the lander. Each ring is offset a little so the
// layout doesn't look like a grid.
export function buildingSlot(index: number): Vec2 {
  const G = BALANCE.growth;
  const ring = Math.floor(index / G.slotsPerRing);
  const slot = index % G.slotsPerRing;
  const radius = G.firstRingRadius + ring * G.ringSpacing;
  const angle = (slot / G.slotsPerRing) * Math.PI * 2 + ring * 0.5;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function buildingCount(state: GameState, player: PlayerState): number {
  const base = findBase(state, player.baseId);
  return base ? base.buildings.length : 0;
}
