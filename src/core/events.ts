// Events the simulation emits each step. Rendering, sound and UI react to
// these (pop effects, numbers, messages) without changing the game state.
// On Roblox these become RemoteEvents fired from the server to clients.

import type { BuildingKind, DisasterKind, FlareClass, PickupKind } from '../config/balance';
import type { Cargo, MissionKind, Vec2 } from './state';

export type GameEvent =
  | { type: 'PickupCollected'; playerId: string; pickupId: number; kind: PickupKind }
  | { type: 'CargoFull'; playerId: string }
  | { type: 'CargoDeposited'; playerId: string; baseId: string; itemCount: number; buildPoints: number; items: Cargo }
  | { type: 'BuildingBuilt'; baseId: string; buildingId: number; kind: BuildingKind }
  | { type: 'CrewAdded'; baseId: string; added: number; crewTotal: number }
  | { type: 'Sunrise'; sol: number }
  | { type: 'Sunset'; sol: number }
  | { type: 'PowerOut'; baseId: string } // something just switched off
  | { type: 'PowerRestored'; baseId: string } // everything is on again
  | { type: 'LifeSupportEmpty'; baseId: string }
  | { type: 'CrewSick'; baseId: string; sick: number }
  | { type: 'CrewLost'; baseId: string; crewLeft: number }
  // Disasters (they hit every base at once)
  | { type: 'DisasterWarning'; kind: DisasterKind; flareClass: FlareClass | null; startsIn: number }
  | { type: 'DisasterStarted'; kind: DisasterKind; flareClass: FlareClass | null; duration: number }
  | { type: 'DisasterEnded'; kind: DisasterKind }
  // Wrecks
  | { type: 'BaseWrecked'; baseId: string; playerId: string; wreckId: number; salvage: number }
  | { type: 'BaseRelaunched'; baseId: string; playerId: string }
  | { type: 'WreckAbsorbed'; playerId: string; baseId: string; wreckId: number; buildPoints: number }
  | { type: 'WreckCrumbled'; wreckId: number }
  // Missions
  | { type: 'MissionStarted'; playerId: string; kind: MissionKind; target: number; disaster: DisasterKind | null }
  | { type: 'MissionEnded'; playerId: string; kind: MissionKind; stars: number; completed: boolean }
  // Supply drops
  | { type: 'SupplyDropCalled'; playerId: string; dropId: number; landsIn: number; lightMinutes: number }
  | { type: 'SupplyDropDenied'; playerId: string; reason: 'cooldown' | 'noPower' | 'noBase' }
  | { type: 'SupplyDropLanded'; playerId: string; dropId: number; pos: Vec2 };
