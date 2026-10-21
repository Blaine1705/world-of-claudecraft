// The Smith's Heart's cliff faces' vertex paint (phase 2C): in the Hammer
// vein, the field's own cliffs (the gallery's drops, the pit's skirts, the
// Slab stair's sides) take the quarry's cool granite, mid grey with warm and
// cool beds drifting through it and a shallow darkening with depth (never the
// near-black basalt the rest of the main map's storm faces use: the painted
// world's shadows lean blue-violet, never black). Elsewhere the shared
// cliff tint is kept until each vein's own phase.
//
// Three-free, DOM-free, deterministic.

import { smithHeartAreaAt } from '../../sim/content/smith_heart_layout';
import type { FieldCliffRun } from '../../sim/instances/authored_field';
import { cliffColor, fieldNoise, type Rgb } from '../authored_field/field_mesh_core';

/** The quarry granite's beds: a cool grey and a warm grey (sRGB-ish linear
 *  vertex colours, multiplied into the strata texture). */
export const HAMMER_CLIFF_COOL: Rgb = [0.27, 0.27, 0.3];
export const HAMMER_CLIFF_WARM: Rgb = [0.31, 0.28, 0.27];
/** The darkest a Hammer face gets with depth (a share of its lit tone). */
export const HAMMER_CLIFF_FLOOR = 0.5;

/** The paint of a cliff face at (x, y, z) under a lip at height `top`. */
export function heartCliffPaint(
  run: FieldCliffRun,
  x: number,
  y: number,
  z: number,
  top: number,
): Rgb {
  if (smithHeartAreaAt(x, z) !== 'hammer') return cliffColor(run, x, y, z, top);
  const depth = Math.max(0, top - y);
  const bed = 0.5 + 0.5 * Math.sin(y * 0.9 + fieldNoise(x * 0.05, z * 0.05, 2) * 5);
  const n = fieldNoise(x * 0.25 + y * 0.15, z * 0.25 - y * 0.1, 3);
  const dark = Math.max(HAMMER_CLIFF_FLOOR, 1 - depth / 60);
  const k = (0.78 + n * 0.32) * dark;
  return [
    (HAMMER_CLIFF_COOL[0] + (HAMMER_CLIFF_WARM[0] - HAMMER_CLIFF_COOL[0]) * bed) * k,
    (HAMMER_CLIFF_COOL[1] + (HAMMER_CLIFF_WARM[1] - HAMMER_CLIFF_COOL[1]) * bed) * k,
    (HAMMER_CLIFF_COOL[2] + (HAMMER_CLIFF_WARM[2] - HAMMER_CLIFF_COOL[2]) * bed) * k,
  ];
}
