// Pure plan for the Stormbrass Foundry's set dressing (foundry_*.ts): the
// palette, where the lights stand, the storm's lightning clock, the jagged
// bolt shapes, the cranes' sweep, the Prime Draft landmark's head aim, and the
// gates' motion curves. Everything here is a function of the authored field
// (sim/content/stormbrass_foundry_layout.ts) and the shared render clock, so
// the dressing is deterministic and testable without Three.
//
// Three-free, DOM-free, deterministic.

import {
  CELL_RACKS,
  COIL_CROWN,
  CRANE_BRIDGE,
  GANTRY,
  GREAT_COIL,
  STORMBRASS_FOUNDRY_FIELD,
} from '../../sim/content/stormbrass_foundry_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';

/** The design's palette (docs/design/dungeon-rework/stormbrass_foundry.md
 *  section 7): no orange lava or ember tones; enemy power is blue-white. */
export const FOUNDRY_PALETTE = {
  brass: 0xc9a14a,
  verdigris: 0x4e9c8a,
  iron: 0x3b3f46,
  stone: 0x6e7378,
  steam: 0xe9eef0,
  storm: 0x56657a,
  lightning: 0xcfe8ff,
  hazard: 0xe6c229,
  black: 0x1b1d20,
  wood: 0x5d4632,
  blueprint: 0x2f5f9e,
} as const;

/** Where the Prime Draft landmark stands: in its scaffold beyond the Gantry's
 *  north lip, on a render-only plinth out of the drop, facing the lift. */
export const PRIME_DRAFT_LANDMARK = {
  x: GANTRY.x,
  z: GANTRY.z + GANTRY.r + 11,
  /** Its feet (the plinth top), level with the Gantry floor. */
  y: GANTRY.h,
  /** Its height to the crown of the head (about four times a player's at the
   *  fight; the landmark is the bigger shot, section 4.3). */
  height: 42,
} as const;

/** Where the great coil's crown takes its strikes (instance-local). */
export const COIL_TOP = { x: GREAT_COIL.x, y: COIL_CROWN.h + 30, z: GREAT_COIL.z } as const;

export type FoundryLightKind = 'lamp' | 'coil' | 'cell' | 'crown' | 'forge';

export interface FoundryLightSpot {
  kind: FoundryLightKind;
  x: number;
  z: number;
  /** Height above the floor under it. */
  lift: number;
  /** Absolute height instead (a light out over the drop: the molten river). */
  y?: number;
}

export const FOUNDRY_LIGHT_STYLE: Readonly<
  Record<FoundryLightKind, { color: number; intensity: number; range: number }>
> = {
  lamp: { color: 0xffd98a, intensity: 2.2, range: 16 },
  coil: { color: 0xcfe8ff, intensity: 3.2, range: 24 },
  cell: { color: 0x8fd0ff, intensity: 2.4, range: 14 },
  crown: { color: 0xa9d4ff, intensity: 3, range: 30 },
  // The furnaces' mouths and the molten river: warm forge orange against the
  // storm's cold blue.
  forge: { color: 0xff8a3a, intensity: 3.4, range: 22 },
};

/** Every budgeted point light: the work lamps on their poles, the coil's
 *  glow on the crown, the charging racks' cells. Few and spread out, well
 *  inside the eight-per-zone budget. */
export function planFoundryLights(): FoundryLightSpot[] {
  const out: FoundryLightSpot[] = [];
  for (const p of STORMBRASS_FOUNDRY_FIELD.props) {
    if (p.kind === 'sf_work_lamp') out.push({ kind: 'lamp', x: p.x, z: p.z, lift: 3.8 });
  }
  out.push({ kind: 'crown', x: GREAT_COIL.x, z: GREAT_COIL.z, lift: 12 });
  for (const r of CELL_RACKS) out.push({ kind: 'cell', x: r.x, z: r.z, lift: 3 });
  // The Main Line's two press lamps.
  out.push({ kind: 'lamp', x: -22, z: -6, lift: 6 });
  out.push({ kind: 'lamp', x: 22, z: -6, lift: 6 });
  // The forge's own light: the molten river under the Line Catwalk (out over
  // the drop, so at its own height), the furnace feeding it, and the pour
  // line's furnace mouth on the crane pad.
  for (const x of [-24, 0, 24])
    out.push({ kind: 'forge', x, z: MOLTEN_Z, lift: 0, y: MOLTEN_Y + 2 });
  out.push({ kind: 'forge', x: -37, z: MOLTEN_Z, lift: 0, y: MOLTEN_Y + 3 });
  out.push({ kind: 'forge', x: -33, z: -72, lift: 2 });
  // The Forge Gauntlet's blast furnace mouth (foundry_kit_plan_core.ts
  // forgeFurnacePoints; pinned equal by the kit test), out over the drop.
  out.push({ kind: 'forge', x: 21, z: 184, lift: 0, y: 23 });
  return out;
}

/** The flood masts standing in the lips' parapets (the kit plan stands a
 *  Kit_FloodMast on each; planFoundryGlows pools their light on the floor). */
export const FOUNDRY_FLOOD_MASTS: readonly (readonly [number, number])[] = [
  [-54.8, -155],
  [54.8, -145],
  [-38, -189.8],
  [38, -189.8],
  [39.8, -94],
  [39.8, -70],
  [-23.8, -22],
  [23.8, -22],
  [-49.8, 72],
  [49.8, 72],
  [-44.8, 142],
  [44.8, 134],
];
/** The lamp heads' height on a flood mast. */
export const FOUNDRY_FLOOD_MAST_LAMP = 9.1;

export interface FoundryGlowSpot {
  /** `flood`: a mast's lamp head. `ember`: a boiler's firebox door. */
  kind: 'flood' | 'ember';
  /** The glow's own point (instance-local, absolute height). */
  x: number;
  y: number;
  z: number;
  /** Its pool of light on the floor (null when no floor lies under it). */
  pool: { x: number; y: number; z: number; r: number } | null;
}

/** The lit points that are NOT lights: every flood mast's lamp head and every
 *  boiler's firebox door, each a glow in the air and a pool of its colour on
 *  the floor it would light. Painted, not lit: the point-light budget stays
 *  with the lamps, the coil and the forge (planFoundryLights). */
export function planFoundryGlows(): FoundryGlowSpot[] {
  const field = STORMBRASS_FOUNDRY_FIELD;
  const out: FoundryGlowSpot[] = [];
  const floorAt = (x: number, z: number) => authoredFieldHeight(field, x, z);
  for (const [x, z] of FOUNDRY_FLOOD_MASTS) {
    const g = floorAt(x, z);
    // The pool falls on the floor inside the lip: toward the walkable side.
    let px = 0;
    let pz = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (Math.abs(floorAt(x + Math.cos(a) * 5, z + Math.sin(a) * 5) - g) < 0.5) {
        px += Math.cos(a);
        pz += Math.sin(a);
      }
    }
    const len = Math.hypot(px, pz);
    out.push({
      kind: 'flood',
      x,
      y: g + FOUNDRY_FLOOD_MAST_LAMP,
      z,
      pool: len > 0.1 ? { x: x + (px / len) * 4.5, y: g, z: z + (pz / len) * 4.5, r: 9 } : null,
    });
  }
  for (const p of field.props) {
    if (p.kind !== 'sf_boiler') continue;
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const g = floorAt(p.x, p.z);
    // The firebox door on the boiler's local -x end, its glow spilling out.
    const at = (d: number): [number, number] => [p.x - d * c, p.z + d * s];
    const [dx, dz] = at(4.2);
    const [fx, fz] = at(6.2);
    out.push({
      kind: 'ember',
      x: dx,
      y: g + 1.3,
      z: dz,
      pool: Math.abs(floorAt(fx, fz) - g) < 0.5 ? { x: fx, y: g, z: fz, r: 3.6 } : null,
    });
  }
  return out;
}

/** The molten river's line and surface (foundry_kit_plan_core.ts
 *  FOUNDRY_MOLTEN_CHANNEL; pinned equal by the render core test). */
const MOLTEN_Z = -51;
const MOLTEN_Y = 2.5;

/** A 0..1 hash of an integer and a salt. */
export function foundryHash(n: number, salt = 0): number {
  const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Seconds between the storm's strikes on the coil (every few seconds). */
export const STRIKE_PERIOD = 4.2;
/** How long a strike's bolt stays lit. */
export const STRIKE_LIT = 0.32;

/** The coil strike at render time `t`: which bolt shape shows and how bright
 *  (0 between strikes). Some beats stay dark, so the rhythm never reads as a
 *  metronome. Cosmetic only (never a telegraph). */
export function coilStrikeAt(t: number, shapes: number): { shape: number; flash: number } {
  const beat = Math.floor(t / STRIKE_PERIOD);
  const into = t - beat * STRIKE_PERIOD - foundryHash(beat, 1) * 1.4;
  if (foundryHash(beat, 2) < 0.18 || into < 0 || into > STRIKE_LIT) return { shape: 0, flash: 0 };
  // A double flicker: bright, a dip, bright again, then gone.
  const k = into / STRIKE_LIT;
  const flicker = k < 0.35 ? 1 : k < 0.5 ? 0.35 : 1 - (k - 0.5) * 1.6;
  return { shape: Math.floor(foundryHash(beat, 3) * shapes) % shapes, flash: Math.max(0, flicker) };
}

/** Seconds the great coil keeps glowing after a strike (its windings cool). */
export const STRIKE_AFTERGLOW = 2.4;

/** The coil's glow at render time `t`: the strike's own flare while the bolt
 *  is lit, then a slow cooling afterglow (0 once it has faded). Looks back
 *  one beat, so a strike late in a beat still glows into the next. */
export function coilAfterglowAt(t: number): number {
  let best = 0;
  const beat = Math.floor(t / STRIKE_PERIOD);
  for (let b = beat; b >= beat - 1; b--) {
    if (foundryHash(b, 2) < 0.18) continue;
    const start = b * STRIKE_PERIOD + foundryHash(b, 1) * 1.4;
    const into = t - start;
    if (into < 0) continue;
    if (into <= STRIKE_LIT) {
      best = Math.max(best, 1);
      continue;
    }
    const cool = (into - STRIKE_LIT) / STRIKE_AFTERGLOW;
    if (cool < 1) best = Math.max(best, 0.75 * (1 - cool) * (1 - cool));
  }
  return best;
}

/**
 * A jagged bolt from `top` down to `bottom` (instance-local points), `steps`
 * segments with a sideways jitter that tapers to the ends. Deterministic per
 * `seed`.
 */
export function boltPath(
  seed: number,
  top: { x: number; y: number; z: number },
  bottom: { x: number; y: number; z: number },
  steps: number,
  jitter: number,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const taper = Math.sin(Math.PI * k);
    const jx = (foundryHash(i, seed * 13 + 1) - 0.5) * 2 * jitter * taper;
    const jz = (foundryHash(i, seed * 13 + 2) - 0.5) * 2 * jitter * taper;
    out.push({
      x: top.x + (bottom.x - top.x) * k + jx,
      y: top.y + (bottom.y - top.y) * k,
      z: top.z + (bottom.z - top.z) * k + jz,
    });
  }
  return out;
}

/** A crane arm's slow sweep (radians) at time `t`: a lazy back-and-forth
 *  about its rest angle, each crane on its own phase. */
export function craneYaw(t: number, rest: number, phase: number): number {
  return rest + Math.sin(t * 0.11 + phase * 2.3) * 0.9;
}

/**
 * The Prime Draft landmark's head yaw toward a viewer at (vx, vz): it turns to
 * follow the group, never past `limit` radians either side of its rest facing
 * (south, toward the lift). Three's yaw about +y: 0 faces +z.
 */
export function primeDraftHeadYaw(vx: number, vz: number, limit = 1.05): number {
  const dx = vx - PRIME_DRAFT_LANDMARK.x;
  const dz = vz - PRIME_DRAFT_LANDMARK.z;
  // Rest is facing -z (south); the offset from rest, clamped.
  const toward = Math.atan2(dx, dz);
  let off = toward - Math.PI;
  while (off > Math.PI) off -= Math.PI * 2;
  while (off < -Math.PI) off += Math.PI * 2;
  return Math.PI + Math.max(-limit, Math.min(limit, off));
}

/** A steam shutter's lift (0 shut, 1 fully raised into its housing), eased. */
export function shutterLift(openness: number): number {
  const k = Math.min(1, Math.max(0, openness));
  return k * k * (3 - 2 * k);
}

/** The crane bridge's extension (0 folded back on its landing, 1 laid across
 *  the gulf): it swings out first, then runs out along its rails. */
export function bridgeExtension(openness: number): { swing: number; run: number } {
  const k = Math.min(1, Math.max(0, openness));
  return { swing: Math.min(1, k * 2), run: Math.max(0, k * 2 - 1) };
}

/** The flat lip the extended deck carries past its ramp's end, tucked under
 *  the Drafting Yard's edge so no seam shows where the two meet. */
export const CRANE_BRIDGE_APRON = 1;

/** The Crane Bridge's deck fully extended, in the instance frame: the pitched
 *  ramp the gate rig draws (`foundry_gates.ts` craneBridge), from the Crane
 *  Landing's lip to the yard, plus its apron. `deckAt(z)` is the drawn top
 *  over the bridge's centre line, NaN off the deck. */
export function craneBridgeDeck(): {
  fromZ: number;
  toZ: number;
  len: number;
  pitch: number;
  deckAt: (z: number) => number;
} {
  const span = CRANE_BRIDGE.toZ - CRANE_BRIDGE.fromZ;
  const rise = CRANE_BRIDGE.toH - CRANE_BRIDGE.fromH;
  const len = Math.hypot(span, rise);
  const pitch = -Math.atan2(rise, span);
  const rampEnd = CRANE_BRIDGE.fromZ + len * Math.cos(pitch);
  const toZ = rampEnd + CRANE_BRIDGE_APRON;
  const deckAt = (z: number): number => {
    if (z < CRANE_BRIDGE.fromZ || z > toZ) return Number.NaN;
    if (z >= rampEnd) return CRANE_BRIDGE.toH;
    return CRANE_BRIDGE.fromH + ((z - CRANE_BRIDGE.fromZ) / span) * rise;
  };
  return { fromZ: CRANE_BRIDGE.fromZ, toZ, len, pitch, deckAt };
}

/** An arc fence's charge (1 live, 0 powered down), with a dying stutter. */
export function arcFenceCharge(openness: number, t: number): number {
  const k = Math.min(1, Math.max(0, openness));
  if (k <= 0) return 1;
  if (k >= 1) return 0;
  return (1 - k) * (0.6 + 0.4 * (Math.sin(t * 40) > 0 ? 1 : 0));
}

// ---- the mountain round the shelf ----------------------------------------------------------

/** Smooth value noise over the hashed lattice (0..1). */
function valueNoise(x: number, z: number, salt: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number): number => foundryHash(a * 157 + b * 9973, salt);
  const top = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * ux;
  const bot = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * ux;
  return top + (bot - top) * uz;
}

/** How far (yards) a spot lies outside the shelf's walkable footprint. */
export function outsideShelf(x: number, z: number): number {
  const b = STORMBRASS_FOUNDRY_FIELD.bounds;
  const dx = Math.max(0, b.minX - x, x - b.maxX);
  const dz = Math.max(0, b.minZ - z, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** The deepest the valley floor comes near the shelf: well under the sim's
 *  void height, so nothing below the drop ever reads as a ledge to land on. */
export const VALLEY_FLOOR_MAX_NEAR = STORMBRASS_FOUNDRY_FIELD.voidHeight - 10;

/**
 * The rock below and around the Foundry's shelf (no sea: the shelf is cut
 * into a mountain). Near the shelf a deep, ridged scree floor far under the
 * drop; farther out it climbs into the mountain's flanks that meet the ring
 * of peaks. Instance-local yards.
 */
export function foundryValleyHeight(x: number, z: number): number {
  const out = outsideShelf(x, z);
  const ridged = 1 - Math.abs(valueNoise(x * 0.018, z * 0.018, 21) * 2 - 1);
  const scree = valueNoise(x * 0.07, z * 0.07, 22);
  // Never above the near maximum, never below the cliffs' feet (they run down
  // to about 25 yd under the void height), so every cliff face meets rock.
  const floor = VALLEY_FLOOR_MAX_NEAR - 14 + ridged * 10 + scree * 4;
  // The flanks rise from about 140 yd out toward the peaks.
  const k = Math.min(1, Math.max(0, (out - 140) / 260));
  const flank = k * k * (3 - 2 * k) * (150 + ridged * 70);
  return floor + flank;
}

/** The buttresses: great rock shoulders standing out of the valley round the
 *  shelf's flanks, their tops always below the shelf's floor and never on
 *  walkable ground. */
export function planFoundryButtresses(
  density: number,
): { x: number; z: number; r: number; base: number; top: number }[] {
  const b = STORMBRASS_FOUNDRY_FIELD.bounds;
  const out: { x: number; z: number; r: number; base: number; top: number }[] = [];
  const count = Math.round(14 + 10 * density);
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const perimeter = 2 * (w + d);
  for (let i = 0; i < count; i++) {
    // Walk the footprint's outline, then step out past its edge.
    let s = ((i + foundryHash(i, 30) * 0.6) / count) * perimeter;
    let px: number;
    let pz: number;
    let nx: number;
    let nz: number;
    if (s < w) {
      px = b.minX + s;
      pz = b.minZ;
      nx = 0;
      nz = -1;
    } else if (s - w < d) {
      s -= w;
      px = b.maxX;
      pz = b.minZ + s;
      nx = 1;
      nz = 0;
    } else if (s - w - d < w) {
      s -= w + d;
      px = b.maxX - s;
      pz = b.maxZ;
      nx = 0;
      nz = 1;
    } else {
      s -= w + d + w;
      px = b.minX;
      pz = b.maxZ - s;
      nx = -1;
      nz = 0;
    }
    const r = 26 + foundryHash(i, 31) * 22;
    const gap = r + 30 + foundryHash(i, 32) * 40;
    out.push({
      x: px + nx * gap,
      z: pz + nz * gap,
      r,
      base: VALLEY_FLOOR_MAX_NEAR - 30,
      top: -34 + foundryHash(i, 33) * 26,
    });
  }
  return out;
}

/** The steam and furnace smoke that climbs the mountain's face below the
 *  shelf's rim (vented from the foundry's works inside the rock): tall plumes
 *  standing just past the footprint, their feet far down the cliffs. */
export function planFoundryPlumes(
  density: number,
): { x: number; z: number; y: number; w: number; h: number; seed: number }[] {
  const b = STORMBRASS_FOUNDRY_FIELD.bounds;
  const count = Math.round(6 + 6 * density);
  const out: { x: number; z: number; y: number; w: number; h: number; seed: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const side = i % 2 === 0 ? -1 : 1;
    const z = b.minZ + 30 + t * (b.maxZ - b.minZ - 60);
    const x = side * (b.maxX + 18 + foundryHash(i, 41) * 22);
    out.push({
      x,
      z,
      y: -60 + foundryHash(i, 42) * 20,
      w: 18 + foundryHash(i, 43) * 10,
      h: 70 + foundryHash(i, 44) * 30,
      seed: foundryHash(i, 45),
    });
  }
  return out;
}
