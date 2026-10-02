// The Stormbrass Foundry's working machinery (docs/design/dungeon-rework/
// stormbrass_foundry.md, section 7): the boilers, engine houses, smokestacks,
// the pour line's furnace and gantry legs and crate stacks standing on the
// walkways (the chained workers' camp pieces are stormbrass_foundry_workers.ts). Each is a collider the size of the
// kit piece the renderer draws over it (src/render/stormbrass_foundry/
// foundry_kit_plan_core.ts), set back against the terraces' edges, clear of
// every pack, patrol, gate and the route (tests/stormbrass_foundry_kit.test.ts
// and tests/stormbrass_foundry_route.test.ts hold it).
//
// Pure data, merged into the field's props by stormbrass_foundry_layout.ts.

import type { FieldProp } from '../instances/authored_field/types';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;

/** A horizontal boiler on its cradles (hw along its barrel). */
function boiler(x: number, z: number, rot: number): FieldProp {
  return { kind: 'sf_boiler', x, z, rot, hw: 4.1, hd: 1.9, h: 5 };
}

/** An engine house block with its flywheel on the local +x side. */
function engine(x: number, z: number, rot: number): FieldProp {
  return { kind: 'sf_machine_block', x, z, rot, hw: 3.8, hd: 2.2, h: 4.5 };
}

function stack(x: number, z: number): FieldProp {
  return { kind: 'sf_smokestack', x, z, rot: 0, r: 1.5, h: 24 };
}

function crates(x: number, z: number, rot: number): FieldProp {
  return { kind: 'sf_crate_stack', x, z, rot, hw: 1.7, hd: 1.2, h: 2.8 };
}

function piston(x: number, z: number, rot: number): FieldProp {
  return { kind: 'sf_piston_engine', x, z, rot, hw: 1.6, hd: 1.3, h: 4.5 };
}

function target(x: number, z: number, rot: number): FieldProp {
  return { kind: 'sf_target_frame', x, z, rot, hw: 1.6, hd: 0.3, h: 3 };
}

/** A small storm coil on a rim (a winding on insulator legs, a glow on top). */
function stormCoil(x: number, z: number): FieldProp {
  return { kind: 'sf_storm_coil', x, z, rot: 0, r: 1, h: 6.5 };
}

/** The pour line on the crane pad: the furnace on the west lip (its mouth to
 *  the east, its hood carrying the rail's west end) and the gantry post that
 *  carries the ladles' rail at its east end, high over every head. */
export const FOUNDRY_POUR_LINE = {
  furnace: { x: -37, z: -72 },
  /** The ladle rail's run along x, its height over the crane pad floor. */
  railZ: -72,
  railX0: -33,
  railX1: -9,
  railLift: 10,
  posts: [-9] as const,
} as const;

export const FOUNDRY_MACHINERY_PROPS: readonly FieldProp[] = [
  // ---- The Rail Yard: boilers and stacks on the south lip, engine houses on
  // the east and west lips, crate stacks by the sidings. (The chained workers'
  // camps are the workers module's props, stormbrass_foundry_workers.ts: camp A
  // works the south-east corner, so the east engine house stands north of it.)
  boiler(-20, -186.5, 0),
  boiler(20, -186.5, 0),
  stack(-12.5, -188),
  stack(12.5, -188),
  engine(51, -164, WEST),
  engine(-51, -176, EAST),
  crates(-52, -142, EAST),
  crates(52, -150, EAST),
  // The yard gantry spanning the Hauler's loop: its two leg bogies (the
  // gantry itself is one render piece over them).
  { kind: 'sf_gantry_leg', x: -27, z: -160, rot: 0, hw: 1.8, hd: 3.1, h: 16 },
  { kind: 'sf_gantry_leg', x: 27, z: -160, rot: 0, hw: 1.8, hd: 3.1, h: 16 },
  // ---- The Assembly Terraces: the parts line's engine house, the boiler and
  // piston engine on its south lip, and the pour line on the crane pad.
  engine(-36, -100, EAST),
  boiler(22, -112, 0),
  stack(30, -111.5),
  piston(12, -112.2, 0),
  crates(37, -99, 0),
  {
    kind: 'sf_furnace',
    x: FOUNDRY_POUR_LINE.furnace.x,
    z: FOUNDRY_POUR_LINE.furnace.z,
    rot: EAST,
    hw: 5,
    hd: 3,
    h: 14,
  },
  ...FOUNDRY_POUR_LINE.posts.map(
    (x): FieldProp => ({
      kind: 'sf_pour_frame',
      x,
      z: FOUNDRY_POUR_LINE.railZ,
      rot: 0,
      hw: 0.7,
      hd: 1.1,
      h: 10,
    }),
  ),
  engine(33, -61, 0),
  boiler(-24, -60.5, 0),
  stack(-15, -60.2),
  // ---- The Main Line: the parts chute's two leg frames on the south lip's
  // corners (the hopper they carry spans the belts, high over every head).
  { kind: 'sf_chute_leg', x: -23.45, z: -42.85, rot: 0, hw: 0.5, hd: 1.1, h: 9.5 },
  { kind: 'sf_chute_leg', x: 23.45, z: -42.85, rot: 0, hw: 0.5, hd: 1.1, h: 9.5 },
  // ---- The Crane Landing behind the press: the bridge crane's engine house.
  engine(19.5, 7, 0),
  crates(-21, 8, 0),
  // ---- The Range Lanes: target frames down the lanes (west of the workers'
  // camp B at -76, -70) and a crate stack.
  target(-92, -73.5, 0),
  target(-86, -73.5, 0),
  target(-64, -73.5, 0),
  crates(-101.5, -50, EAST),
  // ---- The Proving Range: the range officer's observation post in the
  // south-east corner, behind the firing line.
  { kind: 'sf_observation_post', x: -55.5, z: -16.5, rot: WEST, hw: 2.1, hd: 2.2, h: 9 },
  // ---- The Drafting Yard: a boiler, a stack and an engine house on the north
  // lip, crate stacks by the steam vents, one more model frame.
  boiler(-44, 95.8, EAST),
  stack(-46, 87),
  engine(44, 95.5, WEST),
  crates(-46, 60, EAST),
  crates(46, 60, EAST),
  { kind: 'sf_model_frame', x: -14, z: 95, rot: 0.3, hw: 2, hd: 2, h: 7 },
  // The plan tables' two work lamps.
  { kind: 'sf_work_lamp', x: -30, z: 84, rot: 0, r: 0.6, h: 4 },
  { kind: 'sf_work_lamp', x: 30, z: 84, rot: 0, r: 0.6, h: 4 },
  // ---- The Gantry Approach: a boiler by the
  // catwalk, an engine house and its stack by the stair, a crate stack.
  boiler(-24, 165.6, 0),
  engine(24, 120, 0),
  stack(32.5, 119.5),
  crates(42.5, 150, EAST),
  // ---- The Gantry: two great stacks flanking the scaffold, a storm coil
  // either side of the catwalk's mouth.
  stack(-18.5, 218),
  stack(18.5, 218),
  stormCoil(-20.5, 193.5),
  stormCoil(20.5, 193.5),
  // ---- The Coil Crown: storm coils on the rim between the lightning rods.
  stormCoil(105, 14),
  stormCoil(82, 37),
  stormCoil(59, 14),
];
