// Terrain height: sampling the elevation grid, plus a PLACEHOLDER generator
// used until the real Mars Trek elevation for Jezero Crater is processed.
// The placeholder is shaped like a crater (floor, steep wall, rim) with a
// raised "delta" lobe and a few small craters, so gameplay feels the same.

import { BALANCE } from '../config/balance';
import { createRng, rngNext, rngRange } from './rng';
import type { TerrainGrid } from './state';

// Height at any ground position, smoothly blended between grid points.
export function sampleHeight(grid: TerrainGrid, x: number, z: number): number {
  const half = grid.worldSize / 2;
  const cell = grid.worldSize / (grid.size - 1);
  // Convert world position to fractional grid coordinates (clamped to the edges).
  const gx = clamp((x + half) / cell, 0, grid.size - 1);
  const gz = clamp((z + half) / cell, 0, grid.size - 1);
  const c0 = Math.min(Math.floor(gx), grid.size - 2);
  const r0 = Math.min(Math.floor(gz), grid.size - 2);
  const fx = gx - c0;
  const fz = gz - r0;
  const h00 = grid.heights[r0 * grid.size + c0];
  const h10 = grid.heights[r0 * grid.size + c0 + 1];
  const h01 = grid.heights[(r0 + 1) * grid.size + c0];
  const h11 = grid.heights[(r0 + 1) * grid.size + c0 + 1];
  const top = h00 + (h10 - h00) * fx;
  const bottom = h01 + (h11 - h01) * fx;
  return top + (bottom - top) * fz;
}

// TODO-REAL-DATA: replaced by src/data/map_heights.json (Mars Trek, Jezero Crater) in M5.
export function generatePlaceholderTerrain(seed: number): TerrainGrid {
  const m = BALANCE.map;
  const rng = createRng(seed ^ 0x5eed);
  const size = m.gridSize;
  const half = m.worldSize / 2;
  const cell = m.worldSize / (size - 1);

  // Coarse random lattice for gentle "value noise" bumps.
  const lattice = 10;
  const noise: number[] = [];
  for (let i = 0; i < (lattice + 1) * (lattice + 1); i++) noise.push(rngNext(rng));

  // A few small impact craters on the floor (center, radius, depth).
  const smallCraters: { x: number; z: number; r: number; d: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = rngRange(rng, 0, Math.PI * 2);
    const dist = rngRange(rng, 80, m.playRadius - 40);
    smallCraters.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      r: rngRange(rng, 20, 38),
      d: rngRange(rng, 4, 7),
    });
  }

  const heights: number[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = -half + col * cell;
      const z = -half + row * cell;
      const r = Math.hypot(x, z);

      // Crater profile: flat floor, steep inner wall up to the rim, then down to the plains.
      const wallStart = m.craterRadius - m.craterWallWidth;
      let h = smoothstep(wallStart, m.craterRadius, r) * m.craterRimHeight;
      h -= smoothstep(m.craterRadius, m.craterRadius + 80, r) * (m.craterRimHeight - m.outsideHeight);

      // Gentle floor bumps.
      h += valueNoise(noise, lattice, (x + half) / m.worldSize, (z + half) / m.worldSize) * m.floorNoiseHeight;

      // Raised delta lobe on the west side (Jezero has a real river delta there).
      const dx = (x + 190) / 130;
      const dz = (z + 40) / 90;
      h += Math.exp(-(dx * dx + dz * dz)) * 12;

      // Small craters: a bowl with a little raised lip.
      for (const c of smallCraters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.r;
        if (d < 1.6) {
          h -= c.d * Math.max(0, 1 - d * d);
          h += c.d * 0.5 * Math.exp(-((d - 1) * (d - 1)) / 0.04);
        }
      }

      heights.push(h);
    }
  }

  return { size, worldSize: m.worldSize, heights, isPlaceholder: true };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Smoothly interpolated random lattice; u, v in [0, 1]. Returns roughly -0.5..0.5.
function valueNoise(noise: number[], lattice: number, u: number, v: number): number {
  const gx = clamp(u, 0, 1) * lattice;
  const gz = clamp(v, 0, 1) * lattice;
  const x0 = Math.min(Math.floor(gx), lattice - 1);
  const z0 = Math.min(Math.floor(gz), lattice - 1);
  const fx = smoothstep(0, 1, gx - x0);
  const fz = smoothstep(0, 1, gz - z0);
  const at = (cx: number, cz: number) => noise[cz * (lattice + 1) + cx];
  const top = at(x0, z0) + (at(x0 + 1, z0) - at(x0, z0)) * fx;
  const bottom = at(x0, z0 + 1) + (at(x0 + 1, z0 + 1) - at(x0, z0 + 1)) * fx;
  return top + (bottom - top) * fz - 0.5;
}
