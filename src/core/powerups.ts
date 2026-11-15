// One-round power-ups from the shop (M6). Each one has a cost, so there is
// never a choice without a trade-off.
//
// - Shield Bubble: switches on by itself when a solar flare hits and blocks
//   all of that flare's radiation for your base. Costs Power to switch on.
// - Solar Boost: press B. Double solar Power for a while, then the panels
//   overheat and make only half Power for a while.
// (Express Supply Drop is just two modifiers, see supplyDrop.ts.)

import { BALANCE } from '../config/balance';
import type { GameEvent } from './events';
import type { BaseState, GameState, PlayerState } from './state';
import { findBase, findPlayer } from './state';

const P = BALANCE.powerups;

// Called every step right after updateDisasters, with the events so far.
export function updatePowerups(state: GameState, events: GameEvent[]): void {
  for (const e of events) {
    if (e.type === 'DisasterStarted' && e.kind === 'solarFlare') raiseBubbles(state, events);
    if (e.type === 'DisasterEnded') for (const b of state.bases) b.bubble = false;
  }
  for (const player of state.players) {
    const boost = player.solarBoost;
    if (boost === null) continue;
    if (!boost.overloaded && state.time >= boost.endsAt) {
      boost.overloaded = true;
      boost.endsAt = state.time + P.overloadSeconds;
      events.push({ type: 'SolarBoostOverload', playerId: player.id, seconds: P.overloadSeconds });
    } else if (boost.overloaded && state.time >= boost.endsAt) {
      player.solarBoost = null;
      events.push({ type: 'SolarBoostEnded', playerId: player.id });
    }
  }
}

// A flare just hit: every base whose owner has a bubble charge (and the Power) gets one.
function raiseBubbles(state: GameState, events: GameEvent[]): void {
  for (const player of state.players) {
    if (player.bubbles <= 0) continue;
    const base = findBase(state, player.baseId);
    if (!base || base.status !== 'active') continue;
    if (base.stored.power < P.bubblePowerCost) {
      events.push({ type: 'ShieldBubbleFailed', playerId: player.id, baseId: base.id });
      continue; // keep the charge for the next flare
    }
    base.stored.power -= P.bubblePowerCost;
    player.bubbles -= 1;
    base.bubble = true;
    events.push({ type: 'ShieldBubbleUp', playerId: player.id, baseId: base.id });
  }
}

// The player pressed B.
export function useSolarBoost(state: GameState, player: PlayerState, events: GameEvent[]): void {
  if (player.solarBoosts <= 0 || player.solarBoost !== null) return;
  player.solarBoosts -= 1;
  player.solarBoost = { endsAt: state.time + P.boostSeconds, overloaded: false };
  events.push({ type: 'SolarBoostStarted', playerId: player.id, seconds: P.boostSeconds });
}

// How much this base's solar output is multiplied by its owner's upgrades and boosts.
export function solarModifier(state: GameState, base: BaseState): number {
  const owner = findPlayer(state, base.ownerId);
  if (!owner) return 1;
  let factor = owner.mods.solarEfficiency;
  if (owner.solarBoost) factor *= owner.solarBoost.overloaded ? P.overloadFactor : P.boostFactor;
  return factor;
}
