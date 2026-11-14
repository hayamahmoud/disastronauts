// Supply drops: call Earth for a crate of supplies. It does NOT arrive right
// away: a radio message needs minutes to cross space between Earth and Mars
// (communication delay). In the game, 1 light-minute = 1 second of waiting.

import { BALANCE } from '../config/balance';
import type { GameEvent } from './events';
import { depositRadius } from './growth';
import { randomPointNear, spawnTemporaryPickup } from './pickups';
import { rngRange } from './rng';
import type { GameState, PlayerState } from './state';
import { findBase } from './state';

const S = BALANCE.supplyDrop;

// Earth and Mars are a different distance apart every game (they orbit the Sun
// at different speeds). Returns the one-way radio delay in minutes.
export function rollLightMinutes(state: GameState): number {
  const km = rngRange(state.rng, S.earthDistanceMinKm, S.earthDistanceMaxKm);
  return km / S.speedOfLightKmPerS / 60;
}

// Seconds a supply drop takes to arrive this game.
export function supplyDropDelay(state: GameState): number {
  return state.lightMinutes * S.secondsPerLightMinute;
}

// The player pressed "Call Earth".
export function requestSupplyDrop(state: GameState, player: PlayerState, events: GameEvent[]): void {
  const base = findBase(state, player.baseId);
  const deny = (reason: 'cooldown' | 'noPower' | 'noBase') =>
    events.push({ type: 'SupplyDropDenied', playerId: player.id, reason });

  if (!base || base.status !== 'active') return void deny('noBase');
  if (player.supplyCooldown > 0) return void deny('cooldown');
  if (base.stored.power < S.powerCost) return void deny('noPower');

  base.stored.power -= S.powerCost;
  player.supplyCooldown = S.cooldown;
  const delay = supplyDropDelay(state);
  const ring = depositRadius(base) + S.landingOffset;
  const drop = {
    id: state.nextId++,
    playerId: player.id,
    pos: randomPointNear(state, base.pos, ring, ring),
    calledAt: state.time,
    landsAt: state.time + delay,
  };
  state.supplyDrops.push(drop);
  events.push({
    type: 'SupplyDropCalled',
    playerId: player.id,
    dropId: drop.id,
    landsIn: delay,
    lightMinutes: state.lightMinutes,
  });
}

export function updateSupplyDrops(state: GameState, dt: number, events: GameEvent[]): void {
  for (const player of state.players) player.supplyCooldown = Math.max(0, player.supplyCooldown - dt);

  // Drops that touch down burst open into pickups.
  for (const drop of state.supplyDrops) {
    if (state.time < drop.landsAt) continue;
    for (const kind of S.items) {
      spawnTemporaryPickup(state, kind, randomPointNear(state, drop.pos, 0, S.scatter), S.itemLifetime);
    }
    events.push({ type: 'SupplyDropLanded', playerId: drop.playerId, dropId: drop.id, pos: drop.pos });
  }
  state.supplyDrops = state.supplyDrops.filter((d) => state.time < d.landsAt);
}
