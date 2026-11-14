// Disasters: dust storms, solar flares and cold nights. They hit every base at
// the same time, always after a warning, so players can get ready.
//
// - Dust storm (daytime only): solar panels make much less Power, and the wind slows you down.
// - Solar flare: your base needs extra Shielding while it lasts; crew NOT covered
//   get hurt (more if your astronaut is outside).
// - Cold night: from sunset to sunrise, every shelter needs extra Power for heaters.
//
// The next disaster is always decided in advance (state.nextDisaster), so
// missions can say "A flare is coming! Bring soil for your shield".

import { BALANCE, type DisasterKind, type FlareClass } from '../config/balance';
import { timeOfSol } from './dayNight';
import type { GameEvent } from './events';
import { rngRange, rngWeighted } from './rng';
import type { GameState, PlannedDisaster } from './state';

const D = BALANCE.disasters;
const KINDS = Object.keys(D.weights) as DisasterKind[];
const FLARE_CLASSES = Object.keys(D.solarFlare.classes) as FlareClass[];
const SUNSET = 0.75; // time-of-sol when the sun sets (see dayNight.ts)

// Called once by createGame.
export function setupDisasters(state: GameState, enabled: boolean): void {
  state.disastersEnabled = enabled;
  state.disaster = null;
  state.nextDisaster = enabled ? planDisaster(state, D.firstDelay) : null;
}

// Decide the next disaster: which kind, how strong, and when (no earlier than `earliest`).
function planDisaster(state: GameState, earliest: number): PlannedDisaster {
  const kind = rngWeighted(state.rng, KINDS, (k) => D.weights[k]);
  let startsAt = earliest;
  let flareClass: FlareClass | null = null;
  let strength = 1;

  if (kind === 'dustStorm') {
    // A storm only starts in the morning window; otherwise it waits for the next one.
    const w = D.dustStorm.startWindow;
    const tos = timeOfSol(earliest);
    if (tos < w.from || tos > w.to) {
      const untilMorning = (((w.from - tos) % 1) + 1) % 1;
      startsAt = earliest + untilMorning * BALANCE.sol.seconds;
    }
  }
  if (kind === 'coldNight') {
    // A cold night waits for the next sunset.
    const untilSunset = (((SUNSET - timeOfSol(earliest)) % 1) + 1) % 1;
    startsAt = earliest + untilSunset * BALANCE.sol.seconds;
  }
  if (kind === 'solarFlare') {
    flareClass = rngWeighted(state.rng, FLARE_CLASSES, (c) => D.solarFlare.classes[c].weight);
    strength = D.solarFlare.classes[flareClass].strength;
  }
  return { kind, flareClass, strength, startsAt, warned: false };
}

// How long a disaster of this kind lasts, in seconds.
export function disasterDuration(kind: DisasterKind): number {
  if (kind === 'dustStorm') return D.dustStorm.duration;
  if (kind === 'solarFlare') return D.solarFlare.duration;
  return BALANCE.sol.seconds / 2; // cold night: sunset to sunrise is half a sol
}

export function updateDisasters(state: GameState, events: GameEvent[]): void {
  if (!state.disastersEnabled) return;
  const now = state.time;

  // The current disaster is over.
  if (state.disaster && now >= state.disaster.endsAt) {
    events.push({ type: 'DisasterEnded', kind: state.disaster.kind });
    state.disaster = null;
  }

  const next = state.nextDisaster;
  if (!next || state.disaster) return;

  // Warn everyone a few seconds before it hits.
  if (!next.warned && now >= next.startsAt - D.warningSeconds) {
    next.warned = true;
    events.push({
      type: 'DisasterWarning',
      kind: next.kind,
      flareClass: next.flareClass,
      startsIn: Math.max(0, next.startsAt - now),
    });
  }

  // It hits! Plan the one after it right away (so missions can prepare for it).
  if (now >= next.startsAt) {
    const duration = disasterDuration(next.kind);
    state.disaster = {
      kind: next.kind,
      flareClass: next.flareClass,
      strength: next.strength,
      startedAt: now,
      endsAt: now + duration,
    };
    events.push({ type: 'DisasterStarted', kind: next.kind, flareClass: next.flareClass, duration });
    const gap = rngRange(state.rng, D.minGap, D.maxGap);
    state.nextDisaster = planDisaster(state, state.disaster.endsAt + gap);
  }
}

// Is this kind of disaster happening right now?
export function disasterActive(state: GameState, kind: DisasterKind): boolean {
  return state.disaster !== null && state.disaster.kind === kind;
}

// Solar panels make this share of their normal Power (dust blocks the sun).
export function solarFactor(state: GameState): number {
  return disasterActive(state, 'dustStorm') ? D.dustStorm.solarFactor : 1;
}

// Astronauts walk at this share of their normal speed (wind in a dust storm).
export function walkSpeedFactor(state: GameState): number {
  return disasterActive(state, 'dustStorm') ? D.dustStorm.walkSpeedFactor : 1;
}

// During a flare of this class, a base needs this many times its normal Shielding.
export function flareShieldNeed(flareClass: FlareClass | null): number {
  return flareClass ? D.solarFlare.classes[flareClass].shieldNeed : 1;
}

// Extra Power per sol each shelter (lander/habitat) needs for heaters.
export function heatPerShelterPerSol(state: GameState): number {
  return disasterActive(state, 'coldNight') ? D.coldNight.heatPerShelterPerSol : 0;
}

// Seconds until the next disaster hits (Infinity if none is planned).
export function secondsUntilNextDisaster(state: GameState): number {
  if (!state.nextDisaster) return Infinity;
  return state.nextDisaster.startsAt - state.time;
}
