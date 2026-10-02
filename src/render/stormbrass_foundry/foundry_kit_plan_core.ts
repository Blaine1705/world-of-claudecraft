// Pure placement plan for the Stormbrass Foundry kit (docs/design/
// dungeon-rework/stormbrass_foundry.md, section 7; the kit is
// docs/design/dungeon-rework/kit/build_stormbrass_foundry_kit.py): which
// Kit_* piece every sim prop of the layout draws, the edge dressing along the
// generated cliffs (catwalk railings, machinery lips, pipe runs, the Coil
// Crown tower's cladding), the floor dressing (the Hauler's rail loop, the
// belts' housings, the steel catwalks' trusses and piers, knee-high litter,
// the workers' camps), the pour line and the molten channel, and the
// industrial skyline standing in the drop round the shelf, in one list the
// painter (foundry_kit.ts) instances. The pieces that MOVE (crane jibs,
// flywheels, piston rods, ladles) are listed apart (planFoundryMovers), with
// the steam and smoke they breathe (planFoundryEmitters).
//
// The contract (tests/stormbrass_foundry_kit.test.ts audits the shipped GLB
// against the real floor): nothing floats, and nothing taller than a knee
// stands in a walkway's head room without a sim collider under it. A piece
// stands on the floor under its own footprint, rises from the drop, sits on
// a pier or a lip, or hangs from a rail over head height.
//
// Three-free, DOM-free, deterministic.

import { HAULER_LOOP, STORMBRASS_FOUNDRY_SPAWNS } from '../../sim/content/stormbrass_foundry';
import {
  CRANE_BRIDGE,
  LIFT_LANDING,
  LIFT_STATION,
  MAIN_LINE_BELTS,
  STAMPING_PRESS,
  STORMBRASS_FOUNDRY_FIELD,
  STORMBRASS_FOUNDRY_VOID_HEIGHT,
} from '../../sim/content/stormbrass_foundry_layout';
import { FOUNDRY_POUR_LINE } from '../../sim/content/stormbrass_foundry_machinery';
import {
  FOUNDRY_WORKER_CAMPS,
  type FoundryWorkerCampId,
} from '../../sim/content/stormbrass_foundry_workers';
import {
  authoredFieldHeight,
  authoredFieldSurfaceAt,
  type FieldProp,
} from '../../sim/instances/authored_field';
import { type FieldEdgeKind, planFieldEdgePieces } from '../authored_field/field_edge_plan_core';
import { FOUNDRY_FLOOD_MASTS, PRIME_DRAFT_LANDMARK } from './foundry_plan_core';

export interface FoundryKitPlacement {
  piece: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** Absolute instance-local height (else the ground under x, z). */
  y?: number;
  /** Extra lift above the ground. */
  lift?: number;
  /** Stretch along the piece's local x (edge and tiling segments fit their run). */
  stretch?: number;
  /** Extra vertical scale on top of `scale` (a slender pier, a tall lip). */
  scaleY?: number;
  /** Rise per yard along the piece's local x (a sheared rail on a stair). */
  shear?: number;
  /** Sheds on the low graphics tier (cosmetic density only). */
  cosmetic?: boolean;
}

const FIELD = STORMBRASS_FOUNDRY_FIELD;
const VOID = STORMBRASS_FOUNDRY_VOID_HEIGHT;
const ground = (x: number, z: number): number => authoredFieldHeight(FIELD, x, z);
const walkable = (x: number, z: number): boolean => ground(x, z) > VOID + 1;

/** A small deterministic hash in [0, 1). */
export function foundryKitHash(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** The yaw that runs a piece's local +x along the direction (dx, dz). */
export function yawAlong(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

// ---- the kit's measured contract (game frame: x right, y up, z front) ------------------

/** Piece sizes the plan and the stand-ins share (the kit contract,
 *  E:/woc/entregas/fundicion/rehecha/kit_build/CONTRATO.md). */
export const FOUNDRY_KIT_SIZES = {
  craneMastTop: 16,
  craneJibReach: 12,
  pressCrownLift: 12,
  pressRamLength: 5,
  flywheelRadius: 2.4,
  /** The flywheel's hub on an engine house, in the block's frame. */
  machineFlywheel: { x: 3.6, y: 2.6 },
  /** The piston rod's foot on its engine (the cylinder top). */
  pistonRodFoot: 3,
  pistonStroke: 0.9,
  ladleHang: 2,
  pierHeight: 100,
  boilerHouseRoof: 14,
  channelInnerHalf: 3,
  channelTile: 4,
  trussDepth: 3,
  towerPanelDepth: 36,
  machineLipDepth: 8,
  railTrackTile: 2,
  railGauge: 2.2,
  beltHousingHalf: 0.35,
  greatCoilTop: 33,
  /** The yard gantry's beam underside (its trolley rides it). */
  yardGantryBeam: 14,
  /** The model frame's height (the Prime Draft landmark is one, scaled up). */
  modelFrameHeight: 7,
  pipeRunTile: 4,
  /** The workers' camp pieces as built: the seam's half width, the heap's
   *  radius, the chain post's height, the cart's half length. */
  oreSeamHalf: 1.6,
  oreSeamHalfDepth: 1.06,
  scrapHeapRadius: 1.5,
  chainPostHeight: 1.5,
  scrapCartHalf: 1.1,
} as const;

// ---- the sim props --------------------------------------------------------------------

/** Prop kinds that are collider-only (drawn by something else). */
export const FOUNDRY_COLLIDER_ONLY: ReadonlySet<string> = new Set([
  'sf_parts_line',
  // The yard gantry's legs (one Kit_YardGantry over both: planYardGantry).
  'sf_gantry_leg',
  // The parts chute's leg frames (part of Kit_PartsChute).
  'sf_chute_leg',
]);

/** The kit node a sim prop kind draws ('' for a collider-only or unknown prop). */
export function foundryPieceForProp(p: FieldProp): string {
  switch (p.kind) {
    case 'sf_lift_station':
      return 'Kit_LiftStation';
    case 'sf_work_lamp':
      return 'Kit_WorkLamp';
    case 'sf_rail_cart':
      return 'Kit_RailCart';
    case 'sf_plate_stack':
      return 'Kit_PlateStack';
    case 'sf_steam_vent':
      return 'Kit_SteamVent';
    case 'sf_water_tower':
      return 'Kit_WaterTower';
    case 'sf_crane_base':
      return 'Kit_CraneMast';
    case 'sf_press_post':
      return 'Kit_PressPost';
    case 'sf_parts_chute':
      return 'Kit_PartsChute';
    case 'sf_bunker':
      return 'Kit_Bunker';
    case 'sf_target_frame':
      return 'Kit_TargetFrameB';
    case 'sf_turret_berm':
      return 'Kit_TurretEmplacement';
    case 'sf_coil_pylon':
      return 'Kit_CoilPylon';
    case 'sf_great_coil':
      return 'Kit_GreatCoil';
    case 'sf_lightning_rod':
      return 'Kit_LightningRod';
    case 'sf_blueprint_table':
      return 'Kit_BlueprintTable';
    case 'sf_model_frame':
      return 'Kit_ModelFrame';
    case 'sf_cell_rack_small':
      return 'Kit_CellRackSmall';
    case 'sf_cell_rack':
      return 'Kit_CellRack';
    case 'sf_gantry_scaffold':
      return 'Kit_GantryScaffold';
    case 'sf_grinder':
      return 'Kit_Grinder';
    case 'sf_boiler':
      return 'Kit_Boiler';
    case 'sf_machine_block':
      return 'Kit_MachineBlock';
    case 'sf_smokestack':
      return 'Kit_Smokestack';
    case 'sf_piston_engine':
      return 'Kit_PistonEngine';
    case 'sf_crate_stack':
      return 'Kit_CrateStack';
    case 'sf_furnace':
      return 'Kit_FurnaceMouth';
    case 'sf_pour_frame':
      return 'Kit_PourFrame';
    case 'sf_scrap_heap':
      return 'Kit_ScrapHeap';
    case 'sf_ore_seam':
      return 'Kit_OreSeam';
    case 'sf_chain_post':
      return 'Kit_ChainPost';
    case 'sf_scrap_cart':
      return 'Kit_ScrapCart';
    case 'sf_observation_post':
      return 'Kit_ObservationPost';
    case 'sf_storm_coil':
      return 'Kit_StormCoil';
    default:
      return '';
  }
}

/** The scale a prop's piece draws at, fitted to its collider where one piece
 *  serves several sizes. */
function propScale(
  p: FieldProp,
  piece: string,
): { scale: number; stretch?: number; scaleY?: number } {
  if (piece === 'Kit_CraneMast') return { scale: (p.h ?? 16) / FOUNDRY_KIT_SIZES.craneMastTop };
  if (piece === 'Kit_PlateStack') return { scale: Math.max(0.7, (p.h ?? 3) / 3) };
  if (piece === 'Kit_Bunker') return { scale: 1, stretch: (p.hw ?? 3.5) / 3.5 };
  if (piece === 'Kit_PourFrame') return { scale: (p.h ?? 9) / 9 };
  // The workers' camp pieces fit the workers module's colliders (a seam and a
  // post well over a worker's head, a cart a hauler can load).
  if (piece === 'Kit_OreSeam') {
    // Its depth fits the collider (nothing of the rock stands outside it); its
    // width and height take the collider's width, so the seam towers.
    const scale = (p.hd ?? 1) / FOUNDRY_KIT_SIZES.oreSeamHalfDepth;
    const wide = (p.hw ?? 1.6) / FOUNDRY_KIT_SIZES.oreSeamHalf / scale;
    return { scale, stretch: wide, scaleY: wide };
  }
  if (piece === 'Kit_ScrapHeap') return { scale: (p.r ?? 1.5) / FOUNDRY_KIT_SIZES.scrapHeapRadius };
  if (piece === 'Kit_ChainPost') return { scale: (p.h ?? 1.5) / FOUNDRY_KIT_SIZES.chainPostHeight };
  if (piece === 'Kit_ScrapCart') return { scale: (p.hd ?? 1.1) / FOUNDRY_KIT_SIZES.scrapCartHalf };
  return { scale: p.scale ?? 1 };
}

/** The bridge crane on the Crane Landing: its jib is the Crane Bridge gate's
 *  (foundry_gates.ts swings the span with it), not an idle sweep. */
export function isBridgeCrane(p: FieldProp): boolean {
  return (
    p.kind === 'sf_crane_base' &&
    Math.hypot(p.x - CRANE_BRIDGE.x, p.z - CRANE_BRIDGE.fromZ) < 18 &&
    Math.abs(ground(p.x, p.z) - CRANE_BRIDGE.fromH) < 0.5
  );
}

/** The bridge crane prop (the Crane Landing's), or null. */
export function bridgeCraneProp(): FieldProp | null {
  return FIELD.props.find(isBridgeCrane) ?? null;
}

/** Where the lift station is drawn: off the Lift Landing's east rim (the sim
 *  prop's own spot, stormbrass_foundry_layout.ts LIFT_STATION). */
export const FOUNDRY_LIFT_STATION = LIFT_STATION;

/** Every sim prop's kit placement. */
export function planFoundryPropPlacements(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  for (const p of FIELD.props) {
    const piece = foundryPieceForProp(p);
    if (!piece) continue;
    const { scale, stretch, scaleY } = propScale(p, piece);
    const at: FoundryKitPlacement = { piece, x: p.x, z: p.z, rot: p.rot, scale };
    if (stretch !== undefined) at.stretch = stretch;
    if (scaleY !== undefined) at.scaleY = scaleY;
    // The lift station stands off the landing's EAST rim on its own pier, its
    // gate turned to the landing (the sim prop stands there too): it takes
    // the landing's floor, not the drop under it.
    if (piece === 'Kit_LiftStation') {
      at.y = LIFT_LANDING.h;
      const pier = 0.62;
      const top = LIFT_LANDING.h - 0.1;
      const base = VOID - 12;
      out.push({
        piece: 'Kit_Pier',
        x: at.x + 3,
        z: at.z,
        rot: 0,
        scale: pier,
        scaleY: (top - base) / (FOUNDRY_KIT_SIZES.pierHeight * pier),
        y: base,
      });
    }
    out.push(at);
    if (piece === 'Kit_GreatCoil') out.push({ ...at, piece: 'Kit_GreatCoilGlow' });
  }
  // The parts line (collider only): conveyor runs end to end along its length.
  for (const p of FIELD.props.filter((q) => q.kind === 'sf_parts_line')) {
    const len = (p.hd ?? 12) * 2;
    const n = Math.max(1, Math.round(len / 4));
    const step = len / n;
    // The prop's long axis is its local z: a tile's local x runs along it.
    const ax = Math.sin(p.rot);
    const az = Math.cos(p.rot);
    for (let i = 0; i < n; i++) {
      const k = -len / 2 + step * (i + 0.5);
      out.push({
        piece: 'Kit_ConveyorRun',
        x: p.x + ax * k,
        z: p.z + az * k,
        rot: yawAlong(ax, az),
        scale: 1,
        stretch: step / 4,
      });
    }
  }
  return out;
}

// ---- the cliff edges ---------------------------------------------------------------------

export const FOUNDRY_RAILING_EDGE: FieldEdgeKind = {
  piece: 'Kit_RailingEdge',
  inset: 0.15,
  halfLength: 2,
  halfDepth: 0.15,
};
export const FOUNDRY_MACHINE_LIP: FieldEdgeKind = {
  piece: 'Kit_MachineLip',
  inset: 0.3,
  halfLength: 2,
  halfDepth: 0.3,
};
export const FOUNDRY_PIPE_EDGE: FieldEdgeKind = {
  piece: 'Kit_PipeEdge',
  inset: 0.5,
  halfLength: 2,
  halfDepth: 0.5,
};
export const FOUNDRY_TOWER_PANEL: FieldEdgeKind = {
  piece: 'Kit_TowerPanel',
  inset: 0.3,
  halfLength: 2,
  halfDepth: 0.3,
};

/** The variants of each edge tile (same contract, so any one fits any run). */
export const FOUNDRY_EDGE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  Kit_RailingEdge: ['Kit_RailingEdgeB', 'Kit_RailingEdgeC'],
  Kit_MachineLip: ['Kit_RetainingWall', 'Kit_MachineLipB'],
  Kit_PipeEdge: ['Kit_PipeEdgeB', 'Kit_PipeEdgeC'],
};

/** Break a run's repetition: the tile a spot draws. Retaining walls come in
 *  stretches (the mountain cut held back for a few bays at a time), the rest
 *  one tile at a time. Deterministic in the spot. */
export function foundryEdgeVariant(piece: string, x: number, z: number): string {
  const v = FOUNDRY_EDGE_VARIANTS[piece];
  if (!v) return piece;
  const h = foundryKitHash(Math.round(x * 7.3 + z * 13.7), 91);
  if (piece === 'Kit_MachineLip') {
    const stretch = foundryKitHash(Math.floor(x / 14) * 31 + Math.floor(z / 14) * 17, 92);
    if (stretch < 0.42) return v[0];
    return h < 0.16 ? v[1] : piece;
  }
  if (piece === 'Kit_RailingEdge') return h < 0.2 ? v[0] : h < 0.3 ? v[1] : piece;
  return h < 0.3 ? v[0] : h < 0.55 ? v[1] : piece;
}

/** The Coil Crown's tower: the panels clad its drop down to this many yards. */
const TOWER_SURFACE = 'coil_crown';

/** Is the edge piece standing on the lift station's lip (its gate side)? */
function inLiftStation(x: number, z: number): boolean {
  const s = FIELD.props.find((p) => p.kind === 'sf_lift_station');
  if (!s) return false;
  // Into the station's own frame (it is turned to face the landing).
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const dx = x - s.x;
  const dz = z - s.z;
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  return Math.abs(lx) <= (s.hw ?? 6) + 1 && Math.abs(lz) <= (s.hd ?? 1.5) + 2.5;
}

/** Every edge piece: catwalk railings on the balustraded walks and stairs and
 *  on every drop onto a lower floor, machinery lips on the masonry terraces,
 *  pipe runs on the rock shelves, the tower's cladding round the Coil Crown.
 *  Drops under 2.5 yd stay bare. */
export function planFoundryEdges(): FoundryKitPlacement[] {
  return planFieldEdgePieces(FIELD, {
    minDrop: 2.5,
    segment: 4,
    kindFor: (run) => {
      // A drop onto another floor takes a railing (its face never reaches
      // past the wall into the lower walkway).
      if (run.low > VOID + 1) return FOUNDRY_RAILING_EDGE;
      if (run.surface === TOWER_SURFACE) return FOUNDRY_TOWER_PANEL;
      if (run.style === 'balustrade') return FOUNDRY_RAILING_EDGE;
      if (run.style === 'masonry') return FOUNDRY_MACHINE_LIP;
      return FOUNDRY_PIPE_EDGE;
    },
  })
    .filter((e) => !inLiftStation(e.x, e.z))
    .map((e) => ({
      piece: foundryEdgeVariant(e.piece, e.x, e.z),
      x: e.x,
      z: e.z,
      rot: e.rot,
      scale: 1,
      y: e.y,
      stretch: e.stretch,
      shear: e.shear,
    }));
}

// ---- the steel catwalks: open air under them -----------------------------------------

/** The walks and stairs drawn as steel catwalks over open air: the terrain
 *  stops their face a yard under the deck (foundry_interior.ts passes this to
 *  the field painter) and the kit hangs a truss under them, on piers. */
export const FOUNDRY_OPEN_WALKS: ReadonlySet<string> = new Set([
  'lift_stair',
  'line_catwalk',
  'range_catwalk',
  'range_gate_walk',
  'coil_catwalk',
  'coil_stair_lower',
  'coil_stair_upper',
  'gantry_catwalk',
]);
/** How far the drawn face of an open walk drops under its deck. */
export const FOUNDRY_OPEN_WALK_FASCIA = 1;

/** The truss tiles under every open walk (only where the walk itself owns the
 *  floor, so none buries itself in a terrace), sheared to the stair's pitch,
 *  and a slender pier under each long span down into the drop. */
export function planCatwalkTrusses(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  let pierIndex = 0;
  for (const s of FIELD.surfaces) {
    if (s.kind !== 'path' || !FOUNDRY_OPEN_WALKS.has(s.id)) continue;
    const widthScale = s.halfWidth / 5;
    let sincePier = 0;
    for (let i = 0; i + 1 < s.points.length; i++) {
      const [ax, az, ay] = s.points[i];
      const [bx, bz, by] = s.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const n = Math.max(1, Math.round(len / 4));
      const step = len / n;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const rot = yawAlong(ux, uz);
      const pitch = (by - ay) / len;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (authoredFieldSurfaceAt(FIELD, x, z)?.id !== s.id) continue;
        // The walk's own floor over open air on both sides of the tile.
        const side = s.halfWidth + 1;
        if (walkable(x - uz * side, z + ux * side) && walkable(x + uz * side, z - ux * side))
          continue;
        const y = ay + (by - ay) * t;
        out.push({
          piece: 'Kit_CatwalkTruss',
          x,
          z,
          rot,
          scale: widthScale,
          stretch: step / (4 * widthScale),
          shear: pitch,
          y,
        });
        sincePier += step;
        if (sincePier >= 18 && s.id !== 'line_catwalk') {
          sincePier = 0;
          const top = y - FOUNDRY_KIT_SIZES.trussDepth * widthScale;
          out.push(slenderPier(x, z, top, pierIndex++));
        }
      }
    }
  }
  return out;
}

/** A slender iron-banded pier from the drop up to `top` (under a catwalk). */
function slenderPier(x: number, z: number, top: number, i: number): FoundryKitPlacement {
  const scale = 0.24;
  const base = VOID - 12;
  return {
    piece: 'Kit_Pier',
    x,
    z,
    rot: foundryKitHash(i, 3) * 0.4,
    scale,
    scaleY: (top - base) / (FOUNDRY_KIT_SIZES.pierHeight * scale),
    y: base,
  };
}

// ---- the Main Line: belt housings, the press ---------------------------------------------

/** The press crown's height over the Main Line floor (the posts are 14). */
export const PRESS_CROWN_LIFT = FOUNDRY_KIT_SIZES.pressCrownLift;

/** The belts' side frames (both sides of every belt, end to end), their end
 *  drums at the chute, and the Stamping Press's crown on its five posts (the
 *  hammers and their carriages are the sliding rig's, foundry_press.ts). */
export function planMainLine(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  const len = MAIN_LINE_BELTS.z1 - MAIN_LINE_BELTS.z0;
  const n = Math.max(1, Math.round(len / 4));
  const step = len / n;
  const h = FOUNDRY_KIT_SIZES.beltHousingHalf;
  for (const x of MAIN_LINE_BELTS.xs) {
    for (const side of [-1, 1]) {
      // Along +z, the housing's inner (+local z... its local +y face) toward the belt.
      const hx = x + side * (MAIN_LINE_BELTS.halfWidth + h);
      for (let i = 0; i < n; i++) {
        out.push({
          piece: 'Kit_BeltHousing',
          x: hx,
          z: MAIN_LINE_BELTS.z0 + step * (i + 0.5),
          // Local +x runs north; the local -z (inner face, Blender +Y) faces
          // the belt: west housings turn their inner face east, and back.
          rot: side < 0 ? -Math.PI / 2 : Math.PI / 2,
          scale: 1,
          stretch: step / 4,
        });
      }
    }
    out.push({
      piece: 'Kit_BeltDrum',
      x,
      z: MAIN_LINE_BELTS.z0 - 0.6,
      rot: 0,
      scale: 1,
    });
  }
  const g = ground(0, STAMPING_PRESS.z);
  // The crown's worked face (fireboxes, gauges, the gear train) turns south,
  // to the belts the party fights on.
  out.push({
    piece: 'Kit_PressCrown',
    x: 0,
    z: STAMPING_PRESS.z,
    rot: Math.PI,
    scale: 1,
    y: g + PRESS_CROWN_LIFT,
  });
  // Chains hanging from the crown's ends, clear of every head.
  for (const x of [-22.4, 22.4])
    for (const dz of [-1.6, 1.6])
      out.push({
        piece: 'Kit_ChainHang',
        x,
        z: STAMPING_PRESS.z + dz,
        rot: dz > 0 ? 0.4 : 1.9,
        scale: 1,
        y: g + PRESS_CROWN_LIFT,
        cosmetic: true,
      });
  // Vent grilles let into the walkways either side of the belts.
  for (const x of [-21, 21])
    for (const z of [-38, -24, -19, -8])
      out.push({ piece: 'Kit_FloorGrille', x, z, rot: Math.PI / 2, scale: 1.3, lift: 0.01 });
  // No fixed rams under the crown: the hammers ride their rails to the
  // riders (foundry_press.ts), and a static ram would clip one parked on the
  // press-end stop.
  return out;
}

// ---- the Rail Yard: the Hauler's loop and the cart siding -------------------------------

const TRACK_CORNER = 6;
/** The Proving Range's target trolley line (render only: rails a hand high). */
export const FOUNDRY_TARGET_LINE = { x0: -104, x1: -68, z: 9 } as const;

/** Track tiles along a straight from a to b (both ends inclusive of the run). */
function trackRun(ax: number, az: number, bx: number, bz: number, out: FoundryKitPlacement[]) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / FOUNDRY_KIT_SIZES.railTrackTile));
  const step = len / n;
  const rot = yawAlong((bx - ax) / len, (bz - az) / len);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    out.push({
      piece: 'Kit_RailTrack',
      x: ax + (bx - ax) * t,
      z: az + (bz - az) * t,
      rot,
      scale: 1,
      stretch: step / FOUNDRY_KIT_SIZES.railTrackTile,
    });
  }
}

/** The Hauler's loop (HAULER_LOOP with rounded corners), the cart siding on
 *  the yard's west side with its buffer stops. */
export function planRailYard(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  const pts = HAULER_LOOP.map((p) => ({ x: p.x, z: p.z }));
  const r = TRACK_CORNER;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    trackRun(a.x + ux * r, a.z + uz * r, b.x - ux * r, b.z - uz * r, out);
    // The corner at b: a quarter arc from the end of this run to the next.
    const c = pts[(i + 2) % pts.length];
    const l2 = Math.hypot(c.x - b.x, c.z - b.z);
    const vx = (c.x - b.x) / l2;
    const vz = (c.z - b.z) / l2;
    const cx = b.x - ux * r + vx * r;
    const cz = b.z - uz * r + vz * r;
    const steps = 5;
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const p = (t: number) => {
        const ang = (t * Math.PI) / 2;
        // From (b - u r) round to (b + v r) about the corner centre.
        const sx = -vx * Math.cos(ang) + ux * Math.sin(ang);
        const sz = -vz * Math.cos(ang) + uz * Math.sin(ang);
        return { x: cx + sx * r, z: cz + sz * r };
      };
      const p0 = p(t0);
      const p1 = p(t1);
      trackRun(p0.x, p0.z, p1.x, p1.z, out);
    }
  }
  // The cart siding (the two carts stand on it) and its buffers.
  const carts = FIELD.props.filter((p) => p.kind === 'sf_rail_cart');
  if (carts.length > 0) {
    const x = carts[0].x;
    trackRun(x, -188, x, -130, out);
    out.push({ piece: 'Kit_RailBuffer', x, z: -188.6, rot: Math.PI / 2, scale: 1 });
    out.push({ piece: 'Kit_RailBuffer', x, z: -129.4, rot: -Math.PI / 2, scale: 1 });
  }
  return out;
}

/** The Proving Range's target trolley line along its north lip, a buffer
 *  stop at each end. */
export function planTargetLine(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  const T = FOUNDRY_TARGET_LINE;
  trackRun(T.x0, T.z, T.x1, T.z, out);
  out.push({ piece: 'Kit_RailBuffer', x: T.x0 - 0.6, z: T.z, rot: 0, scale: 1 });
  out.push({ piece: 'Kit_RailBuffer', x: T.x1 + 0.6, z: T.z, rot: Math.PI, scale: 1 });
  return out;
}

// ---- the pour line on the crane pad -----------------------------------------------------

/** The pour line: the ladle rail on its posts over the moulds, the furnace at
 *  its west end (a sim prop). Ladles ride it (planFoundryMovers). */
export function planPourLine(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  const L = FOUNDRY_POUR_LINE;
  const g = ground(L.posts[0], L.railZ);
  const len = L.railX1 - L.railX0;
  const n = Math.max(1, Math.round(len / 4));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    out.push({
      piece: 'Kit_LadleRail',
      x: L.railX0 + step * (i + 0.5),
      z: L.railZ,
      rot: 0,
      scale: 1,
      stretch: step / 4,
      y: g + L.railLift,
    });
  }
  // The moulds on the floor under the rail, between the posts.
  for (const x of FOUNDRY_POUR_MOULDS) {
    out.push({ piece: 'Kit_Mould', x, z: L.railZ, rot: 0, scale: 1 });
  }
  return out;
}

/** Where the ladles pour (mould centres along the rail). */
export const FOUNDRY_POUR_MOULDS = [-28, -16] as const;

// ---- the molten channel under the Line Catwalk ----------------------------------------

/** The molten channel: a river of molten brass in the gulf between the crane
 *  pad and the Main Line, crossed by the Line Catwalk; fed by a furnace at
 *  its west end, spilling into the drop at its east end. Render only (the
 *  gulf is the drop; nothing here is walkable). */
export const FOUNDRY_MOLTEN_CHANNEL = {
  z: -51,
  x0: -37,
  x1: 40,
  /** The molten surface's height. */
  y: 2.5,
  /** The trough's scale (the contract tile is 4 long, 6 wide inside). */
  scale: 1.45,
  furnace: { x: -41.2, y: 2 },
  /** Where the fall leaves the channel's east end, and how far it drops. */
  fall: { x: 41, bottom: -60 },
} as const;

export function planMoltenChannel(): FoundryKitPlacement[] {
  const C = FOUNDRY_MOLTEN_CHANNEL;
  const out: FoundryKitPlacement[] = [];
  const tile = FOUNDRY_KIT_SIZES.channelTile * C.scale;
  const n = Math.max(1, Math.round((C.x1 - C.x0) / tile));
  const step = (C.x1 - C.x0) / n;
  for (let i = 0; i < n; i++) {
    out.push({
      piece: 'Kit_ChannelSegment',
      x: C.x0 + step * (i + 0.5),
      z: C.z,
      rot: 0,
      scale: C.scale,
      stretch: step / tile,
      y: C.y,
    });
  }
  // The furnace on its pier at the west end, its mouth toward the channel.
  out.push({
    piece: 'Kit_Pier',
    x: C.furnace.x - 1.5,
    z: C.z,
    rot: 0,
    scale: 0.75,
    y: C.furnace.y - FOUNDRY_KIT_SIZES.pierHeight * 0.75 * 1.4,
    scaleY: 1.4,
  });
  out.push({
    piece: 'Kit_FurnaceMouth',
    x: C.furnace.x,
    z: C.z,
    rot: Math.PI / 2,
    scale: 1,
    y: C.furnace.y,
  });
  return out;
}

// ---- the skyline in the drop ---------------------------------------------------------

/** The engine houses on their piers in the drop round the shelf: the
 *  Foundry's skyline from every terrace (stacks smoking, windows lit). */
export const FOUNDRY_SKYLINE: readonly { x: number; z: number; top: number; rot: number }[] = [
  { x: -84, z: -204, top: 6, rot: 0.3 },
  { x: -98, z: -150, top: 14, rot: -0.2 },
  { x: 82, z: -208, top: 4, rot: -0.4 },
  { x: 96, z: -138, top: 12, rot: 0.25 },
  { x: -74, z: -112, top: 10, rot: 0.1 },
  { x: 72, z: -104, top: 16, rot: -0.15 },
  { x: -92, z: 58, top: 18, rot: 0.35 },
  { x: -80, z: 128, top: 22, rot: -0.3 },
  { x: 80, z: 82, top: 20, rot: 0.2 },
  { x: 86, z: 150, top: 26, rot: -0.25 },
  { x: -62, z: 206, top: 20, rot: 0.15 },
  { x: 62, z: 212, top: 24, rot: -0.1 },
];

export function planSkyline(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  FOUNDRY_SKYLINE.forEach((s, i) => {
    const scale = 0.9 + foundryKitHash(i, 61) * 0.25;
    // The whole skyline is cosmetic: it sheds on the low tier with its smoke.
    out.push({
      piece: 'Kit_Pier',
      x: s.x,
      z: s.z,
      rot: s.rot,
      scale,
      // Down into the valley floor, whatever its own height.
      y: VOID - 26,
      scaleY: (s.top - (VOID - 26)) / (FOUNDRY_KIT_SIZES.pierHeight * scale),
      cosmetic: true,
    });
    out.push({
      piece: 'Kit_BoilerHouse',
      x: s.x,
      z: s.z,
      rot: s.rot,
      scale,
      y: s.top,
      cosmetic: true,
    });
  });
  return out;
}

// ---- the workers' camps and the floor litter -------------------------------------------

/** The three camps where chained workers labour: the workers module's own
 *  posts (sim/content/stormbrass_foundry_workers.ts FOUNDRY_WORKER_CAMPS is the
 *  single source of truth). Their seam, heap, post and cart are sim props, so
 *  planFoundryPropPlacements draws them with the kit's camp pieces. */
export const FOUNDRY_WORKER_CAMP_SPOTS: readonly {
  id: FoundryWorkerCampId;
  x: number;
  z: number;
  floor: number;
}[] = FOUNDRY_WORKER_CAMPS.map((c) => ({ id: c.id, x: c.post.x, z: c.post.z, floor: c.floor }));

/** Knee-high litter along the terraces' edges: crates, ingot stacks, oil
 *  drums, sandbag berms on the range, workbenches by the engineers. Every
 *  piece here is at most a knee tall (no collider needed). */
export const FOUNDRY_LITTER: readonly [string, number, number, number][] = [
  // The Lift Landing.
  ['Kit_Crate', -7.5, -228.5, 0.4],
  ['Kit_DrumCluster', 7.8, -229, 0],
  ['Kit_IngotStack', -8.6, -224.5, 1.2],
  // The Rail Yard.
  ['Kit_IngotStack', -40, -186, 0.1],
  ['Kit_DrumCluster', -34, -188, 0],
  ['Kit_Crate', 36, -188.2, 0.3],
  ['Kit_IngotStack', 41, -186.5, -0.2],
  ['Kit_DrumCluster', -53, -158, 0],
  ['Kit_Crate', 53.2, -158, 1.2],
  ['Kit_Workbench', -42.5, -149.5, Math.PI / 2],
  ['Kit_IngotStack', 50, -131, 0.6],
  ['Kit_Crate', -28, -131, 0.2],
  // The Assembly Terraces.
  ['Kit_IngotStack', -32, -112.5, 0],
  ['Kit_DrumCluster', 38, -112, 0],
  ['Kit_Crate', -38.2, -90, 0.5],
  ['Kit_IngotStack', 28, -90, 0.2],
  ['Kit_Workbench', 11.5, -61.4, Math.PI],
  ['Kit_DrumCluster', -38.4, -60, 0],
  ['Kit_IngotStack', 24, -78.6, 0],
  ['Kit_Crate', 38.5, -70, 0.3],
  // The Crane Landing.
  ['Kit_DrumCluster', 10, 8.6, 0],
  // The Range Lanes and the Proving Range.
  ['Kit_Sandbags', -92, -71.6, 0],
  ['Kit_Sandbags', -86, -71.6, 0],
  ['Kit_Sandbags', -64, -71.6, 0],
  ['Kit_Workbench', -99.5, -61, -Math.PI / 2],
  ['Kit_Sandbags', -111, -9, Math.PI / 2],
  ['Kit_Sandbags', -111, 1, Math.PI / 2],
  ['Kit_Sandbags', -111, 10.4, Math.PI / 2],
  ['Kit_Sandbags', -100, 10.8, 0],
  ['Kit_Sandbags', -62, 10.8, 0],
  // The firing line along the Proving Range's south lip, either side of the
  // gate walk, with its ammunition.
  ['Kit_Sandbags', -101, -18.4, 0],
  ['Kit_Sandbags', -97.6, -18.4, 0],
  ['Kit_Sandbags', -94.2, -18.4, 0],
  ['Kit_Sandbags', -90.8, -18.4, 0],
  ['Kit_Sandbags', -68.6, -18.4, 0],
  ['Kit_Sandbags', -65.2, -18.4, 0],
  ['Kit_Sandbags', -61.8, -18.4, 0],
  ['Kit_Crate', -99, -15.6, 0.3],
  ['Kit_IngotStack', -92.5, -15.8, 1.3],
  ['Kit_Crate', -63.5, -15.6, 1.1],
  ['Kit_Spool', -104, 9, 0.4],
  // Firing points down the Range Lanes.
  ['Kit_Sandbags', -84, -54, 0],
  ['Kit_Sandbags', -80.6, -54, 0],
  ['Kit_Sandbags', -70, -44, 0],
  ['Kit_Sandbags', -66.6, -44, 0],
  ['Kit_Crate', -82, -51.6, 0.5],
  ['Kit_IngotStack', -57, -34, 0.2],
  ['Kit_DrumCluster', -54, 9.5, 0],
  // The Coil landings.
  ['Kit_DrumCluster', 66, -38, 0],
  ['Kit_Workbench', 108.6, -58.2, -Math.PI / 2],
  // The Drafting Yard.
  ['Kit_Workbench', 34.5, 71.5, -0.4],
  ['Kit_Crate', -47.5, 70, 0.2],
  ['Kit_IngotStack', 47.5, 86, 0.4],
  ['Kit_DrumCluster', -10, 46.5, 0],
  // The Gantry Approach.
  ['Kit_Workbench', -40.5, 141, Math.PI / 2],
  ['Kit_IngotStack', 42.5, 126, 0.2],
  ['Kit_Crate', 12, 117.5, 0.3],
  ['Kit_DrumCluster', 42.8, 143.5, 0],
  // Cable spools by the cranes and the coil.
  ['Kit_Spool', 30, -102, 0.5],
  ['Kit_Spool', -30, -62, 1.2],
  ['Kit_Spool', -10, 9, 0.2],
  ['Kit_Spool', 67, -40.5, 2.1],
  ['Kit_Spool', -34, 162, 0.9],
  ['Kit_Spool', 14, 190, 0.3],
  // The Gantry rim.
  ['Kit_IngotStack', -21, 196, 0.6],
  ['Kit_Crate', 21.5, 196.5, 0.2],
];

export function planLitter(): FoundryKitPlacement[] {
  return FOUNDRY_LITTER.map(([piece, x, z, rot], i) => ({
    piece,
    x,
    z,
    rot,
    // (A spool is a knee tall only a shade under its full size.)
    scale: piece === 'Kit_Spool' ? 0.9 : 0.95 + foundryKitHash(i, 71) * 0.1,
    cosmetic: piece !== 'Kit_Workbench',
  }));
}

// ---- the Coil Crown and the lift's cables ----------------------------------------------

/** The cable lift's two hauling cables down the mountain from the station's
 *  pulley, and the conduits from each lightning rod to the great coil. */
export function planCables(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  // The station's back (its cable stubs) faces east: the cables run out and
  // down the mountain from the pulley.
  const S = FOUNDRY_LIFT_STATION;
  for (const dz of [-0.95, 0.95]) {
    const from = { x: S.x + 10, y: LIFT_LANDING.h + 15.35, z: S.z + dz };
    const to = { x: S.x + 190, y: VOID - 30, z: S.z - 60 + dz * 6 };
    const run = Math.hypot(to.x - from.x, to.z - from.z);
    out.push({
      piece: 'Kit_Cable',
      x: from.x,
      z: from.z,
      rot: yawAlong((to.x - from.x) / run, (to.z - from.z) / run),
      scale: 1.3,
      stretch: run / 1.3,
      shear: (to.y - from.y) / run,
      y: from.y,
    });
  }
  return out;
}

// ---- the yard gantry over the Hauler's loop ---------------------------------------------

/** The gantry crane spanning the Hauler's loop on its two leg bogies (sim
 *  colliders, `sf_gantry_leg`), its trolley and hook hanging from the beam. */
export function planYardGantry(): FoundryKitPlacement[] {
  const legs = FIELD.props.filter((p) => p.kind === 'sf_gantry_leg');
  if (legs.length < 2) return [];
  const x = (legs[0].x + legs[1].x) / 2;
  const z = legs[0].z;
  const beam = ground(x, z) + FOUNDRY_KIT_SIZES.yardGantryBeam;
  return [
    { piece: 'Kit_YardGantry', x, z, rot: 0, scale: 1 },
    { piece: 'Kit_YardGantryTrolley', x: x + 9, z, rot: 0, scale: 1, y: beam },
    { piece: 'Kit_ChainHang', x: x - 12, z, rot: 0.6, scale: 1, y: beam, cosmetic: true },
  ];
}

// ---- masts and flags standing in the parapets ---------------------------------------

/** Flood masts and range flags standing IN the lips' parapets (on the cliff
 *  walls' own colliders, so none stands in a walkway): the yards' lamps and
 *  the ranges' wind flags. */
export const FOUNDRY_PARAPET_PIECES: readonly [string, number, number, number][] = [
  // Flood masts: the Rail Yard, the terraces, the Main Line, the yards.
  ...FOUNDRY_FLOOD_MASTS.map(([x, z]): [string, number, number, number] => [
    'Kit_FloodMast',
    x,
    z,
    0,
  ]),
  // Range flags down the lanes and round the Proving Range.
  ['Kit_RangeFlag', -103.8, -66, 0],
  ['Kit_RangeFlag', -103.8, -40, 0],
  ['Kit_RangeFlag', -48.2, -66, Math.PI],
  ['Kit_RangeFlag', -111.8, -17, 0],
  ['Kit_RangeFlag', -111.8, 9, 0],
  ['Kit_RangeFlag', -80, 11.8, -Math.PI / 2],
  ['Kit_RangeFlag', -64, 11.8, -Math.PI / 2],
];

export function planParapetPieces(): FoundryKitPlacement[] {
  return FOUNDRY_PARAPET_PIECES.map(([piece, x, z, rot]) => ({
    piece,
    x,
    z,
    rot,
    scale: 1,
    cosmetic: piece === 'Kit_RangeFlag',
  }));
}

// ---- the steam mains from the engine houses -------------------------------------------

/** Where each skyline engine house's steam main meets the shelf: the lip
 *  point (by FOUNDRY_SKYLINE index). */
export const FOUNDRY_STEAM_MAINS: readonly { house: number; x: number; z: number }[] = [
  { house: 0, x: -55.6, z: -184 },
  { house: 1, x: -55.6, z: -150 },
  { house: 2, x: 55.6, z: -184 },
  { house: 3, x: 55.6, z: -140 },
  { house: 4, x: -40.6, z: -106 },
  { house: 5, x: 40.6, z: -100 },
  { house: 6, x: -50.6, z: 62 },
  { house: 7, x: -45.6, z: 130 },
  { house: 8, x: 50.6, z: 80 },
  { house: 9, x: 45.6, z: 148 },
];
const MAIN_SCALE = 2.2;
/** How far under the lip's floor a main enters the shelf's face. */
const MAIN_UNDER = 3;

/** A fat steam main from each engine house across the gulf into the shelf's
 *  face under the lip (never over a floor), with a valve at mid span. */
export function planSteamMains(): FoundryKitPlacement[] {
  const out: FoundryKitPlacement[] = [];
  for (const m of FOUNDRY_STEAM_MAINS) {
    const h = FOUNDRY_SKYLINE[m.house];
    const dx = m.x - h.x;
    const dz = m.z - h.z;
    const full = Math.hypot(dx, dz);
    const ux = dx / full;
    const uz = dz / full;
    // Leave the house past its wall.
    const lead = 7;
    const ax = h.x + ux * lead;
    const az = h.z + uz * lead;
    const len = full - lead;
    // The lip's floor, sampled inside it.
    const lipFloor = ground(m.x + ux * 1.6, m.z + uz * 1.6);
    const y0 = h.top + 2;
    const y1 = lipFloor - MAIN_UNDER;
    const tile = FOUNDRY_KIT_SIZES.pipeRunTile * MAIN_SCALE;
    const n = Math.max(1, Math.round(len / tile));
    const step = len / n;
    const rot = yawAlong(ux, uz);
    const shear = (y1 - y0) / len;
    const valve = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      out.push({
        piece: i === valve ? 'Kit_PipeValve' : 'Kit_PipeRun',
        x: ax + ux * len * t,
        z: az + uz * len * t,
        rot,
        scale: MAIN_SCALE,
        stretch: i === valve ? 1 : step / tile,
        shear: i === valve ? 0 : shear,
        y: y0 + (y1 - y0) * t,
        cosmetic: true,
      });
    }
  }
  return out;
}

// ---- the Prime Draft landmark ------------------------------------------------------------

/** Is the kit's colossus (a model frame at six times its size) hung in the
 *  cradle? OFF since the Prime Draft has its own Blender body
 *  (prime_draft_model_core.ts): there is ONE Prime Draft, the 11.5 yd fighter
 *  standing cabled to its scaffold on the Gantry, and a 42 yd kit automaton of
 *  another make behind it read as a second, different machine. The cradle it
 *  was built in (the pier, the two scaffold towers, the bays) stays as the
 *  route's landmark silhouette with the 34 yd gantry scaffold. One switch: turn
 *  it on to hang the kit colossus again. */
export const FOUNDRY_PRIME_DRAFT_LANDMARK_SHOWN = false;

/** The Prime Draft's assembly cradle beyond the Gantry's north lip: a pier
 *  out of the drop, two scaffold towers either side with their clamp arms
 *  reaching in, scaffold bays at their feet; and, behind the switch above, the
 *  kit's colossus hung in it (the model frame at six times the size). */
export function planPrimeDraftLandmark(at: {
  x: number;
  y: number;
  z: number;
  height: number;
}): FoundryKitPlacement[] {
  const scale = at.height / FOUNDRY_KIT_SIZES.modelFrameHeight;
  // A yard and a half back, so the frame's front clears the Gantry's rim.
  const z = at.z + 1.5;
  const pier = 1.7;
  const out: FoundryKitPlacement[] = [
    {
      piece: 'Kit_Pier',
      x: at.x,
      z,
      rot: 0,
      scale: pier,
      y: at.y - FOUNDRY_KIT_SIZES.pierHeight * pier,
    },
  ];
  // Turned to face south, down the route the party climbs.
  if (FOUNDRY_PRIME_DRAFT_LANDMARK_SHOWN)
    out.push({ piece: 'Kit_ModelFrame', x: at.x, z, rot: Math.PI, scale, y: at.y });
  for (const side of [-1, 1]) {
    out.push({
      piece: 'Kit_DraftScaffoldTower',
      x: at.x + side * 14.6,
      z: z - 1,
      // The clamp arm (the piece's +x) reaches in toward the colossus.
      rot: side < 0 ? 0 : Math.PI,
      scale: 1,
      y: at.y,
      cosmetic: true,
    });
    for (const level of [0, 1])
      out.push({
        piece: 'Kit_Scaffold',
        x: at.x + side * 14.2,
        z: z + 6,
        rot: 0,
        scale: 1,
        y: at.y + level * 4,
        cosmetic: true,
      });
  }
  return out;
}

// ---- the mine adits in the shelf's faces --------------------------------------------------

/** Where the foundry bites into the mountain: mine adits let into the
 *  shelf's cliff faces under the lips (a portal, rails out onto a timber
 *  ledge, an ore tub, spoil down the face). `out` is the face's outward
 *  direction; `drop` how far under the lip's floor the adit's floor lies. */
export const FOUNDRY_ADITS: readonly {
  x: number;
  z: number;
  out: readonly [number, number];
  drop: number;
}[] = [
  { x: -55, z: -167, out: [-1, 0], drop: 10 },
  { x: 55, z: -160, out: [1, 0], drop: 11 },
  { x: -40, z: -96, out: [-1, 0], drop: 9 },
  { x: 50, z: 70, out: [1, 0], drop: 11 },
  { x: -50, z: 88, out: [-1, 0], drop: 10 },
  { x: -45, z: 150, out: [-1, 0], drop: 12 },
  { x: 45, z: 126, out: [1, 0], drop: 10 },
];
/** How far the cliff face has flared out from the lip at an adit's depth. */
const ADIT_FLARE = 0.22;

export function planAdits(): FoundryKitPlacement[] {
  return FOUNDRY_ADITS.map((a) => {
    const floor = ground(a.x - a.out[0] * 1.5, a.z - a.out[1] * 1.5);
    const push = a.drop * ADIT_FLARE + 0.6;
    return {
      piece: 'Kit_MineAdit',
      x: a.x + a.out[0] * push,
      z: a.z + a.out[1] * push,
      // The piece's front (its local +z) turns outward.
      rot: Math.atan2(a.out[0], a.out[1]),
      scale: 1,
      y: floor - a.drop,
      cosmetic: true,
    };
  });
}

// ---- the Forge Gauntlet: the blast furnace and the steam hammers ----------------------

/** The Gantry Catwalk walks between a roaring blast furnace (east, in the
 *  drop on its pier, its tap arch turned to the walk) and a row of steam
 *  hammers striking in rhythm (west, each on its pier). Render only: all of
 *  it stands in the drop, clear of every floor. */
export const FOUNDRY_FORGE = {
  furnace: { x: 33, z: 184, base: 19, pier: 1.4 },
  hammers: [
    { x: -21, z: 172 },
    { x: -21, z: 178 },
    { x: -21, z: 184 },
  ],
  hammerBase: 25,
  hammerPier: 0.5,
  /** The tup's strike face over the hammer's base, struck and raised. */
  strikeAt: 1.7,
  raise: 3.1,
  /** Seconds of one hammer's blow. */
  period: 2.4,
} as const;

/** The furnace's hot points in the instance frame (the piece faces west). */
export function forgeFurnacePoints(): {
  mouth: { x: number; y: number; z: number };
  runnerEnd: { x: number; y: number; z: number };
  throat: { x: number; y: number; z: number };
} {
  const F = FOUNDRY_FORGE.furnace;
  return {
    mouth: { x: F.x - 8.4, y: F.base + 3.2, z: F.z },
    runnerEnd: { x: F.x - 12.4, y: F.base + 0.7, z: F.z },
    throat: { x: F.x, y: F.base + 43, z: F.z },
  };
}

export function planForgeGauntlet(): FoundryKitPlacement[] {
  const G = FOUNDRY_FORGE;
  const out: FoundryKitPlacement[] = [];
  const pier = (x: number, z: number, top: number, scale: number): FoundryKitPlacement => {
    const base = VOID - 12;
    return {
      piece: 'Kit_Pier',
      x,
      z,
      rot: 0,
      scale,
      scaleY: (top - base) / (FOUNDRY_KIT_SIZES.pierHeight * scale),
      y: base,
    };
  };
  out.push(pier(G.furnace.x, G.furnace.z, G.furnace.base, G.furnace.pier));
  out.push({
    piece: 'Kit_BlastFurnace',
    x: G.furnace.x,
    z: G.furnace.z,
    // Its tap arch (local +z) turns west, to the catwalk.
    rot: -Math.PI / 2,
    scale: 1,
    y: G.furnace.base,
  });
  for (const h of G.hammers) {
    out.push(pier(h.x, h.z, G.hammerBase, G.hammerPier));
    out.push({
      piece: 'Kit_SteamHammer',
      x: h.x,
      z: h.z,
      // Its front turns east, to the catwalk.
      rot: Math.PI / 2,
      scale: 1,
      y: G.hammerBase,
    });
  }
  return out;
}

/** A steam hammer's tup at time `t`: its lift over the struck position
 *  (0 struck, 1 raised) and whether the blow has just landed (the sparks).
 *  A slow lift, a hang at the top, a fast fall. */
export function hammerBlow(t: number, phase: number): { lift: number; struck: number } {
  const k = (((t / FOUNDRY_FORGE.period + phase) % 1) + 1) % 1;
  if (k < 0.1) return { lift: 0, struck: 1 - k / 0.1 };
  if (k < 0.72) {
    const u = (k - 0.1) / 0.62;
    return { lift: u * u * (3 - 2 * u), struck: 0 };
  }
  if (k < 0.86) return { lift: 1, struck: 0 };
  const u = (k - 0.86) / 0.14;
  return { lift: 1 - u * u, struck: 0 };
}

// ---- everything static -------------------------------------------------------------------

/** The whole static dressing. */
export function planFoundryKitPlacements(): FoundryKitPlacement[] {
  return [
    ...planFoundryPropPlacements(),
    ...planFoundryEdges(),
    ...planCatwalkTrusses(),
    ...planMainLine(),
    ...planRailYard(),
    ...planPourLine(),
    ...planMoltenChannel(),
    ...planSkyline(),
    ...planLitter(),
    ...planCables(),
    ...planTargetLine(),
    ...planYardGantry(),
    ...planParapetPieces(),
    ...planSteamMains(),
    ...planAdits(),
    ...planForgeGauntlet(),
    ...planPrimeDraftLandmark(PRIME_DRAFT_LANDMARK),
  ];
}

// ---- the pieces that move ---------------------------------------------------------------

export type FoundryMotion =
  /** Turns about its local x axis (flywheels, gears). */
  | 'spin'
  /** Pumps along its local y (piston rods). */
  | 'pump'
  /** Slews about its local y (crane jibs). */
  | 'slew'
  /** A ladle: runs along the pour rail, tips over a mould, runs back. */
  | 'ladle'
  /** The ladle's trolley: runs with it, never tips. */
  | 'trolley'
  /** A steam hammer's tup: a slow lift, a fast blow (hammerBlow). */
  | 'hammer';

export interface FoundryMover {
  piece: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  motion: FoundryMotion;
  /** Radians a second (spin), strokes a second (pump), or the cycle phase. */
  rate: number;
  phase: number;
  /** For a slewing jib: its rest yaw and sweep. For a ladle: its lane index. */
  amp?: number;
}

/** Every moving piece of the dressing. */
export function planFoundryMovers(): FoundryMover[] {
  const out: FoundryMover[] = [];
  let i = 0;
  for (const p of FIELD.props) {
    const g = ground(p.x, p.z);
    if (p.kind === 'sf_crane_base' && !isBridgeCrane(p)) {
      const scale = (p.h ?? 16) / FOUNDRY_KIT_SIZES.craneMastTop;
      out.push({
        piece: 'Kit_CraneJib',
        x: p.x,
        y: g + FOUNDRY_KIT_SIZES.craneMastTop * scale,
        z: p.z,
        rot: p.rot + foundryKitHash(i, 5) * Math.PI * 2,
        scale,
        motion: 'slew',
        rate: 0.11,
        phase: i * 2.3,
        amp: 0.9,
      });
    }
    if (p.kind === 'sf_machine_block') {
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const f = FOUNDRY_KIT_SIZES.machineFlywheel;
      out.push({
        piece: 'Kit_Flywheel',
        x: p.x + f.x * c,
        y: g + f.y,
        z: p.z - f.x * s,
        rot: p.rot,
        scale: 1,
        motion: 'spin',
        rate: 1.4 + foundryKitHash(i, 7) * 1.2,
        phase: foundryKitHash(i, 8) * 6,
      });
    }
    if (p.kind === 'sf_piston_engine') {
      out.push({
        piece: 'Kit_PistonRod',
        x: p.x,
        y: g + FOUNDRY_KIT_SIZES.pistonRodFoot,
        z: p.z,
        rot: p.rot,
        scale: 1,
        motion: 'pump',
        rate: 0.9,
        phase: foundryKitHash(i, 9),
      });
    }
    i++;
  }
  // The Stamping Press's flywheel in the crown's gearbox slot, and the gear
  // train on the gearbox's worked face (the crown faces south).
  const g = ground(0, STAMPING_PRESS.z) + PRESS_CROWN_LIFT;
  out.push({
    piece: 'Kit_Flywheel',
    x: 0,
    y: g + 5.2,
    z: STAMPING_PRESS.z,
    rot: 0,
    scale: 1,
    motion: 'spin',
    rate: 0.9,
    phase: 0,
  });
  for (const [x, rate, sc] of [
    [-2.2, 1.2, 1],
    [0.6, -1.9, 0.62],
  ] as const) {
    out.push({
      piece: 'Kit_Gear',
      x,
      y: g + 5.2,
      z: STAMPING_PRESS.z - 2.9,
      rot: 0,
      scale: sc,
      motion: 'spin',
      rate,
      phase: 0,
    });
  }
  // The Forge Gauntlet's tups, each a third of a blow behind the last.
  FOUNDRY_FORGE.hammers.forEach((h, k) => {
    out.push({
      piece: 'Kit_SteamHammerRam',
      x: h.x,
      y: FOUNDRY_FORGE.hammerBase + FOUNDRY_FORGE.strikeAt,
      z: h.z,
      rot: Math.PI / 2,
      scale: 1,
      motion: 'hammer',
      rate: 1 / FOUNDRY_FORGE.period,
      phase: k / 3,
      amp: k,
    });
  });
  // The ladles on the pour line and their trolleys.
  const L = FOUNDRY_POUR_LINE;
  const railY = ground(L.posts[0], L.railZ) + L.railLift;
  FOUNDRY_POUR_MOULDS.forEach((_, k) => {
    out.push({
      piece: 'Kit_LadleTrolley',
      x: L.railX0,
      y: railY,
      z: L.railZ,
      rot: 0,
      scale: 1,
      motion: 'trolley',
      rate: 1 / POUR_CYCLE,
      phase: k * 0.5,
      amp: k,
    });
    out.push({
      piece: 'Kit_Ladle',
      x: L.railX0,
      y: railY - FOUNDRY_KIT_SIZES.ladleHang,
      z: L.railZ,
      rot: 0,
      scale: 1,
      motion: 'ladle',
      rate: 1 / POUR_CYCLE,
      phase: k * 0.5,
      amp: k,
    });
  });
  return out;
}

// ---- motion curves (shared by the painter and the tests) --------------------------------

/** Seconds of one ladle's round: fill at the furnace, run out, pour, run back. */
export const POUR_CYCLE = 16;

/** A ladle's state at render time `t`: where it rides along the rail (x),
 *  how far it tips (0 level, 1 fully poured), and how hard the pour runs
 *  (0..1). Lane 0 fills at the furnace (the rail's west end) and pours on
 *  the west mould; lane 1 parks at the east post and pours on the east one,
 *  so the two never meet on the rail. */
export function ladleState(
  t: number,
  phase: number,
  lane: number,
): { x: number; tip: number; pour: number } {
  const L = FOUNDRY_POUR_LINE;
  const k = (((t / POUR_CYCLE + phase) % 1) + 1) % 1;
  const home = lane % 2 === 0 ? L.railX0 + 1.4 : L.railX1 - 1.4;
  const mould = FOUNDRY_POUR_MOULDS[lane % FOUNDRY_POUR_MOULDS.length];
  const ease = (u: number) => u * u * (3 - 2 * u);
  let x = home;
  let tip = 0;
  if (k < 0.15) x = home;
  else if (k < 0.35) x = home + (mould - home) * ease((k - 0.15) / 0.2);
  else if (k < 0.7) x = mould;
  else if (k < 0.9) x = mould + (home - mould) * ease((k - 0.7) / 0.2);
  if (k >= 0.38 && k < 0.66) {
    const u = (k - 0.38) / 0.28;
    tip = u < 0.2 ? ease(u / 0.2) : u > 0.8 ? ease((1 - u) / 0.2) : 1;
  }
  const pour = Math.max(0, (tip - 0.55) / 0.45);
  return { x, tip, pour };
}

/** A slewing jib's yaw at time `t`. */
export function jibYaw(t: number, rest: number, rate: number, phase: number, amp: number): number {
  return rest + Math.sin(t * rate + phase) * amp;
}

/** A piston rod's stroke (0 down, 1 up) at time `t`: a fast drive and a
 *  slower return, like a steam engine's. */
export function pistonStroke(t: number, rate: number, phase: number): number {
  const k = (((t * rate + phase) % 1) + 1) % 1;
  return k < 0.4
    ? Math.sin((k / 0.4) * (Math.PI / 2))
    : Math.cos(((k - 0.4) / 0.6) * (Math.PI / 2));
}

// ---- steam and smoke ------------------------------------------------------------------

export interface FoundryEmitter {
  kind: 'steam' | 'smoke';
  x: number;
  y: number;
  z: number;
  /** Card width and height. */
  w: number;
  h: number;
  seed: number;
}

/** Local source points per piece (game frame), from the kit's NOTAS. */
export const FOUNDRY_SOURCES: Readonly<
  Record<string, readonly { kind: 'steam' | 'smoke'; x: number; y: number; z: number }[]>
> = {
  Kit_Smokestack: [{ kind: 'smoke', x: 0, y: 24, z: 0 }],
  Kit_Boiler: [
    { kind: 'steam', x: -1.6, y: 5.0, z: 0 },
    { kind: 'smoke', x: 3.65, y: 5.0, z: 0 },
  ],
  Kit_SteamVent: [{ kind: 'steam', x: 0, y: 1.3, z: 0 }],
  Kit_BoilerHouse: [
    { kind: 'smoke', x: -4.5, y: 34, z: -2.2 },
    { kind: 'smoke', x: 4.5, y: 34, z: -2.2 },
  ],
  Kit_PressCrown: [
    { kind: 'smoke', x: -5.5, y: 16, z: 0 },
    { kind: 'smoke', x: 5.5, y: 16, z: 0 },
    { kind: 'steam', x: -15.6, y: 7.7, z: 0 },
    { kind: 'steam', x: 15.6, y: 7.7, z: 0 },
  ],
  Kit_FurnaceMouth: [{ kind: 'smoke', x: 0, y: 14, z: -3.4 }],
  Kit_LiftStation: [
    { kind: 'smoke', x: -4.9, y: 9, z: -0.7 },
    { kind: 'steam', x: 5.7, y: 7.85, z: -0.6 },
  ],
  Kit_PipeValve: [{ kind: 'steam', x: 0, y: 1.3, z: 0 }],
  Kit_BlastFurnace: [
    { kind: 'smoke', x: 0, y: 46, z: 0 },
    { kind: 'smoke', x: -10.6, y: 34, z: -2 },
    { kind: 'smoke', x: 0, y: 9, z: 9 },
  ],
  Kit_SteamHammer: [{ kind: 'steam', x: 0, y: 11.2, z: -0.9 }],
};

/** Every steam and smoke source of the static dressing, placed. */
export function planFoundryEmitters(placements: readonly FoundryKitPlacement[]): FoundryEmitter[] {
  const out: FoundryEmitter[] = [];
  placements.forEach((p, i) => {
    const sources = FOUNDRY_SOURCES[p.piece];
    if (!sources) return;
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const y0 = p.y ?? ground(p.x, p.z) + (p.lift ?? 0);
    for (const src of sources) {
      const lx = src.x * p.scale * (p.stretch ?? 1);
      const lz = src.z * p.scale;
      const smoke = src.kind === 'smoke';
      const big =
        p.piece === 'Kit_BoilerHouse' ||
        p.piece === 'Kit_FurnaceMouth' ||
        p.piece === 'Kit_BlastFurnace';
      out.push({
        kind: src.kind,
        x: p.x + lx * c + lz * s,
        y: y0 + src.y * p.scale * (p.scaleY ?? 1),
        z: p.z - lx * s + lz * c,
        w: smoke ? (big ? 9 : 6) : 3,
        h: smoke ? (big ? 34 : 22) : 7,
        seed: foundryKitHash(i, 41),
      });
    }
  });
  return out;
}

// ---- audits the tests share ------------------------------------------------------------

/** Every spawn and patrol point of the dungeon (for clearance checks). */
export function foundrySpawnPoints(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
    out.push({ x: s.x, z: s.z });
    if (s.patrol) for (const p of s.patrol.points) out.push({ x: p.x, z: p.z });
  }
  return out;
}

/** The pieces the gates draw (foundry_gates.ts): the shutters, the arc
 *  fences, and the Crane Bridge's span on the bridge crane's hook. */
export const FOUNDRY_GATE_PIECES: readonly string[] = [
  'Kit_ShutterFrame',
  'Kit_ShutterPanel',
  'Kit_ArcPost',
  'Kit_BridgeSpan',
  'Kit_CraneJib',
  'Kit_HookBlock',
  'Kit_Cable',
  'Kit_Chain',
];

/** The pieces another painter adopts through foundryKitPiece (the moving
 *  press: foundry_press.ts takes the carriage, the hammer and the ram). */
export const FOUNDRY_ADOPTED_PIECES: readonly string[] = [
  'Kit_PressHammer',
  'Kit_PressCarriage',
  'Kit_PressRam',
];
