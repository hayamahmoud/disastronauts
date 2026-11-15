// Mini tasks (M4b): BIG pickups that the magnet can't pull.
// - Ice deposit: drill it.   - Broken solar panel: fix it.   - Regolith pile: scoop it.
// Stand next to one and HOLD the work key. You stand still while you work
// (costs time, risky when a disaster is coming), and when the bar fills, a
// bunch of items of that kind go into your backpack. Work done is kept if you
// stop or walk away, so nobody loses progress by letting go.

import { BALANCE, type TaskKind } from '../config/balance';
import type { GameEvent } from './events';
import { cargoCapacity } from './growth';
import { randomPointInPlayArea } from './pickups';
import { rngWeighted } from './rng';
import type { GameState, PlayerInput, PlayerState, TaskSiteState, Vec2 } from './state';
import { distance, findPlayer } from './state';

const T = BALANCE.tasks;
const TASK_KINDS = Object.keys(T.kinds) as TaskKind[];

export function spawnInitialTaskSites(state: GameState): void {
  for (let i = 0; i < T.count; i++) {
    const site: TaskSiteState = {
      id: state.nextId++,
      kind: 'ice',
      pos: { x: 0, z: 0 },
      active: true,
      respawnTimer: 0,
      progress: 0,
      workerId: null,
    };
    placeTaskSite(state, site);
    state.taskSites.push(site);
  }
}

// Give a site a new random kind and spot, away from bases.
function placeTaskSite(state: GameState, site: TaskSiteState): void {
  site.kind = rngWeighted(state.rng, TASK_KINDS, (k) => T.kinds[k].weight);
  site.pos = pointAwayFromBases(state);
  site.active = true;
  site.respawnTimer = 0;
  site.progress = 0;
  site.workerId = null;
}

function pointAwayFromBases(state: GameState): Vec2 {
  let point = randomPointInPlayArea(state);
  for (let tries = 0; tries < 5; tries++) {
    let ok = true;
    for (const b of state.bases) {
      if (distance(point, b.pos) < T.minDistanceFromBase) ok = false;
    }
    if (ok) break;
    point = randomPointInPlayArea(state);
  }
  return point;
}

// Is there room in the backpack for everything this site gives?
export function hasRoomFor(state: GameState, player: PlayerState, kind: TaskKind): boolean {
  return cargoCapacity(state, player) - player.cargoCount >= T.kinds[kind].reward;
}

// The closest site this player is near enough to work on (ignoring whether
// there's room in the backpack). Used by the sim, the HUD prompt and bots.
export function nearestTaskSite(state: GameState, player: PlayerState): TaskSiteState | null {
  let best: TaskSiteState | null = null;
  let bestD: number = T.workRadius;
  for (const site of state.taskSites) {
    if (!site.active) continue;
    if (site.workerId !== null && site.workerId !== player.id) continue; // someone else is on it
    const d = distance(player.pos, site.pos);
    if (d <= bestD) {
      bestD = d;
      best = site;
    }
  }
  return best;
}

export function findTaskSite(state: GameState, id: number | null): TaskSiteState | null {
  if (id === null) return null;
  for (const s of state.taskSites) if (s.id === id) return s;
  return null;
}

// Decide whether this player is working this step. Called BEFORE movement:
// returns true if they're working, which means they stand still.
export function updateWorking(state: GameState, player: PlayerState, input: PlayerInput | undefined, events: GameEvent[]): boolean {
  const current = findTaskSite(state, player.working);
  if (!input || !input.work) {
    stopWorking(player, current);
    return false;
  }
  // Keep working on the same site while it's still there and in reach.
  if (current && current.active && distance(player.pos, current.pos) <= T.workRadius) return true;
  stopWorking(player, current);

  const site = nearestTaskSite(state, player);
  if (!site || !hasRoomFor(state, player, site.kind)) return false;
  site.workerId = player.id;
  player.working = site.id;
  events.push({ type: 'TaskStarted', playerId: player.id, siteId: site.id, kind: site.kind });
  return true;
}

function stopWorking(player: PlayerState, site: TaskSiteState | null): void {
  if (site && site.workerId === player.id) site.workerId = null;
  player.working = null;
}

// Stand still and face the site you're working on.
export function holdStill(player: PlayerState, state: GameState): void {
  player.vel.x = 0;
  player.vel.z = 0;
  const site = findTaskSite(state, player.working);
  if (site) player.heading = Math.atan2(-(site.pos.x - player.pos.x), -(site.pos.z - player.pos.z));
}

// Fill the work bars; finished sites put their items in the backpack.
// Finished or idle sites count down to respawning somewhere new.
export function updateTaskSites(state: GameState, dt: number, events: GameEvent[]): void {
  for (const site of state.taskSites) {
    if (!site.active) {
      site.respawnTimer -= dt;
      if (site.respawnTimer <= 0) placeTaskSite(state, site);
      continue;
    }
    if (site.workerId === null) continue;
    const player = findPlayer(state, site.workerId);
    if (!player || player.working !== site.id) {
      site.workerId = null;
      continue;
    }
    site.progress += dt;
    if (site.progress < T.kinds[site.kind].seconds) continue;

    // Done! Everything goes in the backpack. Room was checked when work started
    // and the magnet is paused while you work; the min() is just a safety net.
    const items = Math.min(T.kinds[site.kind].reward, cargoCapacity(state, player) - player.cargoCount);
    player.cargo[site.kind] += items;
    player.cargoCount += items;
    player.working = null;
    site.active = false;
    site.workerId = null;
    site.progress = 0;
    site.respawnTimer = T.respawnDelay;
    events.push({ type: 'TaskCompleted', playerId: player.id, siteId: site.id, kind: site.kind, items });
    if (player.cargoCount >= cargoCapacity(state, player)) events.push({ type: 'CargoFull', playerId: player.id });
  }
}

// 0 to 1: how far along a site's work bar is.
export function taskProgress(site: TaskSiteState): number {
  return Math.min(1, site.progress / T.kinds[site.kind].seconds);
}
