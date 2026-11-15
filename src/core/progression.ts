// Coins and XP (M6): what a round earns you, and which level your XP reaches.
// Pure maths only. Saving them in the browser is done by ProfileService.

import { BALANCE } from '../config/balance';
import type { Standing } from './state';

const P = BALANCE.progression;

export interface RoundReward {
  coins: number;
  xp: number;
}

// Better places earn more coins, and every mission star adds a few.
// XP grows with your Colony Score, plus a little just for playing.
export function roundReward(standing: Standing, stars: number, coinMultiplier = 1): RoundReward {
  const place = P.coinsForPlace[Math.min(standing.rank, P.coinsForPlace.length) - 1];
  const coins = Math.round((place + stars * P.coinsPerStar) * coinMultiplier);
  const xp = Math.floor(standing.score.total * P.xpPerScorePoint) + P.xpForPlaying;
  return { coins, xp };
}

// Level 1, 2, 3… for this much XP.
export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < P.levelXp.length; i++) if (xp >= P.levelXp[i]) level = i + 1;
  return level;
}

// How far through the current level you are: XP gained in it, and XP the level needs.
// At the top level, `needed` is 0.
export function levelProgress(xp: number): { level: number; into: number; needed: number } {
  const level = levelForXp(xp);
  const start = P.levelXp[level - 1];
  const next = P.levelXp[level];
  return { level, into: xp - start, needed: next === undefined ? 0 : next - start };
}
