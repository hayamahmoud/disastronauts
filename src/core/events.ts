// Events the simulation emits each step. Rendering, sound and UI react to
// these (pop effects, numbers, messages) without changing the game state.
// On Roblox these become RemoteEvents fired from the server to clients.

import type { BuildingKind, PickupKind } from '../config/balance';

export type GameEvent =
  | { type: 'PickupCollected'; playerId: string; pickupId: number; kind: PickupKind }
  | { type: 'CargoFull'; playerId: string }
  | { type: 'CargoDeposited'; playerId: string; baseId: string; itemCount: number; buildPoints: number }
  | { type: 'BuildingBuilt'; baseId: string; buildingId: number; kind: BuildingKind }
  | { type: 'CrewAdded'; baseId: string; added: number; crewTotal: number }
  | { type: 'Sunrise'; sol: number }
  | { type: 'Sunset'; sol: number }
  | { type: 'PowerOut'; baseId: string } // something just switched off
  | { type: 'PowerRestored'; baseId: string } // everything is on again
  | { type: 'LifeSupportEmpty'; baseId: string }
  | { type: 'CrewSick'; baseId: string; sick: number }
  | { type: 'CrewLost'; baseId: string; crewLeft: number };
