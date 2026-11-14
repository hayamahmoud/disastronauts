// The whole game is described by plain data objects (no classes), so the
// state is easy to copy, save, test, and translate to Luau tables later.
//
// Coordinates: gameplay works on the ground plane {x, z}. Height (y) comes
// from the terrain grid. 1 unit = 1 Roblox stud. Y is up.

import type { BuildingKind, PickupKind, ResourceKind } from '../config/balance';
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
  isPlaceholder: boolean; // true until real Mars Trek data is loaded
}

export interface PlayerInput {
  playerId: string;
  // Desired move direction on the ground, each from -1 to 1.
  // moveZ = -1 means "away from the camera" (W / up arrow).
  moveX: number;
  moveZ: number;
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
}

export interface BuildingState {
  id: number;
  kind: BuildingKind;
  offset: Vec2; // position relative to the base center
}

export interface BaseState {
  id: string;
  ownerId: string;
  pos: Vec2;
  crew: number;
  buildings: BuildingState[];
  buildPoints: number; // saved up toward the next building
  stored: Record<ResourceKind, number>;
}

export interface PickupState {
  id: number;
  kind: PickupKind;
  pos: Vec2;
  active: boolean; // false while waiting to respawn
  respawnTimer: number;
  pulledBy: string | null; // player id whose magnet is pulling it
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
