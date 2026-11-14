// The heart of the game. createGame() builds a fresh state; step() advances
// it by dt seconds. Same seed + same inputs = exactly the same game.
// On Roblox this is the server Script: it owns the state, clients only send inputs.

import { BALANCE } from '../config/balance';
import { updateCrew } from './crew';
import { updateDayNight } from './dayNight';
import type { GameEvent } from './events';
import { moveRover } from './movement';
import { randomPointInPlayArea, spawnInitialPickups, updateDeposits, updatePickups } from './pickups';
import { updateResources } from './resources';
import { createRng } from './rng';
import type { BaseState, GameState, PlayerInput, PlayerState, TerrainGrid, Vec2 } from './state';
import { distance, emptyCargo, findBase } from './state';
import { generatePlaceholderTerrain } from './terrain';

export interface PlayerSetup {
  id: string;
  name: string;
}

export interface GameSetup {
  seed: number;
  players: PlayerSetup[];
  terrain?: TerrainGrid; // defaults to the placeholder crater
}

export function createGame(setup: GameSetup): GameState {
  const state: GameState = {
    seed: setup.seed,
    tick: 0,
    time: 0,
    rng: createRng(setup.seed),
    nextId: 1,
    terrain: setup.terrain ?? generatePlaceholderTerrain(setup.seed),
    players: [],
    bases: [],
    pickups: [],
  };

  setup.players.forEach((ps, index) => {
    const basePos = pickBaseSpawn(state);
    const base: BaseState = {
      id: 'base_' + ps.id,
      ownerId: ps.id,
      pos: basePos,
      crew: BALANCE.base.startCrew,
      sick: 0,
      health: BALANCE.crew.maxHealth,
      buildings: [],
      buildPoints: 0,
      stored: { ...BALANCE.resources.start },
      landerPowered: true,
      powerPriority: 'greenhouse',
      netPerSol: { power: 0, lifeSupport: 0 },
    };
    const player: PlayerState = {
      id: ps.id,
      name: ps.name,
      colorIndex: index,
      baseId: base.id,
      // Rover starts just south (toward the camera) of its lander.
      pos: { x: basePos.x, z: basePos.z + BALANCE.base.roverSpawnOffset },
      vel: { x: 0, z: 0 },
      heading: 0,
      cargo: emptyCargo(),
      cargoCount: 0,
    };
    state.bases.push(base);
    state.players.push(player);
  });

  spawnInitialPickups(state);
  return state;
}

// Advance the game by dt seconds. Mutates `state` in place and returns the
// events that happened during this step (for effects, sounds and UI).
export function step(state: GameState, inputs: PlayerInput[], dt: number): GameEvent[] {
  const events: GameEvent[] = [];

  for (const player of state.players) {
    const input = findInput(inputs, player.id);
    moveRover(player, input, state.terrain, dt);
    applyCommands(state, player, input);
  }
  updatePickups(state, dt, events);
  updateDeposits(state, events);
  updateResources(state, dt, events);
  updateCrew(state, dt, events);
  updateDayNight(state, dt, events);

  state.tick += 1;
  state.time += dt;
  return events;
}

// One-off commands that come with the input (not movement).
function applyCommands(state: GameState, player: PlayerState, input: PlayerInput | undefined): void {
  if (!input || !input.powerPriority) return;
  const base = findBase(state, player.baseId);
  if (base) base.powerPriority = input.powerPriority;
}

function findInput(inputs: PlayerInput[], playerId: string): PlayerInput | undefined {
  for (const i of inputs) if (i.playerId === playerId) return i;
  return undefined;
}

// Random spot in the play area, kept apart from other bases when possible.
function pickBaseSpawn(state: GameState): Vec2 {
  let best = randomPointInPlayArea(state);
  for (let tries = 0; tries < 30; tries++) {
    let ok = true;
    for (const b of state.bases) {
      if (distance(best, b.pos) < BALANCE.base.minSpawnDistance) ok = false;
    }
    if (ok) return best;
    best = randomPointInPlayArea(state);
  }
  return best;
}
