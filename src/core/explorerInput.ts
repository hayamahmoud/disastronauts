// Computer explorers use the same movement inputs as a human player.
import type { GameState, PlayerInput, PlayerState } from './state';
import { findBase } from './state';
import { cargoCapacity } from './growth';

export function explorerInput(state: GameState, player: PlayerState): PlayerInput {
  let target = findBase(state, player.baseId)?.pos;
  if (player.cargoCount < cargoCapacity(state, player)) {
    let nearest = Infinity;
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const distance = Math.hypot(pickup.pos.x - player.pos.x, pickup.pos.z - player.pos.z);
      if (distance < nearest) { nearest = distance; target = pickup.pos; }
    }
  }
  const dx = target ? target.x - player.pos.x : 0;
  const dz = target ? target.z - player.pos.z : 0;
  const length = Math.hypot(dx, dz);
  return { playerId: player.id, moveX: length > 1 ? dx / length : 0, moveZ: length > 1 ? dz / length : 0 };
}
