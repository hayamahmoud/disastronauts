// Your saved progress (coins, XP, what you own), kept in this browser only.
// No account and no server: clearing the browser's site data starts you over.
// On Roblox this becomes a DataStore keyed by the player's UserId.

import { BALANCE } from '../config/balance';
import { modifiersFrom, type Effect, type Modifiers } from '../core/modifiers';
import { levelForXp, type RoundReward } from '../core/progression';
import type { Cosmetics } from '../core/state';
import { findItem, type CosmeticSlot } from './catalog';

export interface Profile {
  coins: number;
  xp: number;
  owned: string[]; // permanent items: upgrades and cosmetics
  packed: string[]; // power-ups bought for the NEXT round (used up when it starts)
  equipped: Cosmetics;
  lastDailyReward: string | null; // the day it was last claimed, e.g. "2026-11-15"
}

// The bit of localStorage we use (tests pass a fake one).
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'disastronauts.profile';

export function newProfile(): Profile {
  return {
    coins: BALANCE.progression.startingCoins,
    xp: 0,
    owned: [],
    packed: [],
    equipped: { trim: null, flag: null },
    lastDailyReward: null,
  };
}

export class ProfileService {
  profile: Profile;
  private listeners: Array<() => void> = [];

  constructor(private store: KeyValueStore | null = browserStore()) {
    this.profile = this.load();
  }

  level(): number {
    return levelForXp(this.profile.xp);
  }

  // Called when anything changes, so open screens (shop, coin counter) can refresh.
  // Returns a function that stops listening.
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  save(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.profile));
    } catch {
      // Storage blocked or full: progress just won't be remembered next time.
    }
    for (const l of this.listeners) l();
  }

  // Start of a round: permanent upgrades + the power-ups packed for it.
  // The packed power-ups are used up.
  takeRoundLoadout(): { mods: Modifiers; cosmetics: Cosmetics } {
    const effects: Effect[] = [];
    for (const id of [...this.profile.owned, ...this.profile.packed]) {
      const item = findItem(id);
      if (item && (item.kind === 'upgrade' || item.kind === 'powerup')) effects.push(...item.effects);
    }
    this.profile.packed = [];
    this.save();
    return { mods: modifiersFrom(effects), cosmetics: { ...this.profile.equipped } };
  }

  // End of a round: add the coins and XP. Says if you reached a new level.
  addReward(reward: RoundReward): { levelBefore: number; levelAfter: number } {
    const levelBefore = this.level();
    this.profile.coins += reward.coins;
    this.profile.xp += reward.xp;
    this.save();
    return { levelBefore, levelAfter: this.level() };
  }

  // Once per calendar day. `today` is the local date, e.g. "2026-11-15".
  canClaimDaily(today: string): boolean {
    return this.profile.lastDailyReward !== today;
  }

  claimDaily(today: string): number {
    if (!this.canClaimDaily(today)) return 0;
    const coins = BALANCE.progression.dailyRewardCoins;
    this.profile.coins += coins;
    this.profile.lastDailyReward = today;
    this.save();
    return coins;
  }

  // Wear a cosmetic you own (or null for the default look).
  equip(slot: CosmeticSlot, itemId: string | null): void {
    if (itemId !== null && !this.profile.owned.includes(itemId)) return;
    this.profile.equipped[slot] = itemId;
    this.save();
  }

  private load(): Profile {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return newProfile();
      // Fill in anything missing (e.g. a save from an older version of the game).
      const saved = JSON.parse(raw) as Partial<Profile>;
      const fresh = newProfile();
      return { ...fresh, ...saved, equipped: { ...fresh.equipped, ...saved.equipped } };
    } catch {
      return newProfile(); // blocked storage or a broken save: start fresh
    }
  }
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // private window with storage blocked
  }
}

// Today's local date as "YYYY-MM-DD" (for the daily reward).
export function todayString(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}
