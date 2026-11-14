// Wrecks: when a base loses its last crew member it becomes a wreck.
// - Salvage crates burst out of it (anyone can grab them).
// - A bigger base can ABSORB the wreck by walking up to it (bonus build points).
// - The owner gets a brand-new lander somewhere else after a short wait.

import { BALANCE } from '../config/balance';
import type { GameEvent } from './events';
import { growBase } from './growth';
import { randomPointInPlayArea, randomPointNear, spawnTemporaryPickup } from './pickups';
import type { BaseState, GameState, Vec2 } from './state';
import { distance, findBase, findPlayer } from './state';

const W = BALANCE.wrecks;

export function updateWrecks(state: GameState, dt: number, events: GameEvent[]): void {
  for (const base of state.bases) {
    if (base.status === 'active' && base.crew <= 0) wreckBase(state, base, events);
    else if (base.status === 'wrecked') {
      base.relaunchTimer -= dt;
      if (base.relaunchTimer <= 0) relaunchBase(state, base, events);
    }
  }
  updateAbsorb(state, events);

  // Old wrecks crumble away.
  for (const w of state.wrecks) {
    w.timeLeft -= dt;
    if (w.timeLeft <= 0) events.push({ type: 'WreckCrumbled', wreckId: w.id });
  }
  state.wrecks = state.wrecks.filter((w) => w.timeLeft > 0);
}

// How many salvage crates a base with this many buildings leaves behind.
export function salvageCount(buildingCount: number): number {
  return Math.min(W.maxSalvage, W.salvageBase + W.salvagePerBuilding * buildingCount);
}

// The base is lost: leave a wreck, scatter salvage, and start the relaunch countdown.
function wreckBase(state: GameState, base: BaseState, events: GameEvent[]): void {
  const owner = findPlayer(state, base.ownerId);
  const wreckId = state.nextId++;
  state.wrecks.push({
    id: wreckId,
    pos: { x: base.pos.x, z: base.pos.z },
    ownerId: base.ownerId,
    colorIndex: owner ? owner.colorIndex : 0,
    buildingCount: base.buildings.length,
    timeLeft: W.lifetime,
  });

  const salvage = salvageCount(base.buildings.length);
  for (let i = 0; i < salvage; i++) {
    const pos = randomPointNear(state, base.pos, W.scatterMin, W.scatterMax);
    spawnTemporaryPickup(state, 'crate', pos, W.salvageLifetime);
  }

  base.status = 'wrecked';
  base.relaunchTimer = W.relaunchDelay;
  base.buildings = [];
  base.buildPoints = 0;
  base.crew = 0;
  base.sick = 0;
  base.health = 0;
  base.landerPowered = false;
  base.netPerSol = { power: 0, lifeSupport: 0 };
  events.push({ type: 'BaseWrecked', baseId: base.id, playerId: base.ownerId, wreckId, salvage });
}

// A fresh lander touches down somewhere new, and the astronaut is beamed next to it.
function relaunchBase(state: GameState, base: BaseState, events: GameEvent[]): void {
  base.pos = pickBaseSpawn(state, base.id);
  base.status = 'active';
  base.relaunchTimer = 0;
  base.launches += 1;
  base.crew = BALANCE.base.startCrew;
  base.sick = 0;
  base.health = BALANCE.crew.maxHealth;
  base.buildings = [];
  base.buildPoints = 0;
  base.stored = { ...BALANCE.resources.start };
  base.landerPowered = true;
  base.netPerSol = { power: 0, lifeSupport: 0 };

  const player = findPlayer(state, base.ownerId);
  if (player) {
    player.pos = { x: base.pos.x, z: base.pos.z + BALANCE.base.roverSpawnOffset };
    player.vel = { x: 0, z: 0 };
  }
  events.push({ type: 'BaseRelaunched', baseId: base.id, playerId: base.ownerId });
}

// Can this base absorb that wreck? Only if it's at least as big as the wreck was.
export function canAbsorb(base: BaseState, buildingCount: number): boolean {
  return base.status === 'active' && base.buildings.length >= buildingCount;
}

// Walk up to a wreck (with a big enough base) to absorb it.
function updateAbsorb(state: GameState, events: GameEvent[]): void {
  for (const player of state.players) {
    const base = findBase(state, player.baseId);
    if (!base) continue;
    for (const w of state.wrecks) {
      if (w.timeLeft <= 0) continue; // already absorbed this step
      if (distance(player.pos, w.pos) > W.absorbRadius || !canAbsorb(base, w.buildingCount)) continue;
      const buildPoints = W.absorbBuildPointsBase + W.absorbBuildPointsPerBuilding * w.buildingCount;
      w.timeLeft = 0; // removed below
      base.buildPoints += buildPoints;
      events.push({ type: 'WreckAbsorbed', playerId: player.id, baseId: base.id, wreckId: w.id, buildPoints });
      growBase(state, base, events);
    }
  }
  state.wrecks = state.wrecks.filter((w) => w.timeLeft > 0);
}

// Random spot in the play area, kept apart from other bases and wrecks when possible.
// `ignoreBaseId` skips a base's own old spot (used when it relaunches).
export function pickBaseSpawn(state: GameState, ignoreBaseId?: string): Vec2 {
  const minD = BALANCE.base.minSpawnDistance;
  let best = randomPointInPlayArea(state);
  for (let tries = 0; tries < 30; tries++) {
    let ok = true;
    for (const b of state.bases) {
      if (b.id !== ignoreBaseId && b.status === 'active' && distance(best, b.pos) < minD) ok = false;
    }
    for (const w of state.wrecks) {
      if (distance(best, w.pos) < W.scatterMax * 2) ok = false;
    }
    if (ok) return best;
    best = randomPointInPlayArea(state);
  }
  return best;
}
