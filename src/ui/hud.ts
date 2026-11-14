// Milestone 1 HUD: cargo, crew and buildings. The full resource bars
// (Power / Life Support / Shielding) arrive in Milestone 2.

import type { GameEvent } from '../core/events';
import { cargoCapacity } from '../core/growth';
import type { GameState } from '../core/state';
import { findBase, findPlayer } from '../core/state';
import { createBadge, createMessage, createPanel, createStat } from './components';

export interface Hud {
  update(state: GameState, events: GameEvent[]): void;
}

const BUILDING_NAMES: Record<string, string> = {
  habitat: 'Habitat',
  solar_panel: 'Solar panel',
  greenhouse: 'Greenhouse',
  shield_generator: 'Shield generator',
};

export function createHud(root: HTMLElement, localPlayerId: string, terrainIsPlaceholder: boolean): Hud {
  const panel = createPanel(root);
  Object.assign(panel.style, { left: '12px', top: '12px' });
  const cargo = createStat(panel, '📦', 'Cargo carried by your rover');
  const crew = createStat(panel, '👩‍🚀', 'Crew at your base');
  const buildings = createStat(panel, '🏠', 'Buildings at your base');

  if (terrainIsPlaceholder) {
    createBadge(root, 'Placeholder map: real Mars terrain coming soon', { right: '12px', bottom: '12px' });
  }
  createBadge(root, 'Move: WASD / arrows · Camera: C', { left: '12px', bottom: '12px' });

  const message = createMessage(root);
  message.show('Grab stuff with your magnet, then drive home!', 5);

  return {
    update(state, events) {
      const me = findPlayer(state, localPlayerId);
      if (!me) return;
      const base = findBase(state, me.baseId);
      const cap = cargoCapacity(state, me);
      cargo.set(`${me.cargoCount} / ${cap}`, me.cargoCount >= cap);
      if (base) {
        crew.set(String(base.crew));
        buildings.set(String(base.buildings.length));
      }

      // One short sentence at a time, only about the local player.
      for (const e of events) {
        if (e.type === 'CargoFull' && e.playerId === localPlayerId) {
          message.show('Cargo full! Drive back to your base.');
        } else if (e.type === 'BuildingBuilt' && base && e.baseId === base.id) {
          message.show(`New ${BUILDING_NAMES[e.kind] ?? 'building'}!`, 2);
        } else if (e.type === 'CrewAdded' && base && e.baseId === base.id) {
          message.show(`+${e.added} crew joined your base!`, 2.5);
        }
      }
    },
  };
}
