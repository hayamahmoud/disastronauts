// The shop catalog (src/data/catalog.json): every upgrade, power-up,
// cosmetic and pass. Flat objects, so it converts 1:1 to a Lua table.
//   kind:       upgrade = permanent, powerup = one round, cosmetic = looks only,
//               pass = Roblox only (hidden in the web game)
//   robloxType: what it becomes on Roblox (GamePass = one-time, DeveloperProduct = repeatable)
//   look:       for cosmetics, the THEME color key it paints with

import catalogFile from '../data/catalog.json';
import type { Effect } from '../core/modifiers';

export type ItemKind = 'upgrade' | 'powerup' | 'cosmetic' | 'pass';
export type CosmeticSlot = 'trim' | 'flag';

export interface CatalogItem {
  id: string;
  name: string;
  kind: ItemKind;
  robloxType: 'GamePass' | 'DeveloperProduct' | 'None';
  coinPrice: number | null; // null = can't be bought with coins
  robuxPrice: number | null; // set when the Roblox version is priced
  unlockLevel: number; // you need at least this level to get it
  slot: CosmeticSlot | null;
  look: string | null;
  effects: Effect[];
  description: string;
}

export const CATALOG = catalogFile as CatalogItem[];

export function findItem(id: string | null): CatalogItem | undefined {
  return id === null ? undefined : CATALOG.find((i) => i.id === id);
}

// What the web shop shows: everything except Roblox-only passes.
export function webShopItems(): CatalogItem[] {
  return CATALOG.filter((i) => i.kind !== 'pass' && i.coinPrice !== null);
}
