// The Forgefather's Isle fortress: the owner's hand-placed exterior pass
// (baked from the /placer drakelands_exterior export, 2026-08-28). ONE
// world-space table drives BOTH the renderer (composed into the ember zone
// features) and the overworld colliders below, the interior dressing
// doctrine carried outside: a piece's physical footprint IS its visible
// silhouette. Placements are absolute world coordinates.
// Sim layer: no three.js, no DOM, deterministic.
import type { Collider } from './colliders';
import {
  IGNIVAR_NON_COLLIDING_PROPS,
  IGNIVAR_PROP_COLLIDER_FOOTPRINT,
  IGNIVAR_PROP_NATIVE,
  type IgnivarPropPlacement,
} from './ignivar_props';
import { terrainHeight } from './world';

const DEG = Math.PI / 180;

export const FORGEFATHER_FORTRESS_PLACEMENTS: readonly IgnivarPropPlacement[] = [
  { key: 'tower_base', x: 502.95, y: 17.05, z: 2249.3, ry: 180 * DEG, scale: 11 },
  { key: 'tower_pillar', x: 503.05, y: 26.75, z: 2249.75, ry: 315 * DEG, scale: 12 },
  { key: 'tower_middle', x: 503.05, y: 38, z: 2249.75, ry: 315 * DEG, scale: 9 },
  { key: 'tower_top', x: 503.05, y: 45.95, z: 2249.9, ry: 270 * DEG, scale: 8 },
  { key: 'tower_base', x: 503.05, y: 0, z: 2250.65, ry: 270 * DEG, scale: 18 },
  { key: 'staircase', x: 503.05, y: 12.95, z: 2242.4, ry: 90 * DEG, scale: 6 },
  { key: 'stone_floor', x: 504.3, y: 14.7, z: 2241.15, ry: 270 * DEG, scale: 8 },
  { key: 'staircase', x: 503.35, y: 11.45, z: 2234.15, ry: 90 * DEG, scale: 6 },
  { key: 'stone_floor', x: 504.05, y: 11, z: 2228.7, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 506.7, y: 13.65, z: 2245.05, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 506.95, y: 10.9, z: 2235.3, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 499.95, y: 10.9, z: 2235.3, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 499.7, y: 13.65, z: 2245.05, ry: 180 * DEG, scale: 8 },
  { key: 'fortress_wall', x: 499.2, y: 7.4, z: 2240.3, ry: 270 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 507.7, y: 7.4, z: 2240.3, ry: 90 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 508.2, y: 6.65, z: 2229.05, ry: 90 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 499.45, y: 6.65, z: 2229.05, ry: 270 * DEG, scale: 9 },
  { key: 'staircase', x: 504.1, y: 6.7, z: 2221.4, ry: 90 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 499.45, y: 2.9, z: 2221.05, ry: 270 * DEG, scale: 9 },
  { key: 'stone_floor', x: 511, y: 6.3, z: 2222.7, ry: 0, scale: 8 },
  { key: 'stone_floor', x: 510.9, y: 6.3, z: 2214.9, ry: 0, scale: 8 },
  { key: 'stone_floor', x: 503.4, y: 6.3, z: 2214.9, ry: 0, scale: 8 },
  { key: 'tower_base', x: 509, y: 6.3, z: 2222.7, ry: 90 * DEG, scale: 6 },
  { key: 'tower_pillar', x: 509, y: 12.05, z: 2222.45, ry: 315 * DEG, scale: 6 },
  { key: 'cannon', x: 509, y: 17.8, z: 2222.45, ry: 120 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.45, y: 6.75, z: 2224.2, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.45, y: 6.75, z: 2219.95, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.45, y: 6.75, z: 2215.95, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.7, y: 6.75, z: 2212.95, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 512.2, y: 6.75, z: 2225.2, ry: 180 * DEG, scale: 4 },
  { key: 'lava_pillar', x: 512.2, y: 6.6, z: 2223, ry: 135 * DEG, scale: 8 },
  { key: 'staircase', x: 507.8, y: 0.95, z: 2207.2, ry: 90 * DEG, scale: 9 },
  { key: 'tower_base', x: 513.6, y: 1.3, z: 2210.15, ry: 165 * DEG, scale: 8 },
  { key: 'cannon', x: 513.6, y: 9.05, z: 2210.4, ry: 135 * DEG, scale: 4 },
  { key: 'stone_floor', x: 520.2, y: 2, z: 2209.95, ry: 270 * DEG, scale: 8 },
  { key: 'stone_floor', x: 512.7, y: 2, z: 2209.95, ry: 270 * DEG, scale: 8 },
  { key: 'stone_floor', x: 520.2, y: 2, z: 2202.95, ry: 270 * DEG, scale: 8 },
  { key: 'stone_floor', x: 512.7, y: 2, z: 2202.95, ry: 270 * DEG, scale: 8 },
  { key: 'stone_floor', x: 505.2, y: 2, z: 2202.95, ry: 270 * DEG, scale: 8 },
  { key: 'stone_floor', x: 505.2, y: 2, z: 2195.2, ry: 270 * DEG, scale: 8 },
  { key: 'stone_floor', x: 512.7, y: 2, z: 2195.2, ry: 270 * DEG, scale: 8 },
  { key: 'stone_floor', x: 520.2, y: 2, z: 2195.2, ry: 270 * DEG, scale: 8 },
  { key: 'fortress_wall', x: 522.2, y: 2, z: 2212.7, ry: 120 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 519.2, y: 2, z: 2208.95, ry: 150 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 514.2, y: 2, z: 2206.95, ry: 180 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2217.7, ry: 90 * DEG, scale: 6 },
  { key: 'tower_pillar', x: 520.2, y: 0, z: 2221.8, ry: 135 * DEG, scale: 12 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2212.2, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2206.95, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2201.7, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2196.45, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 519.7, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'tower_pillar', x: 522.6, y: 2, z: 2193, ry: 45 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 514.2, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 508.7, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 503.2, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'tower_base', x: 501.8, y: 0.9, z: 2209.9, ry: 225 * DEG, scale: 10 },
  { key: 'fortress_wall', x: 499.7, y: 4, z: 2213.7, ry: 270 * DEG, scale: 7 },
];

/** How far above the local ground a piece's base may sit and still count as
 *  GROUND-STANDING (collides). Higher pieces are aerial members of a stacked
 *  assembly (upper tower sections, wall-top cannons): no body can reach
 *  their span, so they carry no collider. */
const GROUND_STAND_TOLERANCE = 2.5;

/** Full-height OBB colliders for every ground-standing solid piece, in
 *  world space (the ignivarPropColliders derivation, ground-aware because
 *  exterior terrain is not a flat interior floor). */
export function forgefatherFortressColliders(seed: number): Collider[] {
  const colliders: Collider[] = [];
  for (const placement of FORGEFATHER_FORTRESS_PLACEMENTS) {
    if (IGNIVAR_NON_COLLIDING_PROPS.has(placement.key)) continue;
    const ground = terrainHeight(placement.x, placement.z, seed);
    if (placement.y > ground + GROUND_STAND_TOLERANCE) continue;
    const native = IGNIVAR_PROP_NATIVE[placement.key];
    const footprint = IGNIVAR_PROP_COLLIDER_FOOTPRINT[placement.key] ?? 1;
    colliders.push({
      type: 'obb',
      x: placement.x,
      z: placement.z,
      hw: (native.len * placement.scale * footprint) / 2,
      hd: (native.dep * placement.scale * footprint) / 2,
      rot: placement.ry,
    });
  }
  return colliders;
}
