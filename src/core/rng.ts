// Seeded random numbers. The core NEVER uses Math.random(), so the same seed +
// the same inputs always produce exactly the same game (great for tests,
// replays, and later for a Roblox server).
// Algorithm: mulberry32, a tiny, well-known 32-bit generator.

export interface RngState {
  s: number; // the current 32-bit state; stored in GameState so it can be saved
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

// Returns a number in [0, 1) and advances the state.
export function rngNext(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Random number in [min, max).
export function rngRange(rng: RngState, min: number, max: number): number {
  return min + (max - min) * rngNext(rng);
}

// Random integer in [0, count).
export function rngInt(rng: RngState, count: number): number {
  return Math.floor(rngNext(rng) * count);
}

// Picks a key using weights, e.g. { ice: 3, crate: 1 } picks ice 3x as often.
// Keys are visited in the order given by `keys` so results are deterministic.
export function rngWeighted<K extends string>(
  rng: RngState,
  keys: readonly K[],
  weightOf: (key: K) => number,
): K {
  let total = 0;
  for (const k of keys) total += weightOf(k);
  let roll = rngNext(rng) * total;
  for (const k of keys) {
    roll -= weightOf(k);
    if (roll < 0) return k;
  }
  return keys[keys.length - 1];
}
