// Pure plan for the Smith's Heart blockout (docs/design/raid/smith_heart.md):
// the palette, the placeholder recipe of every `sh_*` prop kind the field
// places (boxes, cylinders, cones and gems in the vein's colour family, until
// the art phase gives each its own model), where a prop's base stands, and
// the budgeted point lights (one colour key per vein at its guardian's arena
// and at its mouth on the Ring, the heart seal, the forge's crucibles and the
// Frozen Lake's braziers).
//
// Three-free, DOM-free, deterministic: the painters (heart_props.ts,
// heart_lights.ts) read these tables, and tests/smith_heart_render_core.test.ts
// pins them against the sim layout.

import {
  BREATH,
  HEART_SEAL,
  HEAT,
  QUENCH,
  RING,
  ringPoint,
  SMITH_HEART_BOSS_SPOTS,
  SMITH_HEART_FIELD,
  SMITH_HEART_VEIN_COLORS,
  type SmithHeartVein,
} from '../../sim/content/smith_heart_layout';
import { authoredFieldHeight, authoredFieldSurfaceAt } from '../../sim/instances/authored_field';
import type { FieldLightZone } from '../../sim/instances/authored_field/types';

/** The palette (linear hex; the materials take them as three colours). */
export const HEART_PALETTE = {
  /** Stormcrag granite: the mountain's own stone. */
  stone: 0x6f6a64,
  /** Darker basalt for bases and the walls' shadowed faces. */
  dark: 0x3e3b39,
  /** The Smith's runed bronze. */
  bronze: 0x9a7038,
  /** The Ring's forge accent (its light zone's accent). */
  ring: 0xd8c8a0,
  /** A brazier's warm coal (the Quench form's only warmth). */
  coal: 0xffa850,
} as const;

/** A prop part's material family: plain stone, dark rock, bronze, or a glow
 *  in the vein's colour (an emissive face, never a light). */
export type HeartTone = 'stone' | 'dark' | 'bronze' | 'glow';
export type HeartShape = 'box' | 'cyl' | 'cone' | 'gem';
/** Whose colour a part takes: a vein, the Ring's accent, or a brazier's coal. */
export type HeartHue = SmithHeartVein | 'ring' | 'coal';

/** One placeholder primitive, in the prop's local frame (x across, y up from
 *  the prop's base, z along its facing). A box is w x h x d; a cylinder or a
 *  cone is radius `w / 2` (cylinder top `d / 2`) and height `h`; a gem is an
 *  octahedron of radius `w / 2` stretched to `h`. `y` is the part's CENTRE. */
export interface HeartPart {
  shape: HeartShape;
  tone: HeartTone;
  hue: HeartHue;
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  /** Extra yaw, and tilts about the local x and z axes (radians). */
  yaw?: number;
  tiltX?: number;
  tiltZ?: number;
}

function part(
  shape: HeartShape,
  tone: HeartTone,
  hue: HeartHue,
  dims: [number, number, number],
  at: [number, number, number],
  turn: { yaw?: number; tiltX?: number; tiltZ?: number } = {},
): HeartPart {
  return {
    shape,
    tone,
    hue,
    w: dims[0],
    h: dims[1],
    d: dims[2],
    x: at[0],
    y: at[1],
    z: at[2],
    ...turn,
  };
}

function altar(vein: SmithHeartVein): HeartPart[] {
  return [
    part('box', 'stone', vein, [2.4, 2.2, 2.4], [0, 1.1, 0]),
    part('box', 'bronze', vein, [3, 0.4, 3], [0, 2.4, 0]),
    part('gem', 'glow', vein, [1.2, 1.6, 1.2], [0, 3.5, 0]),
  ];
}

/**
 * The placeholder of every `sh_*` prop kind (the heart seal is drawn by
 * heart_seal.ts, so its recipe is empty). Sized to the layout's colliders
 * (`r` and `h` in content/smith_heart_layout.ts): a part never reaches more
 * than a body's width past its prop's footprint.
 */
export const HEART_PROP_RECIPES: Readonly<Record<string, readonly HeartPart[]>> = {
  // The crack in the Stormcrag cliffs behind the Cleft landing: two leaning
  // slabs of dark rock from the fissure's depth to well over the landing,
  // set back (local -z) so neither leans over the landing's floor.
  sh_cleft_mouth: [
    part('box', 'dark', 'hammer', [4, 74, 9], [-6, -6, -5], { tiltZ: 0.06 }),
    part('box', 'dark', 'hammer', [4, 70, 9], [6, -8, -5], { tiltZ: -0.06 }),
    part('gem', 'glow', 'hammer', [1.6, 3, 1.6], [0, 9, -1]),
  ],
  // A half-carved mountain statue: a rough block body, a head, one arm.
  sh_rough_statue: [
    part('box', 'stone', 'hammer', [3.6, 6.4, 2.6], [0, 3.2, 0]),
    part('box', 'stone', 'hammer', [2, 2, 2], [0, 7.6, 0.2]),
    part('box', 'stone', 'hammer', [1.2, 4, 1.2], [2.4, 5, 0.4], { tiltZ: -0.25 }),
    part('box', 'dark', 'hammer', [4.4, 0.8, 3.4], [0, 0.4, 0]),
  ],
  sh_geode: [
    part('gem', 'dark', 'hammer', [2.8, 2.2, 2.8], [0, 1, 0]),
    part('gem', 'glow', 'hammer', [0.8, 2.2, 0.8], [0.5, 1.9, 0], { tiltZ: -0.4 }),
    part('gem', 'glow', 'hammer', [0.7, 1.8, 0.7], [-0.6, 1.7, 0.3], { tiltZ: 0.5 }),
    part('gem', 'glow', 'hammer', [0.6, 1.5, 0.6], [0, 1.6, -0.6], { tiltX: -0.5 }),
  ],
  // The Hammer Pit's columns (they rise and fall in phase 2).
  sh_pit_column: [
    part('cyl', 'stone', 'hammer', [4.4, 9, 4], [0, 4.5, 0]),
    part('box', 'dark', 'hammer', [5, 0.8, 5], [0, 9.2, 0]),
    part('cyl', 'glow', 'hammer', [4.5, 0.3, 4.5], [0, 2.2, 0]),
  ],
  // The Slab's frame: two jambs from the fissure's depth beside the stair and
  // a lintel high over it (the slab itself is a gate, heart_gates.ts). Set
  // just north of the slab, clear of the Pit's rim on either side.
  sh_slab_frame: [
    part('box', 'dark', 'hammer', [2.4, 34, 3], [-9.4, -3, 2]),
    part('box', 'dark', 'hammer', [2.4, 34, 3], [9.4, -3, 2]),
    part('box', 'stone', 'hammer', [21.2, 2.4, 3.2], [0, 13.2, 2]),
    part('box', 'glow', 'hammer', [12, 0.4, 0.4], [0, 12, 3.65]),
  ],
  // A forge pillar on the Ring's outer rim, a bronze collar near its top.
  sh_ring_pillar: [
    part('cyl', 'stone', 'ring', [2.4, 12, 2.2], [0, 6, 0]),
    part('cyl', 'bronze', 'ring', [2.8, 0.8, 2.8], [0, 10.6, 0]),
    part('cone', 'glow', 'ring', [1.6, 1.4, 0], [0, 12.7, 0]),
  ],
  sh_wind_shelter: [
    part('box', 'stone', 'breath', [4.8, 2, 1.4], [0, 1, 0]),
    part('box', 'glow', 'breath', [4.2, 0.2, 0.2], [0, 1.6, 0.72]),
  ],
  sh_brazier: [
    part('cyl', 'dark', 'quench', [1.4, 1.2, 1.1], [0, 0.6, 0]),
    part('cyl', 'bronze', 'quench', [2, 0.4, 1.6], [0, 1.4, 0]),
    part('cyl', 'glow', 'coal', [1.5, 0.2, 1.5], [0, 1.65, 0]),
  ],
  // A half-forged blade set in the ice.
  sh_ice_blade: [
    part('box', 'glow', 'quench', [0.4, 4, 1.4], [0, 2, 0], { tiltZ: 0.15 }),
    part('box', 'bronze', 'quench', [1.6, 0.4, 0.5], [0.3, 4, 0], { tiltZ: 0.15 }),
  ],
  // A house-sized crucible, its melt glowing white-gold.
  sh_crucible: [
    part('cyl', 'bronze', 'heat', [4.6, 4.8, 5.2], [0, 2.4, 0]),
    part('cyl', 'glow', 'heat', [4.2, 0.3, 4.2], [0, 4.9, 0]),
    part('cyl', 'dark', 'heat', [5.2, 0.6, 5.2], [0, 0.3, 0]),
  ],
  // The great pour crucible on its legs, the spout tipped over the channel.
  sh_pour_crucible: [
    part('cyl', 'dark', 'heat', [0.8, 4, 0.8], [-2, 2, -1.2]),
    part('cyl', 'dark', 'heat', [0.8, 4, 0.8], [2, 2, -1.2]),
    part('cyl', 'dark', 'heat', [0.8, 4, 0.8], [0, 2, 2.2]),
    part('cyl', 'bronze', 'heat', [5.6, 5, 6], [0, 6.5, 0]),
    part('cyl', 'glow', 'heat', [5.2, 0.3, 5.2], [0, 9.1, 0]),
    part('cone', 'bronze', 'heat', [1.4, 2.6, 0], [0, 8.4, 3.4], { tiltX: 1.2 }),
  ],
  // The anvil's horn: a glowing inlay along the platform's westward tip
  // (flush with the floor, never in the way).
  sh_anvil_horn: [
    part('box', 'glow', 'heat', [3.6, 0.12, 9], [0, 0.06, 0]),
    part('box', 'glow', 'heat', [1.6, 0.12, 3], [0, 0.06, 5.5]),
  ],
  sh_altar_hammer: altar('hammer'),
  sh_altar_breath: altar('breath'),
  sh_altar_quench: altar('quench'),
  sh_altar_heat: altar('heat'),
  sh_heart_seal: [],
};

/** The colour of a part: its vein's, the Ring's accent, or a coal. */
export function heartHueColor(hue: HeartHue): number {
  if (hue === 'ring') return HEART_PALETTE.ring;
  if (hue === 'coal') return HEART_PALETTE.coal;
  return SMITH_HEART_VEIN_COLORS[hue];
}

/** Scale a colour's channels toward black (a vein's dim tone). */
export function scaleColor(color: number, k: number): number {
  const c = Math.max(0, Math.min(1, k));
  const r = Math.round(((color >> 16) & 0xff) * c);
  const g = Math.round(((color >> 8) & 0xff) * c);
  const b = Math.round((color & 0xff) * c);
  return (r << 16) | (g << 8) | b;
}

/**
 * The floor height a prop stands on: the field's ground under it, or, for a
 * prop set just past a lip into the void (the Cleft's mouth, the Slab's
 * jambs), the highest floor within `reach` yards, so it rises from the
 * terrace beside it rather than from the fissure's depth.
 */
export function heartPropBase(x: number, z: number, reach = 10): number {
  if (authoredFieldSurfaceAt(SMITH_HEART_FIELD, x, z)) {
    return authoredFieldHeight(SMITH_HEART_FIELD, x, z);
  }
  let best = Number.NEGATIVE_INFINITY;
  for (let r = 2; r <= reach; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.sin(a) * r;
      const pz = z + Math.cos(a) * r;
      if (!authoredFieldSurfaceAt(SMITH_HEART_FIELD, px, pz)) continue;
      best = Math.max(best, authoredFieldHeight(SMITH_HEART_FIELD, px, pz));
    }
    if (best > Number.NEGATIVE_INFINITY) return best;
  }
  return SMITH_HEART_FIELD.voidHeight;
}

// ---- lights -------------------------------------------------------------------------

/** One budgeted point light (instance-local; `lift` above the floor). */
export interface HeartLightSpot {
  id: string;
  x: number;
  z: number;
  lift: number;
  color: number;
  intensity: number;
  range: number;
}

function veinKey(id: string, vein: SmithHeartVein, at: { x: number; z: number }): HeartLightSpot {
  return {
    id,
    x: at.x,
    z: at.z,
    lift: 9,
    color: SMITH_HEART_VEIN_COLORS[vein],
    intensity: 7,
    range: 42,
  };
}

function veinMouth(id: string, vein: SmithHeartVein, deg: number): HeartLightSpot {
  const p = ringPoint(deg, RING.R);
  return {
    id,
    x: p.x,
    z: p.z,
    lift: 6,
    color: SMITH_HEART_VEIN_COLORS[vein],
    intensity: 4,
    range: 26,
  };
}

function warm(id: string, x: number, z: number, lift: number, color: number): HeartLightSpot {
  return { id, x, z, lift, color, intensity: 3, range: 16 };
}

/**
 * Every budgeted light: each vein's key over its guardian's arena and an
 * accent at its mouth (the Hammer's on the Balcony, the others on the Ring),
 * the seal's pale glow, the forge's crucibles and the lake's braziers.
 */
export function planHeartLights(): HeartLightSpot[] {
  const spots: HeartLightSpot[] = [
    veinKey('key:hammer', 'hammer', SMITH_HEART_BOSS_SPOTS.hammer),
    veinKey('key:breath', 'breath', BREATH.cornice),
    veinKey('key:quench', 'quench', QUENCH.lake),
    veinKey('key:heat', 'heat', SMITH_HEART_BOSS_SPOTS.heat),
    { ...veinMouth('mouth:hammer', 'hammer', 180), x: 0, z: -80 },
    veinMouth('mouth:breath', 'breath', 0),
    veinMouth('mouth:quench', 'quench', 90),
    veinMouth('mouth:heat', 'heat', 270),
    {
      id: 'seal',
      x: HEART_SEAL.x,
      z: HEART_SEAL.z,
      lift: 7,
      color: HEART_PALETTE.ring,
      intensity: 5,
      range: 30,
    },
  ];
  for (const p of SMITH_HEART_FIELD.props) {
    if (p.kind === 'sh_crucible' || p.kind === 'sh_pour_crucible') {
      spots.push(
        warm(
          `crucible:${p.x}:${p.z}`,
          p.x,
          p.z,
          p.kind === 'sh_pour_crucible' ? 10 : 6,
          SMITH_HEART_VEIN_COLORS.heat,
        ),
      );
    } else if (p.kind === 'sh_brazier') {
      spots.push(warm(`brazier:${p.x}:${p.z}`, p.x, p.z, 2.4, HEART_PALETTE.coal));
    }
  }
  return spots;
}

/** The light zone that holds (x, z) (the first listed that contains it). */
export function heartLightZoneOf(x: number, z: number): FieldLightZone | null {
  for (const zone of SMITH_HEART_FIELD.lightZones) {
    if (Math.hypot(x - zone.x, z - zone.z) <= zone.r) return zone;
  }
  return null;
}

/** The Heat's forge hall: the walls plan keeps its molten channels open. */
export const HEART_ANVIL_CHANNEL_X = HEAT.floor.x0 - 6;

/** Deterministic hash in [0, 1) of two integers (no rng in a plan). */
export function heartHash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
