// How the game "sells" shop items. The web game ONLY uses coins you earned
// by playing: there is no real money anywhere in the web version.
// On Roblox, a second version of this service talks to MarketplaceService
// (see docs/PORTING.md). Game code only ever talks to this interface.

import { findItem, type CatalogItem } from './catalog';
import type { ProfileService } from './ProfileService';

export interface MonetizationService {
  owns(itemId: string): boolean;
  purchase(itemId: string): Promise<boolean>; // web: spend coins; Roblox: MarketplaceService prompt
  grantConsumable(itemId: string): void; // Roblox: ProcessReceipt handler
}

// Why an item can't be bought right now (null = it can).
export type BlockReason = 'owned' | 'packed' | 'level' | 'coins' | 'notOnWeb';

export class WebMonetizationService implements MonetizationService {
  constructor(private profiles: ProfileService) {}

  // Permanent items: bought once. Power-ups: "owned" while packed for the next round.
  owns(itemId: string): boolean {
    const p = this.profiles.profile;
    return p.owned.includes(itemId) || p.packed.includes(itemId);
  }

  blockReason(item: CatalogItem): BlockReason | null {
    const p = this.profiles.profile;
    if (item.kind === 'pass' || item.coinPrice === null) return 'notOnWeb';
    if (item.kind === 'powerup' && p.packed.includes(item.id)) return 'packed'; // one of each per round
    if (item.kind !== 'powerup' && p.owned.includes(item.id)) return 'owned';
    if (this.profiles.level() < item.unlockLevel) return 'level';
    if (p.coins < item.coinPrice) return 'coins';
    return null;
  }

  async purchase(itemId: string): Promise<boolean> {
    const item = findItem(itemId);
    if (!item || this.blockReason(item) !== null) return false;
    const p = this.profiles.profile;
    p.coins -= item.coinPrice ?? 0;
    if (item.kind === 'powerup') {
      this.grantConsumable(itemId); // saves
      return true;
    }
    p.owned.push(itemId);
    if (item.slot) p.equipped[item.slot] = itemId; // wear a new cosmetic straight away
    this.profiles.save();
    return true;
  }

  // A repeatable item was paid for: pack it for the next round.
  grantConsumable(itemId: string): void {
    const p = this.profiles.profile;
    if (!p.packed.includes(itemId)) p.packed.push(itemId);
    this.profiles.save();
  }
}
