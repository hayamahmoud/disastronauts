// Milestone 2: Power, Life Support, Shielding, day/night and crew health.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import type { BuildingKind } from '../src/config/balance';
import { sickCount } from '../src/core/crew';
import { isNight, solNumber, sunlight, timeOfSol } from '../src/core/dayNight';
import type { GameEvent } from '../src/core/events';
import { shieldCoverage, shieldNeeded, storageCapacity } from '../src/core/resources';
import { createGame, step } from '../src/core/simulation';
import type { BaseState, GameState, PlayerInput } from '../src/core/state';

const DT = BALANCE.sim.fixedDt;
const SOL = BALANCE.sol.seconds;

// Disasters are switched off here so these tests stay calm and predictable
// (disasters have their own tests in disasters.test.ts).
function newGame(seed = 42): GameState {
  const s = createGame({ seed, players: [{ id: 'p1', name: 'Tester' }], disasters: false });
  // Park the rover far from its base and turn off pickups, so only the
  // base's own production and consumption change the numbers.
  s.players[0].pos = { x: s.bases[0].pos.x + 100, z: s.bases[0].pos.z };
  for (const p of s.pickups) {
    p.active = false;
    p.respawnTimer = 1e9;
  }
  return s;
}

function run(state: GameState, seconds: number, input?: Partial<Omit<PlayerInput, 'playerId'>>): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    all.push(...step(state, input ? [{ playerId: 'p1', moveX: 0, moveZ: 0, ...input }] : [], DT));
  }
  return all;
}

function addBuilding(s: GameState, base: BaseState, kind: BuildingKind): void {
  base.buildings.push({ id: s.nextId++, kind, offset: { x: 0, z: 0 }, powered: true });
}

// Game time (seconds) at a given time-of-sol on the first sol.
function timeAt(fraction: number): number {
  return (fraction - BALANCE.sol.startTimeOfSol) * SOL;
}

describe('day and night', () => {
  it('starts in the morning of Sol 1', () => {
    expect(solNumber(0)).toBe(1);
    expect(timeOfSol(0)).toBeCloseTo(BALANCE.sol.startTimeOfSol);
    expect(isNight(0)).toBe(false);
  });

  it('sun is strongest at noon and zero at night', () => {
    expect(sunlight(timeAt(0.5))).toBeCloseTo(1);
    expect(sunlight(timeAt(0.9))).toBe(0);
    expect(sunlight(timeAt(0.4))).toBeLessThan(1);
  });

  it('a new sol starts every sol.seconds and fires Sunrise/Sunset events', () => {
    const s = newGame();
    const events = run(s, SOL);
    expect(events.filter((e) => e.type === 'Sunset').length).toBe(1);
    const sunrise = events.find((e) => e.type === 'Sunrise');
    expect(sunrise && sunrise.type === 'Sunrise' && sunrise.sol).toBe(2);
  });
});

describe('power', () => {
  it('solar panels charge the battery during the day', () => {
    const s = newGame();
    const base = s.bases[0];
    addBuilding(s, base, 'solar_panel');
    base.stored.power = 10;
    s.time = timeAt(0.45); // late morning
    run(s, 5);
    expect(base.stored.power).toBeGreaterThan(10);
  });

  it('the battery drains at night', () => {
    const s = newGame();
    const base = s.bases[0];
    base.stored.power = 50;
    s.time = timeAt(0.8);
    run(s, 5);
    expect(base.stored.power).toBeLessThan(50);
  });

  it('never stores more than its capacity', () => {
    const s = newGame();
    const base = s.bases[0];
    addBuilding(s, base, 'solar_panel');
    base.stored.power = storageCapacity(base, 'power');
    s.time = timeAt(0.5);
    run(s, 5);
    expect(base.stored.power).toBeLessThanOrEqual(storageCapacity(base, 'power'));
  });

  it('when power runs out, the chosen priority stays on and the other switches off', () => {
    const s = newGame();
    const base = s.bases[0];
    addBuilding(s, base, 'greenhouse');
    addBuilding(s, base, 'shield_generator');
    s.time = timeAt(0.9); // night: no solar
    // Exactly enough for the lander + one of the two buildings this step.
    const R = BALANCE.resources.powerUsePerSol;
    const perStep = DT / SOL;
    base.stored.power = (R.lander + R.greenhouse) * perStep * 1.01;

    const events = run(s, DT);
    expect(base.landerPowered).toBe(true);
    expect(base.buildings.find((b) => b.kind === 'greenhouse')!.powered).toBe(true);
    expect(base.buildings.find((b) => b.kind === 'shield_generator')!.powered).toBe(false);
    expect(events.some((e) => e.type === 'PowerOut')).toBe(true);
  });

  it('buildings do not flicker on and off when Power is near zero', () => {
    const s = newGame();
    const base = s.bases[0];
    for (const kind of ['solar_panel', 'habitat', 'greenhouse', 'shield_generator'] as const) addBuilding(s, base, kind);
    base.crew = 4;
    const events = run(s, 5 * SOL);
    // At most one switch-off per night (plus slack), not dozens.
    expect(events.filter((e) => e.type === 'PowerOut').length).toBeLessThanOrEqual(7);
  });

  it('the player can switch priority to the shield generator', () => {
    const s = newGame();
    const base = s.bases[0];
    addBuilding(s, base, 'greenhouse');
    addBuilding(s, base, 'shield_generator');
    s.time = timeAt(0.9);
    const R = BALANCE.resources.powerUsePerSol;
    base.stored.power = (R.lander + R.shield_generator) * (DT / SOL) * 1.01;

    run(s, DT, { powerPriority: 'shield_generator' });
    expect(base.powerPriority).toBe('shield_generator');
    expect(base.buildings.find((b) => b.kind === 'shield_generator')!.powered).toBe(true);
    expect(base.buildings.find((b) => b.kind === 'greenhouse')!.powered).toBe(false);
  });
});

describe('life support', () => {
  it('every crew member uses life support each sol', () => {
    const s = newGame();
    const base = s.bases[0];
    base.stored.lifeSupport = 50;
    run(s, SOL);
    const expected = 50 - base.crew * BALANCE.resources.lifeSupportPerCrewPerSol;
    expect(base.stored.lifeSupport).toBeCloseTo(expected, 0);
  });

  it('more crew use it up faster', () => {
    const small = newGame();
    const big = newGame();
    big.bases[0].crew = 6;
    run(small, 10);
    run(big, 10);
    expect(big.bases[0].stored.lifeSupport).toBeLessThan(small.bases[0].stored.lifeSupport);
  });

  it('a powered greenhouse makes life support', () => {
    const withGh = newGame();
    const without = newGame();
    addBuilding(withGh, withGh.bases[0], 'greenhouse');
    for (const s of [withGh, without]) {
      s.bases[0].stored.power = 1000; // plenty of power
      s.bases[0].stored.lifeSupport = 20;
    }
    run(withGh, 5);
    run(without, 5);
    expect(withGh.bases[0].stored.lifeSupport).toBeGreaterThan(without.bases[0].stored.lifeSupport);
  });
});

describe('shielding', () => {
  it('a bigger base needs more shielding', () => {
    const s = newGame();
    const base = s.bases[0];
    const before = shieldNeeded(base);
    base.crew += 2;
    addBuilding(s, base, 'habitat');
    expect(shieldNeeded(base)).toBeGreaterThan(before);
  });

  it('a new base starts fully covered; growth without regolith uncovers it', () => {
    const s = newGame();
    const base = s.bases[0];
    expect(shieldCoverage(base)).toBe(1);
    base.crew += 2;
    expect(shieldCoverage(base)).toBeLessThan(1);
  });

  it('a powered shield generator adds coverage, an unpowered one does not', () => {
    const s = newGame();
    const base = s.bases[0];
    base.crew = 6;
    base.stored.shielding = 10;
    addBuilding(s, base, 'shield_generator');
    const on = shieldCoverage(base);
    base.buildings[0].powered = false;
    expect(shieldCoverage(base)).toBeLessThan(on);
  });
});

describe('crew health', () => {
  it('stays healthy in a well-run base', () => {
    const s = newGame();
    run(s, 10);
    expect(s.bases[0].health).toBe(BALANCE.crew.maxHealth);
    expect(s.bases[0].sick).toBe(0);
  });

  it('drops without life support, crew get sick, then one is lost', () => {
    const s = newGame();
    const base = s.bases[0];
    base.stored.lifeSupport = 0;
    const startCrew = base.crew;
    const events = run(s, SOL);
    expect(events.some((e) => e.type === 'CrewSick')).toBe(true);
    expect(events.some((e) => e.type === 'CrewLost')).toBe(true);
    expect(base.crew).toBe(startCrew - 1);
  });

  it('radiation hurts crew that are not covered by shielding', () => {
    const s = newGame();
    const base = s.bases[0];
    base.stored.shielding = 0;
    run(s, 5);
    expect(base.health).toBeLessThan(BALANCE.crew.maxHealth);
  });

  it('heals when nothing is hurting the crew', () => {
    const s = newGame();
    s.bases[0].health = 50;
    run(s, 5);
    expect(s.bases[0].health).toBeGreaterThan(50);
  });

  it('more crew get sick as health falls', () => {
    const s = newGame();
    const base = s.bases[0];
    base.crew = 6;
    base.health = 30;
    const some = sickCount(base);
    base.health = 5;
    expect(sickCount(base)).toBeGreaterThan(some);
    expect(sickCount(base)).toBeLessThanOrEqual(base.crew);
  });
});

describe('the starting base is stable', () => {
  it('a new base with no pickups survives 2 sols without losing crew', () => {
    const s = newGame();
    const startCrew = s.bases[0].crew;
    const events = run(s, 2 * SOL);
    expect(events.some((e) => e.type === 'CrewLost')).toBe(false);
    expect(s.bases[0].crew).toBe(startCrew);
  });
});
