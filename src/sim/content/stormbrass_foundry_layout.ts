// The Stormbrass Foundry (docs/design/dungeon-rework/stormbrass_foundry.md): a
// NEW open-air five-player dungeon on the storm line of Stormcrag, Varkhul's
// first foundry and proving ground. Brass, steam and blue-white lightning
// under a storm sky in daylight. Every walkway is a terrace, stair, catwalk or
// bridge standing on the mountain shelf; the void between them is the mountain
// drop, sealed by the generated cliffs.
//
// Route (z forward, heights in yards):
//   the Lift Landing (12; the cable lift arrives) -> the Lift Stair -> the Rail
//   Yard (0; G1, G2, patrol A: the Gantry Hauler) -> the Yard Shutter -> the
//   Assembly Terraces (4 and 8; G3 on the parts line, G4 on the crane pad) ->
//   the Line Shutter -> the Main Line (8; Line-Master Ambrel Tock on four
//   conveyor belts running into the Stamping Press; the Crane Landing behind
//   the press) -> BOTH wings in either order:
//     west, the Range Shutter -> the Range Lanes (10; G5, G6, patrol B) -> the
//     Range Arc Fence -> the Proving Range (10; the Rangewarden);
//     east, the Coil Shutter -> the Coil Stair (10 to 40; G7 on the first
//     switchback, G8 on the upper landing, patrol C) -> the Coil Arc Fence ->
//     the Coil Crown (40; the Voltaic Warden, the great coil);
//   -> the Crane Bridge (swings out once BOTH wing bosses are dead) -> the
//   Drafting Yard (20; G9, G10, G11) -> the Gantry Approach (25; G12, G13,
//   patrol D) -> the Gantry Arc Fence -> the Gantry (25; the Prime Draft in
//   its scaffold, the two storm cell charging racks).
//
// Engine limit: ONE floor height per point, so every bridge and catwalk spans
// open air beside the ground it looks onto, never over a floor.
//
// The whole walkable field stays inside the instance slot's footprint
// (|x| < 115, |z| < 245): the claim, the trash kit and the gates count a
// player as "inside" only within |x| < 120 and |z| < 250 of the origin.
//
// Pure data: the sim (height, collision, spawns, gates, encounters) and the
// renderer (terrain, set dressing, light) all read this one record.

import type { AuthoredFieldDef, FieldProp, FieldSurface } from '../instances/authored_field/types';
import { FOUNDRY_MACHINERY_PROPS } from './stormbrass_foundry_machinery';
import { foundryWorkerCampProps } from './stormbrass_foundry_workers';

/** The mountain drop under the shelf (the void between the walkways). */
export const STORMBRASS_FOUNDRY_VOID_HEIGHT = -80;

function rect(
  id: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  extra: Partial<Pick<FieldSurface, 'edge' | 'ground'>> = {},
): FieldSurface {
  return {
    kind: 'poly',
    id,
    points: [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ],
    h,
    ...extra,
  };
}

/** Named anchors: spawns, dev teleports and the renderer's set pieces. */
export const STORMBRASS_FOUNDRY_ANCHORS = {
  entry: { x: 0, z: -226 },
  exit: { x: 0, z: -232 },
  landing: { x: 0, z: -224 },
  railYard: { x: 0, z: -160 },
  terraceLow: { x: 0, z: -100 },
  terraceHigh: { x: 0, z: -68 },
  mainLine: { x: 0, z: -26 },
  craneLanding: { x: 0, z: 5 },
  rangeLanes: { x: -76, z: -52 },
  provingRange: { x: -82, z: -4 },
  coilLanding: { x: 60, z: -44 },
  coilUpper: { x: 102, z: -60 },
  coilCrown: { x: 82, z: 14 },
  draftingYard: { x: 0, z: 72 },
  approach: { x: 0, z: 142 },
  gantry: { x: 0, z: 205 },
} as const;

/** The Lift Landing where the cable lift arrives (the first vista). */
export const LIFT_LANDING = { x: 0, z: -224, r: 11, h: 12 } as const;
/** The cable-lift station: off the landing's EAST rim on its own pier, its
 *  gate turned to the landing (behind the arrival it stood between the camera
 *  and the first vista). The renderer draws the kit's station here and the
 *  collider below closes the rim under its gate. */
export const LIFT_STATION = {
  x: LIFT_LANDING.x + LIFT_LANDING.r + 2.6,
  z: LIFT_LANDING.z,
  rot: -Math.PI / 2,
} as const;
/** The Rail Yard: rails, carts and brass plate stacks, the Hauler's loop. */
export const RAIL_YARD = { x0: -55, z0: -190, x1: 55, z1: -128, h: 0 } as const;

/**
 * The Main Line, Line-Master Tock's arena: four parallel conveyor belts (5 yd
 * wide) running north from the parts chute into the Stamping Press, steel
 * walkways between them, and the Crane Landing behind the press.
 */
export const MAIN_LINE = { x0: -24, z0: -44, x1: 24, z1: 10, h: 8 } as const;
/** The belts: their centre lines (x), half width, and the run from the chute
 *  (z0) to the press (z1). Phase 2's conveyor regions (G19) read these; the
 *  renderer draws the belts and their chevrons from the same numbers. */
export const MAIN_LINE_BELTS = {
  xs: [-15, -5, 5, 15] as const,
  halfWidth: 2.5,
  z0: -42,
  z1: -7,
} as const;
/** The Stamping Press straddling the belts' north end: its frame posts stand
 *  on the walkways, one hammer hangs over each belt's last 8 yd. */
export const STAMPING_PRESS = {
  z: -4,
  postXs: [-20, -10, 0, 10, 20] as const,
  postR: 1.3,
} as const;
/** The parts chute over the belts' south end (render; Parts Drop in phase 2). */
export const PARTS_CHUTE = { x: 0, z: -43 } as const;

/** The Proving Range, the Rangewarden's arena: a long open range. */
export const PROVING_RANGE = { x0: -112, z0: -20, x1: -52, z1: 12, h: 10 } as const;
/** The Proving Range's two bunkers (low walls running north to south, the
 *  long side facing the berm): the Rangewarden's shells burst on them instead
 *  of the ground in their lee (phase 2's cover). Half length along z, half
 *  depth along x, height. */
export const RANGE_BUNKERS: readonly { x: number; z: number; hw: number; hd: number; h: number }[] =
  [
    { x: -70, z: -8, hw: 3.5, hd: 1, h: 1.6 },
    { x: -96, z: 2, hw: 3.5, hd: 1, h: 1.6 },
  ];
/** The berm of turret emplacements along the Proving Range's far (west) side,
 *  where the Rangewarden's shells are fired from. */
export const RANGE_BERM = { x: -109, zs: [-14, -4, 6] as const } as const;
/** The Coil Crown, the Voltaic Warden's round platform on the storm-coil tower. */
export const COIL_CROWN = { x: 82, z: 14, r: 26, h: 40 } as const;
/** The great coil in the crown's centre (render hero piece, a collider). */
export const GREAT_COIL = { x: 82, z: 14, r: 3.5 } as const;
/** The Voltaic Warden's dais on the crown, under its spawn, sized to it. */
export const VOLTAIC_DAIS = { x: 82, z: 24, r: 6, rise: 0.4 } as const;
/** The Drafting Yard: giant blueprint tables and model frames. */
export const DRAFTING_YARD = { x0: -50, z0: 44, x1: 50, z1: 100, h: 20 } as const;
/** The Gantry Approach: crane yards and cell racks. */
export const GANTRY_APPROACH = { x0: -45, z0: 116, x1: 45, z1: 168, h: 25 } as const;
/** The Gantry, the Prime Draft's assembly bay on the shelf's north edge. */
export const GANTRY = { x: 0, z: 205, r: 25, h: 25 } as const;
/** Where the Prime Draft stands in its scaffold (the landmark and the boss). */
export const PRIME_DRAFT_SPOT = { x: 0, z: 213 } as const;
/** The Prime Draft's assembly dais in the Gantry, under its scaffold spot. */
export const PRIME_DRAFT_DAIS = { x: 0, z: 213, r: 7.5, rise: 0.4 } as const;
/** The two storm cell charging racks, west and east (phase 2's Charge Cycle). */
export const CELL_RACKS: readonly { x: number; z: number }[] = [
  { x: -19, z: 204 },
  { x: 19, z: 204 },
];

/** The Crane Bridge from the Crane Landing to the Drafting Yard: it swings
 *  out and extends once both wing bosses are dead (walkable only then). Its
 *  ramp ends ON the yard's south lip (DRAFTING_YARD.z0), so the flat run that
 *  closes the path lies inside the yard (a ramp ending short of it left a
 *  walkable band the gate's deck never drew: the void showed through). */
export const CRANE_BRIDGE = {
  x: 0,
  fromZ: 8,
  toZ: DRAFTING_YARD.z0,
  fromH: 8,
  toH: 20,
  halfWidth: 4.5,
} as const;

const SURFACES: FieldSurface[] = [
  // --- The Lift Landing: the cable lift's brass station on the shelf's lip ------
  {
    kind: 'circle',
    id: 'lift_landing',
    x: LIFT_LANDING.x,
    z: LIFT_LANDING.z,
    r: LIFT_LANDING.r,
    h: LIFT_LANDING.h,
    edge: 'balustrade',
    ground: 'plate',
  },
  // --- The Lift Stair down to the Rail Yard --------------------------------------
  {
    kind: 'path',
    id: 'lift_stair',
    points: [
      [0, -216, 12],
      [0, -212, 12],
      [0, -194, 0],
      [0, -186, 0],
    ],
    halfWidth: 5,
    stairs: true,
    edge: 'balustrade',
    ground: 'grating',
  },
  // --- The Rail Yard (G1, G2, patrol A: the Gantry Hauler) ------------------------
  rect('rail_yard', RAIL_YARD.x0, RAIL_YARD.z0, RAIL_YARD.x1, RAIL_YARD.z1, RAIL_YARD.h, {
    edge: 'rock',
    ground: 'soot',
  }),
  // --- The Yard Stair up to the Assembly Terraces (the Yard Shutter across it) ----
  {
    kind: 'path',
    id: 'yard_stair',
    points: [
      [0, -132, 0],
      [0, -128, 0],
      [0, -118, 4],
      [0, -110, 4],
    ],
    halfWidth: 6,
    stairs: true,
    edge: 'masonry',
    ground: 'soot',
  },
  // --- The Assembly Terraces: the parts line (G3) and the crane pad (G4) ----------
  rect('terrace_parts_line', -40, -114, 40, -88, 4, { edge: 'masonry', ground: 'plate' }),
  {
    kind: 'path',
    id: 'terrace_stair',
    points: [
      [0, -92, 4],
      [0, -88, 4],
      [0, -80, 8],
      [0, -76, 8],
    ],
    halfWidth: 6,
    stairs: true,
    edge: 'masonry',
    ground: 'soot',
  },
  rect('terrace_crane_pad', -40, -80, 40, -58, 8, { edge: 'masonry', ground: 'plate' }),
  // --- The Line Catwalk into the Main Line (the Line Shutter across it) ------------
  {
    kind: 'path',
    id: 'line_catwalk',
    points: [
      [0, -62, 8],
      [0, -40, 8],
    ],
    halfWidth: 5,
    edge: 'balustrade',
    ground: 'grating',
  },
  // --- The Main Line and the Crane Landing behind the press (Line-Master Tock) ---
  rect('main_line', MAIN_LINE.x0, MAIN_LINE.z0, MAIN_LINE.x1, MAIN_LINE.z1, MAIN_LINE.h, {
    edge: 'masonry',
    ground: 'plate',
  }),
  // --- West: the Range Catwalk and the Range Lanes (G5, G6, patrol B) -------------
  {
    kind: 'path',
    id: 'range_catwalk',
    points: [
      [-20, -36, 8],
      [-26, -36, 8],
      [-44, -40, 10],
      [-52, -40, 10],
    ],
    halfWidth: 5,
    stairs: true,
    edge: 'balustrade',
    ground: 'grating',
  },
  rect('range_lanes', -104, -76, -48, -30, 10, { edge: 'rock', ground: 'earth' }),
  {
    kind: 'path',
    id: 'range_gate_walk',
    points: [
      [-78, -34, 10],
      [-78, -16, 10],
    ],
    halfWidth: 5,
    edge: 'balustrade',
    ground: 'grating',
  },
  // --- The Proving Range (the Rangewarden) ----------------------------------------
  rect(
    'proving_range',
    PROVING_RANGE.x0,
    PROVING_RANGE.z0,
    PROVING_RANGE.x1,
    PROVING_RANGE.z1,
    PROVING_RANGE.h,
    { edge: 'rock', ground: 'earth' },
  ),
  // --- East: the Coil Catwalk and the Coil Stair (G7, G8, patrol C) ---------------
  {
    kind: 'path',
    id: 'coil_catwalk',
    points: [
      [20, -36, 8],
      [26, -36, 8],
      [44, -40, 10],
      [53, -43, 10],
    ],
    halfWidth: 5,
    stairs: true,
    edge: 'balustrade',
    ground: 'grating',
  },
  {
    kind: 'circle',
    id: 'coil_landing',
    x: 60,
    z: -44,
    r: 10,
    h: 10,
    edge: 'rock',
    ground: 'plate',
  },
  {
    kind: 'path',
    id: 'coil_stair_lower',
    points: [
      [64, -50, 10],
      [67, -53, 10],
      [92, -64, 24],
      [96, -64, 24],
    ],
    halfWidth: 5,
    stairs: true,
    edge: 'balustrade',
    ground: 'grating',
  },
  {
    kind: 'circle',
    id: 'coil_upper_landing',
    x: 102,
    z: -60,
    r: 9,
    h: 24,
    edge: 'rock',
    ground: 'plate',
  },
  {
    kind: 'path',
    id: 'coil_stair_upper',
    points: [
      [100, -52, 24],
      [99, -47, 24],
      [90, -15, 40],
      [87, -4, 40],
    ],
    halfWidth: 5,
    stairs: true,
    edge: 'balustrade',
    ground: 'grating',
  },
  // --- The Coil Crown (the Voltaic Warden) -----------------------------------------
  {
    kind: 'circle',
    id: 'coil_crown',
    x: COIL_CROWN.x,
    z: COIL_CROWN.z,
    r: COIL_CROWN.r,
    h: COIL_CROWN.h,
    edge: 'balustrade',
    ground: 'plate',
  },
  {
    kind: 'circle',
    id: 'voltaic_dais',
    x: VOLTAIC_DAIS.x,
    z: VOLTAIC_DAIS.z,
    r: VOLTAIC_DAIS.r,
    h: COIL_CROWN.h + VOLTAIC_DAIS.rise,
    edge: 'masonry',
    ground: 'flagstone',
  },
  // --- The Crane Bridge (walkable once extended, drawn by its gate) --------------
  {
    kind: 'path',
    id: 'crane_bridge',
    hidden: true,
    points: [
      [CRANE_BRIDGE.x, CRANE_BRIDGE.fromZ - 4, CRANE_BRIDGE.fromH],
      [CRANE_BRIDGE.x, CRANE_BRIDGE.fromZ, CRANE_BRIDGE.fromH],
      [CRANE_BRIDGE.x, CRANE_BRIDGE.toZ, CRANE_BRIDGE.toH],
      [CRANE_BRIDGE.x, CRANE_BRIDGE.toZ + 8, CRANE_BRIDGE.toH],
    ],
    halfWidth: CRANE_BRIDGE.halfWidth,
    edge: 'balustrade',
    ground: 'grating',
  },
  // --- The Drafting Yard (G9, G10, G11) -------------------------------------------
  rect(
    'drafting_yard',
    DRAFTING_YARD.x0,
    DRAFTING_YARD.z0,
    DRAFTING_YARD.x1,
    DRAFTING_YARD.z1,
    DRAFTING_YARD.h,
    { edge: 'masonry', ground: 'soot' },
  ),
  {
    kind: 'path',
    id: 'approach_stair',
    points: [
      [0, 96, 20],
      [0, 100, 20],
      [0, 112, 25],
      [0, 120, 25],
    ],
    halfWidth: 6,
    stairs: true,
    edge: 'masonry',
    ground: 'soot',
  },
  // --- The Gantry Approach (G12, G13, patrol D) -----------------------------------
  rect(
    'gantry_approach',
    GANTRY_APPROACH.x0,
    GANTRY_APPROACH.z0,
    GANTRY_APPROACH.x1,
    GANTRY_APPROACH.z1,
    GANTRY_APPROACH.h,
    { edge: 'masonry', ground: 'plate' },
  ),
  {
    kind: 'path',
    id: 'gantry_catwalk',
    points: [
      [0, 164, 25],
      [0, 184, 25],
    ],
    halfWidth: 6,
    edge: 'balustrade',
    ground: 'grating',
  },
  // --- The Gantry (the Prime Draft) -----------------------------------------------
  {
    kind: 'circle',
    id: 'gantry',
    x: GANTRY.x,
    z: GANTRY.z,
    r: GANTRY.r,
    h: GANTRY.h,
    edge: 'masonry',
    ground: 'plate',
  },
  {
    kind: 'circle',
    id: 'prime_draft_dais',
    x: PRIME_DRAFT_DAIS.x,
    z: PRIME_DRAFT_DAIS.z,
    r: PRIME_DRAFT_DAIS.r,
    h: GANTRY.h + PRIME_DRAFT_DAIS.rise,
    edge: 'masonry',
    ground: 'flagstone',
  },
];

const PROPS: FieldProp[] = [
  // The Lift Landing: the cable-lift station off the east rim (the lift
  // cage, its winch house and the lightning rod on its roof). The collider is
  // its gate front, from the rim out (the rest hangs over the drop).
  {
    kind: 'sf_lift_station',
    x: LIFT_STATION.x,
    z: LIFT_STATION.z,
    rot: LIFT_STATION.rot,
    hw: 6.2,
    hd: 2.6,
    h: 20,
  },
  { kind: 'sf_work_lamp', x: -8, z: -218, rot: 0, r: 0.6, h: 4 },
  { kind: 'sf_work_lamp', x: 8, z: -218, rot: 0, r: 0.6, h: 4 },
  // The Rail Yard: the cart line (G1's side) and the brass plate stacks (G2's).
  { kind: 'sf_rail_cart', x: -46, z: -164, rot: 0, hw: 1.6, hd: 3, h: 2.6 },
  { kind: 'sf_rail_cart', x: -46, z: -136, rot: 0, hw: 1.6, hd: 3, h: 2.6 },
  { kind: 'sf_plate_stack', x: 47, z: -166, rot: 0.3, hw: 2.4, hd: 1.6, h: 3.2 },
  { kind: 'sf_plate_stack', x: 47, z: -138, rot: -0.2, hw: 2.4, hd: 1.6, h: 2.4 },
  { kind: 'sf_steam_vent', x: -30, z: -186, rot: 0 },
  { kind: 'sf_steam_vent', x: 30, z: -186, rot: 0 },
  { kind: 'sf_water_tower', x: -50, z: -186, rot: 0, r: 2.8, h: 12 },
  // The Assembly Terraces: the parts line and the cranes.
  { kind: 'sf_parts_line', x: -24, z: -110, rot: Math.PI / 2, hw: 1.2, hd: 12, h: 1.4 },
  { kind: 'sf_crane_base', x: 34, z: -106, rot: 0, r: 2, h: 16 },
  { kind: 'sf_crane_base', x: -34, z: -64, rot: 0, r: 2, h: 16 },
  { kind: 'sf_steam_vent', x: 38, z: -92, rot: 0 },
  { kind: 'sf_grinder', x: 30, z: -76, rot: 0.5, r: 0.9, h: 1.6 },
  // The Main Line: the Stamping Press frame (posts on the walkways, the belts
  // run under it), the parts chute and the steam vents along its edges.
  ...STAMPING_PRESS.postXs.map(
    (x): FieldProp => ({
      kind: 'sf_press_post',
      x,
      z: STAMPING_PRESS.z,
      rot: 0,
      r: STAMPING_PRESS.postR,
      h: 14,
    }),
  ),
  { kind: 'sf_parts_chute', x: PARTS_CHUTE.x, z: PARTS_CHUTE.z, rot: 0 },
  { kind: 'sf_steam_vent', x: -23, z: -30, rot: 0 },
  { kind: 'sf_steam_vent', x: 23, z: -30, rot: 0 },
  { kind: 'sf_steam_vent', x: -23, z: -14, rot: 0 },
  { kind: 'sf_steam_vent', x: 23, z: -14, rot: 0 },
  // The Crane Landing: the bridge crane's winch at the gulf's lip.
  { kind: 'sf_crane_base', x: -14, z: 6, rot: 0, r: 2, h: 18 },
  // The Range Lanes: the bunkers (low walls) and the first target frames.
  { kind: 'sf_bunker', x: -88, z: -48, rot: 0, hw: 5, hd: 1, h: 1.6 },
  { kind: 'sf_bunker', x: -62, z: -64, rot: 0, hw: 4, hd: 1, h: 1.6 },
  { kind: 'sf_target_frame', x: -100, z: -72, rot: 0.2, hw: 1.6, hd: 0.3, h: 3 },
  { kind: 'sf_target_frame', x: -52, z: -72, rot: -0.2, hw: 1.6, hd: 0.3, h: 3 },
  // The Proving Range: bunkers across the range, target frames, and the berm
  // of turret emplacements along the far (west) side.
  ...RANGE_BUNKERS.map(
    (b): FieldProp => ({
      kind: 'sf_bunker',
      x: b.x,
      z: b.z,
      rot: Math.PI / 2,
      hw: b.hw,
      hd: b.hd,
      h: b.h,
    }),
  ),
  { kind: 'sf_target_frame', x: -60, z: 6, rot: 0, hw: 1.6, hd: 0.3, h: 3 },
  { kind: 'sf_target_frame', x: -82, z: -16, rot: 0, hw: 1.6, hd: 0.3, h: 3 },
  ...RANGE_BERM.zs.map(
    (z): FieldProp => ({
      kind: 'sf_turret_berm',
      x: RANGE_BERM.x,
      z,
      rot: Math.PI / 2,
      r: 1.8,
      h: 3,
    }),
  ),
  // The Coil Stair: the pylons at the switchbacks.
  { kind: 'sf_coil_pylon', x: 54, z: -50, rot: 0, r: 1, h: 10 },
  { kind: 'sf_coil_pylon', x: 108, z: -64, rot: 0, r: 1, h: 10 },
  // The Coil Crown: the great coil in the centre and the lightning rods round it.
  { kind: 'sf_great_coil', x: GREAT_COIL.x, z: GREAT_COIL.z, rot: 0, r: GREAT_COIL.r, h: 30 },
  ...[40, 140, 220, 320].map((deg): FieldProp => {
    const a = (deg * Math.PI) / 180;
    return {
      kind: 'sf_lightning_rod',
      x: COIL_CROWN.x + Math.sin(a) * 23.5,
      z: COIL_CROWN.z + Math.cos(a) * 23.5,
      rot: a,
      r: 0.8,
      h: 9,
    };
  }),
  // The Drafting Yard: giant blueprint tables and model frames, the test pit.
  { kind: 'sf_blueprint_table', x: -40, z: 76, rot: 0.1, hw: 4, hd: 2.5, h: 1.3 },
  { kind: 'sf_blueprint_table', x: -18, z: 90, rot: -0.2, hw: 4, hd: 2.5, h: 1.3 },
  { kind: 'sf_model_frame', x: 42, z: 78, rot: 0, hw: 2, hd: 2, h: 7 },
  { kind: 'sf_model_frame', x: 20, z: 92, rot: 0.4, hw: 2, hd: 2, h: 7 },
  { kind: 'sf_steam_vent', x: -46, z: 50, rot: 0 },
  { kind: 'sf_steam_vent', x: 46, z: 50, rot: 0 },
  // The Gantry Approach: the crane yard and the cell racks.
  // Set back to the yard's north lip: camp C holds the old spot.
  { kind: 'sf_crane_base', x: -39, z: 160, rot: 0, r: 2, h: 20 },
  { kind: 'sf_cell_rack_small', x: 40, z: 138, rot: Math.PI / 2, hw: 2.5, hd: 1, h: 3.5 },
  { kind: 'sf_cell_rack_small', x: 40, z: 162, rot: Math.PI / 2, hw: 2.5, hd: 1, h: 3.5 },
  // The Gantry: the scaffold round the Prime Draft and the two charging racks.
  { kind: 'sf_gantry_scaffold', x: 0, z: 228, rot: 0, hw: 11.6, hd: 1.5, h: 34 },
  ...CELL_RACKS.map(
    (r, i): FieldProp => ({
      kind: 'sf_cell_rack',
      x: r.x,
      z: r.z,
      rot: i === 0 ? Math.PI / 2 : -Math.PI / 2,
      hw: 3,
      hd: 1.4,
      h: 5,
    }),
  ),
  // The chained workers' three scrap camps (stormbrass_foundry_workers.ts):
  // the ore seam, the scrap heap, the chain post and the cart at each.
  ...foundryWorkerCampProps(),
];

export const STORMBRASS_FOUNDRY_FIELD: AuthoredFieldDef = {
  key: 'stormbrass_foundry',
  bounds: { minX: -114, maxX: 114, minZ: -240, maxZ: 236 },
  voidHeight: STORMBRASS_FOUNDRY_VOID_HEIGHT,
  cliffStep: 1.1,
  mapVoid: 'mist',
  surfaces: SURFACES,
  walls: [],
  props: [...PROPS, ...FOUNDRY_MACHINERY_PROPS],
  lightZones: [
    { id: 'landing', x: 0, z: -215, r: 40, key: 0xdfe6ee, accent: 0xffd98a, fog: 0x80838a },
    { id: 'yard', x: 0, z: -160, r: 60, key: 0xd8dfe8, accent: 0xffc870, fog: 0x7a7d84 },
    { id: 'terraces', x: 0, z: -85, r: 50, key: 0xd6dde6, accent: 0xffc870, fog: 0x787b82 },
    { id: 'main_line', x: 0, z: -18, r: 40, key: 0xd2dae6, accent: 0xe6c229, fog: 0x767980 },
    { id: 'range', x: -80, z: -30, r: 55, key: 0xd4dbe4, accent: 0xffb15a, fog: 0x767980 },
    { id: 'coil', x: 82, z: -20, r: 60, key: 0xc8d6ee, accent: 0xcfe8ff, fog: 0x6c7584 },
    { id: 'yard_north', x: 0, z: 72, r: 55, key: 0xd4dce8, accent: 0xffd98a, fog: 0x787b82 },
    { id: 'gantry', x: 0, z: 190, r: 60, key: 0xcad6ec, accent: 0xcfe8ff, fog: 0x6e7684 },
  ],
};
