// Computer rivals. Each bot "thinks" and then sends the SAME kind of input a
// human sends (a move direction, plus the odd command), so on Roblox a bot can
// be swapped for a real player without changing the game rules.
//
// Simple state machine (see BotMode in state.ts):
//   wander → seek the best pickup in sight → home when the backpack is full
//   (or a disaster warning starts) → shelter during flares → back out again.
//   Now and then it goes for a wreck it can absorb.
// Three personalities (balance.ts) make rounds play out differently.

import { BALANCE, type BotPersonality, type PickupKind } from '../config/balance';
import { cargoCapacity, depositRadius } from './growth';
import { randomPointNear } from './pickups';
import { shieldCoverage, storageCapacity } from './resources';
import type { BaseState, BotState, GameState, PickupState, PlayerInput, PlayerState, Vec2 } from './state';
import { distance, findBase } from './state';
import { canAbsorb } from './wrecks';

const B = BALANCE.bots;

export function createBotState(personality: BotPersonality): BotState {
  return {
    personality,
    mode: 'wander',
    targetPickupId: null,
    targetWreckId: null,
    wanderTo: null,
    thinkTimer: 0,
    targetTimer: 0,
    ignorePickupId: null,
  };
}

// Decide what this bot does this step. Updates the bot's memory (player.bot)
// and returns its input. Only called from step(), so games stay repeatable.
export function botInput(state: GameState, player: PlayerState, dt: number): PlayerInput {
  const bot = player.bot!;
  const p = B.personalities[bot.personality];
  const base = findBase(state, player.baseId);
  const homeBase = base && base.status === 'active' ? base : null;
  const input: PlayerInput = { playerId: player.id, moveX: 0, moveZ: 0 };

  // Set the bot's favourite power priority once its base exists.
  if (homeBase && homeBase.powerPriority !== p.powerPriority) input.powerPriority = p.powerPriority;
  if (homeBase && wantsSupplyDrop(player, homeBase)) input.callSupplyDrop = true;

  bot.thinkTimer -= dt;
  bot.targetTimer += dt;
  chooseMode(state, player, homeBase);

  const target = currentTarget(state, player, homeBase);
  if (!target) return input;
  const stopAt = bot.mode === 'shelter' ? B.homeStopRadius : 0;
  return steerTo(input, player.pos, target, stopAt, p.pace);
}

// --- Choosing what to do ---

function chooseMode(state: GameState, player: PlayerState, base: BaseState | null): void {
  const bot = player.bot!;
  const p = B.personalities[bot.personality];
  const danger = p.shelters && dangerAhead(state);

  // No base right now (wrecked, waiting for a new lander): just collect.
  if (!base) {
    if (bot.mode === 'home' || bot.mode === 'shelter') setMode(bot, 'wander');
  } else if (danger) {
    // Go home and stay there until it's over (unloading on the way in).
    const atHome = distance(player.pos, base.pos) <= depositRadius(base);
    setMode(bot, atHome && player.cargoCount === 0 ? 'shelter' : 'home');
    return;
  } else if (bot.mode === 'shelter') {
    setMode(bot, 'wander'); // danger is over: back to work
  } else if (bot.mode === 'home') {
    if (player.cargoCount === 0) setMode(bot, 'wander'); // unloaded
    else return; // keep walking home
  } else if (player.cargoCount >= Math.ceil(cargoCapacity(state, player) * p.returnAt)) {
    setMode(bot, 'home');
    return;
  }

  // Out collecting. If the target is gone, or it's taking too long (probably
  // stuck behind a hill), drop it and look around again right away.
  const lost =
    (bot.mode === 'wreck' && !findWreck(state, bot.targetWreckId)) ||
    (bot.mode === 'seek' && !pickupStillThere(state, player, bot.targetPickupId));
  if (bot.targetTimer > B.targetTimeout && bot.mode === 'seek') bot.ignorePickupId = bot.targetPickupId;
  if (lost || bot.targetTimer > B.targetTimeout) {
    setMode(bot, 'wander');
    bot.thinkTimer = 0;
  }
  if (bot.mode === 'wander' && !bot.wanderTo) bot.thinkTimer = 0; // nowhere to go: think now

  // Otherwise only look around every thinkInterval seconds.
  if (bot.thinkTimer > 0 || bot.mode === 'wreck') return;
  bot.thinkTimer = B.thinkInterval;

  const wreck = base ? wreckWorthChasing(state, player, base) : null;
  if (wreck !== null) {
    setMode(bot, 'wreck');
    bot.targetWreckId = wreck;
    return;
  }

  const pickup = bestPickup(state, player, base);
  if (pickup) {
    if (bot.targetPickupId !== pickup.id) {
      setMode(bot, 'seek');
      bot.targetPickupId = pickup.id;
    }
  } else if (bot.mode !== 'wander' || !bot.wanderTo) {
    setMode(bot, 'wander');
    bot.wanderTo = randomPointNear(state, player.pos, B.wanderMinDistance, B.wanderMaxDistance);
  }
}

// Switch mode and forget the old target. Any new target restarts the give-up clock.
function setMode(bot: BotState, mode: BotState['mode']): void {
  bot.targetTimer = 0;
  bot.mode = mode;
  if (mode !== 'seek') bot.targetPickupId = null;
  if (mode !== 'wreck') bot.targetWreckId = null;
  if (mode !== 'wander') bot.wanderTo = null;
}

// A disaster warning is showing, or a solar flare is hitting right now.
function dangerAhead(state: GameState): boolean {
  if (state.nextDisaster && state.nextDisaster.warned) return true;
  return state.disaster !== null && state.disaster.kind === 'solarFlare';
}

// Where the bot is walking to right now.
function currentTarget(state: GameState, player: PlayerState, base: BaseState | null): Vec2 | null {
  const bot = player.bot!;
  if ((bot.mode === 'home' || bot.mode === 'shelter') && base) return base.pos;
  if (bot.mode === 'seek') {
    const pickup = findPickup(state, bot.targetPickupId);
    return pickup ? pickup.pos : null;
  }
  if (bot.mode === 'wreck') {
    const wreck = findWreck(state, bot.targetWreckId);
    return wreck ? wreck.pos : null;
  }
  if (bot.wanderTo && distance(player.pos, bot.wanderTo) <= B.arriveRadius) {
    bot.wanderTo = null; // arrived: look around again next think
    bot.thinkTimer = 0;
  }
  return bot.wanderTo;
}

// --- Pickups ---

// The pickup with the best "worth it?" score: how much the bot likes it, more
// if the base needs it, divided by how far away it is.
function bestPickup(state: GameState, player: PlayerState, base: BaseState | null): PickupState | null {
  const bot = player.bot!;
  const p = B.personalities[bot.personality];
  const need = base ? baseNeeds(base) : { crate: 0.5, ice: 0, regolith: 0, solar: 0 };
  let best: PickupState | null = null;
  let bestValue = 0;
  for (const pickup of state.pickups) {
    if (!pickup.active || pickup.id === bot.ignorePickupId) continue;
    if (pickup.pulledBy !== null && pickup.pulledBy !== player.id) continue; // someone else got it
    const d = distance(player.pos, pickup.pos);
    if (d > B.sightRadius) continue;
    const value = (p.likes[pickup.kind] * (1 + p.needWeight * need[pickup.kind])) / (d + B.distanceBias);
    if (value > bestValue) {
      bestValue = value;
      best = pickup;
    }
  }
  return best;
}

// 0 to 1 for each pickup kind: how badly the base needs what it gives.
function baseNeeds(base: BaseState): Record<PickupKind, number> {
  return {
    crate: 0.5, // building points are always handy
    ice: 1 - base.stored.lifeSupport / storageCapacity(base, 'lifeSupport'),
    solar: 1 - base.stored.power / storageCapacity(base, 'power'),
    regolith: 1 - shieldCoverage(base),
  };
}

function findPickup(state: GameState, id: number | null): PickupState | null {
  if (id === null) return null;
  for (const p of state.pickups) if (p.id === id) return p;
  return null;
}

function pickupStillThere(state: GameState, player: PlayerState, id: number | null): boolean {
  const p = findPickup(state, id);
  return p !== null && p.active && (p.pulledBy === null || p.pulledBy === player.id);
}

// --- Wrecks ---

function findWreck(state: GameState, id: number | null) {
  if (id === null) return null;
  for (const w of state.wrecks) if (w.id === id) return w;
  return null;
}

// A wreck in sight that this base is big enough to absorb, if this bot's
// personality fancies it. Each bot makes up its mind once per wreck (a fixed
// "coin flip" from the ids), so it doesn't flip-flop.
function wreckWorthChasing(state: GameState, player: PlayerState, base: BaseState): number | null {
  const p = B.personalities[player.bot!.personality];
  for (const w of state.wrecks) {
    if (w.ownerId === player.id || !canAbsorb(base, w.buildingCount)) continue;
    if (distance(player.pos, w.pos) > B.sightRadius) continue;
    if (fixedChance(w.id, player.colorIndex) < p.wreckChance) return w.id;
  }
  return null;
}

// A number from 0 to 1 that is always the same for the same two inputs.
function fixedChance(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// --- Supply drops ---

// Calls Earth when Life Support is running low and there's Power to spare.
function wantsSupplyDrop(player: PlayerState, base: BaseState): boolean {
  const p = B.personalities[player.bot!.personality];
  if (!p.callsSupplyDrops || player.supplyCooldown > 0) return false;
  if (base.stored.power < BALANCE.supplyDrop.powerCost + B.supplyDropSparePower) return false;
  return base.stored.lifeSupport / storageCapacity(base, 'lifeSupport') < B.supplyDropLowLife;
}

// --- Moving ---

// Point the move input at `target`, stopping `stopAt` studs short of it.
function steerTo(input: PlayerInput, from: Vec2, target: Vec2, stopAt: number, pace: number): PlayerInput {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d <= Math.max(stopAt, 0.5)) return input;
  input.moveX = (dx / d) * pace;
  input.moveZ = (dz / d) * pace;
  return input;
}
