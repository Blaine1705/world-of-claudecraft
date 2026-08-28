// The Forgefather's Isle fortress: the owner's hand-placed exterior pass
// (baked from the /placer drakelands_exterior export, 2026-08-28, complete
// with the strait bridge, gatehouse, dragon fountains, waterside quay, and
// the walled sea pool). ONE world-space table drives BOTH the renderer
// (composed into the ember zone features) and the overworld colliders
// below, the interior dressing doctrine carried outside: a piece's
// physical footprint IS its visible silhouette. Placements are absolute
// world coordinates. Sim layer: no three.js, no DOM, deterministic.
// One curated deviation from the raw export: each staircase's y is
// re-seated so its top landing sits flush with the upper court it serves
// (the surplus length buries at the bottom, where stairs emerging from
// the ground read naturally); the terrain ramps under the flights are
// generated from these placements in src/sim/content/ember_coast.ts and
// must be re-derived whenever a staircase row moves.
import type { Collider } from './colliders';
import { STAIR_LANDING_HEIGHT, STAIR_LANDING_START } from './content/ember_coast';
import {
  IGNIVAR_NON_COLLIDING_PROPS,
  IGNIVAR_PROP_COLLIDER_FOOTPRINT,
  IGNIVAR_PROP_NATIVE,
  type IgnivarEnvPropKey,
  type IgnivarPropPlacement,
} from './ignivar_props';
import { terrainHeight } from './world';

const DEG = Math.PI / 180;

export const FORGEFATHER_FORTRESS_PLACEMENTS: readonly IgnivarPropPlacement[] = [
  { key: 'tower_base', x: 502.95, y: 17.05, z: 2249.3, ry: 180 * DEG, scale: 11 },
  { key: 'tower_pillar', x: 503.05, y: 26.75, z: 2249.75, ry: 315 * DEG, scale: 12 },
  { key: 'tower_middle', x: 503.05, y: 38, z: 2249.75, ry: 315 * DEG, scale: 9 },
  { key: 'tower_top', x: 503.05, y: 45.95, z: 2249.9, ry: 225 * DEG, scale: 8 },
  { key: 'tower_base', x: 503.05, y: -2, z: 2249.4, ry: 270 * DEG, scale: 20 },
  { key: 'staircase', x: 503.05, y: 14.61, z: 2242.4, ry: 90 * DEG, scale: 6 },
  { key: 'stone_floor', x: 504.3, y: 14.7, z: 2241.15, ry: 270 * DEG, scale: 8 },
  { key: 'staircase', x: 503.35, y: 10.95, z: 2234.15, ry: 90 * DEG, scale: 6 },
  { key: 'stone_floor', x: 504.05, y: 11, z: 2228.7, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 506.7, y: 13.65, z: 2245.05, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 506.95, y: 10.9, z: 2235.3, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 499.95, y: 10.9, z: 2235.3, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_pillar', x: 499.7, y: 13.65, z: 2245.05, ry: 180 * DEG, scale: 8 },
  { key: 'fortress_wall', x: 499.2, y: 7.4, z: 2240.3, ry: 270 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 507.7, y: 7.4, z: 2240.3, ry: 90 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 508.2, y: 6.65, z: 2229.05, ry: 90 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 499.45, y: 6.65, z: 2229.05, ry: 270 * DEG, scale: 9 },
  { key: 'staircase', x: 504.1, y: 5.03, z: 2221.4, ry: 90 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 499.45, y: 2.9, z: 2221.05, ry: 270 * DEG, scale: 9 },
  { key: 'stone_floor', x: 511, y: 6.3, z: 2222.7, ry: 0, scale: 8 },
  { key: 'stone_floor', x: 510.9, y: 6.3, z: 2214.9, ry: 0, scale: 8 },
  { key: 'stone_floor', x: 503.4, y: 6.3, z: 2214.9, ry: 0, scale: 8 },
  { key: 'tower_base', x: 509, y: 6.3, z: 2222.7, ry: 90 * DEG, scale: 6 },
  { key: 'tower_pillar', x: 509, y: 12.05, z: 2222.45, ry: 315 * DEG, scale: 6 },
  { key: 'cannon', x: 509, y: 17.8, z: 2222.45, ry: 120 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.45, y: 6.75, z: 2224.2, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.45, y: 6.75, z: 2220.7, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.45, y: 6.75, z: 2216.95, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 514.45, y: 6.75, z: 2213.2, ry: 90 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 512.2, y: 6.75, z: 2225.2, ry: 180 * DEG, scale: 4 },
  { key: 'lava_pillar', x: 512.2, y: 6.6, z: 2223, ry: 135 * DEG, scale: 8 },
  { key: 'staircase', x: 507.8, y: 0.33, z: 2207.2, ry: 90 * DEG, scale: 9 },
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
  { key: 'tower_pillar', x: 516.95, y: 0, z: 2221.8, ry: 135 * DEG, scale: 14 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2212.2, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2206.95, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2201.7, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 523.7, y: 2, z: 2196.45, ry: 90 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 519.7, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'tower_pillar', x: 522.6, y: 2, z: 2193, ry: 45 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 514.2, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 508.7, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 503.2, y: 2, z: 2191.45, ry: 180 * DEG, scale: 6 },
  { key: 'tower_base', x: 502.55, y: 0.9, z: 2207.9, ry: 225 * DEG, scale: 10 },
  { key: 'fortress_wall', x: 499.7, y: 4, z: 2213.7, ry: 270 * DEG, scale: 7 },
  { key: 'staircase', x: 497.05, y: -3.97, z: 2200.45, ry: 180 * DEG, scale: 9 },
  { key: 'fortress_wall', x: 498.95, y: -1, z: 2213.95, ry: 270 * DEG, scale: 10 },
  { key: 'fortress_wall', x: 500.45, y: 2, z: 2194.45, ry: 270 * DEG, scale: 6 },
  { key: 'stone_floor', x: 497.1, y: -2.5, z: 2207.75, ry: 90 * DEG, scale: 8 },
  { key: 'stone_floor', x: 489.35, y: -2.5, z: 2207.75, ry: 90 * DEG, scale: 8 },
  { key: 'stone_floor', x: 489.35, y: -2.5, z: 2200.25, ry: 90 * DEG, scale: 8 },
  { key: 'fortress_wall', x: 498.95, y: -1, z: 2223.2, ry: 270 * DEG, scale: 10 },
  { key: 'fortress_wall', x: 498.4, y: 5.8, z: 2229.3, ry: 270 * DEG, scale: 8 },
  { key: 'fortress_wall', x: 498.4, y: 5.8, z: 2236.8, ry: 270 * DEG, scale: 8 },
  { key: 'tower_pillar', x: 499.4, y: 6.35, z: 2245.7, ry: 90 * DEG, scale: 8 },
  { key: 'tower_pillar', x: 499.4, y: -1.4, z: 2245.7, ry: 90 * DEG, scale: 8 },
  { key: 'fortress_wall', x: 493.3, y: -7.25, z: 2243.5, ry: 270 * DEG, scale: 12 },
  { key: 'fortress_wall', x: 495.3, y: -7.25, z: 2254.25, ry: 300 * DEG, scale: 12 },
  { key: 'fortress_wall', x: 503.3, y: -7.25, z: 2259.75, ry: 0, scale: 12 },
  { key: 'fortress_wall', x: 512.3, y: -7.25, z: 2255.75, ry: 45 * DEG, scale: 12 },
  { key: 'fortress_wall', x: 516.05, y: -7.25, z: 2246.25, ry: 90 * DEG, scale: 12 },
  { key: 'stone_floor', x: 508.3, y: -2.25, z: 2249.25, ry: 90 * DEG, scale: 10 },
  { key: 'fortress_wall', x: 507.7, y: 6.75, z: 2220.2, ry: 90 * DEG, scale: 4 },
  { key: 'tower_pillar', x: 521.95, y: -4.75, z: 2220.8, ry: 135 * DEG, scale: 11 },
  { key: 'tower_pillar', x: 521.2, y: 3, z: 2221.3, ry: 180 * DEG, scale: 8 },
  { key: 'tower_base', x: 520.8, y: -8, z: 2191.5, ry: 315 * DEG, scale: 11 },
  { key: 'tower_base', x: 502.55, y: -8, z: 2191.5, ry: 315 * DEG, scale: 11 },
  { key: 'fortress_wall', x: 510.9, y: -8, z: 2189.9, ry: 180 * DEG, scale: 14 },
  { key: 'tower_pillar', x: 501.1, y: -5.5, z: 2195.75, ry: 315 * DEG, scale: 8 },
  { key: 'fortress_wall', x: 497.6, y: -4.75, z: 2196.25, ry: 180 * DEG, scale: 8 },
  { key: 'bridge_floor', x: 489.1, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 481.6, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 474.1, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 466.6, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 459.1, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 451.6, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 444.1, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 436.35, y: -2.75, z: 2193, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 444.1, y: -2.75, z: 2188.25, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 436.6, y: -2.75, z: 2188.25, ry: 0, scale: 8 },
  { key: 'staircase', x: 443.75, y: -3.38, z: 2183.35, ry: 270 * DEG, scale: 7 },
  { key: 'bridge_floor', x: 489.1, y: -2.75, z: 2197.75, ry: 0, scale: 8 },
  { key: 'tower_pillar', x: 493.9, y: -8, z: 2192.85, ry: 45 * DEG, scale: 8 },
  { key: 'tower_pillar', x: 491.9, y: -8, z: 2191.85, ry: 0, scale: 7 },
  { key: 'bridge_rail', x: 490.15, y: -1.65, z: 2191.1, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 485.4, y: -1.65, z: 2191.1, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 480.65, y: -1.65, z: 2191.1, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 475.9, y: -1.65, z: 2191.1, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 471.15, y: -1.65, z: 2191.1, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 466.4, y: -1.65, z: 2191.1, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 461.65, y: -1.65, z: 2191.1, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 456.65, y: -1.65, z: 2190.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 451.9, y: -1.65, z: 2190.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 447.65, y: -1.65, z: 2188.6, ry: 90 * DEG, scale: 6 },
  { key: 'bridge_floor', x: 481.6, y: -2.75, z: 2197.75, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 474.1, y: -2.75, z: 2197.75, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 466.6, y: -2.75, z: 2197.75, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 459.1, y: -2.75, z: 2197.75, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 451.6, y: -2.75, z: 2197.75, ry: 0, scale: 8 },
  { key: 'bridge_floor', x: 444.1, y: -2.75, z: 2197.75, ry: 0, scale: 8 },
  { key: 'bridge_rail', x: 451.9, y: -1.65, z: 2199.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 456.4, y: -1.65, z: 2199.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 461.15, y: -1.65, z: 2199.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 465.9, y: -1.65, z: 2199.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 470.65, y: -1.65, z: 2199.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 475.4, y: -1.65, z: 2199.85, ry: 0, scale: 6 },
  { key: 'bridge_rail', x: 480.15, y: -1.65, z: 2199.85, ry: 0, scale: 6 },
  { key: 'bridge_pillar', x: 481.6, y: -8, z: 2191.5, ry: 285 * DEG, scale: 6 },
  { key: 'bridge_pillar', x: 471.85, y: -8, z: 2191.5, ry: 285 * DEG, scale: 6 },
  { key: 'bridge_pillar', x: 462.35, y: -8, z: 2191.5, ry: 285 * DEG, scale: 6 },
  { key: 'bridge_pillar', x: 452.1, y: -8, z: 2191.5, ry: 285 * DEG, scale: 6 },
  { key: 'bridge_pillar', x: 451.6, y: -8, z: 2199.5, ry: 270 * DEG, scale: 6 },
  { key: 'bridge_pillar', x: 461.1, y: -8, z: 2199.5, ry: 270 * DEG, scale: 6 },
  { key: 'bridge_pillar', x: 470.6, y: -8, z: 2199.5, ry: 270 * DEG, scale: 6 },
  { key: 'bridge_pillar', x: 480.6, y: -8, z: 2199.5, ry: 270 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 500.8, y: 5.95, z: 2194.4, ry: 270 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 500.8, y: 1.7, z: 2207.4, ry: 270 * DEG, scale: 7 },
  { key: 'fortress_wall', x: 500.8, y: 5.95, z: 2207.15, ry: 270 * DEG, scale: 6 },
  { key: 'fortress_wall', x: 501.05, y: 9.95, z: 2197.65, ry: 270 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 501.05, y: 9.95, z: 2203.65, ry: 270 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 501.05, y: 9.95, z: 2200.65, ry: 90 * DEG, scale: 4 },
  { key: 'gate', x: 501.1, y: 6.25, z: 2198.45, ry: 90 * DEG, scale: 8 },
  { key: 'gate', x: 501.1, y: 6.25, z: 2202.45, ry: 90 * DEG, scale: 8 },
  { key: 'gate_gear', x: 500.85, y: 9.25, z: 2200.6, ry: 270 * DEG, scale: 4 },
  { key: 'dragon_head', x: 498.85, y: 3.5, z: 2194.1, ry: 180 * DEG, scale: 4 },
  { key: 'fountain_base', x: 498.85, y: 1.5, z: 2194.1, ry: 270 * DEG, scale: 8 },
  { key: 'dragon_head', x: 511.1, y: 1.75, z: 2189.6, ry: 90 * DEG, scale: 4 },
  { key: 'fountain_base', x: 511.1, y: 0, z: 2188.85, ry: 180 * DEG, scale: 8 },
  { key: 'dragon_head', x: 497.85, y: 4, z: 2208.35, ry: 180 * DEG, scale: 4 },
  { key: 'fountain_base', x: 498.35, y: 1.5, z: 2208.35, ry: 270 * DEG, scale: 8 },
  { key: 'tower_pillar', x: 498.8, y: -2.25, z: 2205.35, ry: 0, scale: 4 },
  { key: 'tower_pillar', x: 497.8, y: -2.25, z: 2206.35, ry: 0, scale: 4 },
  { key: 'tower_pillar', x: 497.8, y: -2.25, z: 2208.35, ry: 0, scale: 4 },
  { key: 'tower_pillar', x: 497.8, y: -2.25, z: 2210.35, ry: 0, scale: 4 },
  { key: 'fortress_wall', x: 497.4, y: -2.75, z: 2204.7, ry: 225 * DEG, scale: 4 },
  { key: 'cannon', x: 502.3, y: 10.65, z: 2207.9, ry: 135 * DEG, scale: 5 },
  { key: 'fortress_wall', x: 495.9, y: -2.75, z: 2207.45, ry: 270 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 495.9, y: -2.75, z: 2209.45, ry: 270 * DEG, scale: 4 },
  { key: 'fortress_wall', x: 497.4, y: -2.75, z: 2212.45, ry: 315 * DEG, scale: 4 },
  { key: 'dragon_pillar', x: 484.55, y: -2, z: 2200.7, ry: 135 * DEG, scale: 8 },
  { key: 'tower_pillar', x: 448.75, y: -3.7, z: 2190.55, ry: 225 * DEG, scale: 5 },
];

/** How far above the local ground a piece's base may sit and still count as
 *  GROUND-STANDING (collides). Higher pieces are aerial members of a stacked
 *  assembly (upper tower sections, wall-top cannons): no body can reach
 *  their span, so they carry no collider. */
const GROUND_STAND_TOLERANCE = 2.5;

/** Deck pieces walked ON: each emits a STANDABLE platform collider at its
 *  own surface height (the parkour moveTopY lane), whatever hangs beneath.
 *  This is what carries a body across the strait bridge instead of into
 *  the water under it. */
export const FORTRESS_STANDABLE_KEYS: ReadonlySet<IgnivarEnvPropKey> = new Set([
  'bridge_floor',
  'stone_floor',
]);

/** Ten treads per staircase under its flat top landing, matching the
 *  shipped GLB's nose line (constants shared with the under-bank generator
 *  in src/sim/content/ember_coast.ts). Each tread is a narrow STANDABLE
 *  platform, so a walking body climbs the real steps through the physics
 *  step-up (the Beacon-stair parkour lane): every rise stays under
 *  MAX_STEP_HEIGHT at the placed scales, and the terrain below is only a
 *  cosmetic bank tucked beneath the solid stair wedge. */
const STAIR_TREADS = 10;

function staircaseTreadColliders(placement: IgnivarPropPlacement): Collider[] {
  const scale = placement.scale;
  const flightLen = scale * STAIR_LANDING_START;
  const treadLen = flightLen / STAIR_TREADS;
  const halfDep = (IGNIVAR_PROP_NATIVE.staircase.dep * scale) / 2;
  const rise = (STAIR_LANDING_HEIGHT * scale) / STAIR_TREADS;
  const cos = Math.cos(placement.ry);
  const sin = Math.sin(placement.ry);
  const out: Collider[] = [];
  const push = (centerD: number, halfLen: number, top: number) => {
    // centerD measures from the bottom end along the climb; the model's
    // bottom end sits at local +x (canonicalGeometry seats the landing at
    // local -x), so the world offset is the rotated local-x displacement.
    const lx = scale / 2 - centerD;
    out.push({
      type: 'obb',
      x: placement.x + lx * cos,
      z: placement.z - lx * sin,
      hw: halfLen,
      hd: halfDep,
      rot: placement.ry,
      moveTopY: top,
      cameraTopY: top,
      standable: true,
    });
  };
  for (let tread = 0; tread < STAIR_TREADS; tread++)
    push((tread + 0.5) * treadLen, treadLen / 2, placement.y + (tread + 1) * rise);
  push(
    (flightLen + scale) / 2,
    (scale - flightLen) / 2,
    placement.y + STAIR_LANDING_HEIGHT * scale,
  );
  return out;
}

/** Colliders for the baked pass, in world space: standable platform OBBs
 *  for the deck pieces and the staircase treads, full-height blocker OBBs
 *  for every ground-standing solid (the ignivarPropColliders derivation,
 *  ground-aware because exterior terrain is not a flat interior floor). */
export function forgefatherFortressColliders(seed: number): Collider[] {
  const colliders: Collider[] = [];
  for (const placement of FORGEFATHER_FORTRESS_PLACEMENTS) {
    const native = IGNIVAR_PROP_NATIVE[placement.key];
    const footprint = IGNIVAR_PROP_COLLIDER_FOOTPRINT[placement.key] ?? 1;
    if (placement.key === 'staircase') {
      colliders.push(...staircaseTreadColliders(placement));
      continue;
    }
    if (FORTRESS_STANDABLE_KEYS.has(placement.key)) {
      const top = placement.y + native.hei * placement.scale;
      colliders.push({
        type: 'obb',
        x: placement.x,
        z: placement.z,
        hw: (native.len * placement.scale) / 2,
        hd: (native.dep * placement.scale) / 2,
        rot: placement.ry,
        moveTopY: top,
        cameraTopY: top,
        standable: true,
      });
      continue;
    }
    if (IGNIVAR_NON_COLLIDING_PROPS.has(placement.key)) continue;
    const ground = terrainHeight(placement.x, placement.z, seed);
    if (placement.y > ground + GROUND_STAND_TOLERANCE) continue;
    // Fully interred pieces (the summit foundation shaft) never collide: a
    // full-height OBB has no top, so a buried mass would otherwise blanket
    // the walkable ground above it.
    if (placement.y + native.hei * placement.scale < ground + 0.5) continue;
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
