// Round flow: lobby countdown → 5 minutes of play → podium.
// - Lobby: everyone has landed, nobody can move yet, the clock counts down.
// - Playing: the normal game. When time runs out the round ends.
// - Ended: the world freezes and the final standings are saved for the podium.

import { BALANCE } from '../config/balance';
import type { GameEvent } from './events';
import { standings } from './scoring';
import type { GameState, RoundState } from './state';

export interface RoundSetup {
  timed: boolean; // false = no lobby and no time limit (tests, free play)
  lobbySeconds: number;
  seconds: number;
}

export function createRound(setup: RoundSetup): RoundState {
  const hasLobby = setup.timed && setup.lobbySeconds > 0;
  return {
    phase: hasLobby ? 'lobby' : 'playing',
    countdown: hasLobby ? setup.lobbySeconds : 0,
    timed: setup.timed,
    length: setup.seconds,
    endWarned: false,
    results: null,
  };
}

// Lobby: count down, telling the UI each time a new whole second starts.
export function updateLobby(state: GameState, dt: number, events: GameEvent[]): void {
  const r = state.round;
  const before = Math.ceil(r.countdown);
  r.countdown = Math.max(0, r.countdown - dt);
  const after = Math.ceil(r.countdown);
  if (after < before && after > 0) events.push({ type: 'RoundCountdown', secondsLeft: after });
  if (r.countdown <= 0) {
    r.phase = 'playing';
    events.push({ type: 'RoundStarted', seconds: r.length });
  }
}

// Seconds of play left (Infinity in an untimed game).
export function roundTimeLeft(state: GameState): number {
  const r = state.round;
  if (!r.timed) return Infinity;
  if (r.phase === 'lobby') return r.length;
  return Math.max(0, r.length - state.time);
}

// Playing: warn near the end, then end the round when the clock hits zero.
export function updateRoundTimer(state: GameState, events: GameEvent[]): void {
  const r = state.round;
  if (!r.timed || r.phase !== 'playing') return;
  const left = roundTimeLeft(state);
  const warnAt = BALANCE.round.endWarningSeconds;
  if (!r.endWarned && left <= warnAt && r.length > warnAt) {
    r.endWarned = true;
    events.push({ type: 'RoundEndingSoon', secondsLeft: Math.ceil(left) });
  }
  if (left <= 0) {
    r.phase = 'ended';
    r.results = standings(state);
    events.push({ type: 'RoundEnded', results: r.results });
  }
}
