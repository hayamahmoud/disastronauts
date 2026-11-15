// M6: modifiers, power-ups, coins/XP, the saved profile and the coin shop.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import type { GameEvent } from '../src/core/events';
import { cargoCapacity, magnetRadius } from '../src/core/growth';
import { defaultModifiers, modifiersFrom, type Modifiers } from '../src/core/modifiers';
import { solarModifier } from '../src/core/powerups';
import { levelForXp, levelProgress, roundReward } from '../src/core/progression';
import { solarPerSol } from '../src/core/resources';
import { createGame, step } from '../src/core/simulation';
import type { GameState, PlayerInput, Standing } from '../src/core/state';
import { supplyDropDelay, supplyDropPowerCost } from '../src/core/supplyDrop';
import { CATALOG, findItem, webShopItems } from '../src/services/catalog';
import { WebMonetizationService } from '../src/services/MonetizationService';
import { ProfileService, type KeyValueStore } from '../src/services/ProfileService';

const DT = BALANCE.sim.fixedDt;
const P = BALANCE.powerups;

function newGame(mods?: Partial<Modifiers>, disasters = false): GameState {
  return createGame({
    seed: 7,
    players: [{ id: 'p1', name: 'Tester', mods: { ...defaultModifiers(), ...mods } }],
    disasters,
    rounds: false,
  });
}

function run(state: GameState, seconds: number, input: Omit<PlayerInput, 'playerId'> = { moveX: 0, moveZ: 0 }): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) all.push(...step(state, [{ playerId: 'p1', ...input }], DT));
  return all;
}

// Jump straight to a solar flare starting in one step.
function flareNow(s: GameState): void {
  s.nextDisaster = { kind: 'solarFlare', flareClass: 'X', realFlare: null, strength: 1.6, startsAt: s.time, warned: true };
  s.disastersEnabled = true;
}

function fakeStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('modifiers', () => {
  it('no items = no change', () => {
    expect(modifiersFrom([])).toEqual(defaultModifiers());
  });

  it('combines mul and add effects', () => {
    const m = modifiersFrom([
      { modifier: 'roverSpeed', op: 'mul', value: 1.1 },
      { modifier: 'roverSpeed', op: 'mul', value: 2 },
      { modifier: 'cargoCapacity', op: 'add', value: 2 },
    ]);
    expect(m.roverSpeed).toBeCloseTo(2.2);
    expect(m.cargoCapacity).toBe(2);
  });

  it('upgrades change magnet, backpack, speed and solar', () => {
    const plain = newGame();
    const upgraded = newGame({ magnetRadius: 1.2, cargoCapacity: 2, roverSpeed: 1.1, solarEfficiency: 1.15 });
    const [a, b] = [plain.players[0], upgraded.players[0]];
    expect(magnetRadius(upgraded, b)).toBeCloseTo(magnetRadius(plain, a) * 1.2);
    expect(cargoCapacity(upgraded, b)).toBe(cargoCapacity(plain, a) + 2);
    expect(solarPerSol(upgraded, upgraded.bases[0])).toBeCloseTo(solarPerSol(plain, plain.bases[0]) * 1.15);

    // Walk east for a second on both: the upgraded one goes further.
    for (const s of [plain, upgraded]) {
      s.players[0].pos = { ...s.bases[0].pos };
      run(s, 1, { moveX: 1, moveZ: 0 });
    }
    const walked = (s: GameState) => s.players[0].pos.x - s.bases[0].pos.x;
    expect(walked(upgraded)).toBeGreaterThan(walked(plain) * 1.05);
  });

  it('Express Supply Drop: faster, but costs more Power', () => {
    const plain = newGame();
    const express = newGame({ supplyDropDelay: 0.5, supplyDropPowerCost: 1.5 });
    expect(supplyDropDelay(express, express.players[0])).toBeCloseTo(supplyDropDelay(plain, plain.players[0]) * 0.5);
    expect(supplyDropPowerCost(express.players[0])).toBe(Math.round(BALANCE.supplyDrop.powerCost * 1.5));

    express.bases[0].stored.power = 60;
    run(express, DT, { moveX: 0, moveZ: 0, callSupplyDrop: true });
    expect(express.bases[0].stored.power).toBeLessThan(60 - BALANCE.supplyDrop.powerCost);
  });
});

describe('Shield Bubble', () => {
  it('blocks a flare and costs Power', () => {
    const s = newGame({ flareBubbles: 1 });
    const base = s.bases[0];
    base.stored.power = 60;
    base.stored.shielding = 0; // totally unshielded
    s.players[0].pos = { ...base.pos }; // stay home
    flareNow(s);
    const events = run(s, DT);
    expect(events.some((e) => e.type === 'ShieldBubbleUp')).toBe(true);
    expect(base.bubble).toBe(true);
    expect(s.players[0].bubbles).toBe(0);
    expect(base.stored.power).toBeLessThanOrEqual(60 - P.bubblePowerCost + 1);

    // Health doesn't drop from the flare (only normal radiation, which is slow).
    const before = base.health;
    run(s, 3);
    const plain = newGame();
    plain.bases[0].stored.shielding = 0;
    plain.players[0].pos = { ...plain.bases[0].pos };
    flareNow(plain);
    run(plain, 3 + DT);
    expect(before - base.health).toBeLessThan(BALANCE.crew.maxHealth - plain.bases[0].health);

    // Gone when the flare ends.
    run(s, BALANCE.disasters.solarFlare.duration);
    expect(base.bubble).toBe(false);
  });

  it('fails without enough Power and keeps the charge', () => {
    const s = newGame({ flareBubbles: 1 });
    s.bases[0].stored.power = P.bubblePowerCost - 5;
    flareNow(s);
    const events = run(s, DT);
    expect(events.some((e) => e.type === 'ShieldBubbleFailed')).toBe(true);
    expect(s.bases[0].bubble).toBe(false);
    expect(s.players[0].bubbles).toBe(1);
  });
});

describe('Solar Boost', () => {
  it('doubles solar, then overheats to half, then ends', () => {
    const s = newGame({ solarBoosts: 1 });
    const base = s.bases[0];
    const normal = solarPerSol(s, base);
    const events = run(s, DT, { moveX: 0, moveZ: 0, solarBoost: true });
    expect(events.some((e) => e.type === 'SolarBoostStarted')).toBe(true);
    expect(s.players[0].solarBoosts).toBe(0);
    expect(solarPerSol(s, base) / normal).toBeCloseTo(P.boostFactor, 1);

    // (Measured as a multiplier: the sun itself moves during these 60 seconds.)
    expect(run(s, P.boostSeconds + 0.1).some((e) => e.type === 'SolarBoostOverload')).toBe(true);
    expect(solarModifier(s, base)).toBeCloseTo(P.overloadFactor);

    expect(run(s, P.overloadSeconds).some((e) => e.type === 'SolarBoostEnded')).toBe(true);
    expect(s.players[0].solarBoost).toBeNull();
    expect(solarModifier(s, base)).toBe(1);
  });

  it('does nothing without a charge', () => {
    const s = newGame();
    expect(run(s, DT, { moveX: 0, moveZ: 0, solarBoost: true }).some((e) => e.type === 'SolarBoostStarted')).toBe(false);
  });
});

describe('coins and XP', () => {
  const standing = (rank: number, total: number): Standing => ({
    playerId: 'p1', name: 'You', colorIndex: 0, isBot: false, rank,
    score: { crew: 0, buildings: 0, stored: 0, missions: 0, total },
  });

  it('better places and more stars earn more coins', () => {
    expect(roundReward(standing(1, 500), 0).coins).toBeGreaterThan(roundReward(standing(2, 500), 0).coins);
    expect(roundReward(standing(4, 500), 5).coins).toBeGreaterThan(roundReward(standing(4, 500), 0).coins);
    expect(roundReward(standing(1, 500), 0, 2).coins).toBe(roundReward(standing(1, 500), 0).coins * 2);
  });

  it('XP grows with score and levels follow the table', () => {
    expect(roundReward(standing(1, 1000), 0).xp).toBeGreaterThan(roundReward(standing(1, 100), 0).xp);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(BALANCE.progression.levelXp[1])).toBe(2);
    expect(levelForXp(999999)).toBe(BALANCE.progression.levelXp.length);
    expect(levelProgress(BALANCE.progression.levelXp[1] + 10).into).toBe(10);
  });
});

describe('catalog', () => {
  it('has the starter items, all with valid modifiers', () => {
    const names = Object.keys(defaultModifiers());
    for (const item of CATALOG) for (const e of item.effects) expect(names).toContain(e.modifier);
    for (const id of ['rover_speed_1', 'magnet_1', 'cargo_1', 'solar_1', 'shield_bubble', 'solar_boost', 'express_drop']) {
      expect(findItem(id)).toBeDefined();
    }
  });

  it('the web shop hides Roblox passes and has no real-money prices', () => {
    expect(webShopItems().some((i) => i.kind === 'pass')).toBe(false);
    for (const item of webShopItems()) expect(item.coinPrice).not.toBeNull();
  });
});

describe('profile and coin shop', () => {
  it('starts with some coins and saves between visits', () => {
    const store = fakeStore();
    const first = new ProfileService(store);
    expect(first.profile.coins).toBe(BALANCE.progression.startingCoins);
    first.addReward({ coins: 40, xp: 120 });
    const again = new ProfileService(store);
    expect(again.profile.coins).toBe(BALANCE.progression.startingCoins + 40);
    expect(again.level()).toBe(2);
  });

  it('buying spends coins; you cannot buy what you cannot afford', async () => {
    const profiles = new ProfileService(fakeStore());
    profiles.profile.coins = 300;
    const shop = new WebMonetizationService(profiles);
    expect(await shop.purchase('rover_speed_1')).toBe(true);
    expect(profiles.profile.coins).toBe(100);
    expect(shop.owns('rover_speed_1')).toBe(true);
    expect(await shop.purchase('rover_speed_1')).toBe(false); // already owned
    expect(await shop.purchase('magnet_1')).toBe(false); // too expensive now
    expect(await shop.purchase('vip')).toBe(false); // Roblox only
  });

  it('level-locked items need the level', async () => {
    const profiles = new ProfileService(fakeStore());
    profiles.profile.coins = 1000;
    const shop = new WebMonetizationService(profiles);
    expect(await shop.purchase('solar_1')).toBe(false); // needs level 3
    profiles.profile.xp = BALANCE.progression.levelXp[2];
    expect(await shop.purchase('solar_1')).toBe(true);
  });

  it('power-ups are packed for the next round and used up when it starts', async () => {
    const profiles = new ProfileService(fakeStore());
    const shop = new WebMonetizationService(profiles);
    profiles.profile.owned.push('magnet_1');
    expect(await shop.purchase('shield_bubble')).toBe(true);
    expect(await shop.purchase('shield_bubble')).toBe(false); // one per round
    const loadout = profiles.takeRoundLoadout();
    expect(loadout.mods.flareBubbles).toBe(1);
    expect(loadout.mods.magnetRadius).toBeCloseTo(1.2);
    expect(profiles.takeRoundLoadout().mods.flareBubbles).toBe(0); // used up
  });

  it('cosmetics are equipped when bought; daily reward once per day', async () => {
    const profiles = new ProfileService(fakeStore());
    const shop = new WebMonetizationService(profiles);
    expect(await shop.purchase('trim_mint')).toBe(true);
    expect(profiles.profile.equipped.trim).toBe('trim_mint');
    profiles.equip('trim', null);
    expect(profiles.profile.equipped.trim).toBeNull();
    profiles.equip('flag', 'flag_gold'); // not owned: ignored
    expect(profiles.profile.equipped.flag).toBeNull();

    const coins = profiles.profile.coins;
    expect(profiles.claimDaily('2026-11-15')).toBe(BALANCE.progression.dailyRewardCoins);
    expect(profiles.claimDaily('2026-11-15')).toBe(0);
    expect(profiles.claimDaily('2026-11-16')).toBe(BALANCE.progression.dailyRewardCoins);
    expect(profiles.profile.coins).toBe(coins + 2 * BALANCE.progression.dailyRewardCoins);
  });

  it('a broken save starts fresh instead of crashing', () => {
    const store = fakeStore();
    store.setItem('disastronauts.profile', '{not json');
    expect(new ProfileService(store).profile.coins).toBe(BALANCE.progression.startingCoins);
  });
});
