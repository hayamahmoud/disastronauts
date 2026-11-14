// ALL tunable gameplay numbers live here, so the team can tweak the game
// without hunting through code. On Roblox this file becomes a ModuleScript.
// Units: distances are in studs (1 unit = 1 Roblox stud), time in seconds.

export const BALANCE = {
  // Fixed simulation step: the sim always advances in 1/60 s slices,
  // so the game plays the same on fast and slow computers.
  sim: {
    fixedDt: 1 / 60,
    maxStepsPerFrame: 5, // stops a "spiral of death" if a frame takes too long
  },

  map: {
    worldSize: 1000, // the map is 1000 x 1000 studs, centered on (0, 0)
    gridSize: 128, // height grid is 128 x 128 points
    // PLACEHOLDER crater shape, until the real Mars Trek elevation arrives.
    craterRadius: 400, // where the crater wall peaks
    craterWallWidth: 70, // how wide the inner wall slope is
    craterRimHeight: 45,
    outsideHeight: 25, // ground level beyond the rim
    floorNoiseHeight: 5, // gentle bumps on the crater floor
    playRadius: 340, // pickups and bases spawn inside this circle
  },

  rover: {
    maxSpeed: 38, // studs per second on flat ground
    acceleration: 6, // how quickly it reaches top speed (higher = snappier)
    maxClimbSlope: 0.55, // steeper than this = a wall the rover can't climb
    slopeSlowdown: 1.2, // uphill slope multiplies speed by (1 - slope * this)
    minSlopeSpeedFactor: 0.35, // never slower than 35% speed on a climbable hill
    slopeProbeDistance: 3, // how far ahead we test the ground slope
  },

  magnet: {
    baseRadius: 12, // pickups closer than this get pulled in
    radiusPerBuilding: 1.5, // the magnet grows as your base grows
    maxRadius: 40,
    pullSpeed: 70, // studs per second a pulled pickup flies toward you
    collectRadius: 3, // pickups this close are collected
  },

  cargo: {
    baseCapacity: 8, // items the rover can carry
    capacityPerBuilding: 1,
    maxCapacity: 30,
  },

  base: {
    startCrew: 2,
    depositRadius: 16, // drive this close to your base to unload
    depositRadiusPerBuilding: 0.6,
    minSpawnDistance: 220, // bases spawn at least this far apart
    roverSpawnOffset: 10, // rover starts this far from its lander
  },

  pickups: {
    targetCount: 320, // how many pickups are on the map at once
    respawnDelay: 6, // seconds before a collected pickup reappears somewhere new
    minDistanceFromBase: 25, // new pickups don't spawn right on top of a base
    // Each kind: spawn weight, which resource it adds (M2 uses these), how much,
    // and how many build points it gives your base.
    kinds: {
      crate: { weight: 2, resource: 'none', amount: 0, buildPoints: 3 },
      ice: { weight: 3, resource: 'lifeSupport', amount: 5, buildPoints: 1 },
      regolith: { weight: 3, resource: 'shielding', amount: 5, buildPoints: 1 },
      solar: { weight: 3, resource: 'power', amount: 5, buildPoints: 1 },
    },
  },

  growth: {
    // A building costs (firstBuildingCost + costIncrease * buildingsSoFar) build points.
    firstBuildingCost: 6,
    costIncrease: 2,
    // The base builds in this repeating order (M2 may let players choose).
    buildOrder: ['solar_panel', 'habitat', 'greenhouse', 'shield_generator'],
    crewPerHabitat: 2,
    // Where buildings go around the lander: rings of slots.
    firstRingRadius: 9,
    ringSpacing: 7,
    slotsPerRing: 6,
  },

  // Camera is visual only, but it's a tunable number so it lives here too.
  camera: {
    height: 55,
    distance: 48, // how far behind (toward +z) the camera sits
    followSharpness: 6, // higher = camera catches up faster
    topDownHeight: 110,
  },
} as const;

export type PickupKind = keyof typeof BALANCE.pickups.kinds;
export type BuildingKind = (typeof BALANCE.growth.buildOrder)[number];
export type ResourceKind = 'power' | 'lifeSupport' | 'shielding';
