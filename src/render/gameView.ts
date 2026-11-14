// The 3D view. It READS the game state every frame and moves meshes to match.
// It never changes the game state (like a Roblox LocalScript).

import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import type { GameEvent } from '../core/events';
import { sunlight, timeOfSol } from '../core/dayNight';
import { depositRadius, magnetRadius } from '../core/growth';
import type { GameState, PlayerState } from '../core/state';
import { findPlayer } from '../core/state';
import { sampleHeight } from '../core/terrain';
import { BUILDING_ASSET, PICKUP_ASSET, PICKUP_ICON, UI_ICONS } from '../assets/manifest';
import type { PickupKind } from '../config/balance';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RENDER_STYLE, THEME } from '../ui/theme';
import { animateCharacter, createModel } from './models';
import { createTerrainMesh } from './terrainMesh';

export type CameraMode = 'follow' | 'topDown';

export interface GameView {
  update(state: GameState, events: GameEvent[], dt: number): void;
  toggleCameraMode(): void;
  getCameraMode(): CameraMode;
  // Top view only turns when the player drags it with the mouse. 0 = north up.
  // The keys and the mini-map use this so "W" always means "up the screen".
  getMapYaw(): number;
}

interface BaseView {
  group: THREE.Group; // positioned at the base center
  ring: THREE.Mesh;
  builtIds: Set<number>;
  markers: Map<number, THREE.Mesh>; // "no power" marker per building id
  landerMarker: THREE.Mesh;
}

interface PickupView {
  obj: THREE.Group;
  kind: string;
  badge: THREE.Sprite;
}

// A badge that floats up and fades when you grab a pickup.
interface GrabPop {
  sprite: THREE.Sprite;
  age: number;
}

interface PopAnim {
  obj: THREE.Object3D;
  age: number;
}

const POP_TIME = 0.45; // seconds for a new building to "pop" into place
const PICKUP_DRAW_DISTANCE = 190; // studs from the player; beyond this pickups aren't drawn

// Lighting at night vs. noon (visual only). Night stays bright enough to play.
const LIGHT = {
  sunNight: 0.15,
  sunNoon: 2.2,
  skyNight: 0.55,
  skyNoon: 1.4,
};

// Pickup badges: a round icon floating over each pickup, showing which HUD
// chip it fills. One texture per kind, shared by every pickup of that kind.
const BADGE_SIZE = 2.6; // studs across
const BADGE_TOP_VIEW_SCALE = 1.8; // bigger in the top view, where the camera is far away
const BADGE_HEIGHT = 3.9; // studs above the pickup's base
const GRAB_POP_TIME = 0.7; // seconds the "you got it" badge floats up
const BADGE_RING: Record<PickupKind, keyof typeof THEME> = {
  crate: 'badgeBuild',
  ice: 'badgeLife',
  regolith: 'badgeShield',
  solar: 'badgePower',
};
const badgeMaterials = new Map<PickupKind, THREE.SpriteMaterial>();
function badgeMaterial(kind: PickupKind): THREE.SpriteMaterial {
  let m = badgeMaterials.get(kind);
  if (m) return m;
  const px = 128;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  // Same look as the HUD chip icons: a colored disc with a light rim, emoji on top.
  g.fillStyle = hex(THEME.badgeRim);
  g.beginPath();
  g.arc(px / 2, px / 2, px / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hex(THEME[BADGE_RING[kind]] as number);
  g.beginPath();
  g.arc(px / 2, px / 2, px / 2 - 10, 0, Math.PI * 2);
  g.fill();
  g.font = `${px * 0.52}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(UI_ICONS[PICKUP_ICON[kind]].emoji, px / 2, px / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false }); // keep the true HUD colors
  m.userData.outlineParameters = { visible: false }; // no cartoon outline on flat icons
  badgeMaterials.set(kind, m);
  return m;
}
function createBadge(kind: PickupKind): THREE.Sprite {
  const sprite = new THREE.Sprite(badgeMaterial(kind));
  sprite.scale.setScalar(BADGE_SIZE);
  return sprite;
}

// Shared look for the floating "no power" marker.
const markerGeometry = new THREE.OctahedronGeometry(0.9);
const markerMaterial = new THREE.MeshBasicMaterial({ color: THEME.noPowerMarker, toneMapped: false });

export function createGameView(container: HTMLElement, state: GameState, localPlayerId: string, shadows = true): GameView {
  // --- Renderer, scene, camera ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RENDER_STYLE.exposure;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEME.sky);
  scene.fog = new THREE.Fog(THEME.fog, 160, 620);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000);
  let cameraMode: CameraMode = 'follow';

  // --- Lights: soft sky light + one sun that casts shadows near the player ---
  const skyLight = new THREE.HemisphereLight(THEME.skyLight, THEME.groundLight, LIGHT.skyNoon);
  scene.add(skyLight);
  const sun = new THREE.DirectionalLight(THEME.sunLight, LIGHT.sunNoon);
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

  // Stars fade in at night. They follow the camera so they always look far away.
  const stars = createStars();
  scene.add(stars);

  // Optional backdrop: a gradient sky dome, far mountains and Phobos.
  // All three follow the camera so they always look very far away.
  const skyDome = RENDER_STYLE.skyGradient ? createSkyDome() : null;
  const backdrop = RENDER_STYLE.backdrop ? createBackdrop() : null;
  if (skyDome) scene.add(skyDome);
  if (backdrop) scene.add(backdrop);

  // Cartoon styles draw a black outline around every model.
  const outline = RENDER_STYLE.outline ? new OutlineEffect(renderer, { defaultThickness: 0.004 }) : null;

  // --- Entity views, created on demand and kept in maps by id ---
  const rovers = new Map<string, THREE.Group>();
  const bases = new Map<string, BaseView>();
  const pickups = new Map<number, PickupView>();
  const pops: PopAnim[] = [];

  // Magnet ring under the local player's rover, so kids can see their pull range.
  const thin = RENDER_STYLE.ringStyle === 'thin';
  const magnetRing = thin ? createGroundRing(THEME.magnetRing, 0.975, 0.55, 48) : createGroundRing(THEME.magnetRing, 0.93, 0.5);
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
        const ring = thin ? createGroundRing(color, 0.97, 0.45) : createGroundRing(color, 0.9, 0.7);
        ring.position.y = 0.4;
        group.add(ring);
        const landerMarker = createMarker(13);
        group.add(landerMarker);
        scene.add(group);
        view = { group, ring, builtIds: new Set(), markers: new Map(), landerMarker };
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
        const marker = createMarker(7);
        marker.position.x = b.offset.x;
        marker.position.z = b.offset.z;
        marker.position.y += model.position.y;
        view.group.add(marker);
        view.markers.set(b.id, marker);
      }

      // Show the red marker over anything that's switched off for lack of Power.
      view.landerMarker.visible = base.crew > 0 && !base.landerPowered;
      for (const b of base.buildings) {
        const marker = view.markers.get(b.id);
        if (marker) marker.visible = !b.powered;
      }
    }
  }

  // Sky color, sun strength and sun direction follow the time of sol.
  const daySky = new THREE.Color(THEME.sky);
  const nightSky = new THREE.Color(THEME.skyNight);
  const dayFog = new THREE.Color(THEME.fog);
  const nightFog = new THREE.Color(THEME.fogNight);
  const noonSun = new THREE.Color(THEME.sunLight);
  const lowSun = new THREE.Color(THEME.sunLightLow);
  const sunOffset = new THREE.Vector3();
  const dayTop = new THREE.Color(THEME.skyTop);
  const nightTop = new THREE.Color(THEME.skyTopNight);

  function updateDayNight(time: number) {
    const light = sunlight(time);
    // Smooth twilight: the sky starts to darken a bit before sunset.
    const day = Math.min(1, light * 2.5);
    (scene.background as THREE.Color).copy(nightSky).lerp(daySky, day);
    (scene.fog as THREE.Fog).color.copy(nightFog).lerp(dayFog, day);
    if (skyDome) {
      // Horizon matches the fog so the ground melts into the sky.
      const u = (skyDome.material as THREE.ShaderMaterial).uniforms;
      (u.horizon.value as THREE.Color).copy((scene.fog as THREE.Fog).color);
      (u.top.value as THREE.Color).copy(nightTop).lerp(dayTop, day);
    }
    sun.intensity = LIGHT.sunNight + (LIGHT.sunNoon - LIGHT.sunNight) * light;
    sun.color.copy(lowSun).lerp(noonSun, light);
    skyLight.intensity = LIGHT.skyNight + (LIGHT.skyNoon - LIGHT.skyNight) * day;
    (stars.material as THREE.PointsMaterial).opacity = 1 - day;
    stars.visible = day < 1;
    // The sun travels east (+x) to west (-x) across the day; low at the ends.
    const angle = (timeOfSol(time) - 0.25) * 2 * Math.PI; // 0 at sunrise, π at sunset
    sunOffset.set(Math.cos(angle) * 90, 30 + Math.max(0, Math.sin(angle)) * 100, 40);
  }

  function syncRovers(s: GameState, dt: number) {
    for (const p of s.players) {
      let rover = rovers.get(p.id);
      if (!rover) {
        rover = createModel('astronaut', teamColor(p));
        rover.rotation.order = 'YXZ'; // turn first, then tilt with the ground
        scene.add(rover);
        rovers.set(p.id, rover);
      }
      const { x, z } = p.pos;
      rover.position.set(x, heightAt(x, z), z);
      // Characters turn smoothly toward where they're heading (shortest way round).
      if (rover.userData.animation) {
        let diff = p.heading - rover.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        rover.rotation.y += diff * Math.min(1, dt * 12);
        rover.rotation.y = Math.atan2(Math.sin(rover.rotation.y), Math.cos(rover.rotation.y));
      } else {
        rover.rotation.y = p.heading;
      }
      // Characters (astronauts) stay upright and walk; vehicles tilt with the ground.
      if (rover.userData.animation) {
        animateCharacter(rover, Math.hypot(p.vel.x, p.vel.z), dt);
        continue;
      }
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
        const badge = createBadge(p.kind);
        badge.position.y = BADGE_HEIGHT;
        view = { obj: createModel(PICKUP_ASSET[p.kind]), kind: p.kind, badge };
        view.obj.add(badge);
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
      view.badge.scale.setScalar(BADGE_SIZE * (cameraMode === 'topDown' ? BADGE_TOP_VIEW_SCALE : 1));
    }
  }

  // When the local player grabs a pickup, its badge pops up over their head and fades.
  const grabPops: GrabPop[] = [];
  function spawnGrabPops(s: GameState, events: GameEvent[]) {
    for (const e of events) {
      if (e.type !== 'PickupCollected' || e.playerId !== localPlayerId) continue;
      const sprite = new THREE.Sprite(badgeMaterial(e.kind).clone());
      sprite.scale.setScalar(BADGE_SIZE * 1.2);
      scene.add(sprite);
      grabPops.push({ sprite, age: 0 });
    }
    const me = findPlayer(s, localPlayerId);
    for (let i = grabPops.length - 1; i >= 0; i--) {
      const pop = grabPops[i];
      const t = pop.age / GRAB_POP_TIME;
      if (t >= 1 || !me) {
        scene.remove(pop.sprite);
        pop.sprite.material.dispose();
        grabPops.splice(i, 1);
        continue;
      }
      // Rise from the backpack to above the head, then fade out.
      pop.sprite.position.set(me.pos.x, heightAt(me.pos.x, me.pos.z) + 6 + t * 5, me.pos.z);
      pop.sprite.material.opacity = 1 - t * t;
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

  // Behind view: the camera swings round to stay behind where the player faces.
  // Top view: straight down. It never turns by itself, only when the player
  // clicks and drags (mapYaw). The mini-map turns the same way.
  let cameraYaw = 0;
  let mapYaw = 0;
  let dragX: number | null = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (cameraMode !== 'topDown') return;
    dragX = e.clientX;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    mapYaw -= (e.clientX - dragX) * BALANCE.camera.dragTurnSpeed; // drag right = map turns with the mouse
    mapYaw = Math.atan2(Math.sin(mapYaw), Math.cos(mapYaw));
    dragX = e.clientX;
  });
  const endDrag = () => (dragX = null);
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);
  function updateCamera(target: THREE.Vector3, heading: number, dt: number, snap: boolean) {
    const C = BALANCE.camera;
    let diff = heading - cameraYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // turn the short way round
    cameraYaw += snap ? diff : diff * (1 - Math.exp(-C.turnSharpness * dt));
    const desired =
      cameraMode === 'follow'
        ? new THREE.Vector3(
            target.x + Math.sin(cameraYaw) * C.distance,
            target.y + C.height,
            target.z + Math.cos(cameraYaw) * C.distance,
          )
        : // A tiny offset sets which way is "up" on screen when looking straight down.
          new THREE.Vector3(
            target.x + Math.sin(mapYaw) * 0.5,
            target.y + C.topDownHeight,
            target.z + Math.cos(mapYaw) * 0.5,
          );
    const blend = snap ? 1 : 1 - Math.exp(-C.followSharpness * dt);
    camera.position.lerp(desired, blend);
    // Which way is "up" on screen. In the top view this is fixed by mapYaw, so
    // the view never turns when the player changes direction (the camera
    // trailing behind them would otherwise twist it). Only dragging turns it.
    if (cameraMode === 'topDown') camera.up.set(-Math.sin(mapYaw), 0, -Math.cos(mapYaw));
    else camera.up.set(0, 1, 0);
    // Aiming a little above the player tilts the view up to show the horizon.
    camera.lookAt(target.x, target.y + (cameraMode === 'follow' ? C.lookHeight : 0), target.z);

    // Keep the sun's shadow area centered on the player.
    sun.target.position.copy(target);
    sun.position.set(target.x + sunOffset.x, target.y + sunOffset.y, target.z + sunOffset.z);
  }

  let firstFrame = true;
  return {
    update(s, events, dt) {
      syncBases(s);
      syncRovers(s, dt);
      const me = findPlayer(s, localPlayerId);
      syncPickups(s, s.time, me ? me.pos : { x: 0, z: 0 });
      updatePops(dt);
      for (const pop of grabPops) pop.age += dt;
      spawnGrabPops(s, events);
      updateDayNight(s.time);
      const bob = Math.sin(s.time * 4) * 0.4;
      for (const view of bases.values()) {
        for (const m of view.markers.values()) m.rotation.y = s.time * 2;
        view.landerMarker.rotation.y = s.time * 2;
        view.landerMarker.position.y = 13 + bob;
      }

      if (me) {
        const ground = heightAt(me.pos.x, me.pos.z);
        magnetRing.position.set(me.pos.x, ground + 0.5, me.pos.z);
        magnetRing.scale.setScalar(magnetRadius(s, me));
        updateCamera(new THREE.Vector3(me.pos.x, ground, me.pos.z), me.heading, dt, firstFrame);
        firstFrame = false;
      }
      stars.position.copy(camera.position);
      if (skyDome) skyDome.position.copy(camera.position);
      if (backdrop) backdrop.position.set(camera.position.x, camera.position.y - 60, camera.position.z);
      if (outline) outline.render(scene, camera);
      else renderer.render(scene, camera);
    },
    toggleCameraMode() {
      cameraMode = cameraMode === 'follow' ? 'topDown' : 'follow';
    },
    getCameraMode: () => cameraMode,
    getMapYaw: () => mapYaw,
  };
}

// A flat ring (radius 1, scale it to the size you need) drawn on top of the
// ground so hills never hide it.
// With \`dashes\` > 0 the ring is drawn as that many short dashes.
function createGroundRing(color: number, innerRadius: number, opacity: number, dashes = 0): THREE.Mesh {
  let geo: THREE.BufferGeometry = new THREE.RingGeometry(innerRadius, 1, 96);
  if (dashes > 0) {
    const step = (Math.PI * 2) / dashes;
    const parts = [];
    for (let i = 0; i < dashes; i++) parts.push(new THREE.RingGeometry(innerRadius, 1, 4, 1, i * step, step * 0.55));
    geo = mergeGeometries(parts)!;
  }
  const ring = new THREE.Mesh(
    geo.rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false }),
  );
  ring.renderOrder = 1;
  (ring.material as THREE.Material).userData.outlineParameters = { visible: false };
  return ring;
}

// A dome of tiny dots high above the player.
function createStars(): THREE.Points {
  const count = 700;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Fixed pattern (visual only, so no game RNG needed): spread over the upper sky.
    const a = i * 2.39996; // golden angle spreads points around
    const rand = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1; // scrambled height, so no visible pattern
    const y = 0.08 + 0.92 * rand;
    const r = Math.sqrt(1 - y * y);
    positions.set([Math.cos(a) * r * 900, y * 900, Math.sin(a) * r * 900], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: THEME.stars, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
  return new THREE.Points(geo, mat);
}

// A huge inside-out sphere whose color fades from the horizon up to the top.
function createSkyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { horizon: { value: new THREE.Color(THEME.sky) }, top: { value: new THREE.Color(THEME.skyTop) } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 horizon; uniform vec3 top; varying vec3 vDir;
      void main() { float t = pow(clamp(vDir.y, 0.0, 1.0), 0.6); gl_FragColor = vec4(mix(horizon, top, t), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  mat.userData.outlineParameters = { visible: false };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  dome.renderOrder = -2;
  return dome;
}

// Low-poly mountains in a ring around the horizon, plus Phobos in the sky.
function createBackdrop(): THREE.Group {
  const group = new THREE.Group();
  // Two rings of rolling, flat-topped hills all the way round (like the red
  // mesas in the inspo picture). The far ring is paler, so it looks hazy.
  const far = new THREE.Color(THEME.mountains).lerp(new THREE.Color(THEME.fog), 0.35);
  group.add(createRidge(900, 55, 95, far.getHex(), 1.3));
  group.add(createRidge(760, 20, 70, THEME.mountains, 4.1));

  // A few lone buttes in front: a wide tapered rock with a rounded top.
  const buttes = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.sin(i * 4.3) * 0.25;
    const r = 30 + 18 * (0.5 + 0.5 * Math.sin(i * 2.1));
    const h = 45 + 25 * (0.5 + 0.5 * Math.sin(i * 3.3));
    const x = Math.cos(a) * 680;
    const z = Math.sin(a) * 680;
    buttes.push(new THREE.CylinderGeometry(r * 0.8, r, h, 18, 1, true).translate(x, h / 2, z));
    const cap = new THREE.SphereGeometry(r * 0.8, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    buttes.push(cap.scale(1, 0.3, 1).translate(x, h, z));
  }
  const butteMat = new THREE.MeshLambertMaterial({ color: THEME.mountains, fog: false, side: THREE.DoubleSide });
  butteMat.userData.outlineParameters = { visible: false };
  group.add(new THREE.Mesh(mergeGeometries(buttes.map((g) => g.toNonIndexed()))!, butteMat));

  // Phobos: a lumpy potato-shaped moon (it really is lumpy, 27 km across).
  // SOURCE: https://science.nasa.gov/mars/moons/phobos/
  const moonGeo = new THREE.IcosahedronGeometry(24, 2);
  const pos = moonGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const bump = 1 + 0.12 * Math.sin(v.x * 0.15) * Math.cos(v.y * 0.2) + 0.06 * Math.sin(v.z * 0.4);
    v.multiplyScalar(bump);
    v.x *= 1.25; // longer one way, like the real moon
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  moonGeo.computeVertexNormals();
  const moonMat = new THREE.MeshLambertMaterial({ color: THEME.moon, flatShading: true, fog: false });
  moonMat.userData.outlineParameters = { visible: false };
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.set(-420, 330, -1150);
  moon.rotation.set(0.3, 0.5, 0.2);
  group.add(moon);
  return group;
}

// A ring of hills around the player: a wall whose top edge rises and falls
// in smooth bumps, then flattens off into mesa tops.
function createRidge(radius: number, height: number, bump: number, color: number, seed: number): THREE.Mesh {
  const steps = 256;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // Wavy pattern (visual only), whole numbers so the ring joins up.
    const n =
      0.5 +
      0.25 * Math.sin(a * 3 + seed) +
      0.15 * Math.sin(a * 7 + seed * 2.3) +
      0.1 * Math.sin(a * 13 + seed * 4.1);
    // smoothstep squashes the bumps into flat tops with rounded edges.
    const t = Math.min(1, Math.max(0, (n - 0.35) / 0.3));
    const top = height + bump * t * t * (3 - 2 * t);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, 0, z, x * 0.97, top, z * 0.97);
    if (i < steps) {
      const k = i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color, fog: false, side: THREE.DoubleSide });
  mat.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(geo, mat);
}

// A small red spinning gem that floats over a building with no Power.
function createMarker(height: number): THREE.Mesh {
  const m = new THREE.Mesh(markerGeometry, markerMaterial);
  m.position.y = height;
  m.visible = false;
  return m;
}
