// Pure plan of the Stormbrass Foundry's floor marks: what a working foundry
// leaves on its decks. Oil and scorch stains, puddles of quenching water,
// spilled slag, drains and vent grilles, plate seams, worn hazard paint and
// lane lines, the draughtsmen's chalk layouts round the model frames, a
// turntable in the Rail Yard, and on the ranges' packed earth the ruts of
// tracked machines and the craters round every target. Flat quads lying on the
// walkable floor (the painter, foundry_floor_decals.ts, draws them all in one
// mesh on the floor ladder's GROUND rung, under every telegraph).
//
// Every mark lies wholly on ONE flat floor (its corners and centre share a
// height), so none hangs over a lip or climbs a stair. Cosmetic only.
//
// Three-free, DOM-free, deterministic.

import {
  MAIN_LINE_BELTS,
  STORMBRASS_FOUNDRY_FIELD,
  STORMBRASS_FOUNDRY_VOID_HEIGHT,
} from '../../sim/content/stormbrass_foundry_layout';
import { authoredFieldHeight, authoredFieldSurfaceAt } from '../../sim/instances/authored_field';

/** The marks, in atlas order (a 4 by 4 atlas: foundry_floor_decals.ts). */
export const FOUNDRY_DECAL_KINDS = [
  'oil',
  'scorch',
  'hazard',
  'chalk',
  'puddle',
  'drain',
  'slag',
  'ruts',
  'crater',
  'seam',
  'rust',
  'lane',
  'keepClear',
  'turntable',
  'grille',
  'scuff',
] as const;
export type FoundryDecalKind = (typeof FOUNDRY_DECAL_KINDS)[number];

export interface FoundryDecal {
  kind: FoundryDecalKind;
  x: number;
  z: number;
  /** Yaw (three.js rotation.y) of the quad's local x. */
  rot: number;
  /** Size along its local x and z (yards). */
  w: number;
  d: number;
  /** The floor it lies on. */
  y: number;
  /** Sheds on the low tier (the scatter; the authored marks stay). */
  cosmetic: boolean;
}

// ---- the floor's ladder of heights ---------------------------------------------------
// Three things lie level on a Foundry floor: the field's own floor, the painted
// marks, and the kit's flat faces (the rail bed's ballast). Two of them at one
// height are drawn at one depth, and they tear and shimmer as the camera moves,
// so each stands on its own rung, a real height apart (pinned against the
// shipped kit in tests/stormbrass_foundry_kit.test.ts).

/** The lowest mark's lift over its floor (yards). */
export const FOUNDRY_FLOOR_MARK_LIFT = 0.025;
/** A hair more per mark, so two overlapping marks never share a height. */
const FOUNDRY_FLOOR_MARK_STEP = 0.002;
const FOUNDRY_FLOOR_MARK_STEPS = 7;
/** The highest mark's lift over its floor. */
export const FOUNDRY_FLOOR_MARK_TOP =
  FOUNDRY_FLOOR_MARK_LIFT + (FOUNDRY_FLOOR_MARK_STEPS - 1) * FOUNDRY_FLOOR_MARK_STEP;
/** The lowest a level kit face may lie over a floor: clear of every mark. */
export const FOUNDRY_FLOOR_KIT_CLEAR = 0.045;
/** A level kit face this far under the floor is buried, never drawn over it. */
export const FOUNDRY_FLOOR_BURIED = 0.004;
/** The rail track's lift: its ballast bed is modelled 0.05 thick with its top
 *  at 0, so this stands the bed ON the floor with its top over every mark. */
export const FOUNDRY_RAIL_BED_LIFT = 0.05;

/** The height a mark is drawn at: its floor, its rung, and its own hair. */
export function foundryFloorMarkHeight(d: { y: number }, index: number): number {
  return (
    d.y + FOUNDRY_FLOOR_MARK_LIFT + (index % FOUNDRY_FLOOR_MARK_STEPS) * FOUNDRY_FLOOR_MARK_STEP
  );
}

const FIELD = STORMBRASS_FOUNDRY_FIELD;
const VOID = STORMBRASS_FOUNDRY_VOID_HEIGHT;
const floorAt = (x: number, z: number): number => authoredFieldHeight(FIELD, x, z);

function hash(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** The quad's four corners in the instance frame. */
export function decalCorners(d: {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
}): [number, number][] {
  const c = Math.cos(d.rot);
  const s = Math.sin(d.rot);
  const hw = d.w / 2;
  const hd = d.d / 2;
  return (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([lx, lz]) => [d.x + lx * c + lz * s, d.z - lx * s + lz * c]);
}

/** The floor a mark lies on, or null when it would overhang a lip, a stair
 *  or a belt. */
function flatFloor(d: { x: number; z: number; rot: number; w: number; d: number }): number | null {
  const y = floorAt(d.x, d.z);
  if (y <= VOID + 1) return null;
  for (const [x, z] of decalCorners(d)) if (Math.abs(floorAt(x, z) - y) > 0.01) return null;
  // The belts are their own surface (a shader plane over the deck).
  const B = MAIN_LINE_BELTS;
  for (const [x, z] of [[d.x, d.z], ...decalCorners(d)]) {
    if (z < B.z0 - 1 || z > B.z1 + 1) continue;
    for (const bx of B.xs) if (Math.abs(x - bx) < B.halfWidth + 0.8) return null;
  }
  return y;
}

/** Is the point under a tall prop (the mark would be hidden, or lie under a
 *  wall)? Marks may run up to a machine's foot, not under it. */
function underProp(x: number, z: number): boolean {
  for (const p of FIELD.props) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (p.r !== undefined && p.r > 0) {
      if (Math.hypot(dx, dz) < p.r) return true;
    } else if (p.hw !== undefined && p.hd !== undefined) {
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      if (Math.abs(dx * c - dz * s) < p.hw && Math.abs(dx * s + dz * c) < p.hd) return true;
    }
  }
  return false;
}

type Mix = readonly (readonly [FoundryDecalKind, number, number, number])[];

/** What each ground leaves on it: kind, weight, smallest and largest size. */
const MIX: Readonly<Record<string, Mix>> = {
  plate: [
    ['oil', 5, 2.2, 5],
    ['seam', 4, 6, 10],
    ['scuff', 4, 3, 7],
    ['rust', 3, 2, 5],
    ['puddle', 2, 2, 4.5],
    ['drain', 1.5, 1.4, 1.8],
    ['grille', 1.5, 1.8, 2.4],
    ['scorch', 1.5, 2, 4],
    ['hazard', 1.5, 3.5, 4.5],
  ],
  soot: [
    ['oil', 5, 2.5, 6],
    ['scorch', 4, 2.5, 6],
    ['slag', 3, 2, 4.5],
    ['puddle', 3, 2.5, 5.5],
    ['scuff', 3, 3, 7],
    ['rust', 2, 2, 5],
    ['drain', 1.5, 1.4, 1.8],
    ['lane', 1, 5, 7],
  ],
  earth: [
    ['ruts', 6, 7, 12],
    ['crater', 3, 2.5, 5],
    ['scorch', 3, 2.5, 6],
    ['puddle', 2, 2.5, 5],
    ['scuff', 2, 3, 6],
    ['oil', 1, 2, 4],
  ],
  grating: [],
  flagstone: [
    ['scorch', 2, 1.5, 3],
    ['oil', 1, 1.5, 3],
  ],
};

/** Square yards of floor per scattered mark. */
const SCATTER_AREA = 46;

function pick(mix: Mix, u: number): Mix[number] {
  let total = 0;
  for (const m of mix) total += m[1];
  let at = u * total;
  for (const m of mix) {
    at -= m[1];
    if (at <= 0) return m;
  }
  return mix[mix.length - 1];
}

/** The scatter: marks hashed over every flat surface, by its ground. */
export function planDecalScatter(): FoundryDecal[] {
  const out: FoundryDecal[] = [];
  FIELD.surfaces.forEach((s, si) => {
    if (s.hidden || s.kind === 'path') return;
    const mix = MIX[s.ground ?? 'flagstone'];
    if (!mix || mix.length === 0) return;
    let minX: number;
    let maxX: number;
    let minZ: number;
    let maxZ: number;
    if (s.kind === 'circle') {
      minX = s.x - s.r;
      maxX = s.x + s.r;
      minZ = s.z - s.r;
      maxZ = s.z + s.r;
    } else {
      const xs = s.points.map((p) => p[0]);
      const zs = s.points.map((p) => p[1]);
      minX = Math.min(...xs);
      maxX = Math.max(...xs);
      minZ = Math.min(...zs);
      maxZ = Math.max(...zs);
    }
    const count = Math.round(((maxX - minX) * (maxZ - minZ)) / SCATTER_AREA);
    for (let i = 0; i < count; i++) {
      const key = si * 1000 + i;
      const [kind, , lo, hi] = pick(mix, hash(key, 1));
      const size = lo + (hi - lo) * hash(key, 2);
      // Strips (seams, ruts, lanes, hazard bands) run with the deck's axes.
      const strip = kind === 'seam' || kind === 'ruts' || kind === 'lane' || kind === 'hazard';
      const rot = strip
        ? (Math.floor(hash(key, 3) * 2) * Math.PI) / 2 + (kind === 'ruts' ? hash(key, 7) - 0.5 : 0)
        : hash(key, 3) * Math.PI * 2;
      const d: Omit<FoundryDecal, 'y'> = {
        kind,
        x: minX + (maxX - minX) * hash(key, 4),
        z: minZ + (maxZ - minZ) * hash(key, 5),
        rot,
        w: size,
        d: strip
          ? kind === 'ruts'
            ? 3.2
            : kind === 'hazard'
              ? 0.9
              : 0.7
          : size * (0.7 + 0.5 * hash(key, 6)),
        cosmetic: true,
      };
      if (authoredFieldSurfaceAt(FIELD, d.x, d.z)?.id !== s.id) continue;
      if (underProp(d.x, d.z)) continue;
      const y = flatFloor(d);
      if (y === null) continue;
      out.push({ ...d, y });
    }
  });
  return out;
}

/** The authored marks: where the work itself stains the floor. */
export function planDecalFeatures(): FoundryDecal[] {
  const out: FoundryDecal[] = [];
  const add = (kind: FoundryDecalKind, x: number, z: number, w: number, d = w, rot = 0): void => {
    const mark = { kind, x, z, rot, w, d, cosmetic: false };
    const y = flatFloor(mark);
    if (y !== null) out.push({ ...mark, y });
  };
  FIELD.props.forEach((p, i) => {
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    /** A point `along` the prop's local x and `across` its local z. */
    const at = (along: number, across: number): [number, number] => [
      p.x + along * c + across * s,
      p.z - along * s + across * c,
    ];
    switch (p.kind) {
      case 'sf_target_frame': {
        // Craters and scorch where the shells fall short and long.
        for (let k = 0; k < 4; k++) {
          const a = hash(i * 10 + k, 11) * Math.PI * 2;
          const r = 2.2 + hash(i * 10 + k, 12) * 4.5;
          add(
            k % 2 ? 'scorch' : 'crater',
            p.x + Math.cos(a) * r,
            p.z + Math.sin(a) * r,
            2.4 + hash(i * 10 + k, 13) * 2.6,
          );
        }
        break;
      }
      case 'sf_boiler': {
        // Ash and scorch before the firebox, a puddle under the feed valve.
        const [fx, fz] = at(-6.4, 0);
        add('scorch', fx, fz, 4.6, 3.6, p.rot);
        const [wx, wz] = at(1.5, 3.4);
        add('puddle', wx, wz, 3.2, 2.4, p.rot + 0.4);
        break;
      }
      case 'sf_machine_block': {
        const [ox, oz] = at(0, -3.9);
        add('oil', ox, oz, 5, 3.2, p.rot);
        const [hx, hz] = at(0, 3.6);
        add('hazard', hx, hz, 7.6, 0.9, p.rot);
        break;
      }
      case 'sf_piston_engine': {
        const [ox, oz] = at(0, 2.6);
        add('oil', ox, oz, 3.6, 2.8, p.rot);
        break;
      }
      case 'sf_crane_base':
        add('keepClear', p.x, p.z, 8.6);
        break;
      case 'sf_furnace': {
        const [fx, fz] = at(0, 6.5);
        add('scorch', fx, fz, 8, 6, p.rot);
        const [sx, sz] = at(2.5, 9);
        add('slag', sx, sz, 4.2, 3.4, p.rot + 0.5);
        break;
      }
      case 'sf_pour_frame':
        add('slag', p.x + 2.4, p.z + 2.6, 3.6);
        break;
      case 'sf_model_frame':
        // The draughtsmen's chalk layout round the frame.
        add('chalk', p.x, p.z, 9.5, 9.5, p.rot);
        break;
      case 'sf_blueprint_table': {
        const [cx, cz] = at(0, 5.4);
        add('chalk', cx, cz, 6, 6, p.rot + 0.3);
        break;
      }
      case 'sf_water_tower':
        add('puddle', p.x + 4.6, p.z + 3.2, 5, 3.6, 0.4);
        break;
      case 'sf_steam_vent':
        add('rust', p.x, p.z, 3.4);
        break;
      case 'sf_cell_rack':
      case 'sf_cell_rack_small': {
        const [hx, hz] = at(0, -2.6);
        add('hazard', hx, hz, 5.4, 0.9, p.rot);
        break;
      }
      case 'sf_press_post': {
        add('oil', p.x, p.z + 2.6, 3.4, 2.4);
        break;
      }
      case 'sf_great_coil':
        add('scorch', p.x, p.z + 7.5, 7, 5);
        add('scorch', p.x - 7, p.z - 3, 6, 5, 1.1);
        add('keepClear', p.x, p.z, 13.5);
        break;
      default:
    }
  });
  // The pour line's moulds: scorch under the falling metal.
  add('scorch', -28, -72, 6.5, 4.4);
  add('scorch', -16, -72, 6.5, 4.4);
  add('slag', -22, -69.4, 3.4, 2.6, 0.3);
  // The Rail Yard: a turntable inside the Hauler's loop, lanes to the stair.
  add('turntable', 0, -160, 15);
  for (const z of [-184, -176, -148, -140]) {
    add('lane', -5.4, z, 6.4, 0.7, Math.PI / 2);
    add('lane', 5.4, z, 6.4, 0.7, Math.PI / 2);
  }
  // The Main Line: hazard bands across the walkways at the press and the chute.
  for (const x of [-21.6, -10, 0, 10, 21.6]) {
    add('hazard', x, -40.6, 3.6, 0.9);
    add('hazard', x, -9.2, 3.6, 0.9);
  }
  for (const x of [-10, 0, 10]) add('grille', x, -24, 2.2, 1.6, Math.PI / 2);
  // The Crane Landing: where the span seats, and the crane's swing.
  add('hazard', 0, 5.2, 9, 0.9);
  add('scuff', 0, 2.5, 8, 4);
  // The Drafting Yard: lanes up the middle, a great chalk elevation of the
  // colossus on the open floor, quench puddles by the boiler.
  for (const z of [50, 58, 66, 74, 82, 90]) {
    add('lane', -7.4, z, 6.2, 0.7, Math.PI / 2);
    add('lane', 7.4, z, 6.2, 0.7, Math.PI / 2);
  }
  add('chalk', -22, 62, 13, 13, 0.2);
  add('chalk', 24, 58, 11, 11, -0.4);
  add('chalk', 0, 84, 10, 10, 0);
  add('puddle', -38, 88, 5.2, 3.8, 0.3);
  add('hazard', 0, 46.2, 9, 0.9);
  // The Gantry Approach: lanes to the catwalk, a drain line, keep-clear rings.
  for (const z of [122, 130, 138, 146, 154, 162]) {
    add('lane', -8, z, 6.2, 0.7, Math.PI / 2);
    add('lane', 8, z, 6.2, 0.7, Math.PI / 2);
  }
  for (const x of [-30, -18, 18, 30]) add('drain', x, 142, 1.7);
  add('keepClear', -20, 132, 9);
  add('keepClear', 22, 150, 9);
  add('hazard', 0, 166.6, 11, 0.9);
  // The Gantry: scorch rings where the storm cells discharge.
  add('scorch', -10, 198, 7, 6, 0.4);
  add('scorch', 11, 200, 6, 6, 1.2);
  add('hazard', 0, 181.4, 11, 0.9);
  // The ranges: the firing lines' ruts and the gate's churned ground.
  for (const x of [-98, -86, -74, -62]) add('ruts', x, -8, 12, 3.4, Math.PI / 2 + (x % 5) * 0.03);
  for (const z of [-66, -56, -46, -38]) add('ruts', -76, z, 12, 3.4, (z % 3) * 0.05);
  add('ruts', -78, -26, 10, 3.4, Math.PI / 2);
  return out;
}

/** Every floor mark. */
export function planFoundryFloorDecals(): FoundryDecal[] {
  return [...planDecalFeatures(), ...planDecalScatter()];
}
