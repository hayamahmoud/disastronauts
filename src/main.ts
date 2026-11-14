// Entry point: connects the simulation (core) to the 3D view, the HUD and
// the keyboard, and runs the game loop.

import { BALANCE, type PowerPriority } from './config/balance';
import type { GameEvent } from './core/events';
import { createGame, step } from './core/simulation';
import { findBase, findPlayer } from './core/state';
import { createKeyboardInput } from './input/keyboard';
import { createGameView } from './render/gameView';
import { createHud, type Hud } from './ui/hud';
import { createStartScreen } from './ui/startScreen';
import { explorerInput } from './core/explorerInput';
import './ui/startScreen.css';
import { createGameAudio } from './audio/gameAudio';
import { createMinimap } from './ui/minimap';

const LOCAL_PLAYER = 'p1';
const audio = createGameAudio(LOCAL_PLAYER);

// Use ?seed=123 in the URL to replay the exact same map; otherwise random.
const urlSeed = Number(new URLSearchParams(window.location.search).get('seed'));
const seed = Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : Math.floor(Math.random() * 1e9);
console.info(`Disastronauts seed: ${seed} (add ?seed=${seed} to the URL to replay this map)`);

let state: ReturnType<typeof createGame>;
let view: ReturnType<typeof createGameView>;
let hud: Hud;
let minimap: ReturnType<typeof createMinimap>;
let playing = false;
const menu = createStartScreen(options => {
  state = createGame({
    seed,
    players: Array.from({ length: options.players }, (_, i) => ({ id: `p${i + 1}`, name: i === 0 ? 'You' : `Explorer ${i + 1}` })),
  });
  view = createGameView(document.getElementById('game')!, state, LOCAL_PLAYER, menu.shadows());
  hud = createHud(document.getElementById('ui')!, LOCAL_PLAYER, state.terrain.isPlaceholder, togglePowerPriority);
  minimap = createMinimap(document.getElementById('ui')!, LOCAL_PLAYER, () => view.getMapYaw());
  playing = true;
  if (import.meta.env.DEV) {
    (window as unknown as { __disastronauts: unknown }).__disastronauts = { state };
  }
}, audio);
// Switching power priority is sent to the sim as part of the next input
// (the same way a Roblox client would ask the server).
let pendingPriority: PowerPriority | undefined;
function togglePowerPriority() {
  if (!playing) return;
  audio.click();
  const me = findPlayer(state, LOCAL_PLAYER);
  const base = me && findBase(state, me.baseId);
  if (!base) return;
  const current = pendingPriority ?? base.powerPriority;
  pendingPriority = current === 'greenhouse' ? 'shield_generator' : 'greenhouse';
}

const keyboard = createKeyboardInput();
keyboard.onKeyPress('KeyC', () => { if (playing) view.toggleCameraMode(); });
keyboard.onKeyPress('KeyP', togglePowerPriority);

// Game loop: the sim advances in fixed 1/60 s steps (same result on every
// computer); rendering happens once per screen frame.
let last = performance.now();
let accumulator = 0;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25); // ignore huge gaps (e.g. tab was hidden)
  last = now;
  if (!playing) { requestAnimationFrame(frame); return; }
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
    const input = { playerId: LOCAL_PLAYER, moveX, moveZ, ...steer, powerPriority: pendingPriority };
    pendingPriority = undefined; // a one-off command: send it once
    const inputs = [input, ...state.players.slice(1).map(player => explorerInput(state, player))];
    events.push(...step(state, inputs, BALANCE.sim.fixedDt));
    accumulator -= BALANCE.sim.fixedDt;
    steps++;
  }
  if (steps === BALANCE.sim.maxStepsPerFrame) accumulator = 0; // fell behind: drop the backlog

  view.update(state, events, dt);
  hud.update(state, events);
  audio.update(events, state.players[0].baseId);
  minimap.update(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
