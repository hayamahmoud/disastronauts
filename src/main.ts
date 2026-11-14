// Entry point: connects the simulation (core) to the 3D view, the HUD and
// the keyboard, and runs the game loop.

import { BALANCE, type DisasterKind, type PowerPriority } from './config/balance';
import type { GameEvent } from './core/events';
import { createGame, step } from './core/simulation';
import { findBase, findPlayer } from './core/state';
import { createKeyboardInput } from './input/keyboard';
import { createGameView } from './render/gameView';
import { createHud, type Hud } from './ui/hud';
import { createStartScreen } from './ui/startScreen';
import './ui/startScreen.css';
import { createGameAudio } from './audio/gameAudio';
import { createMinimap } from './ui/minimap';
import { createScoreboard, type Scoreboard } from './ui/scoreboard';
import { createLobby, type Lobby } from './ui/lobby';
import { createPodium, type Podium } from './ui/podium';

const LOCAL_PLAYER = 'p1';
const audio = createGameAudio(LOCAL_PLAYER);
const params = new URLSearchParams(window.location.search);

// Use ?seed=123 in the URL to replay the exact same map; otherwise random.
// (Only the first round uses it; "Play again" always picks a new map.)
const urlSeed = Number(params.get('seed'));
const firstSeed = Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : randomSeed();
function randomSeed() {
  return Math.floor(Math.random() * 1e9);
}

let state: ReturnType<typeof createGame>;
let view: ReturnType<typeof createGameView> | null = null;
let hud: Hud;
let minimap: ReturnType<typeof createMinimap>;
let scoreboard: Scoreboard;
let lobby: Lobby;
let podium: Podium;
let playing = false;
let playerCount = 4;
let shadows = true;

const menu = createStartScreen((options) => {
  playerCount = options.players;
  shadows = menu.shadows();
  startRound(firstSeed);
}, audio);

// Builds a fresh round: new world, view and HUD. Used for the first round and
// for "Play again" (instant replay, no trip back to the menu).
function startRound(seed: number) {
  console.info(`Disastronauts seed: ${seed} (add ?seed=${seed} to the URL to replay this map)`);
  const ui = document.getElementById('ui')!;
  view?.dispose();
  ui.replaceChildren();

  // Player 1 is you; players 2-4 are computer rivals, one per personality.
  const order = BALANCE.bots.order;
  state = createGame({
    seed,
    players: Array.from({ length: playerCount }, (_, i) => {
      if (i === 0) return { id: 'p1', name: 'You' };
      const bot = order[(i - 1) % order.length];
      return { id: `p${i + 1}`, name: BALANCE.bots.personalities[bot].name, bot };
    }),
    // Dev only: ?round=60 for a 1-minute round, ?lobby=0 to skip the countdown.
    ...devRoundOverrides(),
  });
  view = createGameView(document.getElementById('game')!, state, LOCAL_PLAYER, shadows);
  hud = createHud(ui, LOCAL_PLAYER, state.terrain.isPlaceholder, togglePowerPriority, callEarth);
  minimap = createMinimap(ui, LOCAL_PLAYER, () => view!.getMapYaw());
  scoreboard = createScoreboard(ui, LOCAL_PLAYER);
  lobby = createLobby(ui, state, LOCAL_PLAYER);
  podium = createPodium(ui, LOCAL_PLAYER, () => { audio.click(); startRound(randomSeed()); }, backToMenu);
  pendingPriority = undefined;
  pendingSupplyDrop = false;
  if (import.meta.env.DEV) setUpDevHelpers();
  playing = true;
}

// Back to the start screen with a fresh random map (drops ?seed from the URL).
function backToMenu() {
  audio.click();
  window.location.href = window.location.pathname;
}

function devRoundOverrides() {
  if (!import.meta.env.DEV) return {};
  const round = Number(params.get('round'));
  const lobbySeconds = Number(params.get('lobby'));
  return {
    ...(params.has('round') && round > 0 ? { roundSeconds: round } : {}),
    ...(params.has('lobby') && lobbySeconds >= 0 ? { lobbySeconds } : {}),
  };
}

// Buttons and keys only do something while the round is being played.
function canAct() {
  return playing && state.round.phase === 'playing';
}

// Switching power priority is sent to the sim as part of the next input
// (the same way a Roblox client would ask the server).
let pendingPriority: PowerPriority | undefined;
function togglePowerPriority() {
  if (!canAct()) return;
  audio.click();
  const me = findPlayer(state, LOCAL_PLAYER);
  const base = me && findBase(state, me.baseId);
  if (!base) return;
  const current = pendingPriority ?? base.powerPriority;
  pendingPriority = current === 'greenhouse' ? 'shield_generator' : 'greenhouse';
}

// Calling Earth for a supply drop is also a one-off command.
let pendingSupplyDrop = false;
function callEarth() {
  if (!canAct()) return;
  audio.click();
  pendingSupplyDrop = true;
}

const keyboard = createKeyboardInput();
keyboard.onKeyPress('KeyC', () => { if (playing) view?.toggleCameraMode(); });
keyboard.onKeyPress('KeyP', togglePowerPriority);
keyboard.onKeyPress('Space', callEarth);

// Dev builds only (not in the deployed game). Runs when you press Start.
// - Inspect the live state from the browser console with `__disastronauts.state`.
// - ?disaster=dustStorm (or solarFlare, coldNight) makes that disaster the next
//   one, starting 10 seconds into the game.
// - ?skip=30 fast-forwards the game 30 seconds (after the lobby).
// - ?round=60 makes the round 60 seconds long; ?lobby=0 skips the countdown.
function setUpDevHelpers() {
  (window as unknown as { __disastronauts: unknown }).__disastronauts = { state };
  const kind = params.get('disaster');
  if (kind && kind in BALANCE.disasters.weights) {
    const flare = kind === 'solarFlare';
    state.nextDisaster = {
      kind: kind as DisasterKind,
      flareClass: flare ? 'X' : null,
      strength: flare ? BALANCE.disasters.solarFlare.classes.X.strength : 1,
      startsAt: 10,
      warned: false,
    };
  }
  const skip = Number(params.get('skip'));
  if (skip > 0) state.round.countdown = 0; // skipping makes no sense with a countdown in the way
  for (let t = 0; t < skip; t += BALANCE.sim.fixedDt) step(state, [], BALANCE.sim.fixedDt);
}

// Game loop: the sim advances in fixed 1/60 s steps (same result on every
// computer); rendering happens once per screen frame.
let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25); // ignore huge gaps (e.g. tab was hidden)
  last = now;
  if (!playing || !view) { requestAnimationFrame(frame); return; }
  accumulator += dt;

  const events: GameEvent[] = [];
  let steps = 0;
  while (accumulator >= BALANCE.sim.fixedDt && steps < BALANCE.sim.maxStepsPerFrame) {
    // Behind view: A/D turn and W/S walk. Top view: W/A/S/D move up/left/down/right
    // on the SCREEN, so we turn the keys by however far the map has been dragged.
    const move = keyboard.getMove();
    const steer = view.getCameraMode() === 'follow' ? keyboard.getTurnWalk() : {};
    const yaw = view.getMapYaw();
    const moveX = move.x * Math.cos(yaw) + move.z * Math.sin(yaw);
    const moveZ = -move.x * Math.sin(yaw) + move.z * Math.cos(yaw);
    const input = { playerId: LOCAL_PLAYER, moveX, moveZ, ...steer, powerPriority: pendingPriority, callSupplyDrop: pendingSupplyDrop };
    pendingPriority = undefined; // one-off commands: send them once
    pendingSupplyDrop = false;
    // The computer rivals decide their own moves inside step().
    events.push(...step(state, [input], BALANCE.sim.fixedDt));
    accumulator -= BALANCE.sim.fixedDt;
    steps++;
  }
  if (steps === BALANCE.sim.maxStepsPerFrame) accumulator = 0; // fell behind: drop the backlog

  view.update(state, events, dt);
  hud.update(state, events);
  audio.update(events, state.players[0].baseId);
  minimap.update(state);
  scoreboard.update(state);
  lobby.update(state, events);
  podium.update(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
