// Rover driving: no physics engine, just simple rules.
// - Velocity eases toward the joystick/keys direction.
// - Uphill slopes slow you down; slopes steeper than maxClimbSlope are walls.
// - If blocked, the rover tries to slide along the wall (x-only or z-only).

import { BALANCE } from '../config/balance';
import { sampleHeight } from './terrain';
import type { PlayerInput, PlayerState, TerrainGrid } from './state';

export function moveRover(player: PlayerState, input: PlayerInput | undefined, terrain: TerrainGrid, dt: number): void {
  const R = BALANCE.rover;

  // 1. Desired velocity from input (diagonals are not faster).
  let ix = input ? input.moveX : 0;
  let iz = input ? input.moveZ : 0;
  const inputLen = Math.hypot(ix, iz);
  if (inputLen > 1) {
    ix /= inputLen;
    iz /= inputLen;
  }
  const blend = Math.min(1, R.acceleration * dt);
  player.vel.x += (ix * R.maxSpeed - player.vel.x) * blend;
  player.vel.z += (iz * R.maxSpeed - player.vel.z) * blend;

  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed < 0.01) {
    player.vel.x = 0;
    player.vel.z = 0;
    return;
  }

  // Face the direction of travel. At heading 0 the model faces -Z.
  player.heading = Math.atan2(-player.vel.x, -player.vel.z);

  // 2. Uphill slows the rover down.
  const dirX = player.vel.x / speed;
  const dirZ = player.vel.z / speed;
  const slope = slopeAlong(terrain, player.pos.x, player.pos.z, dirX, dirZ);
  const factor = slope > 0 ? Math.max(R.minSlopeSpeedFactor, 1 - slope * R.slopeSlowdown) : 1;

  const stepX = player.vel.x * factor * dt;
  const stepZ = player.vel.z * factor * dt;

  // 3. Move if the ground ahead is climbable; otherwise slide along the wall.
  if (canDrive(terrain, player.pos.x, player.pos.z, stepX, stepZ)) {
    player.pos.x += stepX;
    player.pos.z += stepZ;
  } else if (canDrive(terrain, player.pos.x, player.pos.z, stepX, 0)) {
    player.pos.x += stepX;
    player.vel.z = 0;
  } else if (canDrive(terrain, player.pos.x, player.pos.z, 0, stepZ)) {
    player.pos.z += stepZ;
    player.vel.x = 0;
  } else {
    player.vel.x = 0;
    player.vel.z = 0;
  }

  // 4. Stay on the map.
  const half = terrain.worldSize / 2 - 1;
  player.pos.x = Math.max(-half, Math.min(half, player.pos.x));
  player.pos.z = Math.max(-half, Math.min(half, player.pos.z));
}

// Rise over run in the given direction, measured a few studs ahead.
function slopeAlong(terrain: TerrainGrid, x: number, z: number, dirX: number, dirZ: number): number {
  const d = BALANCE.rover.slopeProbeDistance;
  const h0 = sampleHeight(terrain, x, z);
  const h1 = sampleHeight(terrain, x + dirX * d, z + dirZ * d);
  return (h1 - h0) / d;
}

function canDrive(terrain: TerrainGrid, x: number, z: number, stepX: number, stepZ: number): boolean {
  const len = Math.hypot(stepX, stepZ);
  if (len < 1e-6) return false;
  return slopeAlong(terrain, x, z, stepX / len, stepZ / len) <= BALANCE.rover.maxClimbSlope;
}
