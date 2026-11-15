// ALL tunable gameplay numbers live here, so the team can tweak the game
// without hunting through code. On Roblox this file becomes a ModuleScript.
// Units: distances are in studs (1 unit = 1 Roblox stud), time in seconds.

import radiation from '../data/radiation.json';

// Real radiation on the ground of Mars, measured by NASA's Curiosity rover.
// SOURCE: NASA OSDR RadLab, MSL RAD surface absorbed dose rate, 2023 median
// (src/data/radiation.json, made by tools/fetch_radlab.py; see docs/DATA.md).
const MARS_DOSE_MICROGRAY_PER_SOL = radiation.medianMicroGrayPerSol;
// GAME EXAGGERATION: health lost per microgray by unshielded crew. Real Mars
// radiation is far too slow to notice in a 5-minute round, so we speed it up.
const DAMAGE_PER_MICROGRAY = 0.44;

export const BALANCE = {
  // Fixed simulation step: the sim always advances in 1/60 s slices,
  // so the game plays the same on fast and slow computers.
  sim: {
    fixedDt: 1 / 60,
    maxStepsPerFrame: 5, // stops a "spiral of death" if a frame takes too long
  },

  map: {
    // The real map (Jezero Crater) is 60 km wide squeezed into 1000 studs, so
    // 1 stud = 60 m sideways; heights are stretched 4x so hills read well.
    // Both are set in tools/process_marstrek.py; these two must match its output.
    worldSize: 1000, // the map is 1000 x 1000 studs, centered on (0, 0)
    gridSize: 128, // height grid is 128 x 128 points
    // The crater rim is about 396 studs from the middle on the real map.
    // FALLBACK crater shape (only used if the real map data can't load).
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

  // Mini tasks (M4b): BIG pickups the magnet can't pull. Stand next to one and
  // HOLD the work key (E) to drill an ice deposit, fix a broken solar panel or
  // scoop a pile of regolith. You stand still while you work, so it costs time
  // (risky when a disaster is coming), but pays far more than a small pickup.
  // GAME-BALANCE numbers, not NASA measurements.
  tasks: {
    count: 24, // how many big pickups are on the map at once
    workRadius: 6, // stand this close (studs) to work on one
    respawnDelay: 20, // seconds before a finished one reappears somewhere new
    minDistanceFromBase: 40, // they don't appear right next to a base
    // Each kind: spawn weight, hold time in seconds, and how many items of that
    // kind it puts in your backpack. You need room for all of them to start.
    kinds: {
      ice: { weight: 1, seconds: 3, reward: 4 }, // drill the ice deposit
      solar: { weight: 1, seconds: 3.5, reward: 4 }, // fix the broken solar panel
      regolith: { weight: 1, seconds: 2.5, reward: 4 }, // scoop the soil pile
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
    // = real Mars dose per sol (about 137 microgray) x game exaggeration (about 60 health).
    radiationDamagePerSol: MARS_DOSE_MICROGRAY_PER_SOL * DAMAGE_PER_MICROGRAY,
    noLifeSupportDamagePerSol: 150, // out of air, water and food
    noPowerDamagePerSol: 90, // lander/habitats unpowered: no heat, no air recycling
    healPerSol: 30, // recovery when nothing is hurting the crew
    sickBelow: 40, // below this health, some crew get sick (they don't work or score)
    healthAfterLoss: 50, // when health hits 0, one crew member is lost and health resets to this
  },

  // Disasters hit every base at the same time, after a short warning.
  // All numbers here are GAME-BALANCE numbers (not NASA measurements).
  disasters: {
    warningSeconds: 5, // the warning banner shows this long before a disaster hits
    firstDelay: 45, // calm seconds at the start of a game before the first disaster
    // Calm seconds between one disaster ending and the next one starting.
    minGap: 30,
    maxGap: 45,
    // How often each kind is picked (higher = more often).
    weights: { dustStorm: 1, solarFlare: 1, coldNight: 1 },
    dustStorm: {
      duration: 24,
      solarFactor: 0.1, // solar panels make only 10% of their normal Power in the dust
      walkSpeedFactor: 0.6, // the wind slows astronauts to 60% speed
      // Storms only blow in during the day (at night there's no sun to block anyway).
      // If one would start outside this part of the sol, it waits for the next morning.
      startWindow: { from: 0.27, to: 0.45 }, // time of sol (0.25 = sunrise, 0.75 = sunset)
    },
    solarFlare: {
      duration: 10,
      // Health lost per sol by crew NOT covered by shielding, at strength 1.
      // Fully shielded bases take none; half-shielded bases take half.
      damagePerSol: 300,
      // Extra health lost per sol while your astronaut is outside the base.
      outsideDamagePerSol: 120,
      // Flare classes (C < M < X) and how strong each one hits.
      // shieldNeed: during the flare your base needs this many times its normal
      // Shielding to be fully covered, so you must pile up soil before it hits.
      // The class of each flare comes from the real DONKI flare it replays
      // (src/data/flares.json). `weight` is only used if there's no flare data.
      classes: {
        C: { weight: 5, strength: 0.6, shieldNeed: 1.5 },
        M: { weight: 3, strength: 1, shieldNeed: 2 },
        X: { weight: 1, strength: 1.6, shieldNeed: 3 },
      },
    },
    coldNight: {
      // Lasts from sunset to sunrise. Each shelter (lander or habitat) needs this
      // much EXTRA Power per sol for heaters, so bigger bases pay more.
      heatPerShelterPerSol: 80,
    },
  },

  // A base that loses all its crew becomes a wreck.
  wrecks: {
    relaunchDelay: 8, // seconds until your new lander touches down somewhere else
    salvageBase: 4, // salvage crates that burst out of every wreck...
    salvagePerBuilding: 2, // ...plus this many per building it had
    maxSalvage: 16,
    scatterMin: 6, // crates land this far (studs) from the wreck
    scatterMax: 16,
    salvageLifetime: 90, // seconds before uncollected salvage crumbles away
    lifetime: 120, // seconds before the wreck itself crumbles away
    absorbRadius: 9, // walk this close to a wreck to absorb it
    // Absorbing gives your base build points (only if your base is at least as big as the wreck was).
    absorbBuildPointsBase: 6,
    absorbBuildPointsPerBuilding: 4,
  },

  // Supply drops from Earth: they arrive late because radio signals take time
  // to cross space (communication delay).
  supplyDrop: {
    // SOURCE: NASA NSSDCA Mars Fact Sheet, "Distance from Earth":
    // minimum 54.6 million km, maximum 401.4 million km.
    // https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
    earthDistanceMinKm: 54.6e6,
    earthDistanceMaxKm: 401.4e6,
    // Speed of light (exact, by definition of the meter).
    speedOfLightKmPerS: 299792.458,
    // Signal time (light-minutes) → game seconds. 1 = one real minute becomes one game second.
    secondsPerLightMinute: 1,
    powerCost: 20, // calling Earth uses the big radio: costs Power
    cooldown: 40, // seconds before you can call another drop
    landingOffset: 6, // lands this far outside your base's unload circle
    scatter: 4, // the crate bursts into pickups within this many studs
    items: ['ice', 'ice', 'regolith', 'regolith', 'solar', 'solar', 'crate'],
    itemLifetime: 90, // seconds before uncollected supplies blow away
  },

  // Missions: one clear goal at a time. Most are tied to the next disaster.
  missions: {
    firstDelay: 3, // seconds before the very first mission appears
    gap: 3, // seconds between one mission ending and the next
    genericDuration: 40, // time limit for missions not tied to a disaster
    // A mission is tied to the next disaster if it hits between these many seconds from now.
    minDisasterLead: 12,
    maxDisasterLead: 50,
    fastFraction: 0.5, // finish within the first half of the time = 3 stars (else 2)
    partialFraction: 0.5, // time ran out but at least half done = 1 star
    minItems: 3, // "bring N things home" asks for at least...
    maxItems: 8, // ...and at most this many
    secondsPerItem: 5, // ...and never more than one item per this many seconds of time limit
    powerTargetBoost: 20, // "store Power" asks for this much more than you have now
    powerTargetMaxFraction: 0.9, // ...but never more than 90% of the battery
    lowFraction: 0.4, // a bar under 40% counts as "running low" when picking a mission
  },

  // One round: a short lobby countdown, then a timed game. Highest Colony Score wins.
  round: {
    lobbySeconds: 10, // everyone has landed; the countdown runs before you can move
    seconds: 300, // 5 minutes of play (about 5 sols)
    endWarningSeconds: 30, // "30 seconds left!" message
  },

  // Colony Score (who wins). Only HEALTHY crew and POWERED buildings count, so
  // reckless growth loses to a well-run base. GAME-BALANCE numbers.
  score: {
    perHealthyCrew: 100,
    perPoweredBuilding: 50,
    perStoredResource: 1, // each point of stored Power, Life Support and Shielding
    perMissionStar: 25, // finished missions add to the score
  },

  // Computer rivals. They send the same kind of input a human does.
  bots: {
    thinkInterval: 0.5, // seconds between choosing a new target
    sightRadius: 150, // they only notice pickups (and wrecks) this close
    distanceBias: 20, // bigger = cares less about how far away a pickup is
    taskSecondsCost: 25, // a mini task's hold time "feels like" this many studs of walking per second
    taskStopShare: 0.5, // walks this far into a mini task's work circle (0 to 1) before working
    targetTimeout: 12, // give up on a target after this long (e.g. stuck on a hill)
    arriveRadius: 4, // close enough to a walk-to point
    homeStopRadius: 6, // while sheltering, stand this close to the lander
    wanderMinDistance: 60, // when nothing is in sight, walk somewhere this far...
    wanderMaxDistance: 160, // ...to this far away
    supplyDropLowLife: 0.35, // calls Earth when Life Support is under 35%...
    supplyDropSparePower: 30, // ...and it has this much Power to spare after paying
    // Three personalities, so different strategies win (or fail) each round.
    //  pace: share of full speed (bots walk a little slower than you)
    //  returnAt: heads home when the backpack is this full (0 to 1)
    //  shelters: goes home on a disaster warning and stays in during flares
    //  wreckChance: how likely it chases a wreck it could absorb (0 to 1)
    //  likes: how much it wants each pickup; needWeight: how much it favours
    //  whatever its base is running low on
    personalities: {
      grower: {
        name: 'Rusty',
        style: 'Grows fast, takes risks',
        pace: 0.9,
        returnAt: 1,
        shelters: false,
        wreckChance: 0.7,
        powerPriority: 'greenhouse',
        likes: { crate: 3, ice: 1, regolith: 0.5, solar: 1 },
        needWeight: 0.5,
        callsSupplyDrops: false,
      },
      shielder: {
        name: 'Nova',
        style: 'Plays it safe',
        pace: 0.82,
        returnAt: 0.6,
        shelters: true,
        wreckChance: 0.15,
        powerPriority: 'shield_generator',
        likes: { crate: 1, ice: 1, regolith: 2.5, solar: 1.2 },
        needWeight: 1.5,
        callsSupplyDrops: true,
      },
      balanced: {
        name: 'Comet',
        style: 'Keeps everything balanced',
        pace: 0.86,
        returnAt: 0.85,
        shelters: true,
        wreckChance: 0.4,
        powerPriority: 'greenhouse',
        likes: { crate: 1.5, ice: 1, regolith: 1, solar: 1 },
        needWeight: 2,
        callsSupplyDrops: true,
      },
    },
    // Rivals join in this order (player 2 is the grower, and so on).
    order: ['grower', 'shielder', 'balanced'],
  },

  // One-round power-ups from the shop (M6). Each one keeps a trade-off, so
  // there is never a "free" choice. GAME-BALANCE numbers.
  powerups: {
    // Shield Bubble: pops up by itself when the next solar flare hits and
    // blocks ALL of its radiation for your base. Costs Power to switch on;
    // with too little Power it fails and the charge is kept for the next flare.
    bubblePowerCost: 30,
    // Solar Boost: press B to make your solar panels work extra hard for a
    // while. Afterwards they overheat and make LESS Power for a while.
    boostSeconds: 30,
    boostFactor: 2, // x2 solar Power during the boost
    overloadSeconds: 30,
    overloadFactor: 0.5, // half solar Power while the panels cool down
  },

  // Coins and XP earned at the end of a round (M6). Only earned in the game:
  // the web version has no real money anywhere. GAME-BALANCE numbers.
  progression: {
    coinsForPlace: [60, 40, 25, 15], // 1st, 2nd, 3rd, 4th
    coinsPerStar: 4, // every mission star
    xpPerScorePoint: 0.1, // 1 XP for every 10 Colony Score points...
    xpForPlaying: 20, // ...plus this much just for finishing a round
    // XP needed to REACH each level: level 1 = 0 XP, level 2 = 100 XP, and so on.
    levelXp: [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200],
    dailyRewardCoins: 50, // once per calendar day, from the shop
    startingCoins: 100, // a new player can buy one small thing straight away
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

  // "Today's space weather": live solar flares from NASA DONKI (optional).
  liveData: {
    donkiDays: 30, // ask for the flares of the last 30 days
    timeoutSeconds: 8, // give up and use the archived flares after this long
  },

  // Real NASA fact pop-ups during a round (UI only).
  facts: {
    popupSeconds: 10, // how long a fact card stays up
    minGapSeconds: 25, // game seconds between two fact cards
  },
} as const;

export type PickupKind = keyof typeof BALANCE.pickups.kinds;
// Big pickups that need a mini task (each is named after what it gives you).
export type TaskKind = keyof typeof BALANCE.tasks.kinds;
export type BuildingKind = (typeof BALANCE.growth.buildOrder)[number];
export type ResourceKind = 'power' | 'lifeSupport' | 'shielding';
// When there isn't enough Power for everything, which building gets it first.
export type PowerPriority = 'greenhouse' | 'shield_generator';
export type DisasterKind = keyof typeof BALANCE.disasters.weights;
export type FlareClass = keyof typeof BALANCE.disasters.solarFlare.classes;
export type BotPersonality = keyof typeof BALANCE.bots.personalities;
