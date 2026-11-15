// Modifiers: the ONLY way upgrades and power-ups change the game.
// The sim reads these numbers (e.g. "roverSpeed = 1.1"); it never asks
// "did the player buy Turbo Boots?". So on Roblox, a Game Pass or a
// Developer Product just turns into the same list of effects.

export interface Modifiers {
  roverSpeed: number; // x walking speed
  magnetRadius: number; // x magnet reach
  cargoCapacity: number; // + backpack slots
  solarEfficiency: number; // x solar panel output
  supplyDropDelay: number; // x how long a supply drop takes to arrive
  supplyDropPowerCost: number; // x Power it costs to call one
  flareBubbles: number; // + Shield Bubble charges for this round
  solarBoosts: number; // + Solar Boost charges for this round
  coinMultiplier: number; // x coins earned (Roblox VIP pass only)
}

export type ModifierName = keyof Modifiers;

// One effect of a catalog item, e.g. { modifier: 'roverSpeed', op: 'mul', value: 1.1 }.
export interface Effect {
  modifier: ModifierName;
  op: 'mul' | 'add';
  value: number;
}

// Nothing bought: every multiplier is 1 and every bonus is 0.
export function defaultModifiers(): Modifiers {
  return {
    roverSpeed: 1,
    magnetRadius: 1,
    cargoCapacity: 0,
    solarEfficiency: 1,
    supplyDropDelay: 1,
    supplyDropPowerCost: 1,
    flareBubbles: 0,
    solarBoosts: 0,
    coinMultiplier: 1,
  };
}

// Combine a list of effects into one set of modifiers.
export function modifiersFrom(effects: readonly Effect[]): Modifiers {
  const mods = defaultModifiers();
  for (const e of effects) {
    if (!(e.modifier in mods)) continue; // unknown name (e.g. an old save): ignore it
    if (e.op === 'mul') mods[e.modifier] *= e.value;
    else mods[e.modifier] += e.value;
  }
  return mods;
}
