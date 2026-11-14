// Missions: one clear goal at a time, shown on the mission card.
// Most missions get you ready for the next disaster ("A flare is coming!
// Bring 5 soil home for your shield"). Otherwise they help with whatever your
// base needs most. Finish fast for 3 stars, in time for 2, half-done for 1.

import { BALANCE, type PickupKind } from '../config/balance';
import { secondsUntilNextDisaster } from './disasters';
import type { GameEvent } from './events';
import { shieldCoverage, storageCapacity } from './resources';
import type { BaseState, GameState, MissionKind, MissionState, PlayerState } from './state';
import { findBase } from './state';

const M = BALANCE.missions;

// Which pickup each "bring" mission counts.
export const MISSION_PICKUP: Record<Exclude<MissionKind, 'storePower'>, PickupKind> = {
  bringRegolith: 'regolith',
  bringIce: 'ice',
  bringSolar: 'solar',
  bringCrates: 'crate',
};

export function updateMissions(state: GameState, dt: number, events: GameEvent[]): void {
  for (const player of state.players) {
    const base = findBase(state, player.baseId);

    // No base (it was wrecked): drop the mission, a new one comes after landing.
    if (!base || base.status !== 'active') {
      player.mission = null;
      player.missionTimer = M.gap;
      continue;
    }

    const mission = player.mission;
    if (!mission) {
      player.missionTimer -= dt;
      if (player.missionTimer <= 0) {
        player.mission = pickMission(state, base);
        const m = player.mission;
        events.push({ type: 'MissionStarted', playerId: player.id, kind: m.kind, target: m.target, disaster: m.disaster });
      }
      continue;
    }

    updateProgress(mission, player, base, events);
    mission.timeLeft -= dt;

    if (mission.progress >= mission.target) {
      // Done! Faster = more stars.
      const fast = mission.timeLeft >= mission.duration * (1 - M.fastFraction);
      finishMission(player, fast ? 3 : 2, true, events);
    } else if (mission.timeLeft <= 0) {
      // Out of time: 1 star for getting at least halfway.
      const partial = mission.progress >= mission.target * M.partialFraction;
      finishMission(player, partial ? 1 : 0, false, events);
    }
  }
}

// Count what this player unloaded at home during this step.
function updateProgress(mission: MissionState, player: PlayerState, base: BaseState, events: GameEvent[]): void {
  if (mission.kind === 'storePower') {
    mission.progress = Math.floor(base.stored.power);
    return;
  }
  const kind = MISSION_PICKUP[mission.kind];
  for (const e of events) {
    if (e.type === 'CargoDeposited' && e.playerId === player.id) mission.progress += e.items[kind];
  }
  mission.progress = Math.min(mission.progress, mission.target);
}

function finishMission(player: PlayerState, stars: number, completed: boolean, events: GameEvent[]): void {
  const m = player.mission;
  if (!m) return;
  player.stars += stars;
  if (completed) player.missionsDone += 1;
  events.push({ type: 'MissionEnded', playerId: player.id, kind: m.kind, stars, completed });
  player.mission = null;
  player.missionTimer = M.gap;
}

// Choose the next mission. Disaster coming soon? Prepare for it. Otherwise fix
// whatever is running low.
export function pickMission(state: GameState, base: BaseState): MissionState {
  const lead = secondsUntilNextDisaster(state);
  const next = state.nextDisaster;
  if (next && lead >= M.minDisasterLead && lead <= M.maxDisasterLead) {
    if (next.kind === 'solarFlare') {
      // Flare: pile up soil (regolith) for the shield.
      return newMission('bringRegolith', itemTarget(base, lead), lead, next.kind);
    }
    // Dust storm or cold night: charge the battery before Power gets scarce.
    const target = powerTarget(base);
    if (target > base.stored.power + 1) return newMission('storePower', target, lead, next.kind);
    return newMission('bringSolar', itemTarget(base, lead), lead, next.kind);
  }

  const duration = M.genericDuration;
  const items = itemTarget(base, duration);
  if (base.stored.lifeSupport / storageCapacity(base, 'lifeSupport') < M.lowFraction) {
    return newMission('bringIce', items, duration, null);
  }
  if (base.stored.power / storageCapacity(base, 'power') < M.lowFraction) {
    return newMission('bringSolar', items, duration, null);
  }
  if (shieldCoverage(base) < 1) return newMission('bringRegolith', items, duration, null);
  return newMission('bringCrates', items, duration, null);
}

function newMission(kind: MissionKind, target: number, duration: number, disaster: MissionState['disaster']): MissionState {
  return { kind, target, progress: 0, duration, timeLeft: duration, disaster };
}

// "Bring N things": bigger bases get bigger goals, but never more than the time allows.
export function itemTarget(base: BaseState, seconds: number): number {
  const bySize = M.minItems + Math.floor(base.buildings.length / 3);
  const byTime = Math.max(M.minItems, Math.floor(seconds / M.secondsPerItem));
  return Math.max(M.minItems, Math.min(bySize, byTime, M.maxItems));
}

// "Store N Power": a bit more than you have, rounded up to 5, below the battery limit.
export function powerTarget(base: BaseState): number {
  const want = Math.ceil((base.stored.power + M.powerTargetBoost) / 5) * 5;
  return Math.min(Math.floor(storageCapacity(base, 'power') * M.powerTargetMaxFraction), want);
}
