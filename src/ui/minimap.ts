// The mini-map in the top-right corner: a round view of the ground around you.
// It faces the same way as the top view (north up until the player drags the
// view round; an "N" on the rim always shows north). Shows you (an arrow pointing where you face), your base (a house,
// pinned to the edge with an arrow when it's off the map), other bases and
// players, and nearby pickups. It only READS the game state.

import { BALANCE, type PickupKind } from '../config/balance';
import { depositRadius } from '../core/growth';
import type { GameState, TerrainGrid } from '../core/state';
import { findPlayer } from '../core/state';
import { THEME } from './theme';

export interface Minimap {
  update(state: GameState): void;
}

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Pickup dot colors come from the theme, so they match the 3D models.
const PICKUP_COLOR: Record<PickupKind, () => number> = {
  crate: () => THEME.pickupCrateBand,
  ice: () => THEME.pickupIce,
  regolith: () => THEME.pickupRegolith,
  solar: () => THEME.pickupSolar,
};

export function createMinimap(root: HTMLElement, localPlayerId: string, getYaw: () => number = () => 0): Minimap {
  const M = BALANCE.minimap;
  const wrap = document.createElement('div');
  wrap.className = 'minimap';
  wrap.title = 'Map: you are the arrow, 🏠 is your base. N points north.';
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(M.sizePx * dpr);
  canvas.style.width = canvas.style.height = `${M.sizePx}px`;
  wrap.appendChild(canvas);
  root.appendChild(wrap);
  const ctx = canvas.getContext('2d')!;

  let ground: HTMLCanvasElement | null = null; // the terrain picture, drawn once

  return {
    update(state) {
      const me = findPlayer(state, localPlayerId);
      if (!me) return;
      ground ??= drawGround(state.terrain);

      const size = M.sizePx;
      const r = size / 2;
      const scale = r / M.viewRadius; // pixels per stud
      const yaw = getYaw();
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      // World (x, z) -> map pixels, with you in the middle, turned like the top view.
      const toMap = (x: number, z: number) => {
        const dx = (x - me.pos.x) * scale;
        const dz = (z - me.pos.z) * scale;
        return { x: r + dx * cos - dz * sin, y: r + dx * sin + dz * cos };
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2);
      ctx.clip();

      // Ground (turned with the canvas, since it's a picture).
      const ws = state.terrain.worldSize;
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(yaw);
      ctx.drawImage(ground, (-ws / 2 - me.pos.x) * scale, (-ws / 2 - me.pos.z) * scale, ws * scale, ws * scale);
      ctx.restore();

      // Pickups close enough to be on the map.
      for (const p of state.pickups) {
        if (!p.active) continue;
        const dx = p.pos.x - me.pos.x;
        const dz = p.pos.z - me.pos.z;
        if (dx * dx + dz * dz > M.viewRadius * M.viewRadius) continue;
        const q = toMap(p.pos.x, p.pos.z);
        ctx.fillStyle = css(PICKUP_COLOR[p.kind]());
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Other bases (team-colored circles the size of their drop-off zone).
      for (const b of state.bases) {
        if (b.id === me.baseId) continue;
        const owner = findPlayer(state, b.ownerId);
        const q = toMap(b.pos.x, b.pos.z);
        ctx.fillStyle = css(THEME.team[(owner?.colorIndex ?? 0) % THEME.team.length]);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(4, depositRadius(b) * scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Other players: small team-colored dots.
      for (const p of state.players) {
        if (p.id === me.id) continue;
        const q = toMap(p.pos.x, p.pos.z);
        ctx.fillStyle = css(THEME.team[p.colorIndex % THEME.team.length]);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Your base: a house. If it's off the map, pin it to the edge and point at it.
      const home = state.bases.find((b) => b.id === me.baseId);
      if (home) {
        const q = toMap(home.pos.x, home.pos.z);
        const dist = Math.hypot(q.x - r, q.y - r); // in pixels
        const edge = r - 12;
        const far = dist > edge;
        const k = far ? edge / dist : 1;
        const hx = r + (q.x - r) * k;
        const hy = r + (q.y - r) * k;
        if (!far) {
          // Drop-off zone ring.
          ctx.strokeStyle = css(THEME.team[me.colorIndex % THEME.team.length]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, hy, depositRadius(home) * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(30, 20, 40, 0.75)';
        ctx.beginPath();
        ctx.arc(hx, hy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏠', hx, hy + 1);
      }

      // You: an arrow in your team color, pointing where you face.
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(yaw - me.heading); // heading 0 = facing north
      ctx.fillStyle = css(THEME.team[me.colorIndex % THEME.team.length]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();

      // "N" on the rim, pointing north.
      const n = toMap(me.pos.x, me.pos.z - 1); // one stud north of you
      const nl = Math.hypot(n.x - r, n.y - r) || 1;
      const nx = r + ((n.x - r) / nl) * (r - 9);
      const ny = r + ((n.y - r) / nl) * (r - 9);
      ctx.fillStyle = 'rgba(30, 20, 40, 0.85)';
      ctx.beginPath();
      ctx.arc(nx, ny, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', nx, ny + 0.5);
    },
  };
}

// One pixel per height point, low ground darker, high ground lighter.
function drawGround(terrain: TerrainGrid): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = terrain.size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(terrain.size, terrain.size);
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of terrain.heights) {
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  const rgb = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const low = rgb(THEME.terrainLow);
  const high = rgb(THEME.terrainHigh);
  for (let i = 0; i < terrain.heights.length; i++) {
    const t = hi > lo ? (terrain.heights[i] - lo) / (hi - lo) : 0.5;
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = low[ch] + (high[ch] - low[ch]) * t;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
