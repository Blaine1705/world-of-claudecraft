// The castles' shared stone surfacing. Both fortifications (the Last Keep's
// castle_features.ts and Dawnhold's dawnhold_features.ts) build the same
// kinds of raw mass: wall-walk caps, tower cores, stair wedges, curtain
// footings, and paved yards. Those were flat untextured colors, which read
// as grey cardboard beside the textured KayKit modules bolted onto them.
//
// This module is the one place a castle mass asks for its surface. Textures
// come from the procedural canvas set (textures.ts, no image files) and are
// cached PER REPEAT: a THREE texture carries its own repeat, and surfaceMat
// dedupes materials by texture uuid, so two masses wanting the same stone at
// the same tiling share one texture AND one material, while a 50yd bailey
// floor and a 3yd coping each get tiling that suits their size.
//
// Pure presentation: no sim imports, no world state.
import * as THREE from 'three';
import { surfaceMat } from './gfx';
import { flagstoneTexture, stoneTexture } from './textures';

/** world yards covered by one repeat of each texture */
const STONE_TILE_YD = 4;
const FLAGSTONE_TILE_YD = 7;

type Maker = () => THREE.CanvasTexture;

const cache = new Map<string, THREE.Texture>();

/**
 * The canvas texture set needs a DOM. The castle masses are also built
 * headlessly by the geometry guards (tests/last_keep_face_sink), which
 * measure BOX EXTENTS and care nothing for the surface, so outside a
 * browser the surfacing degrades to plain color instead of throwing.
 */
const hasCanvas = typeof document !== 'undefined';

function tiled(kind: string, make: Maker, rx: number, ry: number): THREE.Texture | null {
  if (!hasCanvas) return null;
  // quantize the repeat so near-identical requests still share one texture
  const qx = Math.max(0.25, Math.round(rx * 4) / 4);
  const qy = Math.max(0.25, Math.round(ry * 4) / 4);
  const key = `${kind}:${qx}:${qy}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = make();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(qx, qy);
  cache.set(key, tex);
  return tex;
}

/**
 * Coursed castle stone sized for a mass spanning `wYd` by `hYd` world yards
 * on the face being surfaced (a cap slab's footprint, a wedge's flank).
 */
export function castleStoneTexture(wYd: number, hYd: number): THREE.Texture | null {
  return tiled('stone', stoneTexture, wYd / STONE_TILE_YD, hYd / STONE_TILE_YD);
}

/** Laid paving sized for a yard spanning `wYd` by `dYd` world yards. */
export function castlePavingTexture(wYd: number, dYd: number): THREE.Texture | null {
  return tiled('flag', flagstoneTexture, wYd / FLAGSTONE_TILE_YD, dYd / FLAGSTONE_TILE_YD);
}

/**
 * The material for a rectangular castle mass: coursed stone tiled to the
 * mass's own footprint so the course size stays constant across the castle
 * however big or small the piece is.
 */
export function castleStoneMat(
  wYd: number,
  hYd: number,
  opts: { color?: number; roughness?: number; side?: THREE.Side } = {},
): THREE.Material {
  const map = castleStoneTexture(wYd, hYd);
  return surfaceMat({
    // without a texture the mass keeps its own stone tone rather than the
    // white the map would have been multiplied against
    color: map ? (opts.color ?? 0xffffff) : (opts.color ?? 0x8a7568),
    map: map ?? undefined,
    roughness: opts.roughness ?? 0.94,
    side: opts.side,
  });
}

/** The material for a paved yard of the given world size. */
export function castlePavingMat(
  wYd: number,
  dYd: number,
  opts: { color?: number; roughness?: number } = {},
): THREE.Material {
  const map = castlePavingTexture(wYd, dYd);
  return surfaceMat({
    color: map ? (opts.color ?? 0xffffff) : (opts.color ?? 0x9a958c),
    map: map ?? undefined,
    roughness: opts.roughness ?? 0.96,
  });
}

/** Test-only window into the tiling constants and the shared cache. */
export const castleStoneInternalsForTest = {
  STONE_TILE_YD,
  FLAGSTONE_TILE_YD,
  cacheSize: (): number => cache.size,
};
