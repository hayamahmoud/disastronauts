import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import type { GameEvent } from '../src/core/events';
import { cargoCapacity, magnetRadius } from '../src/core/growth';
import { createRng, rngNext } from '../src/core/rng';
import { createGame, step } from '../src/core/simulation';
import type { GameState, PlayerInput } from '../src/core/state';
import { sampleHeight } from '../src/core/terrain';

const DT = BALANCE.sim.fixedDt;

// Disasters are switched off here so these tests stay calm and predictable
// (disasters have their own tests in disasters.test.ts).
function newGame(seed = 42): GameState {
  return createGame({ seed, players: [{ id: 'p1', name: 'Tester' }], disasters: false });
}

// Run `seconds` of game time with the same input every step; collect all events.
function run(state: GameState, seconds: number, input?: Omit<PlayerInput, 'playerId'>): GameEvent[] {
  const all: GameEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const inputs = input ? [{ playerId: 'p1', ...input }] : [];
    all.push(...step(state, inputs, DT));
  }
  return all;
}

// Move every pickup far away so tests control exactly what's nearby.
function clearPickups(state: GameState): void {
  for (const p of state.pickups) {
    p.active = false;
    p.respawnTimer = 9999;
  }
}

describe('rng', () => {
  it('gives the same sequence for the same seed, values in [0, 1)', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rngNext(a);
      expect(v).toBe(rngNext(b));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('step()', () => {
  it('is deterministic: same seed + same inputs = identical state', () => {
    const a = newGame(123);
    const b = newGame(123);
    for (let i = 0; i < 600; i++) {
      // A wiggly scripted drive so lots of pickups get collected.
      const input = { playerId: 'p1', moveX: Math.sin(i / 50), moveZ: Math.cos(i / 70) };
      step(a, [input], DT);
      step(b, [input], DT);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds give different maps', () => {
    const a = newGame(1);
    const b = newGame(2);
    expect(a.pickups[0].pos).not.toEqual(b.pickups[0].pos);
  });

  it('moves the rover in the input direction', () => {
    const s = newGame();
    const start = { ...s.players[0].pos };
    run(s, 1, { moveX: 1, moveZ: 0 });
    expect(s.players[0].pos.x).toBeGreaterThan(start.x + 10);
    expect(Math.abs(s.players[0].pos.z - start.z)).toBeLessThan(1);
  });

  it('stops when there is no input', () => {
    const s = newGame();
    run(s, 1, { moveX: 0, moveZ: -1 });
    run(s, 2);
    const p = s.players[0];
    expect(Math.hypot(p.vel.x, p.vel.z)).toBe(0);
  });

  describe('turn & walk controls (behind view)', () => {
    it('W walks the way you face (heading 0 = north, -Z)', () => {
      const s = newGame();
      const p = s.players[0];
      p.heading = 0;
      const start = { ...p.pos };
      run(s, 1, { moveX: 0, moveZ: 0, forward: 1 });
      expect(p.pos.z).toBeLessThan(start.z - 10);
      expect(Math.abs(p.pos.x - start.x)).toBeLessThan(1);
    });

    it('D turns right (from north toward east) even when standing still', () => {
      const s = newGame();
      const p = s.players[0];
      p.heading = 0;
      run(s, 0.25, { moveX: 0, moveZ: 0, turn: 1 });
      expect(p.heading).toBeLessThan(0); // right turn = heading goes negative (toward east)
      const start = { ...p.pos };
      run(s, 0.5, { moveX: 0, moveZ: 0, turn: 0, forward: 1 });
      expect(p.pos.x).toBeGreaterThan(start.x); // now walking partly east
    });

    it('S backs up slowly without turning around', () => {
      const s = newGame();
      const p = s.players[0];
      p.heading = 0;
      const start = { ...p.pos };
      run(s, 1, { moveX: 0, moveZ: 0, forward: -1 });
      expect(p.heading).toBe(0);
      expect(p.pos.z).toBeGreaterThan(start.z + 2); // moved backward (south)
      expect(p.pos.z - start.z).toBeLessThan(BALANCE.rover.maxSpeed * BALANCE.rover.backUpSpeedFactor);
    });
  });

  it('cannot drive up the crater wall', () => {
    const s = newGame();
    const p = s.players[0];
    p.pos = { x: 0, z: 0 };
    run(s, 30, { moveX: 1, moveZ: 0 }); // drive east for a long time
    expect(p.pos.x).toBeLessThan(BALANCE.map.craterRadius);
    expect(sampleHeight(s.terrain, p.pos.x, p.pos.z)).toBeLessThan(BALANCE.map.craterRimHeight);
  });
});

describe('magnet pickups', () => {
  it('pulls in and collects a nearby pickup', () => {
    const s = newGame();
    clearPickups(s);
    const player = s.players[0];
    player.pos = { x: 0, z: 0 }; // away from the base, so it doesn't unload straight away
    const pickup = s.pickups[0];
    pickup.active = true;
    pickup.kind = 'ice';
    pickup.pos = { x: player.pos.x + magnetRadius(s, player) - 1, z: player.pos.z };

    const events = run(s, 1);
    expect(player.cargo.ice).toBe(1);
    expect(player.cargoCount).toBe(1);
    expect(pickup.active).toBe(false);
    expect(events.some((e) => e.type === 'PickupCollected')).toBe(true);
  });

  it('ignores pickups outside the magnet radius', () => {
    const s = newGame();
    clearPickups(s);
    const player = s.players[0];
    s.pickups[0].active = true;
    s.pickups[0].pos = { x: player.pos.x + magnetRadius(s, player) + 5, z: player.pos.z };
    run(s, 1);
    expect(player.cargoCount).toBe(0);
  });

  it('stops collecting when cargo is full', () => {
    const s = newGame();
    clearPickups(s);
    const player = s.players[0];
    player.cargo.crate = cargoCapacity(s, player);
    player.cargoCount = cargoCapacity(s, player);
    player.pos = { x: 0, z: 0 }; // away from the base, so nothing gets deposited
    s.pickups[0].active = true;
    s.pickups[0].pos = { x: 2, z: 0 };
    run(s, 1);
    expect(player.cargoCount).toBe(cargoCapacity(s, player));
    expect(s.pickups[0].active).toBe(true);
  });

  it('respawns collected pickups after a delay', () => {
    const s = newGame();
    const p = s.pickups[0];
    p.active = false;
    p.respawnTimer = 1;
    run(s, 1.1);
    expect(p.active).toBe(true);
  });
});

describe('deposit and growth', () => {
  it('unloads cargo at the base and adds resources', () => {
    const s = newGame();
    const player = s.players[0];
    const base = s.bases[0];
    player.cargo.ice = 2;
    player.cargoCount = 2;
    player.pos = { ...base.pos };
    const before = base.stored.lifeSupport;

    const events = run(s, DT);
    expect(player.cargoCount).toBe(0);
    // +10 from the ice, minus a tiny bit the crew breathed during this step.
    expect(base.stored.lifeSupport).toBeCloseTo(before + 2 * BALANCE.pickups.kinds.ice.amount, 1);
    expect(events.some((e) => e.type === 'CargoDeposited')).toBe(true);
  });

  it('builds buildings in order and adds crew for habitats', () => {
    const s = newGame();
    const player = s.players[0];
    const base = s.bases[0];
    // Enough crates to pay for the first two buildings (solar panel, habitat).
    const G = BALANCE.growth;
    const needed = G.firstBuildingCost + (G.firstBuildingCost + G.costIncrease);
    // Enough for two buildings, but not three.
    const crates = Math.ceil(needed / BALANCE.pickups.kinds.crate.buildPoints);
    player.cargo.crate = crates;
    player.cargoCount = crates;
    player.pos = { ...base.pos };

    const events = run(s, DT);
    expect(base.buildings.map((b) => b.kind)).toEqual(['solar_panel', 'habitat']);
    expect(base.crew).toBe(BALANCE.base.startCrew + BALANCE.growth.crewPerHabitat);
    expect(events.filter((e) => e.type === 'BuildingBuilt').length).toBe(2);
    expect(events.some((e) => e.type === 'CrewAdded')).toBe(true);
  });

  it('a bigger base gives a bigger magnet and cargo bay', () => {
    const s = newGame();
    const player = s.players[0];
    const radiusBefore = magnetRadius(s, player);
    const capacityBefore = cargoCapacity(s, player);
    s.bases[0].buildings.push({ id: 999, kind: 'habitat', offset: { x: 0, z: 0 }, powered: true });
    expect(magnetRadius(s, player)).toBeGreaterThan(radiusBefore);
    expect(cargoCapacity(s, player)).toBeGreaterThan(capacityBefore);
  });
});
