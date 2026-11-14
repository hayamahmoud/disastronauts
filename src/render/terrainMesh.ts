// Turns the height grid into a 3D ground mesh with a faceted low-poly look.
// While the terrain is a placeholder, it's colored by height. Once the real
// Mars Trek image exists (M5), it becomes the ground texture instead.

import * as THREE from 'three';
import type { TerrainGrid } from '../core/state';
import { THEME } from '../ui/theme';

export function createTerrainMesh(grid: TerrainGrid): THREE.Mesh {
  const seg = grid.size - 1;
  const geo = new THREE.PlaneGeometry(grid.worldSize, grid.worldSize, seg, seg);
  // Lay the plane flat. Afterwards vertex i sits at row = floor(i / size),
  // col = i % size, matching the grid layout (row 0 = north, z = -half).
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  let minH = Infinity;
  let maxH = -Infinity;
  for (const h of grid.heights) {
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }

  const low = new THREE.Color(THEME.terrainLow);
  const mid = new THREE.Color(THEME.terrainMid);
  const high = new THREE.Color(THEME.terrainHigh);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const h = grid.heights[i];
    pos.setY(i, h);
    const t = (h - minH) / (maxH - minH || 1);
    if (t < 0.5) c.copy(low).lerp(mid, t * 2);
    else c.copy(mid).lerp(high, (t - 0.5) * 2);
    // Tiny deterministic speckle so flat areas don't look plastic.
    const speckle = ((i * 2654435761) % 1000) / 1000;
    c.multiplyScalar(0.94 + speckle * 0.08);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Non-indexed geometry + flat shading = each triangle is a crisp facet.
  const faceted = geo.toNonIndexed();
  faceted.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const mesh = new THREE.Mesh(faceted, mat);
  mesh.receiveShadow = true;
  return mesh;
}
