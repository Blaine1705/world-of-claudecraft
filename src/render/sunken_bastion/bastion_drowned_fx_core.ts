// Pure plan for the drowned garrison's own effects (bastion_drowned_fx.ts):
// the sea still running off them. While one stands near the player, water
// drips from the brim of its helm and from its buckler and blade (from the
// war hound's jaws and collar); when it is
// struck, brine sprays off it away from the blow; when it rushes, it kicks a
// spray up from its boots; when it falls, the sea it drowned in pours out of
// it in a gush of brine and mist and its sea light lifts away as motes.
//
// Numbers are in the creature's Blender model units (the Bastion Revenant's
// build, scripts/assets/sunken_bastion_drowned/: its anchors.py prints
// these half a second into Idle), scaled by the VISUALS height
// the renderer normalizes the GLB to, exactly as bastion_creature_fx_core.ts
// does for the arbalest and the Turnkey.
//
// Presentation only: none of this decides or hides an outcome (a hit, a
// death and a rush are already the sim's), so the whole plan sheds with the
// effects tier. Three-free, DOM-free, deterministic.

import type { ModelPoint } from './bastion_creature_fx_core';

/** One drowned body's effect anchors. */
export interface DrownedFxSpec {
  /** The GLB's bounding height half a second into Idle (the build's measure),
   *  which the VISUALS height normalizes. */
  rawHeight: number;
  /** Where water runs off it (the helm's brim, the buckler's rim, the blade). */
  drips: readonly ModelPoint[];
  /** The middle of its chest: where a blow throws brine off it. */
  chest: ModelPoint;
  /** Where its sea light burns (between the eyes). */
  eyes: ModelPoint;
}

/** The drowned that wear their own Blender bodies and carry these effects. */
export const DROWNED_FX: Readonly<Record<string, DrownedFxSpec>> = {
  bastion_revenant: {
    rawHeight: 4.74,
    drips: [
      { side: 0.38, up: 4.11, fwd: 0.24 },
      { side: -0.34, up: 4.11, fwd: 0.29 },
      { side: -0.22, up: 4.41, fwd: -0.05 },
      { side: 1.01, up: 2.23, fwd: 0.17 },
      { side: -0.5, up: 1.22, fwd: 1.92 },
    ],
    chest: { side: 0, up: 2.96, fwd: 0.42 },
    eyes: { side: 0.03, up: 4.0, fwd: 0.45 },
  },
  // The watchman: water off the kettle hat's drooping brim all round, the
  // halberd's head and the lantern at his hip.
  drowned_watchman: {
    rawHeight: 4.946,
    drips: [
      { side: 0.59, up: 4.06, fwd: 0.08 },
      { side: 0.02, up: 4.11, fwd: 0.7 },
      { side: -0.58, up: 4.08, fwd: 0.1 },
      { side: -0.36, up: 4.46, fwd: 1.61 },
      { side: -0.01, up: 4.12, fwd: -0.52 },
      { side: 0.56, up: 2.16, fwd: 0.09 },
    ],
    chest: { side: 0, up: 2.97, fwd: 0.51 },
    eyes: { side: 0.01, up: 4.17, fwd: 0.31 },
  },
  // The arbalest: water off the sodden mantle's shoulders and back and the
  // crossbow's nose carried low.
  fogbound_arbalest: {
    rawHeight: 4.253,
    drips: [
      { side: 0.52, up: 2.91, fwd: 0.04 },
      { side: 0.22, up: 1.58, fwd: 0.98 },
      { side: -0.5, up: 2.91, fwd: 0.04 },
      { side: 0.01, up: 3.12, fwd: -0.33 },
    ],
    chest: { side: 0.01, up: 2.66, fwd: 0.48 },
    eyes: { side: 0.08, up: 3.72, fwd: 0.77 },
  },
  // The war mastiff: water off its jaws, the collar's ring and the snapped chain.
  bastion_warhound: {
    rawHeight: 4.4,
    drips: [
      { side: 0, up: 3.06, fwd: 3.7 },
      { side: 0, up: 2.98, fwd: 2.1 },
      { side: 0, up: 2.26, fwd: 2.11 },
      { side: 0.55, up: 2.6, fwd: 1.6 },
    ],
    chest: { side: 0, up: 2.4, fwd: 1.9 },
    eyes: { side: 0, up: 3.75, fwd: 3.2 },
  },
};

export function drownedFxSpec(templateId: string | undefined): DrownedFxSpec | null {
  return templateId ? (DROWNED_FX[templateId] ?? null) : null;
}

/** Bodies farther than this from the player shed their ambient drips (the
 *  hit, rush and death effects still play anywhere in view). */
export const DRIP_RANGE = 45;
/** Seconds between drips off one body (a single drop each time, from the
 *  next anchor in turn). */
export const DRIP_INTERVAL = 0.2;
/** Displayed ground speed over its own run speed above which a body is
 *  rushing (the Onrush dash runs at three times its move speed). */
export const RUSH_SPEED_RATIO = 1.7;
/** Seconds between spray bursts off the boots while it rushes. */
export const RUSH_SPRAY_INTERVAL = 0.06;

/** The next drip anchor after `index` (cycling through the body's anchors). */
export function nextDripIndex(index: number, spec: DrownedFxSpec): number {
  const n = spec.drips.length;
  return n === 0 ? 0 : (index + 1) % n;
}

/** Whether a body that moved (dx, dz) yards over `dt` seconds is rushing,
 *  for a template whose plain run speed is `moveSpeed` yards a second. */
export function isRushing(dx: number, dz: number, dt: number, moveSpeed: number): boolean {
  if (dt <= 1e-4 || moveSpeed <= 0) return false;
  const speed = Math.hypot(dx, dz) / dt;
  return speed > moveSpeed * RUSH_SPEED_RATIO;
}

/** The unit ground direction a blow from (fromX, fromZ) throws brine off a
 *  body at (x, z): away from the attacker, or along `facing`'s back when the
 *  two stand on the same spot. Writes into `out`. */
export function sprayDirection(
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  facing: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  let dx = x - fromX;
  let dz = z - fromZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) {
    dx = -Math.sin(facing);
    dz = -Math.cos(facing);
  } else {
    dx /= len;
    dz /= len;
  }
  out.x = dx;
  out.z = dz;
  return out;
}

/** How many spray droplets a blow throws: a scratch a few, a crit a fountain.
 *  Scaled by the effects density (1 full, lower on the low tier). */
export function hitSprayCount(crit: boolean, density: number): number {
  const base = crit ? 22 : 12;
  return Math.max(3, Math.round(base * density));
}

/** The death gush's particle budget, by effects density. */
export function deathBurstCounts(density: number): { brine: number; mist: number; motes: number } {
  return {
    brine: Math.max(10, Math.round(46 * density)),
    mist: Math.max(4, Math.round(10 * density)),
    motes: Math.max(4, Math.round(14 * density)),
  };
}
