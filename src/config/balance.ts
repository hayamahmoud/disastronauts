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
    turnSpeed: 3.2, // radians per second when turning with A/D in the behind view
    backUpSpeedFactor: 0.45, // backing up (S in the behind view) is slower than walking forward
    maxClimbSlope: 0.55, // steeper than this = a wall the rover can't climb
    slopeSlowdown: 1.2, // uphill slope multiplies speed by (1 - slope * this)
    minSlopeSpeedFactor: 0.35, // never slower than 35% speed on a climbable hill
    slopeProbeDistance: 3, // how far ahead we test the ground slope
  },

  magnet: {
    // Game numbers, not NASA data: picked so you have to walk close to things.
    baseRadius: 6, // pickups closer than this get pulled in
    radiusPerBuilding: 0.75, // the magnet grows as your base grows
    maxRadius: 20,
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

  // Day and night. A real Mars sol is 24 h 39 m 35 s (88,775 s).
  // SOURCE: NASA NSSDCA Mars Fact Sheet, "Length of day 24.6597 hrs"
  // https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
  // We squeeze one sol into `seconds` of game time so a 5-minute round has ~5 sols.
  sol: {
    realSeconds: 88775,
    seconds: 60,
    // Where in the sol the game starts (0 = midnight, 0.25 = sunrise,
    // 0.5 = noon, 0.75 = sunset). Starting in the morning gives players a day first.
    startTimeOfSol: 0.3,
  },

  // Rates below are "per sol" (one game day), the same way the brief says
  // "every crew member consumes Life Support every sol".
  // These are GAME-BALANCE numbers (not NASA measurements), except where a SOURCE is given.
  resources: {
    // Mars gets about 43% of the sunlight Earth gets (586.2 vs 1361 W/m²).
    // SOURCE: NASA NSSDCA Mars Fact Sheet, "Solar irradiance (W/m2)" Mars 586.2, Earth 1361.0
    // https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
    marsSunlight: 0.43,

    // Starting stock for a brand-new base.
    start: { power: 30, lifeSupport: 40, shielding: 20 },

    // How much Power and Life Support a base can store (bars are full at this).
    storage: {
      power: { base: 80, perBuilding: 25 },
      lifeSupport: { base: 100, perBuilding: 20 },
    },

    // Solar power at NOON with Earth-strength sun, per sol. The game multiplies it
    // by `marsSunlight` and by the day/night curve, so the real output is much lower.
    landerSolarPerSol: 300, // the lander has a small built-in solar array
    solarPanelPerSol: 720,

    // A building that switched off only turns back on once the battery has
    // this much spare. Stops buildings flickering on/off when Power is near 0.
    restartReserve: 5,

    // Power each building uses per sol, if it's switched on.
    powerUsePerSol: {
      lander: 36,
      habitat: 24,
      solar_panel: 0,
      greenhouse: 48,
      shield_generator: 48,
    },

    lifeSupportPerCrewPerSol: 8, // every crew member breathes, drinks and eats
    greenhouseLifeSupportPerSol: 30, // when powered, scaled by how many crew are healthy

    // Shielding a base needs to be fully covered. A bigger base needs more.
    shieldNeededPerCrew: 10,
    shieldNeededPerBuilding: 4,
    shieldGeneratorAmount: 30, // a powered shield generator counts as this much shielding
  },

  // Crew health: one 0–100 meter for the whole crew of a base.
  crew: {
    maxHealth: 100,
    // Background space radiation hurting crew that aren't covered by shielding.
    // Per sol at 0% coverage; scales down as coverage goes up.
    radiationDamagePerSol: 60, // TODO-REAL-DATA: replace with RadLab baseline dose rate in M5
    noLifeSupportDamagePerSol: 150, // out of air, water and food
    noPowerDamagePerSol: 90, // lander/habitats unpowered: no heat, no air recycling
    healPerSol: 30, // recovery when nothing is hurting the crew
    sickBelow: 40, // below this health, some crew get sick (they don't work or score)
    healthAfterLoss: 50, // when health hits 0, one crew member is lost and health resets to this
  },

  // Camera is visual only, but it's a tunable number so it lives here too.
  camera: {
    // Low camera aimed above the player, so sky and far hills are on screen.
    height: 12,
    distance: 30, // how far behind (toward +z) the camera sits
    followSharpness: 6, // higher = camera catches up faster
    lookHeight: 10, // the camera aims this far above the player (more = more sky on screen)
    topDownHeight: 110,
    turnSharpness: 4, // how quickly the behind view swings round when you turn (higher = faster)
    dragTurnSpeed: 0.006, // top view: radians the map turns per pixel of mouse drag
  },

  // The mini-map in the top-right corner (visual only).
  minimap: {
    sizePx: 150, // on-screen size in pixels
    viewRadius: 160, // studs from the player to the map's edge
  },
} as const;

export type PickupKind = keyof typeof BALANCE.pickups.kinds;
export type BuildingKind = (typeof BALANCE.growth.buildOrder)[number];
export type ResourceKind = 'power' | 'lifeSupport' | 'shielding';
// When there isn't enough Power for everything, which building gets it first.
export type PowerPriority = 'greenhouse' | 'shield_generator';
