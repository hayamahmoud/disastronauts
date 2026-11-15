// Turns the height grid into a 3D ground mesh with a faceted low-poly look.
// It's colored by height (our cozy palette). On the real Jezero map, the real
// orbiter photo (public/map.png, the CTX mosaic from Mars Trek) is laid on top
// as soft light-and-shade detail, so you see the real craters and delta.

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
  if (!grid.isPlaceholder) addPhotoDetail(mat);
  mat.userData.outlineParameters = { visible: false }; // no cartoon outline on the ground
  const mesh = new THREE.Mesh(faceted, mat);
  mesh.receiveShadow = true;
  return mesh;
}


// How strongly the photo shows through (0 = not at all, 1 = full contrast).
const PHOTO_STRENGTH = 0.45;

// Loads the greyscale map photo and uses it as a gentle brightness pattern:
// dark rocks a bit darker, bright dust a bit brighter, average unchanged.
// If the image can't load, the ground just stays height-colored.
function addPhotoDetail(mat: THREE.MeshStandardMaterial): void {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i];
    const mean = sum / (px.length / 4);
    // Squeeze the contrast around the average, so the average becomes 1 after mat.color.
    const BASE = 200; // texels end up near 200/255, with room to go brighter
    for (let i = 0; i < px.length; i += 4) {
      const v = BASE + (px[i] - mean) * PHOTO_STRENGTH;
      px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, v));
    }
    g.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace; // use the numbers as plain multipliers
    tex.anisotropy = 4;
    mat.map = tex;
    mat.color.setScalar(255 / BASE); // undo the average darkening
    mat.needsUpdate = true;
  };
  img.src = import.meta.env.BASE_URL + 'map.png';
}
