// The 3D view. It READS the game state every frame and moves meshes to match.
// It never changes the game state (like a Roblox LocalScript).

import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import type { GameEvent } from '../core/events';
import { depositRadius, magnetRadius } from '../core/growth';
import type { GameState, PlayerState } from '../core/state';
import { findPlayer } from '../core/state';
import { sampleHeight } from '../core/terrain';
import { BUILDING_ASSET, PICKUP_ASSET } from '../assets/manifest';
import { THEME } from '../ui/theme';
import { createModel } from './models';
import { createTerrainMesh } from './terrainMesh';

export type CameraMode = 'follow' | 'topDown';

export interface GameView {
  update(state: GameState, events: GameEvent[], dt: number): void;
  toggleCameraMode(): void;
}

interface BaseView {
  group: THREE.Group; // positioned at the base center
  ring: THREE.Mesh;
  builtIds: Set<number>;
}

interface PickupView {
  obj: THREE.Group;
  kind: string;
}

interface PopAnim {
  obj: THREE.Object3D;
  age: number;
}

const POP_TIME = 0.45; // seconds for a new building to "pop" into place
const PICKUP_DRAW_DISTANCE = 190; // studs from the player; beyond this pickups aren't drawn

export function createGameView(container: HTMLElement, state: GameState, localPlayerId: string): GameView {
  // --- Renderer, scene, camera ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEME.sky);
  scene.fog = new THREE.Fog(THEME.fog, 160, 620);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000);
  let cameraMode: CameraMode = 'follow';

  // --- Lights: soft sky light + one sun that casts shadows near the player ---
  scene.add(new THREE.HemisphereLight(THEME.skyLight, THEME.groundLight, 1.4));
  const sun = new THREE.DirectionalLight(THEME.sunLight, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -80;
  sc.right = 80;
  sc.top = 80;
  sc.bottom = -80;
  sc.near = 1;
  sc.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  scene.add(createTerrainMesh(state.terrain));

  // --- Entity views, created on demand and kept in maps by id ---
  const rovers = new Map<string, THREE.Group>();
  const bases = new Map<string, BaseView>();
  const pickups = new Map<number, PickupView>();
  const pops: PopAnim[] = [];

  // Magnet ring under the local player's rover, so kids can see their pull range.
  const magnetRing = createGroundRing(THEME.magnetRing, 0.93, 0.5);
  scene.add(magnetRing);

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const teamColor = (p: PlayerState) => THEME.team[p.colorIndex % THEME.team.length];
  const heightAt = (x: number, z: number) => sampleHeight(state.terrain, x, z);

  function syncBases(s: GameState) {
    for (const base of s.bases) {
      let view = bases.get(base.id);
      const owner = findPlayer(s, base.ownerId);
      const color = owner ? teamColor(owner) : 0xffffff;
      if (!view) {
        const group = new THREE.Group();
        group.position.set(base.pos.x, heightAt(base.pos.x, base.pos.z), base.pos.z);
        const lander = createModel('lander', color);
        group.add(lander);
        const ring = createGroundRing(color, 0.9, 0.7);
        ring.position.y = 0.4;
        group.add(ring);
        scene.add(group);
        view = { group, ring, builtIds: new Set() };
        bases.set(base.id, view);
      }
      view.ring.scale.setScalar(depositRadius(base));

      for (const b of base.buildings) {
        if (view.builtIds.has(b.id)) continue;
        view.builtIds.add(b.id);
        const model = createModel(BUILDING_ASSET[b.kind], color);
        // Buildings sit on the real ground height at their own spot.
        const wx = base.pos.x + b.offset.x;
        const wz = base.pos.z + b.offset.z;
        model.position.set(b.offset.x, heightAt(wx, wz) - view.group.position.y, b.offset.z);
        model.rotation.y = Math.atan2(b.offset.x, b.offset.z); // face away from the lander
        model.scale.setScalar(0.01);
        view.group.add(model);
        pops.push({ obj: model, age: 0 });
      }
    }
  }

  function syncRovers(s: GameState) {
    for (const p of s.players) {
      let rover = rovers.get(p.id);
      if (!rover) {
        rover = createModel('rover', teamColor(p));
        rover.rotation.order = 'YXZ'; // turn first, then tilt with the ground
        scene.add(rover);
        rovers.set(p.id, rover);
      }
      const { x, z } = p.pos;
      rover.position.set(x, heightAt(x, z), z);
      rover.rotation.y = p.heading;
      // Tilt with the slope: compare ground height in front/behind and left/right.
      const fx = -Math.sin(p.heading);
      const fz = -Math.cos(p.heading);
      const d = 1.8;
      const front = heightAt(x + fx * d, z + fz * d);
      const back = heightAt(x - fx * d, z - fz * d);
      const right = heightAt(x - fz * d, z + fx * d);
      const left = heightAt(x + fz * d, z - fx * d);
      rover.rotation.x = Math.atan2(front - back, 2 * d);
      rover.rotation.z = Math.atan2(right - left, 2 * d);
    }
  }

  function syncPickups(s: GameState, time: number, focus: { x: number; z: number }) {
    for (const p of s.pickups) {
      let view = pickups.get(p.id);
      if (!view || view.kind !== p.kind) {
        // Respawned pickups can change kind: rebuild the model.
        if (view) scene.remove(view.obj);
        view = { obj: createModel(PICKUP_ASSET[p.kind]), kind: p.kind };
        scene.add(view.obj);
        pickups.set(p.id, view);
      }
      // Hide pickups that are inactive or far off-screen (saves draw calls).
      const far = Math.abs(p.pos.x - focus.x) > PICKUP_DRAW_DISTANCE || Math.abs(p.pos.z - focus.z) > PICKUP_DRAW_DISTANCE;
      view.obj.visible = p.active && !far;
      if (!view.obj.visible) continue;
      const bob = Math.sin(time * 2.5 + p.id) * 0.3;
      view.obj.position.set(p.pos.x, heightAt(p.pos.x, p.pos.z) + 0.4 + bob, p.pos.z);
      view.obj.rotation.y = time * 0.8 + p.id;
      // Shrink a little while being sucked into a rover.
      view.obj.scale.setScalar(p.pulledBy ? 0.75 : 1);
    }
  }

  function updatePops(dt: number) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const pop = pops[i];
      pop.age += dt;
      const t = Math.min(1, pop.age / POP_TIME);
      // "Back-out" easing: overshoots a bit, then settles. Feels bouncy.
      const k = 1.70158;
      const s = 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
      pop.obj.scale.setScalar(Math.max(0.01, s));
      if (t >= 1) pops.splice(i, 1);
    }
  }

  function updateCamera(target: THREE.Vector3, dt: number, snap: boolean) {
    const C = BALANCE.camera;
    const desired =
      cameraMode === 'follow'
        ? new THREE.Vector3(target.x, target.y + C.height, target.z + C.distance)
        : new THREE.Vector3(target.x, target.y + C.topDownHeight, target.z + 0.01);
    const blend = snap ? 1 : 1 - Math.exp(-C.followSharpness * dt);
    camera.position.lerp(desired, blend);
    camera.lookAt(target);

    // Keep the sun's shadow area centered on the player.
    sun.target.position.copy(target);
    sun.position.set(target.x + 70, target.y + 120, target.z + 40);
  }

  let firstFrame = true;
  return {
    update(s, _events, dt) {
      syncBases(s);
      syncRovers(s);
      const me = findPlayer(s, localPlayerId);
      syncPickups(s, s.time, me ? me.pos : { x: 0, z: 0 });
      updatePops(dt);

      if (me) {
        const ground = heightAt(me.pos.x, me.pos.z);
        magnetRing.position.set(me.pos.x, ground + 0.5, me.pos.z);
        magnetRing.scale.setScalar(magnetRadius(s, me));
        updateCamera(new THREE.Vector3(me.pos.x, ground, me.pos.z), dt, firstFrame);
        firstFrame = false;
      }
      renderer.render(scene, camera);
    },
    toggleCameraMode() {
      cameraMode = cameraMode === 'follow' ? 'topDown' : 'follow';
    },
  };
}

// A flat ring (radius 1, scale it to the size you need) drawn on top of the
// ground so hills never hide it.
function createGroundRing(color: number, innerRadius: number, opacity: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(innerRadius, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false }),
  );
  ring.renderOrder = 1;
  return ring;
}
