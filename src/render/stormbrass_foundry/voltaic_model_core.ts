// The Voltaic Warden's Blender body, measured (scripts/assets/foundry_voltaic_warden,
// its delivery notes): the facts the look (characters/foundry_creature_looks.ts),
// the plate dials (foundry_creature_fx_core.ts) and the boss effects
// (foundry_creature_fx.ts: the coil arcs, the Discharge, the Static Lash, the
// drone launch) key on.
//
// Model space: yards at the authored size, glTF axes: +Y up, the Warden faces
// +Z, its LEFT is +X, the origin on the ground between its feet. Clip times
// are seconds at 1x (24 fps authoring; frame 0 is t = 0 in the GLB).
//
// Three-free, DOM-free, deterministic.

/** The template's sim scale (sim/content/stormbrass_foundry.ts voltaic_warden). */
export const VOLTAIC_SIM_SCALE = 2.4;

/** In-game yards per model yard: drawn at its authored size, 10.9 yd to the
 *  crown spire's tip, 9.1 to the top of the helm (three and a half players). */
export const VOLTAIC_DRAWN_SCALE = 1;

export const VOLTAIC_MODEL = {
  url: 'models/creatures/foundry_voltaic_warden.glb',
  /** The Idle pose's skinned bounds, the floor (0.00) to the spire's tip: what
   *  prepareVisual normalizes to the def height. */
  idleBoundsHeight: 10.92,
  /** The top of the helm (the body's own height under the crown). */
  helmTop: 9.1,
  /** The storm coil in the chest: its glass cylinder's centre, the Discharge's
   *  origin and the coil arcs' root (rest: up, forward). */
  coil: { up: 6.42, forward: 1.27 },
  /** The crown: the toroid's centre and the discharge spire's tip (behind the
   *  head: forward is negative). */
  crownToroid: { up: 10.0, forward: -1.95, radius: 0.9 },
  crownSpire: { up: 10.82, forward: -1.95 },
  /** The drone bay doors on the back housing (HatchL, HatchR): |x| out, up,
   *  forward (behind), where the drones leave on LaunchDrones' jolt. */
  droneBay: { x: 0.5, up: 7.6, forward: -2.7 },
  /** The RIGHT palm (its right is -x) where StaticLash's whip leaves it at the
   *  bar's end (1.00 s of the clip): x, up, forward. */
  lashPalm: { x: -1.4, up: 5.6, forward: 3.55 },
  /** The gaits' reference speeds (planted feet slide at these). */
  walkRef: 2.0,
  runRef: 5.0,
} as const;

/** The clips' contact beats (seconds at 1x). */
export const VOLTAIC_CLIP = {
  /** Backhand: the right fist lands at 0.72. HammerFists: the slam at 1.05. */
  backhandLand: 0.72,
  hammerLand: 1.05,
  /** StaticLash (the 1 s bar): the lash leaves the right palm at 1.00. */
  lashRelease: 1.0,
  /** FlipRattle (the 3 s bar): the rattle builds to 1.90, every plate pushes
   *  out on its mount 1.90 to 2.22, turns by 2.72 and seats at 2.90. */
  flipPushOut: 1.9,
  flipTurnStart: 2.22,
  flipTurnEnd: 2.72,
  flipSeat: 2.9,
  /** CallStorm: the strike is called at 1.50. Discharge: the release at 1.05. */
  stormCall: 1.5,
  dischargeRelease: 1.05,
  /** LaunchDrones: the hatches open 0.25 to 0.70, the launch jolt at 0.95. */
  dronesJolt: 0.95,
  /** Death: the emissive dies 0.4 to 2.4, at rest (crouched) from 3.00. */
  deathGlowOut: 2.4,
  deathRest: 3.0,
} as const;

export type VoltaicPlateHalf = 'front' | 'back';

/** The twelve reversible plates: bone `Plate_<Name>` (child of
 *  `PlateMount_<Name>`), which turns half a turn about its own local +Y to
 *  show its blue face. On heroic Split Plating the front group (chest,
 *  shoulder fronts, forearms) and the back group (back, shoulder backs, upper
 *  arms) wear opposite faces. */
export const VOLTAIC_PLATE_NAMES: readonly (readonly [string, VoltaicPlateHalf])[] = (
  [
    ['Chest', 'front'],
    ['ShoulderFront', 'front'],
    ['Forearm', 'front'],
    ['Back', 'back'],
    ['ShoulderBack', 'back'],
    ['UpperArm', 'back'],
  ] as const
).flatMap(([name, half]) => [[`${name}L`, half] as const, [`${name}R`, half] as const]);

/** A plate's dial bone. */
export function voltaicPlateBone(name: string): string {
  return `Plate_${name}`;
}

/** The def height that draws the model at VOLTAIC_DRAWN_SCALE at sim `scale`. */
export function voltaicLookHeight(scale = VOLTAIC_SIM_SCALE): number {
  return (VOLTAIC_MODEL.idleBoundsHeight * VOLTAIC_DRAWN_SCALE) / scale;
}

/** In-game yards per model yard for the Warden drawn at sim `scale`. */
export function voltaicModelScale(scale: number): number {
  return (VOLTAIC_DRAWN_SCALE * scale) / VOLTAIC_SIM_SCALE;
}

/**
 * The seconds into the flip bar at which the plates turn to their NEXT face:
 * the clip has pushed every plate out on its mount by then (flipTurnStart), so
 * the dial's half turn clears the armour and is done as the mounts seat. The
 * clip's own plate rotation is dropped (characters/clip_track_drops.ts): the
 * dial is the plates' one owner, so a flip cut short (the Warden stunned mid
 * bar) leaves them on the face the aura still names.
 */
export function voltaicFlipTurned(castElapsed: number): boolean {
  return castElapsed >= VOLTAIC_CLIP.flipTurnStart;
}
