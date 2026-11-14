// Tiny helpers for writing placeholder model parts in a few words.
// p('box', [w, h, d], [x, y, z], 'hull') is one part; pair(...) adds its mirror image.

import type { PrimitivePart, PrimitiveShape } from './manifest';
import type { ThemeColorKey } from '../ui/theme';

type Vec3 = [number, number, number];
type Extra = Partial<Pick<PrimitivePart, 'rot' | 'glow' | 'opacity' | 'shiny' | 'wire' | 'limb'>>;

export function p(shape: PrimitiveShape, size: Vec3, pos: Vec3, color: ThemeColorKey | 'team', extra: Extra = {}): PrimitivePart {
  return { shape, size, pos, color, ...extra };
}

// The part plus its mirror image on the other side (left/right arms, legs...).
export function pair(part: PrimitivePart): PrimitivePart[] {
  const [x, y, z] = part.pos;
  const mirrored: PrimitivePart = { ...part, pos: [-x, y, z] };
  if (part.rot) mirrored.rot = [part.rot[0], -part.rot[1], -part.rot[2]];
  // A left limb's mirror is the right limb.
  if (part.limb) mirrored.limb = (part.limb.endsWith('L') ? part.limb.replace('L', 'R') : part.limb.replace('R', 'L')) as typeof part.limb;
  return [part, mirrored];
}
