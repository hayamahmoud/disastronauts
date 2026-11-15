// "Juice" (M7): small visual rewards that make the game feel good.
//   - bursts: little puffs of colored dots (grabbing a pickup, a new building…)
//   - floating text: "+12 ⚡" numbers that float up over your base and fade
// Visual only: nothing here changes the game.

import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import { THEME, cssColor as css } from '../ui/theme';

const MAX_PARTICLES = 700; // reused round-robin, so there's never more than this
const GRAVITY = 28; // studs/s², pulls the dots back down
const DOT_SIZE = 380; // on-screen size factor (bigger = bigger dots)

export interface Juice {
  // A puff of `count` dots at a point. `spread` = sideways speed, `up` = upward speed.
  burst(at: THREE.Vector3, color: number, count?: number, spread?: number, up?: number): void;
  // Text that floats up from a point and fades ("+12 ⚡"). `delay` staggers several.
  floatText(at: THREE.Vector3, text: string, color: number, delay?: number): void;
  update(dt: number, topView: boolean): void;
}

export function createJuice(scene: THREE.Scene, pixelRatio: number): Juice {
  // --- Bursts: one Points object; each dot has a position, velocity, color and life ---
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const tint = new Float32Array(MAX_PARTICLES * 3);
  const alpha = new Float32Array(MAX_PARTICLES); // 1 = just born, 0 = gone
  const fade = new Float32Array(MAX_PARTICLES); // how fast it fades (per second)
  let next = 0;
  let alive = 0; // rough count, so update() can skip work when nothing is flying

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { size: { value: DOT_SIZE * pixelRatio } },
    // Round soft dots that shrink a little as they fade.
    vertexShader: `attribute vec3 tint; attribute float alpha; uniform float size;
      varying vec3 vTint; varying float vAlpha;
      void main() {
        vTint = tint; vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = alpha > 0.0 ? size * (0.45 + 0.55 * alpha) / -mv.z : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vTint; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vTint, vAlpha * smoothstep(0.5, 0.3, d));
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);
  const color = new THREE.Color();

  // --- Floating text sprites ---
  interface Floater {
    sprite: THREE.Sprite;
    from: THREE.Vector3;
    age: number; // negative while waiting for its delay
  }
  const floaters: Floater[] = [];

  return {
    burst(at, hex, count = BALANCE.juice.burstParticles, spread = 9, up = 12) {
      color.setHex(hex);
      for (let n = 0; n < count; n++) {
        const i = next;
        next = (next + 1) % MAX_PARTICLES;
        // Spread evenly round a circle, with a little randomness (visual only).
        const a = (n / count) * Math.PI * 2 + Math.random() * 0.6;
        const s = spread * (0.5 + Math.random() * 0.5);
        pos.set([at.x, at.y, at.z], i * 3);
        vel.set([Math.cos(a) * s, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s], i * 3);
        tint.set([color.r, color.g, color.b], i * 3);
        alpha[i] = 1;
        fade[i] = 1 / (0.55 + Math.random() * 0.35);
      }
      alive = Math.min(MAX_PARTICLES, alive + count);
      geo.attributes.tint.needsUpdate = true;
    },

    floatText(at, text, hex, delay = 0) {
      const sprite = new THREE.Sprite(textMaterial(text, hex));
      sprite.visible = false;
      sprite.renderOrder = 3;
      scene.add(sprite);
      floaters.push({ sprite, from: at.clone(), age: -delay });
    },

    update(dt, topView) {
      mat.uniforms.size.value = DOT_SIZE * pixelRatio * (topView ? 2.5 : 1);
      if (alive > 0) {
        let still = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
          if (alpha[i] <= 0) continue;
          vel[i * 3 + 1] -= GRAVITY * dt;
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          alpha[i] = Math.max(0, alpha[i] - fade[i] * dt);
          if (alpha[i] > 0) still++;
        }
        alive = still;
        geo.attributes.position.needsUpdate = true;
        geo.attributes.alpha.needsUpdate = true;
      }

      const life = BALANCE.juice.floatTextSeconds;
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.age += dt;
        if (f.age < 0) continue;
        const t = f.age / life;
        if (t >= 1) {
          scene.remove(f.sprite);
          f.sprite.material.map?.dispose();
          f.sprite.material.dispose();
          floaters.splice(i, 1);
          continue;
        }
        // Pop up quickly, then drift; fade out over the last third.
        const rise = 1 - Math.pow(1 - t, 3);
        f.sprite.visible = true;
        f.sprite.position.set(f.from.x, f.from.y + rise * 7, f.from.z);
        const k = (topView ? 2.2 : 1) * (t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1);
        f.sprite.scale.set(7 * k, 2.6 * k, 1);
        f.sprite.material.opacity = t > 0.66 ? 1 - (t - 0.66) / 0.34 : 1;
      }
    },
  };
}

// "+12 ⚡" drawn on a small canvas: chunky colored text with a plum outline,
// so it reads on both the orange ground and the night sky.
function textMaterial(text: string, hex: number): THREE.SpriteMaterial {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '700 58px Fredoka, "Trebuchet MS", system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = css(THEME.textOutline);
  g.strokeText(text, 128, 50);
  g.fillStyle = css(hex);
  g.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  return m;
}
