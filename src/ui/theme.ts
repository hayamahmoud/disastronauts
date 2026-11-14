// 3D colors for the placeholder "clean low-poly" look. This mirrors the CSS
// variables in theme.css. To restyle the game, change colors HERE and in
// theme.css only. No other file should hardcode a color.

export const THEME = {
  sky: 0xe9b38a, // dusty Mars sky
  fog: 0xe0a77d,
  sunLight: 0xfff1dc,
  skyLight: 0xffd9b8, // hemisphere light from above
  groundLight: 0x8a4a2a, // hemisphere light bounced from the ground

  // Terrain colors from low ground to high ground (placeholder until the real Mars image arrives).
  terrainLow: 0xa9512b,
  terrainMid: 0xc4703e,
  terrainHigh: 0xdc9a63,

  // One color per player base so the 4 bases are easy to tell apart.
  team: [0x3fa7ff, 0xffc93c, 0x5ed18a, 0xc77dff],

  // Building / prop materials.
  hull: 0xf3efe8, // white module panels
  hullDark: 0x6b6f78, // metal frames, wheels
  glass: 0x9fd8ff,
  solarCell: 0x2c3e8f,
  greenhouseGlass: 0xa8f0c0,
  shieldGlow: 0x9ec9ff,

  // Pickups.
  pickupCrate: 0xf5f1e6,
  pickupCrateBand: 0xff8a3d,
  pickupIce: 0xb8f0ff,
  pickupRegolith: 0x7a4a33,
  pickupSolar: 0x34489c,

  // Effects and helper rings.
  magnetRing: 0xffffff,
} as const;

export type ThemeColorKey = Exclude<keyof typeof THEME, 'team'>;
