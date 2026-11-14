// Pickups: spawning, magnet pulling, collecting, respawning, and unloading
// cargo at your base.

import { BALANCE, type PickupKind } from '../config/balance';
import type { GameEvent } from './events';
import { cargoCapacity, depositRadius, growBase, magnetRadius } from './growth';
import { rngNext, rngRange, rngWeighted } from './rng';
import type { GameState, PickupState, Vec2 } from './state';
import { distance, emptyCargo, findBase, findPlayer } from './state';

const PICKUP_KINDS = Object.keys(BALANCE.pickups.kinds) as PickupKind[];

export function spawnInitialPickups(state: GameState): void {
  for (let i = 0; i < BALANCE.pickups.targetCount; i++) {
    const p: PickupState = { id: state.nextId++, kind: 'crate', pos: { x: 0, z: 0 }, active: true, respawnTimer: 0, pulledBy: null };
    placePickup(state, p);
    state.pickups.push(p);
  }
}

// Give a pickup a new random kind and position inside the play area.
function placePickup(state: GameState, p: PickupState): void {
  p.kind = rngWeighted(state.rng, PICKUP_KINDS, (k) => BALANCE.pickups.kinds[k].weight);
  p.pos = randomPointAwayFromBases(state);
  p.active = true;
  p.respawnTimer = 0;
  p.pulledBy = null;
}

// Uniform random point in the play circle, retrying a few times if it lands on a base.
export function randomPointInPlayArea(state: GameState): Vec2 {
  const angle = rngRange(state.rng, 0, Math.PI * 2);
  const r = Math.sqrt(rngNext(state.rng)) * BALANCE.map.playRadius; // sqrt = evenly spread
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

function randomPointAwayFromBases(state: GameState): Vec2 {
  let point = randomPointInPlayArea(state);
  for (let tries = 0; tries < 5; tries++) {
    let ok = true;
    for (const b of state.bases) {
      if (distance(point, b.pos) < BALANCE.pickups.minDistanceFromBase) ok = false;
    }
    if (ok) break;
    point = randomPointInPlayArea(state);
  }
  return point;
}

// Magnet: pull nearby pickups toward rovers that have room; collect them on contact.
export function updatePickups(state: GameState, dt: number, events: GameEvent[]): void {
  const M = BALANCE.magnet;

  for (const p of state.pickups) {
    if (!p.active) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) placePickup(state, p);
      continue;
    }

    // Grab: the first rover (in player order) with room whose magnet reaches it.
    if (p.pulledBy === null) {
      for (const player of state.players) {
        if (player.cargoCount >= cargoCapacity(state, player)) continue;
        if (distance(p.pos, player.pos) <= magnetRadius(state, player)) {
          p.pulledBy = player.id;
          break;
        }
      }
    }
    if (p.pulledBy === null) continue;

    const player = findPlayer(state, p.pulledBy);
    if (!player || player.cargoCount >= cargoCapacity(state, player)) {
      p.pulledBy = null; // cargo filled up while it was flying: drop it where it is
      continue;
    }

    // Fly toward the rover.
    const dx = player.pos.x - p.pos.x;
    const dz = player.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= M.collectRadius) {
      player.cargo[p.kind] += 1;
      player.cargoCount += 1;
      p.active = false;
      p.pulledBy = null;
      p.respawnTimer = BALANCE.pickups.respawnDelay;
      events.push({ type: 'PickupCollected', playerId: player.id, pickupId: p.id, kind: p.kind });
      if (player.cargoCount >= cargoCapacity(state, player)) {
        events.push({ type: 'CargoFull', playerId: player.id });
      }
    } else {
      const move = Math.min(d, M.pullSpeed * dt);
      p.pos.x += (dx / d) * move;
      p.pos.z += (dz / d) * move;
    }
  }
}

// Driving into your own base's deposit circle unloads everything.
export function updateDeposits(state: GameState, events: GameEvent[]): void {
  for (const player of state.players) {
    if (player.cargoCount === 0) continue;
    const base = findBase(state, player.baseId);
    if (!base || distance(player.pos, base.pos) > depositRadius(base)) continue;

    let buildPoints = 0;
    for (const kind of PICKUP_KINDS) {
      const count = player.cargo[kind];
      const info = BALANCE.pickups.kinds[kind];
      buildPoints += count * info.buildPoints;
      if (info.resource !== 'none') base.stored[info.resource] += count * info.amount;
    }
    events.push({ type: 'CargoDeposited', playerId: player.id, baseId: base.id, itemCount: player.cargoCount, buildPoints });

    base.buildPoints += buildPoints;
    player.cargo = emptyCargo();
    player.cargoCount = 0;
    growBase(state, base, events);
  }
}
