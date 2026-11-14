// 3D colors for the "Cozy Outpost" look (see docs/ART_SPEC.md). This mirrors the CSS
// variables in theme.css. To restyle the game, change colors HERE and in
// theme.css only. No other file should hardcode a color.

export const THEME = {
  sky: 0xf2b48a, // dusty Mars sky
  fog: 0xeaa880,
  skyNight: 0x3a2a4a, // Mars night: dark purple-blue
  fogNight: 0x34263f,
  sunLightLow: 0xff9e66, // warmer sun near sunrise/sunset
  sunLight: 0xffe8d0,
  skyLight: 0xfff0e0, // hemisphere light from above
  groundLight: 0xc98466, // hemisphere light bounced from the ground

  // Terrain colors from low ground to high ground (placeholder until the real Mars image arrives).
  terrainLow: 0xc0623d,
  terrainMid: 0xd57a4c,
  terrainHigh: 0xe6996b,

  // One color per player base so the 4 bases are easy to tell apart.
  team: [0xf07a2e, 0x5ab8e8, 0x6cc48a, 0xb27ad8],

  // Building / prop materials.
  hull: 0xfff1e2, // white module panels
  hullDark: 0x5b4a5f, // metal frames, wheels
  glass: 0x9fd8f4,
  solarCell: 0x34488f,
  greenhouseGlass: 0xc6eef7,
  shieldGlow: 0x8fd3f4,

  // Pickups.
  pickupCrate: 0xfff1e2,
  pickupCrateBand: 0xf07a2e,
  pickupIce: 0x8fd3f4,
  pickupRegolith: 0x9e3b2e,
  pickupSolar: 0x34488f,

  // Astronaut (player) and extra building details.
  suit: 0xfff4ea, // spacesuit fabric
  visor: 0x1a1626, // helmet visor (glossy)
  accent: 0xf07a2e, // boots, gloves, backpack, trims
  windowGlow: 0xffa64a, // lit windows and lamps (glow at night)
  plant: 0x6cc46a, // plants inside greenhouses
  stars: 0xfff4e0, // night-sky stars

  // Backdrop (only drawn when RENDER_STYLE turns it on).
  skyTop: 0xc9786a, // sky color straight up (the horizon uses \`sky\`)
  skyTopNight: 0x17112a,
  mountains: 0xb4583a, // far-away hills on the horizon
  moon: 0xc2b2a6, // Phobos, the bigger of Mars's two moons

  // Effects and helper rings.
  magnetRing: 0xfff2e0,
  // Badges floating over pickups: a disc in the color of the HUD chip that
  // pickup fills (same colors as the chips in theme.css), with a light rim.
  badgeRim: 0xfff4ea,
  badgePower: 0xffc54a,
  badgeLife: 0x6fc8f2,
  badgeShield: 0xb58cf0,
  badgeBuild: 0xf07a2e,
  noPowerMarker: 0xff5a4f, // floats over buildings that are switched off

  // Disasters (M3): the sky and air change color while one is happening.
  dustHaze: 0xc98a5a, // dust storm: thick orange-brown air
  dustMote: 0xe8b07c, // blowing dust specks
  flareGlow: 0xfff0b8, // solar flare: harsh pale-yellow light
  frostHaze: 0x8a9cc8, // cold night: icy blue air
  frostFlake: 0xeef6ff, // drifting frost crystals
  shieldDome: 0x3f9ff0, // the bubble over a base during a flare (brighter = better shielded)
  scorch: 0x3a2b2e, // burnt metal on wrecks
  landingMarker: 0xf07a2e, // where a supply drop will land
  parachute: 0xfff4ea,
} as const;

// How 3D materials are drawn. Part of the theme so a visual direction can
// switch between faceted, smooth "clay" and cartoon (toon + outline) looks.
export interface RenderStyle {
  shading: 'flat' | 'smooth' | 'toon';
  outline: boolean; // black cartoon outlines around models
  roughness: number;
  metalness: number;
  glowIntensity: number; // how strongly 'glow' parts light themselves
  segments: number; // roundness of spheres/cylinders (more = smoother, slower)
  exposure: number; // overall brightness of the picture
  skyGradient: boolean; // sky fades from horizon color to a deeper top color
  backdrop: boolean; // far mountains and Phobos on the horizon
  ringStyle: 'bold' | 'thin'; // thin = dashed magnet ring and a fine base ring
}

export const RENDER_STYLE: RenderStyle = {
  shading: 'smooth', // soft "clay" look
  outline: false,
  roughness: 0.65,
  metalness: 0.02,
  glowIntensity: 1.1, // windows and lamps glow warmly at night
  segments: 24,
  exposure: 1.12,
  skyGradient: true,
  backdrop: true,
  ringStyle: 'thin',
};

export type ThemeColorKey = Exclude<keyof typeof THEME, 'team'>;
