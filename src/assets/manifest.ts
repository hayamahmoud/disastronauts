// The asset manifest: every visual asset in the game, listed by ID.
// Game code refers ONLY to these IDs, never to file paths.
//
// To swap in a real model later: put the GLB in public/models/ and set `file`
// (e.g. file: 'models/rover.glb'). If the file is missing or fails to load,
// the game automatically falls back to the placeholder primitives below.
//
// Conventions (see docs/ART_SPEC.md): 1 unit = 1 Roblox stud, Y is up,
// models face -Z ("forward"), pivot at the bottom center.

import type { BuildingKind, PickupKind } from '../config/balance';
import type { ThemeColorKey } from '../ui/theme';

export type PrimitiveShape = 'box' | 'roundedBox' | 'cylinder' | 'dome' | 'sphere' | 'cone' | 'crystal' | 'rock';

export interface PrimitivePart {
  shape: PrimitiveShape;
  size: [number, number, number]; // width (x), height (y), depth (z) in studs
  pos: [number, number, number]; // center of the part relative to the pivot (domes: center of their flat base)
  rot?: [number, number, number]; // rotation in degrees
  color: ThemeColorKey | 'team'; // 'team' = the owning player's color
  glow?: boolean; // gently self-lit (glass, shield)
}

export interface AssetEntry {
  file?: string; // GLB path under public/, once designed
  scale: number;
  rotationYOffset: number; // degrees, to fix a model that faces the wrong way
  placeholder: PrimitivePart[];
}

export type AssetId =
  | 'rover'
  | 'lander'
  | 'habitat'
  | 'solar_panel'
  | 'greenhouse'
  | 'shield_generator'
  | 'pickup_crate'
  | 'pickup_ice'
  | 'pickup_regolith'
  | 'pickup_solar';

export const ASSETS: Record<AssetId, AssetEntry> = {
  rover: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'roundedBox', size: [2.6, 1.1, 4.2], pos: [0, 1.25, 0], color: 'team' },
      { shape: 'roundedBox', size: [2.2, 1.0, 1.7], pos: [0, 2.25, -0.8], color: 'hull' },
      { shape: 'box', size: [1.9, 0.5, 0.1], pos: [0, 2.35, -1.66], color: 'glass', glow: true },
      { shape: 'cylinder', size: [1.2, 0.6, 1.2], pos: [-1.45, 0.6, -1.35], rot: [0, 0, 90], color: 'hullDark' },
      { shape: 'cylinder', size: [1.2, 0.6, 1.2], pos: [1.45, 0.6, -1.35], rot: [0, 0, 90], color: 'hullDark' },
      { shape: 'cylinder', size: [1.2, 0.6, 1.2], pos: [-1.45, 0.6, 1.35], rot: [0, 0, 90], color: 'hullDark' },
      { shape: 'cylinder', size: [1.2, 0.6, 1.2], pos: [1.45, 0.6, 1.35], rot: [0, 0, 90], color: 'hullDark' },
      { shape: 'cylinder', size: [0.12, 1.6, 0.12], pos: [0.8, 2.6, 1.4], color: 'hullDark' },
      { shape: 'sphere', size: [0.45, 0.45, 0.45], pos: [0.8, 3.45, 1.4], color: 'team' },
    ],
  },
  lander: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'cylinder', size: [0.35, 3.2, 0.35], pos: [2.4, 1.3, 2.4], rot: [-12, 0, 12], color: 'hullDark' },
      { shape: 'cylinder', size: [0.35, 3.2, 0.35], pos: [-2.4, 1.3, 2.4], rot: [-12, 0, -12], color: 'hullDark' },
      { shape: 'cylinder', size: [0.35, 3.2, 0.35], pos: [2.4, 1.3, -2.4], rot: [12, 0, 12], color: 'hullDark' },
      { shape: 'cylinder', size: [0.35, 3.2, 0.35], pos: [-2.4, 1.3, -2.4], rot: [12, 0, -12], color: 'hullDark' },
      { shape: 'cylinder', size: [6, 3.2, 6], pos: [0, 4, 0], color: 'hull' },
      { shape: 'cylinder', size: [6.15, 0.7, 6.15], pos: [0, 4.3, 0], color: 'team' },
      { shape: 'dome', size: [6, 2.6, 6], pos: [0, 5.6, 0], color: 'hull' },
      { shape: 'cylinder', size: [0.15, 4, 0.15], pos: [0, 9, 0], color: 'hullDark' },
      { shape: 'box', size: [0.08, 1.2, 2], pos: [0, 10.3, 1], color: 'team' },
    ],
  },
  habitat: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'cylinder', size: [5, 2.8, 5], pos: [0, 1.4, 0], color: 'hull' },
      { shape: 'dome', size: [5, 2.4, 5], pos: [0, 2.8, 0], color: 'hull' },
      { shape: 'roundedBox', size: [1.4, 2, 0.6], pos: [0, 1, -2.45], color: 'team' },
      { shape: 'cylinder', size: [5.1, 0.4, 5.1], pos: [0, 2.2, 0], color: 'team' },
    ],
  },
  solar_panel: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'cylinder', size: [0.3, 2.2, 0.3], pos: [0, 1.1, 0], color: 'hullDark' },
      { shape: 'box', size: [5.2, 0.25, 3.2], pos: [0, 2.4, 0], rot: [-20, 0, 0], color: 'hullDark' },
      { shape: 'box', size: [4.9, 0.3, 2.9], pos: [0, 2.45, 0], rot: [-20, 0, 0], color: 'solarCell', glow: true },
      { shape: 'box', size: [0.6, 0.3, 0.6], pos: [0, 0.15, 0], color: 'team' },
    ],
  },
  greenhouse: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'roundedBox', size: [5.4, 0.7, 4.2], pos: [0, 0.35, 0], color: 'hull' },
      { shape: 'dome', size: [4.8, 2.8, 3.8], pos: [0, 0.7, 0], color: 'greenhouseGlass', glow: true },
      { shape: 'box', size: [5.5, 0.25, 0.4], pos: [0, 0.6, -2.05], color: 'team' },
    ],
  },
  shield_generator: {
    scale: 1,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'roundedBox', size: [3.4, 1, 3.4], pos: [0, 0.5, 0], color: 'hull' },
      { shape: 'cylinder', size: [1.2, 2.6, 1.2], pos: [0, 2.3, 0], color: 'hullDark' },
      { shape: 'sphere', size: [2, 2, 2], pos: [0, 4.2, 0], color: 'shieldGlow', glow: true },
      { shape: 'cylinder', size: [3.5, 0.3, 3.5], pos: [0, 1.0, 0], color: 'team' },
    ],
  },
  pickup_crate: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'roundedBox', size: [1.6, 1.6, 1.6], pos: [0, 0.8, 0], color: 'pickupCrate' },
      { shape: 'box', size: [1.68, 0.35, 1.68], pos: [0, 0.8, 0], color: 'pickupCrateBand' },
    ],
  },
  pickup_ice: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'crystal', size: [1.3, 2.2, 1.3], pos: [0, 1.1, 0], color: 'pickupIce', glow: true },
      { shape: 'crystal', size: [0.8, 1.3, 0.8], pos: [0.7, 0.65, 0.3], rot: [0, 0, -25], color: 'pickupIce', glow: true },
    ],
  },
  pickup_regolith: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'rock', size: [2, 1.3, 1.7], pos: [0, 0.6, 0], color: 'pickupRegolith' },
      { shape: 'rock', size: [0.9, 0.7, 0.9], pos: [0.9, 0.35, 0.5], color: 'pickupRegolith' },
    ],
  },
  pickup_solar: {
    scale: 1.4,
    rotationYOffset: 0,
    placeholder: [
      { shape: 'box', size: [2.2, 0.15, 1.5], pos: [0, 0.5, 0], rot: [15, 20, -10], color: 'hullDark' },
      { shape: 'box', size: [2.0, 0.2, 1.3], pos: [0, 0.52, 0], rot: [15, 20, -10], color: 'pickupSolar', glow: true },
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
  | 'icon_buildings'
  | 'icon_day'
  | 'icon_night'
  | 'icon_greenhouse'
  | 'icon_shield_generator'
  | 'icon_ice'
  | 'icon_solar'
  | 'icon_regolith';

export interface UiIconEntry {
  file?: string;
  emoji: string;
}

export const UI_ICONS: Record<UiIconId, UiIconEntry> = {
  icon_power: { emoji: '⚡' },
  icon_life_support: { emoji: '🫁' },
  icon_shielding: { emoji: '🛡️' },
  icon_crew: { emoji: '👩‍🚀' },
  icon_health: { emoji: '❤️' },
  icon_cargo: { emoji: '📦' },
  icon_buildings: { emoji: '🏠' },
  icon_day: { emoji: '☀️' },
  icon_night: { emoji: '🌙' },
  icon_greenhouse: { emoji: '🌱' },
  icon_shield_generator: { emoji: '🛡️' },
  icon_ice: { emoji: '🧊' },
  icon_solar: { emoji: '☀️' },
  icon_regolith: { emoji: '🪨' },
};
