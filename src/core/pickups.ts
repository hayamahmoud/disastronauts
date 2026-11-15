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
    const p: PickupState = {
      id: state.nextId++,
      kind: 'crate',
      pos: { x: 0, z: 0 },
      active: true,
      respawnTimer: 0,
      pulledBy: null,
      temporary: false,
      timeLeft: 0,
    };
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

// A one-off pickup (salvage from a wreck, or supplies from Earth). It never
// respawns: it disappears when collected or after `lifetime` seconds.
export function spawnTemporaryPickup(state: GameState, kind: PickupKind, pos: Vec2, lifetime: number): void {
  state.pickups.push({
    id: state.nextId++,
    kind,
    pos: clampToPlayArea(pos),
    active: true,
    respawnTimer: 0,
    pulledBy: null,
    temporary: true,
    timeLeft: lifetime,
  });
}

// Pulls a point back inside the play circle if it landed outside.
export function clampToPlayArea(pos: Vec2): Vec2 {
  const r = Math.hypot(pos.x, pos.z);
  const max = BALANCE.map.playRadius;
  if (r <= max) return { x: pos.x, z: pos.z };
  return { x: (pos.x / r) * max, z: (pos.z / r) * max };
}

// Random point in a ring around `center` (between minR and maxR studs away).
export function randomPointNear(state: GameState, center: Vec2, minR: number, maxR: number): Vec2 {
  const angle = rngRange(state.rng, 0, Math.PI * 2);
  const r = rngRange(state.rng, minR, maxR);
  return clampToPlayArea({ x: center.x + Math.cos(angle) * r, z: center.z + Math.sin(angle) * r });
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

  let anyGone = false;
  for (const p of state.pickups) {
    if (p.temporary) {
      p.timeLeft -= dt;
      if (p.timeLeft <= 0) p.active = false; // crumbled away
      if (!p.active) {
        anyGone = true;
        continue;
      }
    }
    if (!p.active) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) placePickup(state, p);
      continue;
    }

    // Grab: the first rover (in player order) with room whose magnet reaches it.
    if (p.pulledBy === null) {
      for (const player of state.players) {
        if (player.working !== null) continue; // hands busy with a mini task: magnet paused
        if (player.cargoCount >= cargoCapacity(state, player)) continue;
        if (distance(p.pos, player.pos) <= magnetRadius(state, player)) {
          p.pulledBy = player.id;
          break;
        }
      }
    }
    if (p.pulledBy === null) continue;

    const player = findPlayer(state, p.pulledBy);
    if (!player || player.working !== null || player.cargoCount >= cargoCapacity(state, player)) {
      p.pulledBy = null; // cargo filled up (or a mini task started) while it was flying: drop it where it is
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
      if (p.temporary) anyGone = true;
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

  // Temporary pickups that were collected or crumbled are removed for good.
  if (anyGone) state.pickups = state.pickups.filter((p) => !p.temporary || p.active);
}

// Driving into your own base's deposit circle unloads everything.
export function updateDeposits(state: GameState, events: GameEvent[]): void {
  for (const player of state.players) {
    if (player.cargoCount === 0) continue;
    const base = findBase(state, player.baseId);
    if (!base || base.status !== 'active' || distance(player.pos, base.pos) > depositRadius(base)) continue;

    let buildPoints = 0;
    for (const kind of PICKUP_KINDS) {
      const count = player.cargo[kind];
      const info = BALANCE.pickups.kinds[kind];
      buildPoints += count * info.buildPoints;
      if (info.resource !== 'none') base.stored[info.resource] += count * info.amount;
    }
    events.push({
      type: 'CargoDeposited',
      playerId: player.id,
      baseId: base.id,
      itemCount: player.cargoCount,
      buildPoints,
      items: { ...player.cargo },
    });

    base.buildPoints += buildPoints;
    player.cargo = emptyCargo();
    player.cargoCount = 0;
    growBase(state, base, events);
  }
}
