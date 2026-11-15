// Mini tasks (M4b): big pickups you work on by holding the work key (E).
import { describe, expect, it } from 'vitest';
import { BALANCE, type TaskKind } from '../src/config/balance';
import type { GameEvent } from '../src/core/events';
import { cargoCapacity, magnetRadius } from '../src/core/growth';
import { createGame, step } from '../src/core/simulation';
import type { GameState, PlayerInput, PlayerState, TaskSiteState } from '../src/core/state';
import { taskProgress } from '../src/core/tasks';

const DT = BALANCE.sim.fixedDt;
const T = BALANCE.tasks;

// One player (or two humans), no disasters, no rounds: calm and predictable.
function newGame(seed = 42, players = 1): GameState {
  const list = Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `Tester ${i + 1}` }));
  return createGame({ seed, players: list, disasters: false, rounds: false });
}

// Same input every step for each listed player; collects all events.
function run(state: GameState, seconds: number, inputs: Record<string, Omit<PlayerInput, 'playerId'>> = {}): GameEvent[] {
  const all: GameEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const list = Object.entries(inputs).map(([playerId, input]) => ({ playerId, ...input }));
    all.push(...step(state, list, DT));
  }
  return all;
}

const HOLD = { moveX: 0, moveZ: 0, work: true };
const IDLE = { moveX: 0, moveZ: 0 };

// Clear the field: no small pickups, and only ONE task site (returned),
// placed `gap` studs east of the player. The player is moved away from home
// so the backpack isn't emptied at the base.
function setUp(state: GameState, kind: TaskKind = 'ice', gap = 3): { me: PlayerState; site: TaskSiteState } {
  for (const p of state.pickups) {
    p.active = false;
    p.respawnTimer = 9999;
  }
  const me = state.players[0];
  const home = state.bases[0].pos;
  me.pos = { x: home.x + 60, z: home.z };
  me.vel = { x: 0, z: 0 };
  for (const t of state.taskSites) {
    t.active = false;
    t.respawnTimer = 9999;
  }
  const site = state.taskSites[0];
  site.active = true;
  site.kind = kind;
  site.pos = { x: me.pos.x + gap, z: me.pos.z };
  return { me, site };
}

const done = (events: GameEvent[]) => events.filter((e) => e.type === 'TaskCompleted');
const started = (events: GameEvent[]) => events.filter((e) => e.type === 'TaskStarted');

describe('mini tasks', () => {
  it('there are task sites on the map from the start, away from the bases', () => {
    const s = newGame();
    expect(s.taskSites).toHaveLength(T.count);
    for (const t of s.taskSites) expect(t.active).toBe(true);
  });

  it('holding the work key fills the bar, then puts the reward in the backpack', () => {
    const s = newGame();
    const { me, site } = setUp(s, 'ice');
    const seconds = T.kinds.ice.seconds;

    const first = run(s, seconds - 0.5, { p1: HOLD });
    expect(started(first)).toHaveLength(1);
    expect(me.working).toBe(site.id);
    expect(done(first)).toHaveLength(0);
    expect(me.cargoCount).toBe(0);

    const rest = run(s, 0.6, { p1: HOLD });
    const finished = done(rest);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ playerId: 'p1', kind: 'ice', items: T.kinds.ice.reward });
    expect(me.cargo.ice).toBe(T.kinds.ice.reward);
    expect(me.cargoCount).toBe(T.kinds.ice.reward);
    expect(me.working).toBeNull();
    expect(site.active).toBe(false);
  });

  it('each kind gives its own items', () => {
    for (const kind of ['solar', 'regolith'] as TaskKind[]) {
      const s = newGame();
      const { me } = setUp(s, kind);
      run(s, T.kinds[kind].seconds + 0.1, { p1: HOLD });
      expect(me.cargo[kind]).toBe(T.kinds[kind].reward);
    }
  });

  it('letting go keeps the work done so far', () => {
    const s = newGame();
    const { me, site } = setUp(s, 'regolith');
    run(s, 1, { p1: HOLD });
    const saved = site.progress;
    expect(saved).toBeGreaterThan(0.9);
    run(s, 2, { p1: IDLE });
    expect(me.working).toBeNull();
    expect(site.progress).toBe(saved);
    expect(site.workerId).toBeNull();
    // Only the rest of the time is needed to finish.
    const events = run(s, T.kinds.regolith.seconds - 1 + 0.05, { p1: HOLD });
    expect(done(events)).toHaveLength(1);
  });

  it('you stand still (facing the site) while you work, even with move keys held', () => {
    const s = newGame();
    const { me } = setUp(s, 'solar');
    const start = { ...me.pos };
    run(s, 1, { p1: { moveX: 0, moveZ: 1, work: true } });
    expect(me.pos).toEqual(start);
    expect(me.vel).toEqual({ x: 0, z: 0 });
    // The site is east (+x): facing direction (-sin, -cos) points that way.
    expect(-Math.sin(me.heading)).toBeCloseTo(1, 5);
    // Let go: you can walk again.
    run(s, 1, { p1: { moveX: 0, moveZ: 1 } });
    expect(me.pos.z).toBeGreaterThan(start.z);
  });

  it('does not start when you are too far away', () => {
    const s = newGame();
    const { site } = setUp(s, 'ice', T.workRadius + 1);
    const events = run(s, 2, { p1: HOLD });
    expect(started(events)).toHaveLength(0);
    expect(site.progress).toBe(0);
  });

  it('does not start when the backpack has no room for the whole reward', () => {
    const s = newGame();
    const { me, site } = setUp(s, 'ice');
    me.cargoCount = cargoCapacity(s, me) - T.kinds.ice.reward + 1;
    me.cargo.crate = me.cargoCount;
    const events = run(s, T.kinds.ice.seconds + 1, { p1: HOLD });
    expect(started(events)).toHaveLength(0);
    expect(site.progress).toBe(0);
    expect(site.active).toBe(true);
  });

  it('the magnet never pulls a task site', () => {
    const s = newGame();
    const { me, site } = setUp(s, 'ice');
    site.pos = { ...me.pos }; // standing right on it
    run(s, 5, { p1: IDLE });
    expect(site.active).toBe(true);
    expect(me.cargoCount).toBe(0);
  });

  it('the magnet pauses while you work, so the backpack keeps room for the reward', () => {
    const s = newGame();
    const { me } = setUp(s, 'ice');
    const pickup = s.pickups[0];
    pickup.active = true;
    pickup.kind = 'crate';
    pickup.pos = { x: me.pos.x, z: me.pos.z + magnetRadius(s, me) * 0.5 };
    run(s, T.kinds.ice.seconds - 0.2, { p1: HOLD });
    expect(pickup.active).toBe(true);
    expect(me.cargoCount).toBe(0);
    // Finish the task, then the magnet grabs the pickup again.
    run(s, 0.3, { p1: HOLD });
    expect(me.cargo.ice).toBe(T.kinds.ice.reward);
    run(s, 3, { p1: IDLE });
    expect(me.cargo.crate).toBe(1);
    expect(me.cargo.ice).toBe(T.kinds.ice.reward);
  });

  it('a finished site comes back somewhere else after a while', () => {
    const s = newGame();
    const { site } = setUp(s, 'ice');
    run(s, T.kinds.ice.seconds + 0.1, { p1: HOLD });
    expect(site.active).toBe(false);
    const where = { ...site.pos };
    run(s, T.respawnDelay - 0.5, { p1: IDLE });
    expect(site.active).toBe(false);
    run(s, 1, { p1: IDLE });
    expect(site.active).toBe(true);
    expect(site.progress).toBe(0);
    expect(site.pos).not.toEqual(where);
  });

  it('only one player can work a site at a time', () => {
    const s = newGame(42, 2);
    const { me, site } = setUp(s, 'solar');
    const other = s.players[1];
    other.pos = { x: site.pos.x + 2, z: site.pos.z };
    other.vel = { x: 0, z: 0 };
    const events = run(s, 1, { p1: HOLD, p2: HOLD });
    expect(started(events).map((e) => e.playerId)).toEqual(['p1']);
    expect(site.workerId).toBe(me.id);
    expect(other.working).toBeNull();
    // p1 lets go: now p2 can take over, and keeps p1's progress.
    const after = run(s, 0.1, { p1: IDLE, p2: HOLD });
    expect(started(after).map((e) => e.playerId)).toEqual(['p2']);
    expect(taskProgress(site)).toBeGreaterThan(0.25);
  });
});

describe('bots and mini tasks', () => {
  it('a bot walks to a task site and works on it', () => {
    const s = createGame({
      seed: 7,
      players: [
        { id: 'p1', name: 'You' },
        { id: 'p2', name: 'Comet', bot: 'balanced' },
      ],
      disasters: false,
      rounds: false,
    });
    const { site } = setUp(s, 'ice', 3);
    // Put the bot 30 studs from the site, away from its base.
    const bot = s.players[1];
    bot.pos = { x: site.pos.x, z: site.pos.z + 30 };
    bot.vel = { x: 0, z: 0 };
    s.players[0].pos = { x: site.pos.x + 200, z: site.pos.z }; // you're far away
    const events = run(s, 20);
    const finished = done(events).filter((e) => e.playerId === 'p2');
    expect(finished).toHaveLength(1);
    expect(bot.cargo.ice).toBe(T.kinds.ice.reward);
  });

  it('bots do mini tasks in a normal round, and games still replay exactly', () => {
    const make = () =>
      createGame({
        seed: 21,
        players: [
          { id: 'p1', name: 'You' },
          { id: 'p2', name: 'Rusty', bot: 'grower' },
          { id: 'p3', name: 'Nova', bot: 'shielder' },
          { id: 'p4', name: 'Comet', bot: 'balanced' },
        ],
        lobbySeconds: 0,
        roundSeconds: 180,
      });
    const a = make();
    const b = make();
    const eventsA = run(a, 181);
    run(b, 181);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(done(eventsA).some((e) => e.playerId !== 'p1')).toBe(true);
  });
});
