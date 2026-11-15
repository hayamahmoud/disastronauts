// The Shop: spend the coins you earned by playing. No real money anywhere.
// Shows your coins, level and XP bar, the daily reward, then three shelves:
// upgrades (forever), power-ups (next round only) and cosmetics (looks only).
// Opened from the menu and the podium. Uses the menu's dialog look (.start-help).

import { levelProgress } from '../core/progression';
import { webShopItems, type CatalogItem, type ItemKind } from '../services/catalog';
import type { BlockReason, WebMonetizationService } from '../services/MonetizationService';
import { todayString, type ProfileService } from '../services/ProfileService';
import { BALANCE } from '../config/balance';
import { el } from './components';

export interface ShopDeps {
  profile: ProfileService;
  shop: WebMonetizationService;
  click: () => void; // button sound
}

const SHELVES: Array<{ kind: ItemKind; title: string; note: string }> = [
  { kind: 'upgrade', title: 'Upgrades', note: 'Small boosts that last forever.' },
  { kind: 'powerup', title: 'Power-ups', note: 'Packed for your NEXT round only. Each one has a catch!' },
  { kind: 'cosmetic', title: 'Looks', note: 'Just for fun: they don’t change the game.' },
];

const BLOCKED: Record<BlockReason, string> = {
  owned: 'Owned',
  packed: 'Packed',
  level: '', // filled in with the level number
  coins: 'Not enough coins',
  notOnWeb: 'Coming soon',
};

export function openShop(deps: ShopDeps): void {
  const { profile, shop, click } = deps;
  const dialog = el('dialog', 'start-help shop-screen');
  dialog.setAttribute('aria-label', 'Shop');
  document.body.appendChild(dialog);

  // Redraw the whole (small) dialog whenever the profile changes.
  const render = () => {
    const scroll = dialog.scrollTop;
    dialog.replaceChildren(...build());
    dialog.scrollTop = scroll;
  };
  const stopListening = profile.onChange(render);
  dialog.addEventListener('close', () => {
    stopListening();
    dialog.remove();
  });
  render();
  dialog.showModal();

  function build(): HTMLElement[] {
    const p = profile.profile;
    const close = el('button', 'settings-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => { click(); dialog.close(); });

    // Coins, level and the XP bar.
    const stats = el('div', 'shop-stats');
    const coins = el('span', 'shop-coins');
    coins.append(el('b', '', String(p.coins)), ' coins');
    const lv = levelProgress(p.xp);
    const level = el('span', 'shop-level');
    level.append(el('b', '', `Level ${lv.level}`));
    const bar = el('span', 'shop-xp-bar');
    const fill = el('span');
    fill.style.width = lv.needed ? `${Math.round((lv.into / lv.needed) * 100)}%` : '100%';
    bar.appendChild(fill);
    bar.title = lv.needed ? `${lv.into} / ${lv.needed} XP to level ${lv.level + 1}` : 'Top level!';
    level.appendChild(bar);
    stats.append(coins, level);

    // Daily reward: once per day.
    const today = todayString();
    const daily = el('button', 'shop-daily');
    daily.type = 'button';
    const canClaim = profile.canClaimDaily(today);
    daily.disabled = !canClaim;
    daily.textContent = canClaim ? `Claim your daily gift: +${BALANCE.progression.dailyRewardCoins} coins` : 'Daily gift claimed. Come back tomorrow.';
    daily.addEventListener('click', () => { click(); profile.claimDaily(today); });

    const intro = el('p', 'shop-intro', 'Earn coins and XP by playing rounds. Better places and mission stars earn more!');
    const header = el('header', 'scroll-dialog-header');
    const title = el('div', 'console-title');
    title.append(el('h2', '', 'Outpost Shop'));
    header.append(title, close);
    const parts: HTMLElement[] = [header, stats, daily, intro];
    const items = webShopItems();
    for (const shelf of SHELVES) {
      parts.push(el('h3', 'shop-shelf', shelf.title), el('p', 'shop-note', shelf.note));
      const grid = el('div', 'shop-grid');
      for (const item of items.filter((i) => i.kind === shelf.kind)) grid.appendChild(card(item));
      parts.push(grid);
    }
    return parts;
  }

  // One item: name, what it does, and a Buy / Claim / Wear button.
  function card(item: CatalogItem): HTMLElement {
    const p = profile.profile;
    const box = el('div', 'shop-item');
    if (item.look) box.style.setProperty('--look', `var(--color-${item.look})`);
    const head = el('div', 'shop-item-head');
    if (item.look) head.appendChild(el('span', 'shop-swatch'));
    head.appendChild(el('b', '', item.name));
    box.append(head, el('div', 'shop-item-text', item.description));

    const owned = p.owned.includes(item.id);
    const button = el('button', 'shop-buy');
    button.type = 'button';
    if (owned && item.slot) {
      // A cosmetic you own: wear it or take it off.
      const slot = item.slot;
      const wearing = p.equipped[slot] === item.id;
      button.textContent = wearing ? 'Wearing  (take off)' : 'Wear';
      button.classList.toggle('is-on', wearing);
      button.addEventListener('click', () => { click(); profile.equip(slot, wearing ? null : item.id); });
    } else {
      const reason = shop.blockReason(item);
      const price = item.coinPrice ?? 0;
      if (reason === null) button.textContent = price === 0 ? 'Claim (free!)' : `Buy: ${price} coins`;
      else if (reason === 'level') button.textContent = `🔒 Level ${item.unlockLevel}`;
      else if (reason === 'coins') button.textContent = `${price} coins (need ${price - p.coins} more)`;
      else button.textContent = BLOCKED[reason];
      button.disabled = reason !== null;
      button.classList.toggle('is-owned', reason === 'owned' || reason === 'packed');
      button.addEventListener('click', () => { click(); void shop.purchase(item.id); });
    }
    box.appendChild(button);
    return box;
  }
}
