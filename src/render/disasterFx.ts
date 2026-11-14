// Disaster looks (visual only, never changes the game state):
// - Dust storm: thick orange air you can't see far through, specks blowing sideways.
// - Solar flare: the sky flashes pale yellow and pulses; shield bubbles appear over bases.
// - Cold night: icy blue air with frost crystals drifting down.
// Effects fade in and out smoothly instead of switching on/off.

import * as THREE from 'three';
import type { DisasterKind } from '../config/balance';
import type { GameState } from '../core/state';
import { THEME } from '../ui/theme';

const FADE_SPEED = 1.2; // how fast effects fade in/out (per second)
const PARTICLES = 900;
const BOX = 120; // particles fill a box this many studs wide around the player
const BOX_HEIGHT = 50;

// How each disaster changes the air. tint = color mixed into sky and fog,
// amount = how much of it, fogNear/fogFar = how far you can see.
const LOOK: Record<DisasterKind, { tint: number; amount: number; fogNear: number; fogFar: number }> = {
  dustStorm: { tint: THEME.dustHaze, amount: 0.85, fogNear: 25, fogFar: 170 },
  solarFlare: { tint: THEME.flareGlow, amount: 0.55, fogNear: 160, fogFar: 620 },
  coldNight: { tint: THEME.frostHaze, amount: 0.45, fogNear: 90, fogFar: 420 },
};
const NORMAL_FOG = { near: 160, far: 620 }; // must match the fog made in gameView.ts

export interface DisasterFx {
  // Call after the day/night colors are set: mixes the disaster look on top.
  // `center` = the ground point under the player (particles fill the air around it).
  update(state: GameState, dt: number, center: THREE.Vector3, fog: THREE.Fog, background: THREE.Color, sun: THREE.DirectionalLight): void;
  // 0..1: how strongly a flare is showing right now (shield bubbles use it).
  flareAmount(): number;
}

export function createDisasterFx(scene: THREE.Scene): DisasterFx {
  // One shared cloud of particles; dust and frost just recolor and move it differently.
  const positions = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES; i++) {
    // Fixed scramble (visual only, so no game RNG needed).
    const r = (k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
    positions.set([(r(1) - 0.5) * BOX, r(2) * BOX_HEIGHT, (r(3) - 0.5) * BOX], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    map: createDotTexture(), // round, soft-edged specks instead of squares
    transparent: true,
    opacity: 0,
    depthWrite: false,
    color: THEME.dustMote,
  });
  mat.userData.outlineParameters = { visible: false };
  const particles = new THREE.Points(geo, mat);
  particles.frustumCulled = false;
  particles.visible = false;
  scene.add(particles);

  // Fade amount per kind, so one disaster can fade out while the next fades in.
  const fade: Record<DisasterKind, number> = { dustStorm: 0, solarFlare: 0, coldNight: 0 };
  const tint = new THREE.Color();
  let drift = 0;

  return {
    update(state, dt, center, fog, background, sun) {
      const active = state.disaster?.kind ?? null;
      for (const k of Object.keys(fade) as DisasterKind[]) {
        const target = k === active ? 1 : 0;
        fade[k] += Math.sign(target - fade[k]) * Math.min(Math.abs(target - fade[k]), FADE_SPEED * dt);
      }

      // Sky and fog: mix in each disaster's tint, and pull the fog closer.
      let near = NORMAL_FOG.near;
      let far = NORMAL_FOG.far;
      for (const k of Object.keys(fade) as DisasterKind[]) {
        const f = fade[k];
        if (f <= 0) continue;
        const look = LOOK[k];
        // A flare's light pulses.
        const pulse = k === 'solarFlare' ? 0.75 + 0.25 * Math.sin(state.time * 6) : 1;
        tint.setHex(look.tint);
        background.lerp(tint, look.amount * f * pulse);
        fog.color.lerp(tint, look.amount * f * pulse);
        near += (look.fogNear - NORMAL_FOG.near) * f;
        far += (look.fogFar - NORMAL_FOG.far) * f;
      }
      fog.near = near;
      fog.far = far;
      sun.intensity *= 1 - 0.6 * fade.dustStorm; // dust blocks the sun
      sun.intensity += 1.2 * fade.solarFlare; // a flare blazes

      // Particles: dust blows sideways fast, frost drifts down slowly.
      const dust = fade.dustStorm;
      const frost = fade.coldNight;
      const show = Math.max(dust, frost);
      particles.visible = show > 0.01;
      if (!particles.visible) return;
      mat.opacity = 0.8 * show;
      mat.color.setHex(dust >= frost ? THEME.dustMote : THEME.frostFlake);
      mat.size = dust >= frost ? 0.9 : 0.6;
      drift += dt;
      const windX = dust >= frost ? 40 : 3; // studs per second
      const fall = dust >= frost ? 2 : 4;
      // Move the whole cloud with the player, wrapping each speck inside the box.
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLES; i++) {
        const baseX = positions[i * 3];
        const baseY = positions[i * 3 + 1];
        const baseZ = positions[i * 3 + 2];
        const x = wrap(baseX + drift * windX - center.x, BOX) + center.x;
        const y = wrap(baseY - drift * fall + Math.sin(drift + i) * 0.5, BOX_HEIGHT) + center.y + BOX_HEIGHT / 2;
        const z = wrap(baseZ + Math.sin(drift * 0.7 + i) * 2 - center.z, BOX) + center.z;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    },
    flareAmount: () => fade.solarFlare,
  };
}

// A small white dot that fades out at the edge (the particle color tints it).
function createDotTexture(): THREE.DataTexture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2); // 0 middle, 1 edge
      const i = (y * n + x) * 4;
      data.set([255, 255, 255, Math.round(255 * Math.max(0, Math.min(1, (1 - d) * 2.5)))], i);
    }
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  return tex;
}

// Keep v inside [-size/2, size/2) by wrapping around.
function wrap(v: number, size: number): number {
  return ((((v + size / 2) % size) + size) % size) - size / 2;
}

// A see-through bubble over a base, shown during a solar flare. Radius 1:
// scale it to the base size. Clear in the middle with a glowing blue edge, like
// a force field. Set `uniforms.opacity.value` (0..1) to fade it.
export function createShieldDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(THEME.shieldDome) },
      opacity: { value: 0 },
    },
    // "rim" is 0 where the surface faces the camera and 1 at the edges.
    vertexShader: `
      varying float rim;
      void main() {
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        rim = 1.0 - abs(dot(n, normalize(-viewPos.xyz)));
        gl_Position = projectionMatrix * viewPos;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying float rim;
      void main() {
        float a = (0.12 + 0.88 * pow(rim, 2.5)) * opacity;
        gl_FragColor = vec4(color + rim * 0.35, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide, // only the outside, so the bubble's inside doesn't double up
  });
  mat.userData.outlineParameters = { visible: false };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.visible = false;
  return dome;
}

// A pulsing ring on the ground where a supply drop will land.
export function createLandingMarker(): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: THEME.landingMarker,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  mat.userData.outlineParameters = { visible: false };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2), mat);
  ring.renderOrder = 1;
  return ring;
}
