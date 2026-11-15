import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { createBotState, botInput } from '../src/core/bots';
import type { GameEvent } from '../src/core/events';
import { cargoCapacity } from '../src/core/growth';
import { roundTimeLeft } from '../src/core/round';
import { colonyScore, standings } from '../src/core/scoring';
import { createGame, step } from '../src/core/simulation';
import type { GameState, PlayerInput } from '../src/core/state';

const DT = BALANCE.sim.fixedDt;
const S = BALANCE.score;

// You + 3 rivals, like the real game.
function fullGame(seed = 11, extra: Partial<Parameters<typeof createGame>[0]> = {}): GameState {
  return createGame({
    seed,
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Rusty', bot: 'grower' },
      { id: 'p3', name: 'Nova', bot: 'shielder' },
      { id: 'p4', name: 'Comet', bot: 'balanced' },
    ],
    ...extra,
  });
}

function run(state: GameState, seconds: number, input?: Omit<PlayerInput, 'playerId'>): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const inputs = input ? [{ playerId: 'p1', ...input }] : [];
    events.push(...step(state, inputs, DT));
  }
  return events;
}

describe('round flow', () => {
  it('starts in the lobby: nobody moves and the clock does not run', () => {
    const s = fullGame();
    expect(s.round.phase).toBe('lobby');
    const start = { ...s.players[0].pos };
    const botStart = { ...s.players[1].pos };
    run(s, 5, { moveX: 1, moveZ: 0 });
    expect(s.players[0].pos).toEqual(start);
    expect(s.players[1].pos).toEqual(botStart);
    expect(s.time).toBe(0);
    expect(roundTimeLeft(s)).toBe(BALANCE.round.seconds);
  });

  it('counts down 3, 2, 1 and then starts', () => {
    const s = fullGame();
    const events = run(s, BALANCE.round.lobbySeconds + 0.1);
    const counts = events.filter((e) => e.type === 'RoundCountdown').map((e) => (e.type === 'RoundCountdown' ? e.secondsLeft : 0));
    expect(counts.slice(-3)).toEqual([3, 2, 1]);
    expect(events.filter((e) => e.type === 'RoundStarted')).toHaveLength(1);
    expect(s.round.phase).toBe('playing');
  });

  it('ends when time runs out, saves the standings, then freezes', () => {
    const s = fullGame(11, { lobbySeconds: 0, roundSeconds: 40, disasters: false });
    expect(s.round.phase).toBe('playing');
    const events = run(s, 41, { moveX: 1, moveZ: 0 });
    expect(events.filter((e) => e.type === 'RoundEndingSoon')).toHaveLength(1);
    const ended = events.filter((e) => e.type === 'RoundEnded');
    expect(ended).toHaveLength(1);
    expect(s.round.phase).toBe('ended');
    expect(s.round.results).toHaveLength(4);
    expect(s.time).toBeCloseTo(40, 1);

    // Frozen: more steps change nothing.
    const before = JSON.stringify(s);
    expect(run(s, 2, { moveX: 1, moveZ: 0 })).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('untimed games (rounds: false) start right away and never end', () => {
    const s = createGame({ seed: 3, players: [{ id: 'p1', name: 'You' }], rounds: false, disasters: false });
    expect(s.round.phase).toBe('playing');
    run(s, 20);
    expect(s.round.phase).toBe('playing');
    expect(roundTimeLeft(s)).toBe(Infinity);
  });
});

describe('Colony Score', () => {
  it('counts healthy crew, powered buildings, stored resources and mission stars', () => {
    const s = fullGame();
    const me = s.players[0];
    const base = s.bases[0];
    base.crew = 4;
    base.sick = 1; // sick crew don't count
    base.buildings = [
      { id: 1, kind: 'solar_panel', offset: { x: 0, z: 0 }, powered: true },
      { id: 2, kind: 'habitat', offset: { x: 0, z: 0 }, powered: true },
      { id: 3, kind: 'greenhouse', offset: { x: 0, z: 0 }, powered: false }, // switched off: doesn't count
    ];
    base.stored = { power: 10.7, lifeSupport: 20, shielding: 5 };
    me.stars = 4;
    expect(colonyScore(s, me)).toEqual({
      crew: 3 * S.perHealthyCrew,
      buildings: 2 * S.perPoweredBuilding,
      stored: 35 * S.perStoredResource,
      missions: 4 * S.perMissionStar,
      total: 3 * S.perHealthyCrew + 2 * S.perPoweredBuilding + 35 * S.perStoredResource + 4 * S.perMissionStar,
    });
  });

  it('a wrecked base only keeps its mission stars', () => {
    const s = fullGame();
    s.bases[0].status = 'wrecked';
    s.players[0].stars = 2;
    expect(colonyScore(s, s.players[0]).total).toBe(2 * S.perMissionStar);
  });

  it('finishing a mission raises the score', () => {
    const s = fullGame(5, { lobbySeconds: 0, disasters: false });
    const me = s.players[0];
    const before = colonyScore(s, me).missions;
    me.mission = { kind: 'bringCrates', target: 1, progress: 1, duration: 40, timeLeft: 40, disaster: null };
    run(s, DT);
    expect(me.stars).toBe(3);
    expect(colonyScore(s, me).missions).toBe(before + 3 * S.perMissionStar);
  });

  it('standings are best first, ties go to more stars, then player order', () => {
    const s = fullGame();
    for (const b of s.bases) b.stored = { power: 0, lifeSupport: 0, shielding: 0 };
    s.players[2].stars = 1; // Nova: +25, and wins the tie below on stars
    s.bases[3].stored.power = 25; // Comet: +25, no stars
    const ranks = standings(s).map((r) => [r.playerId, r.rank]);
    expect(ranks).toEqual([
      ['p3', 1],
      ['p4', 2],
      ['p1', 3],
      ['p2', 4],
    ]);
    expect(standings(s)[0].isBot).toBe(true);
  });
});

describe('bots', () => {
  it('play a whole round on their own, the same way every time', () => {
    const a = fullGame(21, { lobbySeconds: 0, roundSeconds: 120 });
    const b = fullGame(21, { lobbySeconds: 0, roundSeconds: 120 });
    run(a, 121);
    run(b, 121);
    expect(a.round.phase).toBe('ended');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Every bot left home and brought something back.
    for (const p of a.players.slice(1)) {
      const base = a.bases.find((x) => x.ownerId === p.id)!;
      expect(base.buildings.length + base.launches).toBeGreaterThan(1);
    }
  });

  it('walk toward a pickup they can see', () => {
    const s = fullGame(4, { lobbySeconds: 0, disasters: false });
    const bot = s.players[1];
    for (const p of s.pickups) p.active = false;
    bot.pos = { x: 0, z: 0 };
    s.pickups[0].active = true;
    s.pickups[0].pos = { x: 30, z: 0 };
    const input = botInput(s, bot, DT);
    expect(bot.bot!.mode).toBe('seek');
    expect(input.moveX).toBeGreaterThan(0);
    expect(Math.abs(input.moveZ)).toBeLessThan(1e-9);
  });

  it('head home when the backpack is full', () => {
    const s = fullGame(4, { lobbySeconds: 0, disasters: false });
    const bot = s.players[1];
    bot.cargoCount = cargoCapacity(s, bot);
    bot.cargo.crate = bot.cargoCount;
    const base = s.bases[1];
    bot.pos = { x: base.pos.x + 50, z: base.pos.z };
    const input = botInput(s, bot, DT);
    expect(bot.bot!.mode).toBe('home');
    expect(input.moveX).toBeLessThan(0);
  });

  it('cautious bots go home on a disaster warning; the grower keeps going', () => {
    const s = fullGame(4, { lobbySeconds: 0 });
    s.nextDisaster = { kind: 'solarFlare', flareClass: 'M', realFlare: null, strength: 1, startsAt: 5, warned: true };
    const grower = s.players[1];
    const shielder = s.players[2];
    shielder.pos = { x: s.bases[2].pos.x + 60, z: s.bases[2].pos.z }; // out on the map
    botInput(s, grower, DT);
    botInput(s, shielder, DT);
    expect(shielder.bot!.mode).toBe('home');
    expect(grower.bot!.mode).not.toBe('home');
    // Once home with an empty backpack, it shelters until the danger passes.
    shielder.pos = { ...s.bases[2].pos };
    botInput(s, shielder, DT);
    expect(shielder.bot!.mode).toBe('shelter');
  });

  it('set their favourite power priority', () => {
    const s = fullGame(4, { lobbySeconds: 0, disasters: false });
    run(s, DT);
    expect(s.bases[2].powerPriority).toBe(BALANCE.bots.personalities.shielder.powerPriority);
  });

  it('a fresh bot brain starts wandering', () => {
    expect(createBotState('balanced').mode).toBe('wander');
  });
});
