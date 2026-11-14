// Builds 3D objects from the asset manifest.
// - Placeholder models are made from simple shapes (shared geometry/materials,
//   so hundreds of pickups stay fast).
// - If an asset has a `file`, the GLB is loaded and swapped in; if loading
//   fails, the placeholder simply stays. The game never breaks.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ASSETS, type AssetId, type PrimitivePart, type PrimitiveShape } from '../assets/manifest';
import { THEME } from '../ui/theme';

const DEG = Math.PI / 180;
const geometryCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<string, THREE.Material>();
const gltfCache = new Map<string, Promise<GLTF | null>>();
const loader = new GLTFLoader();

// Create a model for an asset ID. `teamColor` paints parts marked 'team'.
export function createModel(id: AssetId, teamColor = 0xffffff): THREE.Group {
  const entry = ASSETS[id];
  const root = new THREE.Group();
  root.name = id;

  const inner = new THREE.Group(); // holds the placeholder or the loaded model
  inner.rotation.y = entry.rotationYOffset * DEG;
  inner.scale.setScalar(entry.scale);
  for (const part of entry.placeholder) inner.add(createPart(part, teamColor));
  root.add(inner);

  if (entry.file) {
    loadGltf(entry.file).then((gltf) => {
      if (!gltf) return; // missing file → keep the placeholder
      inner.clear();
      const model = gltf.scene.clone(true);
      model.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
        // A material named "team" in the designed model takes the player's color.
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat && mat.name === 'team' && mat.color) {
          mesh.material = mat.clone();
          (mesh.material as THREE.MeshStandardMaterial).color.setHex(teamColor);
        }
      });
      inner.add(model);
    });
  }
  return root;
}

function loadGltf(file: string): Promise<GLTF | null> {
  let p = gltfCache.get(file);
  if (!p) {
    p = loader.loadAsync(import.meta.env.BASE_URL + file).catch((err) => {
      console.warn(`Asset "${file}" failed to load, using placeholder.`, err);
      return null;
    });
    gltfCache.set(file, p);
  }
  return p;
}

function createPart(part: PrimitivePart, teamColor: number): THREE.Mesh {
  const color = part.color === 'team' ? teamColor : THEME[part.color];
  const mesh = new THREE.Mesh(getGeometry(part.shape, part.size), getMaterial(color, !!part.glow));
  mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
  if (part.rot) mesh.rotation.set(part.rot[0] * DEG, part.rot[1] * DEG, part.rot[2] * DEG);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Each shape is built at its real size, and identical shapes are shared.
function getGeometry(shape: PrimitiveShape, size: [number, number, number]): THREE.BufferGeometry {
  const key = shape + size.join(',');
  let g = geometryCache.get(key);
  if (g) return g;
  const [w, h, d] = size;
  switch (shape) {
    case 'box':
      g = new THREE.BoxGeometry(w, h, d);
      break;
    case 'roundedBox':
      g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.2);
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14).scale(w, h, d);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(0.5, 1, 14).scale(w, h, d);
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(0.5, 14, 10).scale(w, h, d);
      break;
    case 'dome':
      // Top half of a sphere, sitting on its flat base.
      g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(w / 2, h, d / 2);
      break;
    case 'crystal':
      g = new THREE.OctahedronGeometry(0.5).scale(w, h, d);
      break;
    case 'rock':
      g = new THREE.DodecahedronGeometry(0.5).scale(w, h, d);
      break;
  }
  geometryCache.set(key, g);
  return g;
}

function getMaterial(color: number, glow: boolean): THREE.Material {
  const key = color + (glow ? 'g' : '');
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true, // faceted "low-poly" look
      roughness: glow ? 0.3 : 0.75,
      metalness: 0.05,
      emissive: glow ? color : 0x000000,
      emissiveIntensity: glow ? 0.35 : 0,
    });
    materialCache.set(key, m);
  }
  return m;
}
