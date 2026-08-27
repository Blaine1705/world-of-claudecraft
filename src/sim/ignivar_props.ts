// Authored Ignivar raid dressing prop placements: ONE table drives BOTH the
// renderer's dressing meshes (src/render/ignivar_dressing_plan_core.ts
// consumes these placements) and the sim's interior colliders below, so a
// prop's physical footprint IS its visible silhouette and the two can never
// disagree (the dungeon_layout.ts doctrine). Placements are instance-local,
// baked from the maintainer's in-game /placer passes.
// Sim layer: no three.js, no DOM, fully deterministic.
import type { Collider } from './colliders';
import { DUNGEON_WALL_HEIGHT, type DungeonLayout } from './dungeon_layout';

export type IgnivarEnvPropKey =
  | 'beam'
  | 'curved_wall'
  | 'firepit'
  | 'gear_machine'
  | 'vault_door'
  | 'gear_wall'
  | 'pillar_broad'
  | 'pillar_slim'
  | 'reactor'
  | 'gear_wall_rusty'
  | 'lava_face'
  | 'anvil'
  | 'forge'
  | 'chain'
  | 'chain_hanging'
  | 'control_machine'
  | 'furnace_small'
  | 'gear_pile'
  | 'lava_furnace'
  | 'press_machine'
  | 'shelf'
  | 'square_wall';

export interface IgnivarPropPlacement {
  key: IgnivarEnvPropKey;
  x: number;
  y: number;
  z: number;
  ry: number;
  scale: number;
  /** Dropped on the low graphics tier (density only, never structure). */
  highOnly?: boolean;
}

/** Canonical native extents (after the prop template's long-axis-to-X
 *  normalization), measured from the baked GLBs. Placement insets, the
 *  colliders below, and the render-side clearance tests all derive from
 *  these, so a rebaked asset that changes shape shows up as a data diff
 *  here, not a silent clip. */
export const IGNIVAR_PROP_NATIVE: Record<
  IgnivarEnvPropKey,
  { len: number; hei: number; dep: number }
> = {
  beam: { len: 1.0, hei: 0.14, dep: 0.14 },
  curved_wall: { len: 1.0, hei: 0.72, dep: 0.11 },
  firepit: { len: 0.97, hei: 0.68, dep: 0.95 },
  gear_machine: { len: 1.0, hei: 0.75, dep: 0.4 },
  vault_door: { len: 1.0, hei: 0.67, dep: 0.2 },
  gear_wall: { len: 1.0, hei: 0.63, dep: 0.11 },
  pillar_broad: { len: 0.43, hei: 1.0, dep: 0.43 },
  pillar_slim: { len: 0.26, hei: 1.0, dep: 0.26 },
  reactor: { len: 0.8, hei: 1.0, dep: 0.52 },
  gear_wall_rusty: { len: 1.0, hei: 0.67, dep: 0.35 },
  lava_face: { len: 0.72, hei: 1.0, dep: 0.55 },
  anvil: { len: 1.0, hei: 0.48, dep: 0.37 },
  forge: { len: 0.99, hei: 1.0, dep: 0.71 },
  chain: { len: 0.12, hei: 1.0, dep: 0.11 },
  chain_hanging: { len: 0.14, hei: 1.0, dep: 0.1 },
  control_machine: { len: 0.86, hei: 1.0, dep: 0.62 },
  furnace_small: { len: 1.0, hei: 0.99, dep: 0.72 },
  gear_pile: { len: 1.0, hei: 0.69, dep: 0.97 },
  lava_furnace: { len: 0.6, hei: 1.0, dep: 0.32 },
  press_machine: { len: 0.76, hei: 1.0, dep: 0.57 },
  shelf: { len: 0.83, hei: 1.0, dep: 0.39 },
  square_wall: { len: 0.99, hei: 1.0, dep: 0.2 },
};

/** The raid rooms build at the double-height wall course. */
export const IGNIVAR_WALL_TOP = DUNGEON_WALL_HEIGHT * 2;

const DEG = Math.PI / 180;

const at = (
  key: IgnivarEnvPropKey,
  x: number,
  z: number,
  ry: number,
  scale: number,
  y = 0,
  highOnly?: boolean,
): IgnivarPropPlacement => ({ key, x, y, z, ry, scale, highOnly });

/** Halls of the First Tempering: the maintainer's hand-placed pass (baked
 *  from the /placer export, 2026-08-27): a slim-pillar ring around the
 *  perimeter, sealed vault doors on both end walls, and a reactor wall on
 *  the east side. The six centre torch pillars replace the stone kit
 *  pillars (dungeon.ts skips the kit module for the ignivar variant and
 *  keeps the torch rigs). */
export function ignivarApproachPropPlacements(layout: DungeonLayout): IgnivarPropPlacement[] {
  const placements: IgnivarPropPlacement[] = [
    at('vault_door', 0.4, -56.5, 180 * DEG, 26),
    at('pillar_slim', -13.1, -56.5, 0, 26),
    at('pillar_slim', 13.8, -56, 0, 26),
    at('pillar_slim', -26.1, -20, 90 * DEG, 26),
    at('pillar_slim', -26.2, 12.2, 90 * DEG, 26),
    at('pillar_slim', -26.5, 44.4, 90 * DEG, 26),
    at('vault_door', 0, 56.1, 0, 26),
    at('pillar_slim', -15.2, 56.5, 180 * DEG, 26),
    at('pillar_slim', 14.8, 54.9, 270 * DEG, 26),
    at('pillar_slim', 26.3, 43.8, 270 * DEG, 26),
    at('reactor', 26.5, 11.3, 270 * DEG, 20),
    at('gear_wall_rusty', 27.5, -41.3, 270 * DEG, 12),
    at('gear_wall_rusty', 28.5, 21.2, 270 * DEG, 12),
    at('pillar_slim', 26.5, -14.3, 270 * DEG, 26),
    at('pillar_slim', 24.4, -46.8, 315 * DEG, 26),
    // Roof chains in the darkness, boss-room style: hook chains hang over
    // the tempering-station lanes (the assembly line the Forgefather left
    // running), straight drops stagger down the whole hall, tops vanishing
    // above the wall line.
    at('chain_hanging', -13, -40, 0.6, 8, 10),
    at('chain_hanging', 13, -18, -0.8, 8, 10, true),
    at('chain_hanging', -13, 8, 2.1, 8, 10),
    at('chain_hanging', 13, 34, 1.2, 8, 10, true),
    at('chain', -14, -25, 0, 8, 12),
    at('chain', 16, 0, 0.9, 8, 12, true),
    at('chain', -12, 30, 2.2, 8, 12),
    at('chain', 8, -44, 0.4, 7, 13),
    at('chain', -18, -34, 1.6, 9, 11, true),
    at('chain', 20, -12, 2.8, 8, 12),
    at('chain', -6, -2, 3.7, 6, 14, true),
    at('chain', 12, 18, 4.5, 9, 11),
    at('chain', -20, 24, 5.3, 8, 12, true),
    at('chain', 4, 40, 0.7, 7, 13),
    at('chain', -10, 46, 1.9, 8, 11),
  ];
  // The centre torch pillars ride the layout so they stay glued to the
  // torch rigs dungeon.ts places at the same points.
  for (const pt of layout.pillars ?? [])
    placements.push(at('pillar_slim', pt.x, pt.z, pt.x < 0 ? 90 * DEG : 270 * DEG, 15));
  return placements;
}

/** Crucible of the Last Spring: roof chains only until the hand-placed
 *  pass lands. Chains hang high over the ring, outside the fighting circle
 *  in plan view. */
export function ignivarArenaPropPlacements(_layout: DungeonLayout): IgnivarPropPlacement[] {
  return [
    at('chain', -14, -14, 0.7, 8, 12, true),
    at('chain', 14, -14, 1.9, 8, 12),
    at('chain', 14, 14, 3.4, 8, 12, true),
    at('chain', -14, 14, 5.1, 8, 12),
  ];
}

/** The Inner Crucible: roof chains only until the hand-placed pass lands
 *  (the hook chains still hang over the forge anchor the boss works). */
export function ignivarCruciblePropPlacements(_layout: DungeonLayout): IgnivarPropPlacement[] {
  return [
    at('chain', -24, -14, 0.4, 8, 12, true),
    at('chain', 24, -14, 1.3, 8, 12),
    at('chain', -27, 0, 2.1, 8, 12, true),
    at('chain', 27, 0, 3.0, 8, 12),
    at('chain', -24, 14, 3.9, 8, 12, true),
    at('chain', 24, 14, 4.8, 8, 12),
    at('chain_hanging', -5.5, 25, 0.5, 8, 10),
    at('chain_hanging', 5.5, 25, -0.5, 8, 10),
  ];
}

export function ignivarPropPlacements(
  interior: string,
  layout: DungeonLayout,
): IgnivarPropPlacement[] {
  if (interior === 'ignivar_approach') return ignivarApproachPropPlacements(layout);
  if (interior === 'ignivar') return ignivarArenaPropPlacements(layout);
  if (interior === 'ignivar_depths') return ignivarCruciblePropPlacements(layout);
  return [];
}

/** Overhead or trim props that never block movement: chains hang from the
 *  roof darkness, and the beam courses are ankle-height wall skirting. */
const NON_COLLIDING: ReadonlySet<IgnivarEnvPropKey> = new Set(['beam', 'chain', 'chain_hanging']);

/** Collider footprint as a fraction of the visual AABB: ornate pillars and
 *  the firepit bowl collide on their trunk, not their widest flange, so a
 *  body brushing the decorative rim slides past instead of snagging (and
 *  the dormant packs hugging the wall pillars stay clear). */
export const IGNIVAR_PROP_COLLIDER_FOOTPRINT: Partial<Record<IgnivarEnvPropKey, number>> = {
  pillar_slim: 0.68,
  pillar_broad: 0.8,
  firepit: 0.85,
  // The console's side pipe loops and the rack's hanging hooks widen the
  // AABB past the solid body; the gear pile's skirt slopes off low.
  control_machine: 0.8,
  shelf: 0.75,
  gear_pile: 0.85,
};

/** Full-height OBB colliders for every floor-standing dressing prop, in the
 *  same instance-local frame as the placements (moveTopY deliberately unset:
 *  a 26x pillar or sealed vault door is architecture, not parkour). */
export function ignivarPropColliders(interior: string, layout: DungeonLayout): Collider[] {
  const colliders: Collider[] = [];
  for (const placement of ignivarPropPlacements(interior, layout)) {
    if (placement.y !== 0 || NON_COLLIDING.has(placement.key)) continue;
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
