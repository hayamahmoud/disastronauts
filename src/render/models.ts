// Builds 3D objects from the asset manifest.
// - Placeholder models are made from simple shapes (shared geometry/materials,
//   so hundreds of pickups stay fast).
// - If an asset has a `file`, the GLB is loaded and swapped in; if loading
//   fails, the placeholder simply stays. The game never breaks.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ASSETS, type AssetId, type PrimitivePart, type PrimitiveShape } from '../assets/manifest';
import { RENDER_STYLE, THEME, type ThemeColorKey } from '../ui/theme';

const DEG = Math.PI / 180;
const geometryCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<string, THREE.Material>();
const gltfCache = new Map<string, Promise<GLTF | null>>();
const loader = new GLTFLoader();

// Swap some theme colors on one model, e.g. { accent: gold } for a suit trim cosmetic.
export type Recolor = Partial<Record<ThemeColorKey, number>>;

// Create a model for an asset ID. `teamColor` paints parts marked 'team';
// `recolor` swaps theme colors (placeholder models only, for now).
export function createModel(id: AssetId, teamColor = 0xffffff, recolor: Recolor = {}): THREE.Group {
  const entry = ASSETS[id];
  const root = new THREE.Group();
  root.name = id;

  const inner = new THREE.Group(); // holds the placeholder or the loaded model
  inner.name = 'inner';
  if (entry.animation) root.userData.animation = entry.animation;
  inner.rotation.y = entry.rotationYOffset * DEG;
  inner.scale.setScalar(entry.scale);
  for (const part of entry.placeholder) {
    const mesh = createPart(part, teamColor, recolor);
    const pivot = part.limb && entry.limbPivots?.[part.limb];
    if (part.limb && pivot) {
      // Limb parts hang from a pivot group (hip/shoulder) so they can swing.
      let joint = inner.getObjectByName(part.limb);
      if (!joint) {
        joint = new THREE.Group();
        joint.name = part.limb;
        joint.position.set(pivot[0], pivot[1], pivot[2]);
        inner.add(joint);
      }
      mesh.position.sub(joint.position);
      joint.add(mesh);
    } else {
      inner.add(mesh);
    }
  }
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

function createPart(part: PrimitivePart, teamColor: number, recolor: Recolor): THREE.Mesh {
  const color = part.color === 'team' ? teamColor : (recolor[part.color] ?? THEME[part.color]);
  const mesh = new THREE.Mesh(getGeometry(part.shape, part.size), getMaterial(color, part));
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
  const seg = RENDER_STYLE.segments;
  switch (shape) {
    case 'box':
      g = new THREE.BoxGeometry(w, h, d);
      break;
    case 'roundedBox':
      g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.2);
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, seg).scale(w, h, d);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(0.5, 1, seg).scale(w, h, d);
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(0.5, seg, Math.round(seg * 0.7)).scale(w, h, d);
      break;
    case 'dome':
      // Top half of a sphere, sitting on its flat base.
      g = new THREE.SphereGeometry(1, seg + 2, Math.round(seg * 0.6), 0, Math.PI * 2, 0, Math.PI / 2).scale(w / 2, h, d / 2);
      break;
    case 'crystal':
      g = new THREE.OctahedronGeometry(0.5).scale(w, h, d);
      break;
    case 'rock':
      g = new THREE.DodecahedronGeometry(0.5).scale(w, h, d);
      break;
    case 'capsule':
      // Unit capsule is 2 tall (two half-sphere caps + a 1-long middle).
      g = new THREE.CapsuleGeometry(0.5, 1, 4, seg).scale(w, h / 2, d);
      break;
    case 'torus':
      // Lies flat (like a ring on the ground); w/d = outer diameter, h = thickness.
      g = new THREE.TorusGeometry(0.5, 0.06, 8, seg * 2).rotateX(Math.PI / 2).scale(w, h / 0.12, d);
      break;
  }
  geometryCache.set(key, g);
  return g;
}

// Cartoon shading uses 3 flat light steps.
let toonSteps: THREE.DataTexture | null = null;
function getToonSteps(): THREE.DataTexture {
  if (!toonSteps) {
    toonSteps = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    toonSteps.minFilter = toonSteps.magFilter = THREE.NearestFilter;
    toonSteps.needsUpdate = true;
  }
  return toonSteps;
}

function getMaterial(color: number, part: Pick<PrimitivePart, 'shape' | 'glow' | 'opacity' | 'shiny' | 'wire'>): THREE.Material {
  const glow = !!part.glow;
  const opacity = part.opacity ?? 1;
  const open = part.shape === 'dome'; // domes are open underneath (dishes): draw both sides
  const key = [color, glow, opacity, !!part.shiny, !!part.wire, open].join('|');
  let m = materialCache.get(key);
  if (!m) {
    const S = RENDER_STYLE;
    const common = {
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
      wireframe: !!part.wire,
      side: open ? THREE.DoubleSide : THREE.FrontSide,
      emissive: glow ? color : 0x000000,
      emissiveIntensity: glow ? S.glowIntensity : 0,
    };
    if (S.shading === 'toon') {
      m = new THREE.MeshToonMaterial({ ...common, gradientMap: getToonSteps() });
    } else {
      m = new THREE.MeshStandardMaterial({
        ...common,
        flatShading: S.shading === 'flat', // faceted "low-poly" look
        roughness: part.shiny ? 0.12 : glow ? 0.3 : S.roughness,
        metalness: part.shiny ? 0.4 : S.metalness,
      });
    }
    // See-through and wire parts get no cartoon outline.
    if (opacity < 1 || part.wire) m.userData.outlineParameters = { visible: false };
    materialCache.set(key, m);
  }
  return m;
}

// Walk animation for characters (asset `animation: 'walk'`): legs and arms
// swing in opposite pairs, the body bobs a little with each step and leans
// forward. No side-to-side sway. Call every frame with the ground speed
// (studs per second).
// `working` = busy with a mini task: lean in and pump both arms (drilling, fixing, scooping).
export function animateCharacter(root: THREE.Object3D, speed: number, dt: number, working = false): void {
  if (root.userData.animation !== 'walk') return;
  const inner = root.getObjectByName('inner');
  if (!inner) return;
  const u = root.userData as { phase?: number; moving?: number; work?: number };
  // Ease in and out of walking so starts and stops aren't jerky.
  const target = Math.min(1, speed / 12);
  u.moving = (u.moving ?? 0) + (target - (u.moving ?? 0)) * Math.min(1, dt * 8);
  const moving = u.moving;
  // Steps follow distance travelled, so feet don't look like they slide.
  u.phase = (u.phase ?? 0) + dt * (1.5 + speed * 0.32);
  const phase = u.phase;
  const swing = Math.sin(phase);
  const idle = Math.sin(phase * 0.8) * 0.05 * (1 - moving); // gentle breathing when standing
  inner.position.y = Math.abs(Math.cos(phase)) * 0.35 * moving + idle;
  // Ease in and out of the working pose too.
  u.work = (u.work ?? 0) + ((working ? 1 : 0) - (u.work ?? 0)) * Math.min(1, dt * 10);
  const work = u.work;
  const pump = Math.sin(phase * 7) * 0.35 * work; // quick up-and-down arm motion
  inner.rotation.x = -0.1 * moving - 0.3 * work; // lean forward when moving or working
  inner.rotation.z = 0;
  const limb = (name: string, angle: number) => {
    const j = inner.getObjectByName(name);
    if (j) j.rotation.x = angle;
  };
  // Positive angle = limb swings forward.
  limb('legL', swing * 0.7 * moving);
  limb('legR', -swing * 0.7 * moving);
  limb('armL', -swing * 0.6 * moving + 1.2 * work + pump);
  limb('armR', swing * 0.6 * moving + 1.2 * work - pump);
}
