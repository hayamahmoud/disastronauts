// The heart of the game. createGame() builds a fresh state; step() advances
// it by dt seconds. Same seed + same inputs = exactly the same game.
// On Roblox this is the server Script: it owns the state, clients only send inputs.

import { BALANCE, type BotPersonality } from '../config/balance';
import { botInput, createBotState } from './bots';
import { updateCrew } from './crew';
import { updateDayNight } from './dayNight';
import { setupDisasters, updateDisasters, walkSpeedFactor } from './disasters';
import type { GameEvent } from './events';
import { updateMissions } from './missions';
import { moveRover } from './movement';
import { spawnInitialPickups, updateDeposits, updatePickups } from './pickups';
import { updateResources } from './resources';
import { createRng, rngNext } from './rng';
import { createRound, updateLobby, updateRoundTimer } from './round';
import type { BaseState, FlareRecord, GameState, PlayerInput, PlayerState, TerrainGrid } from './state';
import { emptyCargo, findBase } from './state';
import { requestSupplyDrop, rollLightMinutes, updateSupplyDrops } from './supplyDrop';
import { generatePlaceholderTerrain } from './terrain';
import { pickBaseSpawn, updateWrecks } from './wrecks';

export interface PlayerSetup {
  id: string;
  name: string;
  bot?: BotPersonality; // set = a computer rival with this personality
}

export interface GameSetup {
  seed: number;
  players: PlayerSetup[];
  terrain?: TerrainGrid; // the real Jezero map (see terrainFromData); defaults to the placeholder crater
  flares?: FlareRecord[]; // real flares to replay in order; without them flare classes are random
  disasters?: boolean; // defaults to true; tests can turn disasters off
  // Rounds (lobby countdown + time limit). Defaults to true; tests turn them
  // off so the game starts right away and never ends.
  rounds?: boolean;
  lobbySeconds?: number; // defaults to BALANCE.round.lobbySeconds
  roundSeconds?: number; // defaults to BALANCE.round.seconds
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
    disastersEnabled: false,
    disaster: null,
    nextDisaster: null,
    flares: setup.flares ?? [],
    nextFlareIndex: 0,
    wrecks: [],
    supplyDrops: [],
    lightMinutes: 0,
    round: createRound({
      timed: setup.rounds ?? true,
      lobbySeconds: setup.lobbySeconds ?? BALANCE.round.lobbySeconds,
      seconds: setup.roundSeconds ?? BALANCE.round.seconds,
    }),
  };

  setup.players.forEach((ps, index) => {
    const basePos = pickBaseSpawn(state);
    const base: BaseState = {
      id: 'base_' + ps.id,
      ownerId: ps.id,
      pos: basePos,
      status: 'active',
      relaunchTimer: 0,
      launches: 1,
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
      mission: null,
      missionTimer: BALANCE.missions.firstDelay,
      stars: 0,
      missionsDone: 0,
      supplyCooldown: 0,
      bot: ps.bot ? createBotState(ps.bot) : null,
    };
    state.bases.push(base);
    state.players.push(player);
  });

  spawnInitialPickups(state);
  state.lightMinutes = rollLightMinutes(state);
  // Each game starts the flare replay at a different (seeded) point in the list.
  if (state.flares.length > 0) state.nextFlareIndex = Math.floor(rngNext(state.rng) * state.flares.length);
  setupDisasters(state, setup.disasters ?? true);
  return state;
}

// Advance the game by dt seconds. Mutates `state` in place and returns the
// events that happened during this step (for effects, sounds and UI).
export function step(state: GameState, inputs: PlayerInput[], dt: number): GameEvent[] {
  const events: GameEvent[] = [];

  // Lobby: everyone has landed but waits for the countdown. Ended: frozen.
  if (state.round.phase === 'lobby') {
    updateLobby(state, dt, events);
    state.tick += 1;
    return events;
  }
  if (state.round.phase === 'ended') return events;

  for (const player of state.players) {
    // Bots decide their own input here, the same shape a human's input has.
    const input = player.bot ? botInput(state, player, dt) : findInput(inputs, player.id);
    moveRover(player, input, state.terrain, dt, walkSpeedFactor(state));
    applyCommands(state, player, input, events);
  }
  updateDisasters(state, events);
  updatePickups(state, dt, events);
  updateDeposits(state, events);
  updateSupplyDrops(state, dt, events);
  updateResources(state, dt, events);
  updateCrew(state, dt, events);
  updateWrecks(state, dt, events);
  updateMissions(state, dt, events);
  updateDayNight(state, dt, events);

  state.tick += 1;
  state.time += dt;
  updateRoundTimer(state, events);
  return events;
}

// One-off commands that come with the input (not movement).
function applyCommands(state: GameState, player: PlayerState, input: PlayerInput | undefined, events: GameEvent[]): void {
  if (!input) return;
  const base = findBase(state, player.baseId);
  if (input.powerPriority && base) base.powerPriority = input.powerPriority;
  if (input.callSupplyDrop) requestSupplyDrop(state, player, events);
}

function findInput(inputs: PlayerInput[], playerId: string): PlayerInput | undefined {
  for (const i of inputs) if (i.playerId === playerId) return i;
  return undefined;
}
