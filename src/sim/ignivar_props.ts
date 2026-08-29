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
  | 'vault_door'
  | 'pillar_slim'
  | 'reactor'
  | 'gear_wall_rusty'
  | 'lava_face'
  | 'anvil'
  | 'forge'
  | 'chain'
  | 'chain_hanging'
  | 'lava_furnace'
  | 'press_machine'
  | 'square_wall'
  | 'chain_link'
  | 'hanging_hook'
  | 'industrial_pipe'
  | 'lava_channel'
  | 'lava_channel_curved'
  | 'lava_outlet'
  | 'lava_port'
  | 'steam_machine_round'
  | 'steam_pipes'
  | 'water_pump'
  | 'torch';

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
  vault_door: { len: 1.0, hei: 0.67, dep: 0.2 },
  pillar_slim: { len: 0.26, hei: 1.0, dep: 0.26 },
  reactor: { len: 0.8, hei: 1.0, dep: 0.52 },
  gear_wall_rusty: { len: 1.0, hei: 0.67, dep: 0.35 },
  lava_face: { len: 0.72, hei: 1.0, dep: 0.55 },
  anvil: { len: 1.0, hei: 0.48, dep: 0.37 },
  forge: { len: 0.99, hei: 1.0, dep: 0.71 },
  chain: { len: 0.12, hei: 1.0, dep: 0.11 },
  chain_hanging: { len: 0.14, hei: 1.0, dep: 0.1 },
  lava_furnace: { len: 0.6, hei: 1.0, dep: 0.32 },
  press_machine: { len: 0.76, hei: 1.0, dep: 0.57 },
  square_wall: { len: 0.99, hei: 1.0, dep: 0.2 },
  chain_link: { len: 1.0, hei: 0.75, dep: 0.14 },
  hanging_hook: { len: 0.76, hei: 1.0, dep: 0.4 },
  industrial_pipe: { len: 1.0, hei: 0.81, dep: 0.38 },
  lava_channel: { len: 1.0, hei: 0.11, dep: 0.33 },
  lava_channel_curved: { len: 1.0, hei: 0.13, dep: 0.79 },
  lava_outlet: { len: 0.4, hei: 1.0, dep: 0.28 },
  lava_port: { len: 0.89, hei: 1.0, dep: 0.34 },
  steam_machine_round: { len: 0.51, hei: 1.0, dep: 0.47 },
  steam_pipes: { len: 0.63, hei: 1.0, dep: 0.2 },
  water_pump: { len: 1.0, hei: 0.93, dep: 0.99 },
  torch: { len: 0.62, hei: 1.06, dep: 0.55 },
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

/** Crucible of the Last Spring: the maintainer's hand-placed pass (baked from
 *  the /placer export, 2026-08-28). Four water pumps stand at the corner
 *  anchors as the reworked water conduits, each with a paired industrial pipe;
 *  the walls carry lava vents, rusty gear panels, a workshop face over the
 *  south door, slim pillars, roof chain links, and wall torches. The pumps sit
 *  by the old conduit anchors (+/-18) so the cleanse footprint still lines up
 *  when they are re-wired to the encounter. */
export function ignivarArenaPropPlacements(_layout: DungeonLayout): IgnivarPropPlacement[] {
  return [
    // The reworked water conduits: a pump at each corner anchor, paired
    // with an industrial pipe behind it.
    at('water_pump', -16.2, 16.4, 135 * DEG, 7),
    at('water_pump', -17.4, -17.1, 45 * DEG, 7),
    at('water_pump', 16.6, -16.5, 315 * DEG, 7),
    at('water_pump', 17.1, 16.8, 225 * DEG, 7),
    at('industrial_pipe', -18.6, -18.3, 45 * DEG, 11),
    at('industrial_pipe', -17.7, 17.8, 135 * DEG, 11),
    at('industrial_pipe', 17.8, -17.6, 135 * DEG, 11),
    at('industrial_pipe', 18.5, 18.4, 225 * DEG, 11),
    // East wall: a lava port between the rusty gear panels, torch-lit.
    at('lava_port', 31.95, 0, 270 * DEG, 8),
    at('gear_wall_rusty', 33.1, -7.6, 270 * DEG, 11, 1.25),
    at('gear_wall_rusty', 33.05, 7.45, 270 * DEG, 11, 1.25),
    // West wall: paired lava outlets.
    at('lava_outlet', -32.3, -2.65, 90 * DEG, 10, 0.5),
    at('lava_outlet', -32.3, 2.85, 90 * DEG, 10, 0.5),
    // South door wall: a workshop face panel flanked by lava faces.
    at('square_wall', 0.05, -32, 0, 12, 1),
    at('lava_face', 9.7, -32.35, 0, 10),
    at('lava_face', -9.8, -32.4, 0, 10),
    // Roof chain links over the corners (overhead density, low-tier droppable).
    at('chain_link', -22.7, 22.8, 135 * DEG, 8, 9.5, true),
    at('chain_link', 23.1, 22.5, 225 * DEG, 8, 9.5, true),
    at('chain_link', 22.75, -22.6, 315 * DEG, 8, 9.5, true),
    at('chain_link', -22.75, -22.55, 45 * DEG, 8, 9.5, true),
    // Side-wall pillar pairs, torch-lit.
    at('pillar_slim', -29.3, 9.1, 90 * DEG, 12),
    at('pillar_slim', -29.45, -11, 90 * DEG, 12),
    at('pillar_slim', 27.05, -11, 90 * DEG, 12),
    at('pillar_slim', 27.25, 13, 90 * DEG, 12),
    at('torch', -27.6, 9.2, 0, 2, 8),
    at('torch', -27.75, -11, 0, 2, 8),
    at('torch', 25.6, 13, 180 * DEG, 2, 8),
    at('torch', 25.5, -11.1, 180 * DEG, 2, 8),
    // North door wall: a pillar row with chain links and low torches.
    at('pillar_slim', -5.6, 25.4, 180 * DEG, 13),
    at('pillar_slim', -13.3, 25.4, 180 * DEG, 13),
    at('pillar_slim', 6.2, 25.5, 180 * DEG, 13),
    at('pillar_slim', 14.25, 25.4, 180 * DEG, 13),
    at('chain_link', -9.4, 23.45, 180 * DEG, 10, 5, true),
    at('chain_link', 10.3, 23.7, 180 * DEG, 10, 5, true),
    at('torch', -5.5, 23.55, 90 * DEG, 2, 3.25),
    at('torch', 6.1, 23.8, 90 * DEG, 2, 3.25),
    // High wall sconces over the south door and the east/west walls.
    at('torch', -9.7, -31.65, 270 * DEG, 2, 10.75),
    at('torch', 9.7, -31.7, 270 * DEG, 2, 10.75),
    at('torch', 31.7, 0, 180 * DEG, 2, 10.75),
    at('torch', -32, 0, 0, 2, 10.75),
    // Extra hanging chains draped through the room interior (overhead density,
    // low-tier droppable).
    at('chain_hanging', -12.8, 0.7, 90 * DEG, 15, 11, true),
    at('chain_hanging', 12.3, 7.1, 90 * DEG, 7, 8, true),
    at('chain_hanging', 8.8, -15, 90 * DEG, 20, 12, true),
    at('chain_hanging', -3.9, -8.5, 90 * DEG, 5, 10, true),
  ];
}

/** The Inner Crucible: the hand-placed pass (baked from the /placer export,
 *  2026-08-27) over the original roof chains. Furnace banks and steam stacks
 *  line the east and west walls, a workshop face wraps the south door (wall
 *  panels riding above pipes and lava ports, press machines on the corner
 *  diagonals), the lava-fed north wall stands behind the forge anchor, and
 *  chain drapes dress the wall feet. Every floor placement hugs the walls,
 *  outside the trench-bounded fighting floor the encounter declares. */
export function ignivarCruciblePropPlacements(_layout: DungeonLayout): IgnivarPropPlacement[] {
  return [
    // Roof chains in the darkness (the hook chains hang over the forge
    // anchor the boss works).
    at('chain', -24, -14, 0.4, 8, 12, true),
    at('chain', 24, -14, 1.3, 8, 12),
    at('chain', -27, 0, 2.1, 8, 12, true),
    at('chain', 27, 0, 3.0, 8, 12),
    at('chain', -24, 14, 3.9, 8, 12, true),
    at('chain', 24, 14, 4.8, 8, 12),
    at('chain_hanging', -5.5, 25, 0.5, 8, 10),
    at('chain_hanging', 5.5, 25, -0.5, 8, 10),
    // The forge-anchor dressing (re-baked from the /placer export,
    // 2026-08-28): the assembly forge stands at the north face of the
    // fighting circle with the anvil the boss works squared up at its
    // front, both under the hook chains. The deliberate floor placements
    // inside the fighting circle; the clearance contracts carve out the
    // forge-anchor radius for exactly this.
    at('anvil', 1.2, 22.9, 180 * DEG, 10),
    at('forge', 0.8, 26.7, 180 * DEG, 13),
    // East wall: furnace bank flanking the steam pipe stack.
    at('steam_pipes', 39.25, -2.5, 270 * DEG, 15),
    at('lava_furnace', 37.5, -10.5, 270 * DEG, 15),
    at('lava_furnace', 37.5, 6.5, 270 * DEG, 15),
    // South door wall: the workshop face. Wall panels ride high over the
    // pipe runs and lava ports; the press machines hold the corner
    // diagonals with lava outlets at their feet.
    at('square_wall', 11.7, -39, 0, 8, 7.75),
    at('square_wall', 3.7, -39, 0, 8, 7.75),
    at('square_wall', -4.3, -39, 0, 8, 7.75),
    at('square_wall', -11.3, -39, 0, 8, 7.75),
    at('industrial_pipe', 9.3, -38.2, 0, 12),
    at('industrial_pipe', -9.7, -38.2, 0, 12),
    at('lava_outlet', -28.55, -30.55, 45 * DEG, 14),
    at('lava_outlet', 29.2, -30.9, 315 * DEG, 14),
    at('press_machine', -22.45, -34.25, 45 * DEG, 11),
    at('lava_port', -10.1, -38.3, 0, 7),
    at('lava_port', 9.1, -38.5, 0, 7),
    at('press_machine', 22.6, -34.6, 315 * DEG, 11),
    // East and west wall chain rigs: a link run with its hook below.
    at('chain_link', 35.2, -20.95, 315 * DEG, 10, 8),
    at('hanging_hook', 34.1, -24.9, 135 * DEG, 10, 5),
    // West wall: the mirrored furnace bank.
    at('lava_furnace', -38, -9.9, 90 * DEG, 15),
    at('lava_furnace', -37.5, 7.1, 90 * DEG, 15),
    at('steam_pipes', -38, -0.6, 90 * DEG, 15),
    at('chain_link', -35.3, -19.1, 45 * DEG, 10, 8),
    at('hanging_hook', -32.3, -24.1, 45 * DEG, 10, 5),
    // North wall behind the forge anchor: lava outlets feed an elevated
    // port over a stacked beam course, steam pipes at the wall feet.
    at('lava_outlet', -16.55, 38, 180 * DEG, 15),
    at('lava_outlet', 14.4, 38.5, 180 * DEG, 15),
    at('lava_port', -0.5, 38, 180 * DEG, 13, 2.75),
    at('beam', -10.6, 39.05, 180 * DEG, 9, 11),
    at('beam', -9.6, 39.05, 180 * DEG, 9, 8.25),
    at('beam', -9.6, 39.05, 180 * DEG, 9, 5),
    at('beam', 9.4, 39.05, 180 * DEG, 9, 5),
    at('beam', 9.4, 39.05, 180 * DEG, 9, 8.25),
    at('beam', 8.4, 39.05, 180 * DEG, 9, 11),
    at('steam_pipes', 8.9, 39.1, 180 * DEG, 10),
    at('steam_pipes', -10.1, 39.1, 180 * DEG, 10),
    at('beam', -0.6, 39.05, 180 * DEG, 13),
    // Mid walls: one round steam machine per side.
    at('steam_machine_round', -36.9, 16.05, 90 * DEG, 12),
    at('steam_machine_round', 36.95, 14.85, 270 * DEG, 12),
    // North corner wall panels on the octagon diagonals.
    at('square_wall', 26.2, 33.2, 225 * DEG, 15),
    at('square_wall', -28, 31.8, 135 * DEG, 15),
    // Wall drapes: a long low chain with a short one beside it, at the
    // door corners and the mid walls.
    at('chain_hanging', 16.4, -36.2, 0, 15, 1),
    at('chain_hanging', 18.4, -36.2, 0, 10, 6),
    at('chain_hanging', -17.7, -37.5, 225 * DEG, 15, 1),
    at('chain_hanging', -19.3, -36.7, 0, 10, 6.5),
    at('chain_hanging', -35, 21.5, 0, 15, 1),
    at('chain_hanging', -33.1, 22.1, 0, 10, 6.5),
    at('chain_hanging', 34.1, 20.7, 0, 15, 1),
    at('chain_hanging', 31, 21, 0, 10, 6.5),
    // North corner pillars beside the forge wall.
    at('pillar_slim', 18.9, 37.5, 135 * DEG, 12),
    at('pillar_slim', -19.4, 35.9, 135 * DEG, 12),
    // Lava gutters (walk-over floor trim, never colliders): a curved-fed
    // channel run along each furnace bank, a fed loop under the north
    // wall, straight runs at the door wall, and curved feeds into the
    // press machines on the door diagonals.
    at('lava_channel_curved', 37.35, -15.15, 0, 8),
    at('lava_channel', 34.7, -8.6, 270 * DEG, 8),
    at('lava_channel', 34.7, -1.35, 270 * DEG, 8),
    at('lava_channel', 34.7, 5.9, 270 * DEG, 8),
    at('lava_channel_curved', 36.55, 13.15, 90 * DEG, 8),
    at('lava_channel_curved', -35.6, -14.05, 270 * DEG, 8),
    at('lava_channel', -33.85, -6.8, 270 * DEG, 8),
    at('lava_channel', -33.85, 0.45, 270 * DEG, 8),
    at('lava_channel', -33.85, 7.7, 270 * DEG, 8),
    at('lava_channel_curved', -36.45, 14.1, 180 * DEG, 8),
    at('lava_channel', -0.7, 37.15, 270 * DEG, 12),
    at('lava_channel_curved', 12.05, 34.9, 270 * DEG, 8),
    at('lava_channel', 5.55, 32.15, 180 * DEG, 8),
    at('lava_channel', -7.2, 32.4, 180 * DEG, 8),
    at('lava_channel_curved', -14.4, 34.25, 0, 8),
    at('lava_channel', -10.1, -37.25, 0, 8),
    at('lava_channel', 9.15, -37.25, 0, 8),
    at('lava_channel_curved', 24, -29.5, 135 * DEG, 8),
    at('lava_channel', 17.65, -33.15, 315 * DEG, 8),
    at('lava_channel_curved', -25.65, -29.75, 135 * DEG, 8),
    at('lava_channel', -19.15, -32.5, 225 * DEG, 8),
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

/** Overhead or trim props that never block movement: chains and hook rigs
 *  hang from the roof darkness or the walls, the beam courses are
 *  ankle-height wall skirting, and the lava channels are floor gutters a
 *  body steps over. */
export const IGNIVAR_NON_COLLIDING_PROPS: ReadonlySet<IgnivarEnvPropKey> = new Set([
  'beam',
  'chain',
  'chain_hanging',
  'chain_link',
  'hanging_hook',
  'lava_channel',
  'lava_channel_curved',
  'torch',
]);

/** Collider footprint as a fraction of the visual AABB: ornate pillars
 *  collide on their trunk, not their widest flange, so a body brushing the
 *  decorative rim slides past instead of snagging (and the dormant packs
 *  hugging the wall pillars stay clear). */
export const IGNIVAR_PROP_COLLIDER_FOOTPRINT: Partial<Record<IgnivarEnvPropKey, number>> = {
  pillar_slim: 0.68,
  // The water pumps are the conduit soak stations: only the central pump body
  // blocks, so a body can wade into the surrounding water pool (the cleanse
  // footprint) to be cleansed while the boss's frontal is up.
  water_pump: 0.3,
};

/** Full-height OBB colliders for every floor-standing dressing prop, in the
 *  same instance-local frame as the placements (moveTopY deliberately unset:
 *  a 26x pillar or sealed vault door is architecture, not parkour). */
export function ignivarPropColliders(interior: string, layout: DungeonLayout): Collider[] {
  const colliders: Collider[] = [];
  for (const placement of ignivarPropPlacements(interior, layout)) {
    if (placement.y !== 0 || IGNIVAR_NON_COLLIDING_PROPS.has(placement.key)) continue;
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
