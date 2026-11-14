// The asset manifest: every visual asset in the game, listed by ID.
// Game code refers ONLY to these IDs, never to file paths.
//
// To swap in a real model later: put the GLB in public/models/ and set `file`
// (e.g. file: 'models/astronaut.glb'). If the file is missing or fails to load,
// the game automatically falls back to the placeholder primitives below.
//
// Conventions (see docs/ART_SPEC.md): 1 unit = 1 Roblox stud, Y is up,
// models face -Z ("forward"), pivot at the bottom center.

import type { BuildingKind, PickupKind } from '../config/balance';
import type { ThemeColorKey } from '../ui/theme';
import { p, pair } from './parts';

export type PrimitiveShape =
  | 'box'
  | 'roundedBox'
  | 'cylinder'
  | 'dome'
  | 'sphere'
  | 'cone'
  | 'crystal'
  | 'rock'
  | 'capsule' // pill shape: arms, legs, bean bodies
  | 'torus'; // flat ring: shield rings, trims

export interface PrimitivePart {
  shape: PrimitiveShape;
  size: [number, number, number]; // width (x), height (y), depth (z) in studs
  pos: [number, number, number]; // center of the part relative to the pivot (domes: center of their flat base)
  rot?: [number, number, number]; // rotation in degrees
  color: ThemeColorKey | 'team'; // 'team' = the owning player's color
  glow?: boolean; // gently self-lit (glass, shield)
  opacity?: number; // < 1 = see-through (greenhouse glass)
  shiny?: boolean; // glossy (helmet visors)
  wire?: boolean; // drawn as a wire frame (greenhouse struts)
  limb?: Limb; // part of a swinging arm or leg (see AssetEntry.limbPivots)
}

// Arms and legs that swing when a character walks.
export type Limb = 'legL' | 'legR' | 'armL' | 'armR';

export interface AssetEntry {
  file?: string; // GLB path under public/, once designed
  scale: number;
  rotationYOffset: number; // degrees, to fix a model that faces the wrong way
  placeholder: PrimitivePart[];
  animation?: 'walk'; // 'walk' = characters swing arms and legs while moving
  // Where each limb turns (hip or shoulder), in the same units as part positions.
  limbPivots?: Partial<Record<Limb, [number, number, number]>>;
}

export type AssetId =
  | 'astronaut'
  | 'lander'
  | 'habitat'
  | 'solar_panel'
  | 'greenhouse'
  | 'shield_generator'
  | 'pickup_crate'
  | 'pickup_ice'
  | 'pickup_regolith'
  | 'pickup_solar';

// The "Cozy Outpost" look (picked at the D1 design checkpoint, see docs/ART_SPEC.md).
export const ASSETS: Record<AssetId, AssetEntry> = {
  // The player: a chunky astronaut. Helmet top is 5.25 studs before the 1.3x scale (about 6.8 on screen).
  astronaut: {
    scale: 1.3,
    rotationYOffset: 0,
    animation: 'walk',
    // Hips and shoulders: where the legs and arms swing from when walking.
    limbPivots: { legL: [0.45, 1.4, 0], legR: [-0.45, 1.4, 0], armL: [1.05, 2.65, 0], armR: [-1.05, 2.65, 0] },
    placeholder: [
      // Legs (with orange boots and knee stripes, like the inspo).
      ...pair(p('capsule', [0.8, 1.4, 0.8], [0.45, 0.75, 0], 'suit', { limb: 'legL' })),
      ...pair(p('cylinder', [0.84, 0.18, 0.84], [0.45, 0.85, 0], 'accent', { limb: 'legL' })),
      ...pair(p('roundedBox', [0.85, 0.45, 1.0], [0.45, 0.22, -0.1], 'accent', { limb: 'legL' })),
      // Body.
      p('roundedBox', [1.9, 1.6, 1.3], [0, 2.05, 0], 'suit'),
      p('box', [1.94, 0.28, 1.34], [0, 1.45, 0], 'team'),
      p('roundedBox', [0.7, 0.45, 0.15], [0, 2.2, -0.66], 'windowGlow', { glow: true }),
      // Arms (with team armbands, orange elbow stripes and gloves).
      ...pair(p('capsule', [0.6, 1.5, 0.6], [1.15, 1.95, 0], 'suit', { rot: [0, 0, 12], limb: 'armL' })),
      ...pair(p('cylinder', [0.66, 0.2, 0.66], [1.18, 2.3, 0], 'team', { rot: [0, 0, 12], limb: 'armL' })),
      ...pair(p('cylinder', [0.64, 0.14, 0.64], [1.25, 1.75, 0], 'accent', { rot: [0, 0, 12], limb: 'armL' })),
      ...pair(p('sphere', [0.65, 0.65, 0.65], [1.32, 1.2, 0], 'accent', { limb: 'armL' })),
      // Helmet, visor, backpack, antenna.
      p('cylinder', [1.5, 0.3, 1.5], [0, 2.95, 0], 'accent'),
      p('sphere', [2.7, 2.5, 2.6], [0, 4.0, 0], 'suit'),
      p('sphere', [2.1, 1.6, 1.5], [0, 4.0, -0.65], 'visor', { shiny: true }),
      p('sphere', [0.35, 0.25, 0.1], [-0.5, 4.4, -1.38], 'stars', { glow: true }),
      p('roundedBox', [1.6, 1.7, 0.8], [0, 2.2, 0.95], 'accent'),
      p('box', [1.0, 0.18, 0.1], [0, 2.6, 1.37], 'windowGlow', { glow: true }),
      p('cylinder', [0.08, 0.8, 0.08], [0.55, 5.4, 0.3], 'hullDark'),
      p('sphere', [0.25, 0.25, 0.25], [0.55, 5.85, 0.3], 'windowGlow', { glow: true }),
    ],
  },
  // Starting base: main module with a comm tower and dish.
  lander: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      p('roundedBox', [7, 3.6, 5.4], [0, 1.8, 0], 'hull'),
      p('roundedBox', [6, 0.8, 4.4], [0, 3.9, 0], 'hull'),
      p('box', [7.05, 0.35, 5.45], [0, 0.5, 0], 'team'),
      ...pair(p('box', [1.6, 0.35, 0.12], [2.2, 2.4, -2.72], 'windowGlow', { glow: true })),
      ...pair(p('box', [1.6, 0.35, 0.12], [2.2, 2.4, 2.72], 'windowGlow', { glow: true })),
      p('roundedBox', [1.4, 2.3, 0.3], [0, 1.15, -2.65], 'hullDark'),
      p('sphere', [0.35, 0.35, 0.35], [0, 2.6, -2.85], 'windowGlow', { glow: true }),
      // Comm tower: 4 legs, cross bars, platform, dish, beacon.
      p('cylinder', [0.22, 6, 0.22], [1.65, 7.3, -0.55], 'hullDark'),
      p('cylinder', [0.22, 6, 0.22], [2.75, 7.3, -0.55], 'hullDark'),
      p('cylinder', [0.22, 6, 0.22], [1.65, 7.3, 0.55], 'hullDark'),
      p('cylinder', [0.22, 6, 0.22], [2.75, 7.3, 0.55], 'hullDark'),
      p('box', [1.3, 0.12, 0.12], [2.2, 6, -0.55], 'hullDark'),
      p('box', [1.3, 0.12, 0.12], [2.2, 8, 0.55], 'hullDark'),
      p('box', [0.12, 0.12, 1.3], [1.65, 7, 0], 'hullDark'),
      p('box', [0.12, 0.12, 1.3], [2.75, 9, 0], 'hullDark'),
      p('box', [1.6, 0.2, 1.6], [2.2, 10.35, 0], 'hullDark'),
      p('dome', [2.8, 0.9, 2.8], [2.2, 11.1, 0], 'hull', { rot: [120, 0, 0] }),
      p('sphere', [0.4, 0.4, 0.4], [2.2, 11.5, -0.9], 'windowGlow', { glow: true }),
      // Lamp posts on both sides of the door, like the inspo.
      ...pair(p('cylinder', [0.18, 3.6, 0.18], [3.2, 1.8, -4.2], 'hullDark')),
      ...pair(p('box', [0.9, 0.12, 0.12], [2.85, 3.6, -4.2], 'hullDark')),
      ...pair(p('sphere', [0.55, 0.45, 0.55], [2.45, 3.4, -4.2], 'windowGlow', { glow: true })),
      ...pair(p('cylinder', [0.6, 0.2, 0.6], [3.2, 0.1, -4.2], 'hullDark')),
    ],
  },
  habitat: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      p('roundedBox', [5, 3.2, 4.2], [0, 1.6, 0], 'hull'),
      p('roundedBox', [4.2, 0.7, 3.4], [0, 3.4, 0], 'hull'),
      p('box', [5.05, 0.3, 4.25], [0, 0.45, 0], 'team'),
      ...pair(p('box', [1.1, 0.32, 0.12], [1.5, 2.1, -2.12], 'windowGlow', { glow: true })),
      p('roundedBox', [1.2, 2.0, 0.25], [0, 1.0, -2.1], 'hullDark'),
      p('sphere', [0.3, 0.3, 0.3], [0, 2.3, -2.25], 'windowGlow', { glow: true }),
      p('cylinder', [0.6, 0.5, 0.6], [1.3, 3.9, 0.6], 'hullDark'),
      // Little glowing path lights by the door, like the inspo.
      ...pair(p('cylinder', [0.22, 1.3, 0.22], [2.0, 0.65, -3.0], 'hullDark')),
      ...pair(p('sphere', [0.45, 0.45, 0.45], [2.0, 1.45, -3.0], 'windowGlow', { glow: true })),
    ],
  },
  greenhouse: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      p('cylinder', [5.2, 0.7, 5.2], [0, 0.35, 0], 'hull'),
      p('cylinder', [5.25, 0.14, 5.25], [0, 0.6, 0], 'windowGlow', { glow: true }),
      p('cylinder', [5.25, 0.22, 5.25], [0, 0.15, 0], 'team'),
      p('cylinder', [4.4, 0.2, 4.4], [0, 0.75, 0], 'pickupRegolith'),
      p('sphere', [1.0, 1.2, 1.0], [-1, 1.3, -0.8], 'plant'),
      p('sphere', [0.9, 1.1, 0.9], [1, 1.25, -0.6], 'plant'),
      p('sphere', [1.1, 1.4, 1.1], [0, 1.5, 0.9], 'plant'),
      p('sphere', [0.8, 0.9, 0.8], [-1.3, 1.15, 0.8], 'plant'),
      p('sphere', [0.8, 1.0, 0.8], [1.3, 1.2, 0.9], 'plant'),
      p('dome', [4.8, 3, 4.8], [0, 0.7, 0], 'greenhouseGlass', { opacity: 0.3, shiny: true }),
      p('dome', [4.85, 3.05, 4.85], [0, 0.7, 0], 'hull', { wire: true }),
      ...pair(p('cylinder', [0.22, 1.3, 0.22], [2.6, 0.65, -2.6], 'hullDark')),
      ...pair(p('sphere', [0.45, 0.45, 0.45], [2.6, 1.45, -2.6], 'windowGlow', { glow: true })),
    ],
  },
  solar_panel: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      p('box', [4, 0.25, 0.7], [0, 0.12, 0], 'team'),
      ...pair(p('cylinder', [0.2, 1.6, 0.2], [1.4, 0.8, 0], 'hullDark')),
      ...pair(p('box', [2.4, 0.15, 3.0], [1.4, 1.75, 0], 'hullDark', { rot: [-25, 0, 0] })),
      ...pair(p('box', [2.2, 0.18, 2.8], [1.4, 1.78, 0], 'solarCell', { rot: [-25, 0, 0], shiny: true })),
    ],
  },
  // Shield generator looks like the inspo's tall tank, with a glowing ring.
  shield_generator: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      p('cylinder', [3, 0.3, 3], [0, 0.15, 0], 'hullDark'),
      p('cylinder', [2.6, 4, 2.6], [0, 2.2, 0], 'hull'),
      p('cylinder', [2.65, 0.35, 2.65], [0, 1.2, 0], 'team'),
      p('dome', [2.6, 1.0, 2.6], [0, 4.2, 0], 'hull'),
      p('cylinder', [1.0, 0.6, 1.0], [0, 5.3, 0], 'accent'),
      p('sphere', [1.0, 1.0, 1.0], [0, 6.0, 0], 'shieldGlow', { glow: true }),
      p('torus', [3.4, 0.25, 3.4], [0, 3.2, 0], 'shieldGlow', { glow: true }),
    ],
  },
  pickup_crate: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      p('roundedBox', [1.6, 1.4, 1.4], [0, 0.7, 0], 'pickupCrate'),
      p('box', [1.65, 0.3, 1.45], [0, 0.95, 0], 'pickupCrateBand'),
      p('box', [0.6, 0.15, 0.05], [0, 0.45, -0.72], 'windowGlow', { glow: true }),
    ],
  },
  pickup_ice: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      p('crystal', [1.2, 2.2, 1.2], [0, 1.1, 0], 'pickupIce', { glow: true, shiny: true }),
      p('crystal', [0.8, 1.4, 0.8], [0.7, 0.7, 0.3], 'pickupIce', { rot: [0, 0, -25], glow: true, shiny: true }),
      p('crystal', [0.6, 1.0, 0.6], [-0.6, 0.5, -0.2], 'pickupIce', { rot: [0, 0, 25], glow: true, shiny: true }),
    ],
  },
  pickup_regolith: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      p('rock', [2, 1.3, 1.7], [0, 0.6, 0], 'pickupRegolith'),
      p('rock', [0.9, 0.7, 0.9], [0.9, 0.35, 0.5], 'terrainMid'),
    ],
  },
  pickup_solar: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      p('box', [2.2, 0.15, 1.5], [0, 0.5, 0], 'hullDark', { rot: [15, 20, -10] }),
      p('box', [2.0, 0.2, 1.3], [0, 0.52, 0], 'pickupSolar', { rot: [15, 20, -10], shiny: true }),
    ],
  },
};

// Maps game concepts to asset IDs, so the renderer never hardcodes them.
export const PICKUP_ASSET: Record<PickupKind, AssetId> = {
  crate: 'pickup_crate',
  ice: 'pickup_ice',
  regolith: 'pickup_regolith',
  solar: 'pickup_solar',
};

export const BUILDING_ASSET: Record<BuildingKind, AssetId> = {
  habitat: 'habitat',
  solar_panel: 'solar_panel',
  greenhouse: 'greenhouse',
  shield_generator: 'shield_generator',
};

// --- UI icons (HUD) ---
// Each icon is an emoji for now. To use a designed icon, put an SVG/PNG in
// public/ui/ and set `file` (e.g. file: 'ui/icon_power.svg'). If the file is
// missing, the emoji is shown instead.
export type UiIconId =
  | 'icon_power'
  | 'icon_life_support'
  | 'icon_shielding'
  | 'icon_crew'
  | 'icon_health'
  | 'icon_cargo'
  | 'icon_day'
  | 'icon_night'
  | 'icon_greenhouse'
  | 'icon_shield_generator'
  | 'icon_ice'
  | 'icon_solar'
  | 'icon_regolith'
  | 'icon_build';

export interface UiIconEntry {
  file?: string;
  emoji: string;
}

export const UI_ICONS: Record<UiIconId, UiIconEntry> = {
  icon_power: { emoji: '⚡' },
  icon_life_support: { emoji: '🫁' },
  icon_shielding: { emoji: '🛡️' },
  icon_crew: { emoji: '🧑‍🚀' },
  icon_health: { emoji: '❤️' },
  icon_cargo: { emoji: '🎒' }, // your backpack
  icon_day: { emoji: '☀️' },
  icon_night: { emoji: '🌙' },
  icon_greenhouse: { emoji: '🌱' },
  icon_shield_generator: { emoji: '🛡️' },
  icon_ice: { emoji: '🧊' },
  icon_solar: { emoji: '☀️' },
  icon_regolith: { emoji: '🪨' },
  icon_build: { emoji: '🔨' },
};

// The badge floating over each pickup shows what it's FOR, using the same icon
// as the HUD chip it fills (so kids can match "⚡ thing" to "⚡ bar").
// Crates don't fill a bar: they pay for new buildings.
export const PICKUP_ICON: Record<PickupKind, UiIconId> = {
  crate: 'icon_build',
  ice: 'icon_life_support',
  regolith: 'icon_shielding',
  solar: 'icon_power',
};
