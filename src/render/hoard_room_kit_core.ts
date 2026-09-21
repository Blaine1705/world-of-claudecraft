// The EMBERFORGE boss room, dressed: where each piece of the forge kit stands and
// what is drawn on the floor. Pure: no Three.js, no DOM. The room itself (outline,
// cliffs, floor, collision) stays the seeded one the sim generates; this only
// decides what stands in it, from that same seed, so every player in one hoard
// sees one room. The adapter (hoard_room_kit.ts) turns the plan into instances of
// the Blender kit (docs/design/forge-room/).
//
// Composition, not scatter: a HERO forge set into the back wall behind the boss,
// then CLUSTERS pressed against the side walls (a smelter, a bellows bank, a
// braced wall, a stockpile) with empty wall left between them. Nothing taller than
// a floor mark ever stands in the fight: every prop keeps within WALL_BAND of a
// wall, and none of it collides (the walls already do).

import {
  type HoardValleyLayoutInput,
  hoardValleyRevealZ,
  hoardValleySpanAtZ,
} from './hoard_valley_core';

export const FORGE_KIT_PIECES = [
  'GreatForge',
  'Anvil',
  'Crucible',
  'IngotStack',
  'Vent',
  'ForgePost',
  'ChainHook',
  'IronBrace',
] as const;
export type ForgeKitPiece = (typeof FORGE_KIT_PIECES)[number];

/** What a graphics tier keeps: low the room's identity, high all of it. */
export type RoomKitCategory = 'hero' | 'large' | 'medium' | 'filler';
export type RoomKitTier = 'high' | 'medium' | 'low';
const KEPT: Record<RoomKitTier, readonly RoomKitCategory[]> = {
  high: ['hero', 'large', 'medium', 'filler'],
  medium: ['hero', 'large', 'medium'],
  low: ['hero', 'large'],
};
/** The low tier also caps its large props: the forge and a few silhouettes. */
const LOW_LARGE_CAP = 6;

export interface RoomKitPlacement {
  piece: ForgeKitPiece;
  category: RoomKitCategory;
  x: number;
  y: number;
  z: number;
  /** Radians about +Y; the kit's front is +Z. */
  yaw: number;
  scale: number;
  /** Mirrored across its own front axis: a free second variant. */
  mirror: boolean;
}

/** A flat mark on the floor: an oriented rectangle, or a ring segment. */
export interface RoomKitFloorMark {
  kind: 'plate' | 'channel' | 'channel-edge' | 'ring' | 'scar' | 'glow';
  x: number;
  z: number;
  /** Half extents along its own axes, in yards. */
  halfLength: number;
  halfWidth: number;
  yaw: number;
  /** Rings: the radius of the band's middle. Glows: how far the light reaches. */
  radius?: number;
}

export interface RoomKitPlan {
  placements: RoomKitPlacement[];
  floor: RoomKitFloorMark[];
}

/** Every prop stands within this of a wall; the floor beyond it is the fight's. */
export const ROOM_KIT_WALL_BAND = 9;
/** The boss's own ground: nothing but floor marks comes this close to the dais. */
export const ROOM_KIT_DAIS_CLEAR = 4;

function hash(seed: number, index: number, salt: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

type Recipe = 'smelter' | 'bellows' | 'braced' | 'stockpile';
const RECIPES: readonly Recipe[] = ['smelter', 'bellows', 'braced', 'stockpile'];

/** Does this room get the forge kit? The kit is the Emberforge Tyrant's. */
export function roomKitFor(bossTemplateId: string | undefined): 'forge' | null {
  return bossTemplateId === 'rift_boss_ember' ? 'forge' : null;
}

export function buildForgeRoomKitPlan(
  layout: HoardValleyLayoutInput,
  seed: number,
  tier: RoomKitTier,
): RoomKitPlan {
  const all: RoomKitPlacement[] = [];
  const floor: RoomKitFloorMark[] = [];
  const back = layout.zMax;
  const start = hoardValleyRevealZ(layout) + 5;
  const dais = layout.dais;
  const put = (
    piece: ForgeKitPiece,
    category: RoomKitCategory,
    x: number,
    z: number,
    yaw: number,
    scale = 1,
    y = 0,
    mirror = false,
  ): void => {
    if (Math.hypot(x - dais.x, z - dais.z) < dais.r + ROOM_KIT_DAIS_CLEAR && category !== 'hero')
      return;
    all.push({ piece, category, x, y, z, yaw, scale, mirror });
  };

  // ---- the hero: the Great Forge, its back buried in the end wall
  const backSpan = hoardValleySpanAtZ(layout, back - 0.5);
  const forgeX = (backSpan.minX + backSpan.maxX) / 2;
  // The cliff's face stands about on the outline, so the forge sits proud of it:
  // its mouth a few yards into the room, its body and chimney rising out of the rock.
  put('GreatForge', 'hero', forgeX, back - 3.6, Math.PI, 0.94);
  floor.push({
    kind: 'glow',
    x: forgeX,
    z: back - 9,
    halfLength: 1,
    halfWidth: 0.5,
    yaw: 0,
    radius: 17,
  });
  // Its wall: braces either side, and chains hung high between them and the forge.
  for (const side of [-1, 1]) {
    put('IronBrace', 'large', forgeX + side * 19.5, back - 0.6, Math.PI, 1.05, 0, side < 0);
    put('ChainHook', 'filler', forgeX + side * 15.2, back - 1.4, Math.PI, 1.1, 11.5);
    put('Vent', 'large', forgeX + side * 25.5, back - 2.6, Math.PI, 0.95, 0, side < 0);
  }
  // The hearth apron: dark plates on the floor before the mouth.
  for (let row = 0; row < 2; row++) {
    for (let column = -2; column <= 2; column++) {
      floor.push({
        kind: 'plate',
        x: forgeX + column * 5.3 + (row ? 1.1 : -0.6),
        z: back - 10.4 - row * 4.4,
        halfLength: 2.45,
        halfWidth: 2.0,
        yaw: (hash(seed, column + 9 * row, 3) - 0.5) * 0.06,
      });
    }
  }

  // ---- clusters down the side walls, never mirrored across the room
  const spacing = 23;
  for (const side of [-1, 1]) {
    let previous: Recipe | null = null;
    let kept = 0;
    const first = start + (side > 0 ? spacing * 0.5 : 2);
    for (let station = 0, z = first; z < back - 27; station++, z += spacing) {
      const index = station * 2 + (side > 0 ? 1 : 0);
      // Leave some wall bare, but never a whole side.
      if (hash(seed, index, 11) < 0.28 && kept >= 1) continue;
      const at = z + (hash(seed, index, 12) - 0.5) * 7;
      const span = hoardValleySpanAtZ(layout, at);
      const wall = side < 0 ? span.minX : span.maxX;
      const inward = -side;
      const face = Math.atan2(inward, 0);
      let recipe = RECIPES[Math.floor(hash(seed, index, 13) * RECIPES.length)];
      if (recipe === previous) recipe = RECIPES[(RECIPES.indexOf(recipe) + 1) % RECIPES.length];
      previous = recipe;
      kept++;
      const along = (offset: number): number => at + offset;
      // Each piece measures from the wall at ITS OWN depth into the room: where the
      // gorge funnels out, the wall a few yards along is not the wall here.
      const off = (depth: number, offset = 0): number => {
        if (offset === 0) return wall + inward * depth;
        const there = hoardValleySpanAtZ(layout, at + offset);
        return (side < 0 ? there.minX : there.maxX) + inward * depth;
      };
      const turn = (salt: number, amount: number): number =>
        face + (hash(seed, index, salt) - 0.5) * amount;
      if (recipe === 'smelter') {
        put('Crucible', 'large', off(3.4, 0), along(0), turn(21, 0.5), 1.05);
        floor.push({
          kind: 'glow',
          x: off(3.4),
          z: along(0),
          halfLength: 1,
          halfWidth: 0.34,
          yaw: 0,
          radius: 6.5,
        });
        put('Anvil', 'medium', off(6.4, 5.4), along(5.4), turn(22, 1.1) + Math.PI / 2, 1);
        put('IngotStack', 'medium', off(2.8, -5.2), along(-5.2), turn(23, 1.4), 0.95);
        put('ChainHook', 'filler', off(1.3, 0.4), along(0.4), face, 1, 10.5);
        floor.push({
          kind: 'channel',
          x: off(1.9),
          z: along(0),
          halfLength: 1.5,
          halfWidth: 0.35,
          yaw: face + Math.PI / 2,
        });
      } else if (recipe === 'bellows') {
        put('Vent', 'large', off(2.4, 0), along(0), face, 1.1);
        put('ForgePost', 'medium', off(4.6, -4.6), along(-4.6), turn(24, 3), 1);
        put('ForgePost', 'medium', off(4.6, 4.6), along(4.6), turn(25, 3), 1);
        put('IngotStack', 'filler', off(3.0, 8.2), along(8.2), turn(26, 1.6), 0.8, 0, true);
      } else if (recipe === 'braced') {
        put('IronBrace', 'large', off(0.9, -3.6), along(-3.6), face, 1);
        put('IronBrace', 'large', off(0.9, 3.6), along(3.6), face, 0.94, 0, true);
        put('ChainHook', 'filler', off(1.5, 0), along(0), face, 1.15, 9.2);
        put(
          'Anvil',
          'medium',
          off(5.6, 0.6),
          along(0.6),
          turn(27, 1.2) + Math.PI / 2,
          1.1,
          0,
          true,
        );
      } else {
        put('IngotStack', 'medium', off(3.0, -2.6), along(-2.6), turn(28, 1.2), 1.15);
        put('IngotStack', 'medium', off(5.4, 2.9), along(2.9), turn(29, 2.2), 0.85, 0, true);
        put('ForgePost', 'medium', off(2.2, 5.8), along(5.8), turn(30, 3), 1.1);
        put('ChainHook', 'filler', off(1.4, -5.5), along(-5.5), face, 0.95, 9.8);
      }
      // A riveted plate or two under every cluster.
      for (let plate = 0; plate < 2; plate++) {
        floor.push({
          kind: 'plate',
          x: off(3.6 + plate * 3.1, plate ? 2.2 : -1.8),
          z: along((plate ? 2.2 : -1.8) + (hash(seed, index, 40 + plate) - 0.5) * 2),
          halfLength: 1.7,
          halfWidth: 1.5,
          yaw: (hash(seed, index, 42 + plate) - 0.5) * 0.5,
        });
      }
    }
    // The molten channel at this wall's foot, in straight runs that follow it.
    for (let z = start; z < back - 8; z += 6) {
      const a = hoardValleySpanAtZ(layout, z);
      const b = hoardValleySpanAtZ(layout, Math.min(back - 8, z + 6));
      const ax = (side < 0 ? a.minX : a.maxX) - side * 1.7;
      const bx = (side < 0 ? b.minX : b.maxX) - side * 1.7;
      const length = Math.hypot(bx - ax, 6);
      const mark = {
        x: (ax + bx) / 2,
        z: z + 3,
        halfLength: length / 2 + 0.05,
        yaw: Math.atan2(bx - ax, 6),
      };
      floor.push({ kind: 'channel-edge', ...mark, halfWidth: 0.72 });
      floor.push({ kind: 'channel', ...mark, halfWidth: 0.32 });
    }
  }
  // The channels meet along the back wall and run into the forge's slag troughs.
  floor.push({
    kind: 'channel-edge',
    x: forgeX,
    z: back - 2.4,
    halfLength: backSpan.maxX - forgeX - 1.7,
    halfWidth: 0.72,
    yaw: Math.PI / 2,
  });
  floor.push({
    kind: 'channel',
    x: forgeX,
    z: back - 2.4,
    halfLength: backSpan.maxX - forgeX - 1.7,
    halfWidth: 0.32,
    yaw: Math.PI / 2,
  });

  // ---- the engraved forge ring round the boss's ground, and old hammer scars
  floor.push({
    kind: 'ring',
    x: dais.x,
    z: dais.z,
    halfLength: 0,
    halfWidth: 0.22,
    yaw: 0,
    radius: dais.r + 3.2,
  });
  floor.push({
    kind: 'ring',
    x: dais.x,
    z: dais.z,
    halfLength: 0,
    halfWidth: 0.12,
    yaw: 0,
    radius: dais.r + 4.1,
  });
  for (let scar = 0; scar < 6; scar++) {
    const z = start + 8 + hash(seed, scar, 51) * Math.max(1, back - start - 40);
    const span = hoardValleySpanAtZ(layout, z);
    const reach = (span.maxX - span.minX) / 2 - ROOM_KIT_WALL_BAND - 2;
    floor.push({
      kind: 'scar',
      x: (span.minX + span.maxX) / 2 + (hash(seed, scar, 52) - 0.5) * 2 * Math.max(0, reach),
      z,
      halfLength: 1.6 + hash(seed, scar, 53) * 1.5,
      halfWidth: 1.6 + hash(seed, scar, 54) * 1.5,
      yaw: hash(seed, scar, 55) * Math.PI,
    });
  }

  // ---- the tier keeps a prefix of one plan, so every tier agrees on where things are
  const keep = KEPT[tier];
  let larges = 0;
  const placements = all.filter((placement) => {
    if (!keep.includes(placement.category)) return false;
    if (tier === 'low' && placement.category === 'large') return larges++ < LOW_LARGE_CAP;
    return true;
  });
  return {
    placements,
    floor:
      tier === 'low'
        ? floor.filter(
            (mark) => mark.kind !== 'scar' && !(mark.kind === 'glow' && (mark.radius ?? 0) < 10),
          )
        : floor,
  };
}
