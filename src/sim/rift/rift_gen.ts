// The procedural Rift generator: pure, deterministic functions that turn a
// compact descriptor (seed + baseLevel + floorIndex) into a fully-resolved floor
// (geometry + visual style + spawn plan + gate). The authoritative server and
// every client call these identical functions, so no rift geometry is ever
// transmitted, only the descriptor. This mirrors how terrainHeight(x,z,seed) is a
// pure function both the sim and the renderer sample (see src/sim/world.ts).
//
// Sim layer: no DOM/Three imports. Randomness uses a LOCAL Rng seeded from the
// descriptor (NOT the live sim rng), so generation never perturbs the sim's
// global draw order and is reproducible anywhere.

import type { Collider } from '../colliders';
import { RIFT_THEMES, type RiftTheme } from '../content/rift/themes';
import {
  DUNGEON_WALL_X,
  type DungeonLayout,
  type GridPoint,
  type InteriorStyle,
  layoutColliders,
  type WallStub,
} from '../dungeon_layout';
import { Rng } from '../rng';
import type { RiftFloorPlan, RiftObjectPlan, RiftPlan, RiftPuzzle, RiftSpawn } from './types';

// ---- Tuning -----------------------------------------------------------------
const MIN_FLOORS = 3;
const MAX_FLOORS = 6;
const LEVEL_CAP = 60;
const ENTRY_Z_OFFSET = 8; // player arrival, past the entrance porch
const AISLE_HALF = 5.5; // centre column kept clear of all obstacles (walkable spine)
const BODY_R = 0.6; // player body radius used for clearance checks

const RIFT_SUFFIXES = [
  'Abyss',
  'Depths',
  'Descent',
  'Hollow',
  'Labyrinth',
  'Warren',
  'Sanctum',
  'Rift',
] as const;

// Deterministic 32-bit mix so each floor gets an independent, reproducible seed
// from (seed, floorIndex) without consuming any external rng.
function mix(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** How many floors this rift runs (deterministic from the seed). */
export function riftFloorCount(seed: number): number {
  return new Rng(mix(seed, 0x510f)).int(MIN_FLOORS, MAX_FLOORS);
}

function themeForFloor(seed: number, floorIndex: number): RiftTheme {
  const rng = new Rng(mix(seed, 0x7000 + floorIndex));
  return rng.pick(RIFT_THEMES as RiftTheme[]);
}

// Small deterministic per-channel jitter of a 0xRRGGBB colour, so two floors that
// happen to share a theme still read a little differently. `amt` is a fraction.
function jitterColor(rng: Rng, hex: number, amt: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const f = () => 1 + rng.range(-amt, amt);
  return (clamp(r * f()) << 16) | (clamp(g * f()) << 8) | clamp(b * f());
}

function buildStyle(rng: Rng, theme: RiftTheme): InteriorStyle {
  return {
    kit: theme.kit,
    torch: {
      flame: jitterColor(rng, theme.torch.flame, 0.08),
      emissive: jitterColor(rng, theme.torch.emissive, 0.08),
      light: jitterColor(rng, theme.torch.light, 0.08),
    },
    fog: {
      color: jitterColor(rng, theme.fog.color, 0.12),
      near: Math.round(theme.fog.near + rng.range(-2, 2)),
      far: Math.round(theme.fog.far + rng.range(-6, 6)),
    },
    wallTint: theme.wallTint !== undefined ? jitterColor(rng, theme.wallTint, 0.06) : undefined,
    floorTint: theme.floorTint !== undefined ? jitterColor(rng, theme.floorTint, 0.06) : undefined,
    daisRaised: theme.daisRaised ?? false,
  };
}

// ---- Geometry ---------------------------------------------------------------

/** Whether (x,z) clears every obstacle by the body radius (walkable). */
function isClear(colliders: readonly Collider[], x: number, z: number, r = BODY_R): boolean {
  for (const c of colliders) {
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return false;
    } else {
      // axis-aligned OBBs (all layout colliders have rot 0)
      if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return false;
    }
  }
  return true;
}

/** Nudge a candidate point toward the always-clear centre spine until it clears
 * every obstacle. Deterministic (fixed march), and guaranteed to terminate
 * because |x| <= AISLE_HALF is kept obstacle-free by construction. */
function toClear(colliders: readonly Collider[], x: number, z: number): GridPoint {
  if (isClear(colliders, x, z)) return { x, z };
  const step = x >= 0 ? -1 : 1;
  let cx = x;
  for (let i = 0; i < 40; i++) {
    cx += step;
    if (Math.abs(cx) <= AISLE_HALF) cx = 0;
    if (isClear(colliders, cx, z)) return { x: cx, z };
    if (cx === 0) break;
  }
  return { x: 0, z };
}

interface GeneratedGeometry {
  layout: DungeonLayout;
  colliders: Collider[];
}

function buildLayout(rng: Rng, floorIndex: number, isBoss: boolean): GeneratedGeometry {
  // Width and length vary per floor for silhouette variety. wallX is the side-wall
  // centreline; the KayKit modules tile at any width via layout.wallX/floorHalfX.
  const wallX = rng.pick([19, 21, 23, 25, 28]);
  const zMin = -19;
  const length = isBoss ? rng.int(96, 120) : rng.int(104, 148);
  const zMax = zMin + length;
  const sideWallZ = (zMin + zMax) / 2;
  const sideWallHd = (zMax - zMin) / 2 + 1;

  const daisR = isBoss ? rng.range(11, 14) : rng.range(8, 10.5);
  const dais = { x: 0, z: zMax - Math.round(daisR + 4), r: daisR };

  // Pillar rows down the nave, off the centre spine. Row cadence + inset vary.
  const pillars: GridPoint[] = [];
  const pillarInset = Math.min(wallX - 6, rng.pick([12, 14, 16]));
  const rowGap = rng.pick([14, 16, 18, 20]);
  const firstRow = zMin + rng.int(22, 30);
  const lastRow = dais.z - 16;
  for (let z = firstRow; z <= lastRow; z += rowGap) {
    // Occasionally stagger a row to one side for asymmetry.
    const stagger = rng.chance(0.25);
    if (stagger) {
      pillars.push({ x: rng.chance(0.5) ? -pillarInset : pillarInset, z });
    } else {
      pillars.push({ x: -pillarInset, z }, { x: pillarInset, z });
    }
  }

  // Wall-side obstacles (sarcophagi / crates / altars, per kit) hugging the walls.
  const tombs: GridPoint[] = [];
  const tombInset = wallX - 4;
  if (rng.chance(0.8)) {
    const tombGap = rng.pick([20, 24, 28]);
    for (let z = zMin + rng.int(16, 24); z <= dais.z - 20; z += tombGap) {
      if (rng.chance(0.85)) tombs.push({ x: -tombInset, z });
      if (rng.chance(0.85)) tombs.push({ x: tombInset, z });
    }
  }

  // Optional chamber waist(s): stubs that pinch the room to a centre passage,
  // giving multi-chamber structure. Always leave a >= 2*AISLE_HALF passage.
  const stubs: WallStub[] = [];
  const waistCount = rng.pick([0, 0, 1, 2]);
  for (let i = 0; i < waistCount; i++) {
    const wz = zMin + Math.round(((i + 1) / (waistCount + 1)) * (dais.z - 20 - zMin)) + 20;
    const hd = rng.pick([3, 4, 5]);
    // A pinch that leaves a centre passage: each stub fills from the wall (|x|=wallX)
    // inward to |x|=passageHalf, so the walkable spine (|x| <= AISLE_HALF) stays open.
    const passageHalf = AISLE_HALF + rng.range(1.5, 3);
    const hw = (wallX - passageHalf) / 2;
    if (hw <= 0.5) continue;
    const centerMag = (wallX + passageHalf) / 2;
    stubs.push({ x: -centerMag, z: wz, hw, hd });
    stubs.push({ x: centerMag, z: wz, hw, hd });
  }

  // Floor clutter, scattered off-centre; renderer draws matching props.
  const clutter: GridPoint[] = [];
  const clutterCount = rng.int(4, 10);
  for (let i = 0; i < clutterCount; i++) {
    const z = zMin + rng.range(14, dais.z - 18 - zMin);
    const side = rng.chance(0.5) ? -1 : 1;
    const x = side * rng.range(AISLE_HALF + 2, wallX - 3);
    clutter.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }

  const layout: DungeonLayout = {
    zMin,
    zMax,
    sideWallZ,
    sideWallHd,
    wallX,
    endWallHw: wallX + 1,
    floorHalfX: wallX,
    doorZ: zMin + 2,
    pillars,
    tombs,
    stubs,
    dais,
    clutter,
  };
  return { layout, colliders: layoutColliders(layout) };
}

// ---- Spawns + objects -------------------------------------------------------

function planSpawns(
  rng: Rng,
  theme: RiftTheme,
  geo: GeneratedGeometry,
  floorLevel: number,
  isBoss: boolean,
): RiftSpawn[] {
  const { layout, colliders } = geo;
  const out: RiftSpawn[] = [];
  const wallX = layout.wallX ?? DUNGEON_WALL_X;

  const packStartZ = layout.zMin + 22;
  const packEndZ = layout.dais.z - (isBoss ? 22 : 14);
  const packGap = rng.pick([16, 18, 20]);
  const packCount = Math.max(2, Math.floor((packEndZ - packStartZ) / packGap));

  for (let i = 0; i < packCount; i++) {
    const z = packStartZ + i * packGap;
    const size = isBoss ? rng.int(1, 2) : rng.int(2, 3);
    for (let j = 0; j < size; j++) {
      const templateId = rng.pick(theme.trash as string[]);
      // Spread the pack across the aisle, then pull any blocked spawn to a clear tile.
      // Round BEFORE the clearance march so the stored point is exactly the one
      // validated as clear (no post-rounding drift into an obstacle).
      const rawX = Math.round(rng.range(-wallX + 4, wallX - 4) * 10) / 10;
      const rawZ = Math.round((z + rng.range(-2, 2)) * 10) / 10;
      const p = toClear(colliders, rawX, rawZ);
      // color/scale left undefined: the base template's (theme-appropriate) values
      // are used, then lightly jittered per-entity at spawn time (rift/runs.ts).
      out.push({ templateId, x: p.x, z: p.z, level: floorLevel });
    }
  }

  if (isBoss) {
    const boss: RiftSpawn = {
      templateId: theme.boss,
      x: 0,
      z: layout.dais.z,
      level: floorLevel,
      boss: true,
    };
    out.push(boss);
    // Two dais guards flanking the boss.
    for (const gx of [-6, 6]) {
      const p = toClear(colliders, gx, layout.dais.z - 6);
      out.push({
        templateId: rng.pick(theme.trash as string[]),
        x: p.x,
        z: p.z,
        level: floorLevel,
      });
    }
  }
  return out;
}

function planPuzzle(rng: Rng, isBoss: boolean): RiftPuzzle {
  if (isBoss) return { kind: 'none', pylonCount: 0 };
  if (rng.chance(0.4)) return { kind: 'rune_pylons', pylonCount: rng.int(2, 3) };
  return { kind: 'none', pylonCount: 0 };
}

function planObjects(
  rng: Rng,
  geo: GeneratedGeometry,
  isBoss: boolean,
  puzzle: RiftPuzzle,
): RiftObjectPlan[] {
  const { layout, colliders } = geo;
  const out: RiftObjectPlan[] = [];
  if (isBoss) {
    // The reward chest sits on the dais; the exit portal is spawned by runs.ts
    // only after the boss dies (so it can't be used to skip the fight).
    out.push({
      kind: 'chest',
      x: 0,
      z: layout.dais.z + Math.round(layout.dais.r * 0.6),
      name: 'Rift Cache',
    });
  } else {
    // Descent portal centred just past the dais, always on the clear spine.
    out.push({
      kind: 'descent',
      x: 0,
      z: layout.dais.z + Math.round(layout.dais.r + 2),
      name: 'Rift Descent',
    });
    if (puzzle.kind === 'rune_pylons') {
      const zBase = layout.zMin + 40;
      for (let i = 0; i < puzzle.pylonCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * ((layout.wallX ?? DUNGEON_WALL_X) - 5);
        const z = zBase + i * 22;
        const p = toClear(colliders, x, z);
        out.push({ kind: 'rune_pylon', x: p.x, z: p.z, name: 'Rune Pylon' });
      }
    }
  }
  return out;
}

// ---- Public generation ------------------------------------------------------

const FLOOR_CACHE = new Map<string, RiftFloorPlan>();
const CACHE_LIMIT = 128;

function floorLevelFor(baseLevel: number, floorIndex: number): number {
  return Math.max(1, Math.min(LEVEL_CAP, Math.round(baseLevel) + floorIndex));
}

/** The rift as a whole: name + floor count (derived from seed + baseLevel). */
export function generateRiftPlan(seed: number, baseLevel: number): RiftPlan {
  const floorCount = riftFloorCount(seed);
  const bossTheme = themeForFloor(seed, floorCount - 1);
  const nameRng = new Rng(mix(seed, 0x9a3e));
  const noun = nameRng.pick(bossTheme.nouns as string[]);
  const suffix = nameRng.pick(RIFT_SUFFIXES as unknown as string[]);
  return {
    seed,
    baseLevel,
    name: `The ${noun} ${suffix}`,
    themeId: bossTheme.id,
    floorCount,
  };
}

/** A fully-resolved floor. Memoised (bounded) since both the sim spawn path and
 * the renderer regenerate the same floor repeatedly. */
export function generateRiftFloor(
  seed: number,
  baseLevel: number,
  floorIndex: number,
): RiftFloorPlan {
  const key = `${seed >>> 0}:${Math.round(baseLevel)}:${floorIndex}`;
  const cached = FLOOR_CACHE.get(key);
  if (cached) return cached;

  const floorCount = riftFloorCount(seed);
  const clampedIndex = Math.max(0, Math.min(floorCount - 1, floorIndex));
  const isBoss = clampedIndex === floorCount - 1;
  const theme = themeForFloor(seed, clampedIndex);
  const rng = new Rng(mix(seed, 0xf100 + clampedIndex));

  const geo = buildLayout(rng, clampedIndex, isBoss);
  const style = buildStyle(rng, theme);
  const floorLevel = floorLevelFor(baseLevel, clampedIndex);
  const puzzle = planPuzzle(rng, isBoss);
  const spawns = planSpawns(rng, theme, geo, floorLevel, isBoss);
  const objects = planObjects(rng, geo, isBoss, puzzle);

  const plan: RiftFloorPlan = {
    seed: seed >>> 0,
    baseLevel: Math.round(baseLevel),
    floorIndex: clampedIndex,
    floorCount,
    isBoss,
    name: `${theme.name} ${isBoss ? 'Sanctum' : `Reaches`} — Depth ${clampedIndex + 1}`,
    themeName: theme.name,
    layout: geo.layout,
    style,
    entry: { x: 0, z: geo.layout.zMin + ENTRY_Z_OFFSET },
    spawns,
    objects,
    puzzle,
  };

  if (FLOOR_CACHE.size >= CACHE_LIMIT) FLOOR_CACHE.clear();
  FLOOR_CACHE.set(key, plan);
  return plan;
}

/** Instance-local collider set for a rift floor (pure, from the generated layout). */
export function riftFloorColliders(
  seed: number,
  baseLevel: number,
  floorIndex: number,
): Collider[] {
  return layoutColliders(generateRiftFloor(seed, baseLevel, floorIndex).layout);
}
