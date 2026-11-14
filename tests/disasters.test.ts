// Milestone 3: disasters, wrecks + salvage + absorb, missions, supply drops.
import { describe, expect, it } from 'vitest';
import { BALANCE, type BuildingKind } from '../src/config/balance';
import { crewDamagePerSol, flareCoverage } from '../src/core/crew';
import { timeOfSol } from '../src/core/dayNight';
import { disasterDuration } from '../src/core/disasters';
import type { GameEvent } from '../src/core/events';
import { flareSoilTarget, itemTarget, pickMission, powerTarget } from '../src/core/missions';
import { powerUse, shieldNeeded, solarPerSol } from '../src/core/resources';
import { createGame, step } from '../src/core/simulation';
import type { BaseState, GameState, PlayerInput } from '../src/core/state';
import { distance } from '../src/core/state';
import { salvageCount } from '../src/core/wrecks';

const DT = BALANCE.sim.fixedDt;
const D = BALANCE.disasters;

// A game with two players. Pickups are switched off so only the code under test
// changes things.
function newGame(seed = 7, disasters = true): GameState {
  const s = createGame({
    seed,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
    disasters,
  });
  for (const p of s.pickups) {
    p.active = false;
    p.respawnTimer = 1e9;
  }
  return s;
}

function run(state: GameState, seconds: number, inputs: PlayerInput[] = []): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) all.push(...step(state, inputs, DT));
  return all;
}

// Run until an event of this type happens (or give up after maxSeconds).
function runUntil(state: GameState, type: GameEvent['type'], maxSeconds = 600): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(maxSeconds / DT); i++) {
    const events = step(state, [], DT);
    all.push(...events);
    if (events.some((e) => e.type === type)) return all;
  }
  throw new Error(`no ${type} within ${maxSeconds}s`);
}

function addBuildings(s: GameState, base: BaseState, kind: BuildingKind, count: number): void {
  for (let i = 0; i < count; i++) base.buildings.push({ id: s.nextId++, kind, offset: { x: 0, z: 0 }, powered: true });
}

// Force a specific disaster to start right now.
function startDisaster(s: GameState, kind: 'dustStorm' | 'solarFlare' | 'coldNight', strength = 1): void {
  s.disaster = { kind, flareClass: kind === 'solarFlare' ? 'M' : null, strength, startedAt: s.time, endsAt: s.time + 1e9 };
}

describe('disasters', () => {
  it('can be switched off', () => {
    const s = newGame(7, false);
    const events = run(s, 300);
    expect(s.nextDisaster).toBeNull();
    expect(events.some((e) => e.type === 'DisasterStarted')).toBe(false);
  });

  it('warn first, then start, then end — and the next one is planned', () => {
    const s = newGame();
    const planned = s.nextDisaster!;
    expect(planned.startsAt).toBeGreaterThanOrEqual(D.firstDelay);

    const events = runUntil(s, 'DisasterStarted');
    const warning = events.find((e) => e.type === 'DisasterWarning');
    expect(warning).toBeDefined();
    const warnIndex = events.indexOf(warning!);
    const startIndex = events.findIndex((e) => e.type === 'DisasterStarted');
    expect(warnIndex).toBeLessThan(startIndex);
    // The warning came about warningSeconds before the start.
    expect(s.time - planned.startsAt).toBeLessThan(DT * 2);
    expect(s.disaster!.kind).toBe(planned.kind);
    expect(s.nextDisaster!.startsAt).toBeGreaterThanOrEqual(s.disaster!.endsAt + D.minGap);

    const kind = s.disaster!.kind;
    const ended = runUntil(s, 'DisasterEnded');
    expect(ended.some((e) => e.type === 'DisasterEnded' && e.kind === kind)).toBe(true);
    expect(s.disaster).toBeNull();
  });

  it('every kind of disaster shows up over a long game', () => {
    const s = newGame(11);
    const kinds = new Set<string>();
    for (const e of run(s, 60 * 30)) if (e.type === 'DisasterStarted') kinds.add(e.kind);
    expect([...kinds].sort()).toEqual(['coldNight', 'dustStorm', 'solarFlare']);
  });

  it('cold nights start at sunset and last until sunrise', () => {
    const s = newGame(11);
    for (const e of run(s, 60 * 30)) {
      if (e.type === 'DisasterStarted' && e.kind === 'coldNight') {
        expect(e.duration).toBe(disasterDuration('coldNight'));
        return;
      }
    }
    throw new Error('no cold night');
  });

  it('planned cold nights line up with sunset', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newGame(seed);
      const n = s.nextDisaster!;
      if (n.kind !== 'coldNight') continue;
      expect(timeOfSol(n.startsAt)).toBeCloseTo(0.75, 5);
    }
  });

  it('a dust storm cuts solar power', () => {
    const s = newGame();
    const base = s.bases[0];
    addBuildings(s, base, 'solar_panel', 2);
    const normal = solarPerSol(s, base);
    startDisaster(s, 'dustStorm');
    expect(solarPerSol(s, base)).toBeCloseTo(normal * D.dustStorm.solarFactor);
  });

  it('a cold night makes shelters use more power (bigger base pays more)', () => {
    const s = newGame();
    const before = powerUse(s, 'habitat');
    startDisaster(s, 'coldNight');
    expect(powerUse(s, 'habitat')).toBe(before + D.coldNight.heatPerShelterPerSol);
    expect(powerUse(s, 'lander')).toBe(BALANCE.resources.powerUsePerSol.lander + D.coldNight.heatPerShelterPerSol);
    expect(powerUse(s, 'greenhouse')).toBe(BALANCE.resources.powerUsePerSol.greenhouse);
  });

  it('a solar flare hurts crew the shielding does not cover, and needs extra shielding', () => {
    const s = newGame();
    const [ready, normal] = s.bases;
    // Both astronauts stay home.
    s.players[0].pos = { ...ready.pos };
    s.players[1].pos = { ...normal.pos };
    // An M-class flare needs 2x the normal shielding.
    const mult = D.solarFlare.classes.M.shieldNeed;
    ready.stored.shielding = shieldNeeded(ready) * mult;
    normal.stored.shielding = shieldNeeded(normal); // fine on a normal day...
    startDisaster(s, 'solarFlare');
    expect(flareCoverage(ready, 'M')).toBe(1);
    expect(crewDamagePerSol(s, ready).flare).toBe(0);
    // ...but only half covered during the flare.
    expect(flareCoverage(normal, 'M')).toBeCloseTo(1 / mult);
    expect(crewDamagePerSol(s, normal).flare).toBeCloseTo(D.solarFlare.damagePerSol * (1 - 1 / mult));

    run(s, 5);
    expect(ready.health).toBe(BALANCE.crew.maxHealth);
    expect(normal.health).toBeLessThan(BALANCE.crew.maxHealth);
  });

  it('a flare hurts more while your astronaut is outside, and stronger flares hurt more', () => {
    const s = newGame();
    const base = s.bases[0];
    base.stored.shielding = shieldNeeded(base) * D.solarFlare.classes.M.shieldNeed; // fully covered
    s.players[0].pos = { x: base.pos.x + 100, z: base.pos.z };
    startDisaster(s, 'solarFlare', 1);
    expect(crewDamagePerSol(s, base).flare).toBeCloseTo(D.solarFlare.outsideDamagePerSol);
    startDisaster(s, 'solarFlare', 1.6);
    expect(crewDamagePerSol(s, base).flare).toBeCloseTo(D.solarFlare.outsideDamagePerSol * 1.6);
  });

  it('the flare mission asks for exactly the soil that covers the shortfall', () => {
    const s = newGame();
    const base = s.bases[0];
    base.stored.shielding = shieldNeeded(base); // covered for a normal day
    const missing = shieldNeeded(base) * (D.solarFlare.classes.X.shieldNeed - 1);
    const soil = Math.ceil(missing / BALANCE.pickups.kinds.regolith.amount);
    expect(flareSoilTarget(base, 'X', 1000)).toBe(Math.min(soil, BALANCE.missions.maxItems));
    // Already covered: still asks for the minimum, so there's always something to do.
    base.stored.shielding = 1000;
    expect(flareSoilTarget(base, 'X', 1000)).toBe(BALANCE.missions.minItems);
  });

  it('a dust storm slows astronauts down', () => {
    const calm = newGame();
    const windy = newGame();
    startDisaster(windy, 'dustStorm');
    for (const g of [calm, windy]) for (let i = 0; i < 120; i++) step(g, [{ playerId: 'p1', moveX: 1, moveZ: 0 }], DT);
    const speed = (g: GameState) => Math.hypot(g.players[0].vel.x, g.players[0].vel.z);
    expect(speed(windy)).toBeCloseTo(speed(calm) * D.dustStorm.walkSpeedFactor, 1);
  });

  it('dust storms only start in the morning', () => {
    const s = newGame(3);
    let storms = 0;
    for (let i = 0; i < 40 * 60 * 30; i++) {
      const events: GameEvent[] = step(s, [], DT);
      for (const e of events) {
        if (e.type !== 'DisasterStarted' || e.kind !== 'dustStorm') continue;
        storms++;
        const tos = timeOfSol(s.time);
        expect(tos).toBeGreaterThanOrEqual(D.dustStorm.startWindow.from - 0.01);
        expect(tos).toBeLessThanOrEqual(D.dustStorm.startWindow.to + 0.01);
      }
    }
    expect(storms).toBeGreaterThan(0);
  });

  it('stays deterministic with disasters on', () => {
    const a = newGame(99);
    const b = newGame(99);
    run(a, 200);
    run(b, 200);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('wrecks, salvage and absorb', () => {
  function wreckFirstBase(s: GameState, buildings = 0): { base: BaseState; events: GameEvent[] } {
    const base = s.bases[0];
    addBuildings(s, base, 'solar_panel', buildings);
    base.crew = 0;
    return { base, events: run(s, DT) };
  }

  it('a base with no crew left becomes a wreck that drops salvage', () => {
    const s = newGame(7, false);
    const pickupsBefore = s.pickups.length;
    const { base, events } = wreckFirstBase(s, 3);
    expect(base.status).toBe('wrecked');
    expect(base.buildings.length).toBe(0);
    expect(s.wrecks.length).toBe(1);
    expect(s.wrecks[0].buildingCount).toBe(3);
    expect(events.some((e) => e.type === 'BaseWrecked')).toBe(true);
    const salvage = s.pickups.filter((p) => p.temporary);
    expect(salvage.length).toBe(salvageCount(3));
    expect(s.pickups.length).toBe(pickupsBefore + salvageCount(3));
    for (const p of salvage) expect(distance(p.pos, s.wrecks[0].pos)).toBeLessThanOrEqual(BALANCE.wrecks.scatterMax + 0.01);
  });

  it('losing the last crew member in play makes a wreck', () => {
    const s = newGame(7, false);
    const base = s.bases[0];
    base.crew = 1;
    base.health = 1;
    base.stored.lifeSupport = 0;
    const events = runUntil(s, 'BaseWrecked', 30);
    expect(events.some((e) => e.type === 'CrewLost' && e.crewLeft === 0)).toBe(true);
  });

  it('relaunches somewhere new with a fresh crew', () => {
    const s = newGame(7, false);
    const { base } = wreckFirstBase(s);
    const oldPos = { ...base.pos };
    const events = run(s, BALANCE.wrecks.relaunchDelay + 0.1);
    expect(events.some((e) => e.type === 'BaseRelaunched')).toBe(true);
    expect(base.status).toBe('active');
    expect(base.launches).toBe(2);
    expect(base.crew).toBe(BALANCE.base.startCrew);
    // Fresh starting supplies (it may have used a tiny bit since landing).
    expect(base.stored.power).toBeCloseTo(BALANCE.resources.start.power, 0);
    expect(base.stored.lifeSupport).toBeCloseTo(BALANCE.resources.start.lifeSupport, 0);
    expect(base.stored.shielding).toBe(BALANCE.resources.start.shielding);
    expect(distance(base.pos, oldPos)).toBeGreaterThan(0);
    // The astronaut was moved next to the new lander.
    expect(distance(s.players[0].pos, base.pos)).toBeLessThan(BALANCE.base.roverSpawnOffset + 1);
  });

  it('a big enough base absorbs the wreck for build points', () => {
    const s = newGame(7, false);
    wreckFirstBase(s, 2);
    const wreck = s.wrecks[0];
    const other = s.bases[1];
    addBuildings(s, other, 'solar_panel', 2);
    // Huge first-building cost so the points just pile up and we can count them.
    const before = other.buildPoints;
    s.players[1].pos = { ...wreck.pos };
    const events = run(s, DT);
    expect(s.wrecks.length).toBe(0);
    const absorbed = events.find((e) => e.type === 'WreckAbsorbed');
    expect(absorbed).toBeDefined();
    const expected = BALANCE.wrecks.absorbBuildPointsBase + BALANCE.wrecks.absorbBuildPointsPerBuilding * 2;
    if (absorbed?.type === 'WreckAbsorbed') expect(absorbed.buildPoints).toBe(expected);
    // Points went in (some may have turned into a building right away).
    expect(other.buildPoints + other.buildings.length).toBeGreaterThan(before + 2 - 1);
  });

  it('a smaller base cannot absorb a bigger wreck', () => {
    const s = newGame(7, false);
    wreckFirstBase(s, 3);
    s.players[1].pos = { ...s.wrecks[0].pos };
    const events = run(s, 1);
    expect(s.wrecks.length).toBe(1);
    expect(events.some((e) => e.type === 'WreckAbsorbed')).toBe(false);
  });

  it('wrecks and salvage crumble away over time', () => {
    const s = newGame(7, false);
    wreckFirstBase(s, 1);
    // Keep astronauts far from the wreck so nobody collects or absorbs.
    for (const p of s.players) p.pos = { x: -1000, z: -1000 };
    const events = run(s, BALANCE.wrecks.lifetime + 1);
    expect(s.wrecks.length).toBe(0);
    expect(events.some((e) => e.type === 'WreckCrumbled')).toBe(true);
    expect(s.pickups.some((p) => p.temporary)).toBe(false);
  });

  it('collected salvage is gone for good (it does not respawn)', () => {
    const s = newGame(7, false);
    wreckFirstBase(s);
    const crate = s.pickups.find((p) => p.temporary)!;
    s.players[0].pos = { x: -1000, z: -1000 }; // keep player 1 out of the way
    s.players[1].pos = { ...crate.pos };
    run(s, 0.5);
    expect(s.pickups.find((p) => p.id === crate.id)).toBeUndefined();
    expect(s.players[1].cargo.crate).toBeGreaterThan(0);
  });
});

describe('missions', () => {
  it('the first mission appears after a short delay', () => {
    const s = newGame(7, false);
    expect(s.players[0].mission).toBeNull();
    const events = run(s, BALANCE.missions.firstDelay + 0.1);
    expect(s.players[0].mission).not.toBeNull();
    expect(events.some((e) => e.type === 'MissionStarted' && e.playerId === 'p1')).toBe(true);
  });

  it('a solar flare coming soon asks for soil (regolith) for the shield', () => {
    const s = newGame();
    s.nextDisaster = { kind: 'solarFlare', flareClass: 'M', strength: 1, startsAt: 30, warned: false };
    const m = pickMission(s, s.bases[0]);
    expect(m.kind).toBe('bringRegolith');
    expect(m.disaster).toBe('solarFlare');
    expect(m.duration).toBe(30); // the deadline is when the flare hits
  });

  it('a dust storm coming soon asks you to charge the battery', () => {
    const s = newGame();
    s.nextDisaster = { kind: 'dustStorm', flareClass: null, strength: 1, startsAt: 30, warned: false };
    const m = pickMission(s, s.bases[0]);
    expect(m.kind).toBe('storePower');
    expect(m.target).toBe(powerTarget(s.bases[0]));
    expect(m.target).toBeGreaterThan(s.bases[0].stored.power);
  });

  it('with no disaster close, it asks for what the base needs most', () => {
    const s = newGame(7, false);
    const base = s.bases[0];
    base.stored.lifeSupport = 5;
    expect(pickMission(s, base).kind).toBe('bringIce');
    base.stored.lifeSupport = 100;
    base.stored.power = 1;
    expect(pickMission(s, base).kind).toBe('bringSolar');
    base.stored.power = 70;
    base.stored.shielding = 0;
    expect(pickMission(s, base).kind).toBe('bringRegolith');
    base.stored.shielding = 1000;
    expect(pickMission(s, base).kind).toBe('bringCrates');
  });

  it('item goals stay between the min and max, and fit the time', () => {
    const s = newGame(7, false);
    const base = s.bases[0];
    expect(itemTarget(base, 100)).toBe(BALANCE.missions.minItems);
    addBuildings(s, base, 'solar_panel', 60);
    expect(itemTarget(base, 1000)).toBe(BALANCE.missions.maxItems);
    expect(itemTarget(base, 20)).toBe(Math.max(BALANCE.missions.minItems, 20 / BALANCE.missions.secondsPerItem));
  });

  it('bringing the items home fast earns 3 stars', () => {
    const s = newGame(7, false);
    const player = s.players[0];
    const base = s.bases[0];
    base.stored.lifeSupport = 100; // plenty of everything except shielding...
    base.stored.power = 70;
    base.stored.shielding = 0; // ...makes it a "bring regolith" mission
    run(s, BALANCE.missions.firstDelay + 0.1);
    const m = player.mission!;
    expect(m.kind).toBe('bringRegolith');
    player.cargo.regolith = m.target;
    player.cargoCount = m.target;
    player.pos = { ...base.pos };
    const events = run(s, DT);
    const ended = events.find((e) => e.type === 'MissionEnded');
    expect(ended).toMatchObject({ type: 'MissionEnded', stars: 3, completed: true });
    expect(player.stars).toBe(3);
    expect(player.missionsDone).toBe(1);
    expect(player.mission).toBeNull();
  });

  it('finishing late earns 2 stars; half done when time runs out earns 1', () => {
    const s = newGame(7, false);
    const player = s.players[0];
    const base = s.bases[0];
    base.stored.lifeSupport = 100;
    base.stored.power = 70;
    base.stored.shielding = 0;
    player.pos = { x: base.pos.x + 100, z: base.pos.z };
    run(s, BALANCE.missions.firstDelay + 0.1);
    const m = player.mission!;
    // Half done...
    player.cargo.regolith = Math.ceil(m.target / 2);
    player.cargoCount = player.cargo.regolith;
    player.pos = { ...base.pos };
    run(s, DT);
    player.pos = { x: base.pos.x + 100, z: base.pos.z };
    // ...then the time runs out.
    const events = runUntil(s, 'MissionEnded', m.duration + 1);
    expect(events.find((e) => e.type === 'MissionEnded')).toMatchObject({ stars: 1, completed: false });

    // Next mission: finish it after more than half the time.
    run(s, BALANCE.missions.gap + 0.1);
    const m2 = player.mission!;
    run(s, m2.duration * 0.6);
    player.cargo.regolith = m2.target;
    player.cargo.ice = m2.target;
    player.cargo.solar = m2.target;
    player.cargo.crate = m2.target;
    player.cargoCount = m2.target * 4;
    player.pos = { ...base.pos };
    const events2 = run(s, DT);
    expect(events2.find((e) => e.type === 'MissionEnded')).toMatchObject({ stars: 2, completed: true });
  });

  it('a wrecked base drops its mission', () => {
    const s = newGame(7, false);
    run(s, BALANCE.missions.firstDelay + 0.1);
    expect(s.players[0].mission).not.toBeNull();
    s.bases[0].crew = 0;
    run(s, DT * 2);
    expect(s.players[0].mission).toBeNull();
  });
});

describe('supply drops', () => {
  const S = BALANCE.supplyDrop;
  const call: PlayerInput = { playerId: 'p1', moveX: 0, moveZ: 0, callSupplyDrop: true };

  it('the radio delay is between the real closest and farthest Earth–Mars distance', () => {
    const minMinutes = S.earthDistanceMinKm / S.speedOfLightKmPerS / 60; // ~3.0
    const maxMinutes = S.earthDistanceMaxKm / S.speedOfLightKmPerS / 60; // ~22.3
    expect(minMinutes).toBeCloseTo(3.04, 1);
    expect(maxMinutes).toBeCloseTo(22.3, 1);
    for (let seed = 1; seed < 30; seed++) {
      const s = newGame(seed, false);
      expect(s.lightMinutes).toBeGreaterThanOrEqual(minMinutes);
      expect(s.lightMinutes).toBeLessThanOrEqual(maxMinutes);
    }
  });

  it('costs power, arrives after the radio delay and bursts into supplies', () => {
    const s = newGame(7, false);
    const base = s.bases[0];
    s.players[0].pos = { x: -1000, z: -1000 }; // far away so nothing gets collected
    const power = base.stored.power;
    const events = step(s, [call], DT);
    expect(events.some((e) => e.type === 'SupplyDropCalled')).toBe(true);
    expect(base.stored.power).toBeLessThan(power - S.powerCost + 1);
    expect(s.supplyDrops.length).toBe(1);
    const landsAt = s.supplyDrops[0].landsAt;
    expect(landsAt - s.supplyDrops[0].calledAt).toBeCloseTo(s.lightMinutes * S.secondsPerLightMinute);

    const landed = runUntil(s, 'SupplyDropLanded', 30);
    expect(s.time).toBeGreaterThanOrEqual(landsAt);
    expect(landed.some((e) => e.type === 'SupplyDropLanded')).toBe(true);
    expect(s.supplyDrops.length).toBe(0);
    expect(s.pickups.filter((p) => p.temporary).length).toBe(S.items.length);
  });

  it('is refused while cooling down or without enough power', () => {
    const s = newGame(7, false);
    step(s, [call], DT);
    const again = step(s, [call], DT);
    expect(again).toContainEqual({ type: 'SupplyDropDenied', playerId: 'p1', reason: 'cooldown' });

    const t = newGame(7, false);
    t.bases[0].stored.power = S.powerCost - 1;
    const poor = step(t, [call], DT);
    expect(poor).toContainEqual({ type: 'SupplyDropDenied', playerId: 'p1', reason: 'noPower' });
    expect(t.supplyDrops.length).toBe(0);
  });
});
