// Colony Score: who wins the round.
//   score = healthy crew × 100 + powered buildings × 50 + stored resources × 1
//         + mission stars × 25
// Sick crew and switched-off buildings don't count, so a big base that can't
// keep its crew healthy or its lights on loses to a smaller, well-run one.

import { BALANCE } from '../config/balance';
import { healthyCrew } from './resources';
import type { GameState, PlayerState, ScoreBreakdown, Standing } from './state';
import { findBase } from './state';

const S = BALANCE.score;

export function colonyScore(state: GameState, player: PlayerState): ScoreBreakdown {
  const base = findBase(state, player.baseId);
  const missions = player.stars * S.perMissionStar;
  // A wrecked base has nothing left; only the stars you earned still count.
  if (!base || base.status !== 'active') return { crew: 0, buildings: 0, stored: 0, missions, total: missions };

  let powered = 0;
  for (const b of base.buildings) if (b.powered) powered++;
  const crew = healthyCrew(base) * S.perHealthyCrew;
  const buildings = powered * S.perPoweredBuilding;
  const resources = base.stored.power + base.stored.lifeSupport + base.stored.shielding;
  const stored = Math.floor(resources) * S.perStoredResource;
  return { crew, buildings, stored, missions, total: crew + buildings + stored + missions };
}

// Everyone, best first. Ties go to more stars, then to the earlier player
// (so the order never depends on luck).
export function standings(state: GameState): Standing[] {
  const list = state.players.map((p, index) => ({ player: p, index, score: colonyScore(state, p) }));
  list.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if (b.player.stars !== a.player.stars) return b.player.stars - a.player.stars;
    return a.index - b.index;
  });
  return list.map((e, i) => ({
    playerId: e.player.id,
    name: e.player.name,
    colorIndex: e.player.colorIndex,
    isBot: e.player.bot !== null,
    rank: i + 1,
    score: e.score,
  }));
}
