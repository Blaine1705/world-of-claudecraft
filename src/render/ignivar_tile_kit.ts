// Raid-only duplicates of the dungeon-kit structural modules for the Ignivar
// raid interiors. The three forge rooms re-skin their floors, walls, and
// pillars with the dark-iron ember atlas (ignivar_<kind>.glb copies of the
// shared KayKit modules); every other dungeon keeps the shared kit untouched.
// dungeon.ts owns loading and materials (per-pack): these duplicates land in
// their own 'ignivarKit' pack so the recolored source material never bleeds
// into the shared kit, and the resolver below is consulted only at the two
// asset-lookup funnels (emit / emitArenaHideable).

/** Structural kinds the Ignivar rooms place, in shipped-file order. Torches,
 *  banners, and props stay on the shared kit on purpose: only the stone
 *  changes identity. */
export const IGNIVAR_TILE_KINDS = [
  'floor_tile_large',
  'floor_tile_small',
  'wall',
  'wall_cracked',
  'wall_pillar',
  'wall_arched',
  'wall_archedwindow_gated',
  'wall_gated',
  'pillar',
  'pillar_decorated',
] as const;

/** Which raid module carries each surface's ONE shared texture; every other
 *  module is geometry-only and rides the carrier pack's material. Loaded
 *  first, so the pack material always comes from the carrier. */
export const IGNIVAR_TILE_CARRIERS = {
  ignivarFloor: 'floor_tile_large',
  ignivarWall: 'wall',
} as const;

/** The raid pack a structural kind belongs to (floor vs wall vs the swatch
 *  pillars), so each surface family shares one material and one texture. */
export function ignivarTilePack(kind: string): 'ignivarFloor' | 'ignivarWall' | 'ignivarKit' {
  if (kind.startsWith('floor_')) return 'ignivarFloor';
  if (kind.startsWith('wall')) return 'ignivarWall';
  return 'ignivarKit';
}

const KIND_SET: ReadonlySet<string> = new Set(IGNIVAR_TILE_KINDS);

export const IGNIVAR_TILE_PREFIX = 'ignivar_';

/** The raid-only module name for a placement kind, or the kind unchanged for
 *  every other variant and for non-structural kinds. */
export function ignivarTileKind(variant: string, kind: string): string {
  return variant === 'ignivar' && KIND_SET.has(kind) ? IGNIVAR_TILE_PREFIX + kind : kind;
}

/** Whether an interior id is one of the three Ignivar raid rooms. */
export function isIgnivarInterior(interior: string): boolean {
  return interior === 'ignivar' || interior === 'ignivar_approach' || interior === 'ignivar_depths';
}
