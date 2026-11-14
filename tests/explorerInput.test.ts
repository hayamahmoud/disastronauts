import { expect, it } from 'vitest';
import { explorerInput } from '../src/core/explorerInput';
import { cargoCapacity } from '../src/core/growth';
import { createGame } from '../src/core/simulation';

it('computer explorers seek the nearest active supply without changing state', () => {
  const state = createGame({ seed: 42, players: [{ id: 'p1', name: 'Explorer' }] });
  const player = state.players[0];
  player.pos = { x: 0, z: 0 };
  state.pickups.forEach(p => { p.active = false; });
  state.pickups[0].pos = { x: 3, z: 4 };
  state.pickups[0].active = true;
  state.pickups[1].pos = { x: 100, z: 0 };
  state.pickups[1].active = true;
  const before = JSON.stringify(state);
  expect(explorerInput(state, player)).toEqual({ playerId: 'p1', moveX: 0.6, moveZ: 0.8 });
  expect(JSON.stringify(state)).toBe(before);
});

it('a full explorer heads home to deposit, then stops at home', () => {
  const state = createGame({ seed: 42, players: [{ id: 'p1', name: 'Explorer' }] });
  const player = state.players[0];
  state.bases[0].pos = { x: 0, z: 0 };
  player.pos = { x: 10, z: 0 };
  player.cargoCount = cargoCapacity(state, player);
  expect(explorerInput(state, player)).toEqual({ playerId: 'p1', moveX: -1, moveZ: 0 });
  player.pos = { x: 0, z: 0 };
  expect(explorerInput(state, player)).toEqual({ playerId: 'p1', moveX: 0, moveZ: 0 });
});
