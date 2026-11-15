// The whole game is described by plain data objects (no classes), so the
// state is easy to copy, save, test, and translate to Luau tables later.
//
// Coordinates: gameplay works on the ground plane {x, z}. Height (y) comes
// from the terrain grid. 1 unit = 1 Roblox stud. Y is up.

import type { BotPersonality, BuildingKind, DisasterKind, FlareClass, PickupKind, PowerPriority, ResourceKind, TaskKind } from '../config/balance';
import type { RngState } from './rng';

export interface Vec2 {
  x: number;
  z: number;
}

// Elevation grid, stored row by row: heights[row * size + col].
// Row 0 is the north edge (z = -worldSize/2), col 0 is the west edge (x = -worldSize/2).
export interface TerrainGrid {
  size: number; // points per side
  worldSize: number; // studs per side
  heights: number[];
  isPlaceholder: boolean; // true = the made-up crater (used if the real map can't load)
}

// A real solar flare from NASA's DONKI database that an in-game flare replays.
export interface RealFlare {
  id: string; // DONKI flare id
  classType: string; // e.g. "X1.0"
  peakTime: string; // when it peaked (UTC), e.g. "2024-05-14T16:51Z"
}

// One entry of the flare list given to createGame (src/data/flares.json).
// classLetter picks the game's flare class (C, M or X).
export interface FlareRecord extends RealFlare {
  classLetter: FlareClass;
}

export interface PlayerInput {
  playerId: string;
  // Desired move direction on the ground, each from -1 to 1.
  // moveZ = -1 means "away from the camera" (W / up arrow).
  moveX: number;
  moveZ: number;
  // "Turn & walk" controls (used by the camera-behind view). When either is
  // set, moveX/moveZ are ignored. turn: +1 = turn right, -1 = turn left.
  // forward: +1 = walk forward, -1 = back up (without turning around).
  turn?: number;
  forward?: number;
  // Optional one-off command: change which building gets Power first.
  powerPriority?: PowerPriority;
  // Optional one-off command: ask Earth for a supply drop.
  callSupplyDrop?: boolean;
  // True while the work key (E) is HELD: works on a big pickup (mini task) you stand next to.
  work?: boolean;
}

export type Cargo = Record<PickupKind, number>;

export interface PlayerState {
  id: string;
  name: string;
  colorIndex: number; // which team color to use (visuals look this up)
  baseId: string;
  pos: Vec2;
  vel: Vec2;
  // Facing angle in radians around the Y axis. Models face -Z at heading 0
  // (the Roblox "forward" convention).
  heading: number;
  cargo: Cargo;
  cargoCount: number;
  mission: MissionState | null; // the one goal shown on the mission card
  missionTimer: number; // seconds until the next mission appears
  stars: number; // stars earned from missions so far
  missionsDone: number;
  supplyCooldown: number; // seconds until another supply drop can be called
  working: number | null; // id of the big pickup (mini task) you're working on right now
  bot: BotState | null; // null = a human; otherwise a computer rival's memory
}

// A computer rival's "brain". It walks around like a player would:
//   wander   → nothing in sight, walk somewhere new
//   seek     → walk to the best pickup it can see
//   task     → walk to a big pickup and work on it (mini task)
//   wreck    → walk to a wreck to absorb it
//   home     → backpack full (or a disaster is coming): walk home to unload
//   shelter  → stay home until the danger is over
export type BotMode = 'wander' | 'seek' | 'task' | 'wreck' | 'home' | 'shelter';

export interface BotState {
  personality: BotPersonality;
  mode: BotMode;
  targetPickupId: number | null; // the pickup it's heading for (seek)
  targetTaskId: number | null; // the big pickup it's heading for (task)
  targetWreckId: number | null; // the wreck it's heading for (wreck)
  wanderTo: Vec2 | null; // where it's walking (wander)
  thinkTimer: number; // seconds until it looks around again
  targetTimer: number; // seconds spent on the current target
  ignorePickupId: number | null; // a pickup it gave up on (e.g. stuck behind a hill)
}

// Missions: "bring N of something home" or "fill your battery to N".
export type MissionKind = 'bringRegolith' | 'bringIce' | 'bringSolar' | 'bringCrates' | 'storePower';

export interface MissionState {
  kind: MissionKind;
  target: number;
  progress: number;
  duration: number; // seconds you had in total
  timeLeft: number;
  disaster: DisasterKind | null; // the disaster this mission prepares for (if any)
}

export interface BuildingState {
  id: number;
  kind: BuildingKind;
  offset: Vec2; // position relative to the base center
  powered: boolean; // false = not enough Power, the building does nothing
}

export interface BaseState {
  id: string;
  ownerId: string;
  pos: Vec2;
  // 'wrecked' = all crew were lost. A new lander arrives after relaunchTimer.
  status: 'active' | 'wrecked';
  relaunchTimer: number;
  launches: number; // counts landings, so visuals know to rebuild the base
  crew: number;
  sick: number; // how many of `crew` are sick (they don't work)
  health: number; // crew health, 0–100, shared by the whole crew
  buildings: BuildingState[];
  buildPoints: number; // saved up toward the next building
  // Power and Life Support are stocks that fill up and drain.
  // Shielding is regolith piled on the base; compare it to what the base needs.
  stored: Record<ResourceKind, number>;
  landerPowered: boolean;
  powerPriority: PowerPriority;
  // Net change per sol from buildings and crew (not counting pickups). For the HUD arrows.
  netPerSol: { power: number; lifeSupport: number };
}

export interface PickupState {
  id: number;
  kind: PickupKind;
  pos: Vec2;
  active: boolean; // false while waiting to respawn
  respawnTimer: number;
  pulledBy: string | null; // player id whose magnet is pulling it
  // Temporary pickups (salvage, supply drops) never respawn: they vanish when
  // collected or when timeLeft runs out.
  temporary: boolean;
  timeLeft: number;
}

// A big pickup that needs a mini task (M4b): drill ice, fix a solar panel,
// scoop regolith. The magnet can't pull it; you hold the work key next to it.
export interface TaskSiteState {
  id: number;
  kind: TaskKind; // also the kind of item it gives you
  pos: Vec2;
  active: boolean; // false while waiting to respawn
  respawnTimer: number;
  progress: number; // seconds of work done so far (kept if you walk away)
  workerId: string | null; // the player working on it right now
}

// A disaster that is happening right now.
export interface ActiveDisaster {
  kind: DisasterKind;
  flareClass: FlareClass | null; // only for solar flares
  realFlare: RealFlare | null; // the real flare it replays (null = no flare data)
  strength: number; // 1 = normal
  startedAt: number;
  endsAt: number;
}

// The next disaster, already decided so we can warn players and plan missions.
export interface PlannedDisaster {
  kind: DisasterKind;
  flareClass: FlareClass | null;
  realFlare: RealFlare | null;
  strength: number;
  startsAt: number;
  warned: boolean;
}

// What's left of a base that lost all its crew. Bigger bases can absorb it.
export interface WreckState {
  id: number;
  pos: Vec2;
  ownerId: string;
  colorIndex: number;
  buildingCount: number; // how big the base was
  timeLeft: number; // seconds before it crumbles away
}

// A supply drop on its way from Earth.
export interface SupplyDropState {
  id: number;
  playerId: string;
  pos: Vec2; // where it will land
  calledAt: number;
  landsAt: number;
}

// Round flow: lobby countdown → timed play → podium.
export type RoundPhase = 'lobby' | 'playing' | 'ended';

export interface ScoreBreakdown {
  crew: number; // points from healthy crew
  buildings: number; // points from powered buildings
  stored: number; // points from stored resources
  missions: number; // points from mission stars
  total: number;
}

export interface Standing {
  playerId: string;
  name: string;
  colorIndex: number;
  isBot: boolean;
  rank: number; // 1 = winner
  score: ScoreBreakdown;
}

export interface RoundState {
  phase: RoundPhase;
  countdown: number; // lobby seconds left
  timed: boolean; // false = the round never ends (tests, free play)
  length: number; // seconds of play; time left = length - state.time
  endWarned: boolean; // the "30 seconds left" message was sent
  results: Standing[] | null; // final standings, set when the round ends
}

export interface GameState {
  seed: number;
  tick: number;
  time: number; // seconds since the game started
  rng: RngState;
  nextId: number; // used to give new buildings/pickups unique ids
  terrain: TerrainGrid;
  players: PlayerState[];
  bases: BaseState[];
  pickups: PickupState[];
  taskSites: TaskSiteState[]; // big pickups for mini tasks
  disastersEnabled: boolean;
  disaster: ActiveDisaster | null;
  nextDisaster: PlannedDisaster | null;
  // Real NASA flares replayed in order, one per in-game flare (empty = random classes).
  flares: FlareRecord[];
  nextFlareIndex: number;
  wrecks: WreckState[];
  supplyDrops: SupplyDropState[];
  // How long a radio signal takes between Earth and Mars this game, in minutes.
  lightMinutes: number;
  round: RoundState;
}

export function emptyCargo(): Cargo {
  return { crate: 0, ice: 0, regolith: 0, solar: 0 };
}

export function findBase(state: GameState, baseId: string): BaseState | undefined {
  for (const b of state.bases) if (b.id === baseId) return b;
  return undefined;
}

export function findPlayer(state: GameState, playerId: string): PlayerState | undefined {
  for (const p of state.players) if (p.id === playerId) return p;
  return undefined;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
