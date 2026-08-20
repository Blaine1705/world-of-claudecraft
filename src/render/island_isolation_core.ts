// The Proving Shore's isolated presentation scope.
//
// A brand new player's very first load should stream ONE SMALL ISLAND, not the
// continent it happens to sit beside. Today it streams both: the island
// arrival at (-281, -18) sits 101 yd from Eastbrook Vale's rectangle, inside
// the 160 yd arrival-neighbour radius, so the vale's terrain, water, props and
// foliage are all prepared behind the loading screen before a tutorial player
// sees anything. Worse, every cell of the world grid starts life "pending"
// (terrain.ts groundPending.fill(1)), and the outdoor fog clamp pins the
// horizon at the nearest pending cell (chunk_residency_core.ts), so the
// unbuilt mainland walls the island in at roughly 93 yd of visibility.
//
// Nothing here touches the SIM. The world content, the colliders, the quest
// rail and the server's authority are all unchanged, so a player who rings the
// ferry bell crosses into an ordinary, fully streamed Eastbrook. This module
// decides only what the CLIENT bothers to stream, to keep pending, and to draw
// while the player stands on the island. That is why isolation can key on
// nothing but position: there is no state to migrate, and the ferry crossing
// is a teleport rather than a walk, so the scope flips once with the ride.
//
// Three consumers, one decision each:
//   render/terrain.ts   a cell this scope will never build is NOT pending, so
//                       the residency clamp stops seeing the mainland and the
//                       horizon opens over the sea.
//   render/renderer.ts  the streaming lane only queues island zones.
//   render/far_terrain  the vista's tile grid is bounded to the island and its
//                       sea, which IS the panorama backdrop: the same coarse
//                       far mesh the mainland uses, planned over four tiles
//                       instead of twelve.
//
// Pure: no Three, no DOM, no wall clock, no rng. Registered in
// RENDER_PURE_CORES (tests/architecture.test.ts); driven directly by
// tests/island_isolation_core.test.ts.

import { isOnProvingShore } from '../sim/content/proving_shore';

/** The island's zone id, the one zone an isolated scope streams. */
export const ISLAND_ZONE_ID = 'proving_shore';

/** How far past the island's own rectangle the panorama's ground reaches.
 *  Wide enough that the horizon is open sea in every direction (the island's
 *  playable ground spans roughly 120 yd of a 360 yd rectangle), and small
 *  enough that the far mesh plans four tiles rather than the continent's
 *  twelve. */
export const ISLAND_VISTA_MARGIN_YD = 600;

/** The island's zone rectangle, mirrored from the content constant that
 *  isOnProvingShore tests (proving_shore.ts PROVING_SHORE_RECT is private, and
 *  a render core must not import sim internals beyond the predicate).
 *  tests/island_isolation_core.test.ts pins these against the predicate. */
export const ISLAND_RECT = { minX: -540, maxX: -180, minZ: -180, maxZ: 180 } as const;

/**
 * Does the client scope its streaming to the island right now?
 *
 * Position alone, deliberately: the island is ringed by open water and the way
 * off it is the ferry bell's teleport, so a player is either on the shore or
 * somewhere else entirely. A swimmer who strikes out east for the mainland
 * leaves the rectangle and gets ordinary streaming back, which is the right
 * answer for someone actually heading there.
 */
export function islandIsolationActive(x: number, z: number): boolean {
  return isOnProvingShore(x, z);
}

/**
 * Is this zone worth streaming under the isolated scope? Only the island's
 * own zone: every other rectangle is across the water, hidden behind the
 * panorama, and unreachable without the ferry.
 */
export function islandScopeStreamsZone(zoneId: string): boolean {
  return zoneId === ISLAND_ZONE_ID;
}

/**
 * The zones worth streaming from this position: the world's own list,
 * narrowed to the island while the player stands on the Proving Shore.
 * Generic over the zone shape so the renderer's ZoneDef list and a test's
 * fixtures both fit without the core importing render types.
 */
export function streamableZones<T extends { id: string }>(
  zones: readonly T[],
  playerX: number,
  playerZ: number,
): T[] {
  if (!islandIsolationActive(playerX, playerZ)) return [...zones];
  return zones.filter((zone) => islandScopeStreamsZone(zone.id));
}

/**
 * The far-vista ground rect for the panorama: the island's rectangle grown by
 * the sea margin. Fed to planFarTiles in place of the world bounds, so the
 * backdrop mesh covers the island and the water around it instead of the whole
 * continent.
 */
export function islandVistaBounds(): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  return {
    minX: ISLAND_RECT.minX,
    maxX: ISLAND_RECT.maxX,
    minZ: ISLAND_RECT.minZ,
    maxZ: ISLAND_RECT.maxZ,
  };
}

/**
 * The residency question, asked per chunk cell: should this cell count as
 * PENDING ground for the fog clamp?
 *
 * Under the isolated scope a cell owned by any other zone will never be built
 * while the player is here, so calling it pending is a lie that costs the
 * player their horizon. Off the island the answer is unchanged, which is what
 * keeps this a scope rather than a behaviour change: the clamp still pins the
 * fog at genuinely unbuilt ground everywhere else in the world.
 *
 * `ownedByScope` is passed in already resolved rather than looked up here:
 * the caller walks this per cell inside the clamp's grid scan, and the owning
 * rectangle is fixed for the life of the view, so it is precomputed once.
 */
export function cellCountsAsPending(
  owedGeometry: boolean,
  ownedByScope: boolean,
  isolated: boolean,
): boolean {
  if (!owedGeometry) return false;
  return !isolated || ownedByScope;
}
