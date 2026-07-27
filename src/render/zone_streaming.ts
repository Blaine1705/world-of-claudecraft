// Pure spatial policy for renderer zone streaming. Only resident zones own
// render geometry. Two cooperating halves keep that invariant seamless:
// zonesWithinStreamingHorizon feeds the renderer's background prepare queue,
// so a zone becomes resident BEFORE its rectangle can enter the relaxed fog
// horizon, and fogFarForPreparedZones is the safety net that contracts the
// fog ahead of any zone the streaming has not finished yet (a teleport, a
// sprint that outruns the build), so an unloaded region is never visible.

import { STRIP_MAX_X, STRIP_MIN_X } from '../sim/data';
import type { ZoneDef } from '../sim/types';

// The outdoor visibility envelope: no biome fog preset may exceed this, and
// terrain/prop/foliage culling all key off the live fog far, so this is the
// hard ceiling on how much world one camera can request.
export const MAX_OUTDOOR_FOG_FAR = 850;
export const MIN_OUTDOOR_FOG_FAR = 45;
export const UNPREPARED_ZONE_FOG_GUARD = 8;
export const ZONE_STREAM_RECHECK_DISTANCE = 24;
// How much of the landing NEIGHBOURHOOD a blocking teleport (a realm portal, a
// hearthstone, a dungeon door) materializes before the loading screen lifts.
// Preparing the destination rectangle alone is not enough near a border:
// fogFarForPreparedZones pins outdoor visibility at MIN_OUTDOOR_FOG_FAR while
// any unprepared rectangle sits within a few dozen yards, and the background
// lane that would clear it is idle-paced, so the player stares at a 45-yard
// wall for as long as building a whole neighbouring zone takes. Deliberately
// well under the rift-exit radius: zone rectangles are 360 yd across, so this
// reaches the one or two borders a landing point is actually standing next to
// rather than a whole ring of realms.
export const ARRIVAL_NEIGHBOR_STREAM_RADIUS = 160;
// GPU texture uploads are synchronous in WebGL. The loading-screen prewarm
// covers only this immediate radius: enough for the first normal travel
// transition without fetching the world's long tail of realm sky HDRIs.
export const INITIAL_SKY_PREWARM_RADIUS = 240;
// Camera-direction urgency, in world units, subtracted from a zone's rectangle
// distance when it sits in the camera's projected forward direction (added
// when behind). Pure nearest-first ordering let a marginally nearer sideways
// zone (Farshore, 178 yd east of spawn) occupy the sequential prepare lane
// for tens of seconds while the player walked into the next-nearest zone
// (Mirefen, 182 yd north) unprepared - the walked-crossing blocking warmup.
export const STREAM_FORWARD_BIAS = 64;

interface Candidate {
  zone: ZoneDef;
  distanceSq: number;
  alignment: number;
  /** Rectangle distance biased by the camera direction: lower prepares first. */
  urgency: number;
  order: number;
}

/** Squared XZ distance from a point to a zone's exact rectangle. */
export function distanceSqToZone(zone: ZoneDef, x: number, z: number): number {
  const minX = zone.xMin ?? STRIP_MIN_X;
  const maxX = zone.xMax ?? STRIP_MAX_X;
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dz = z < zone.zMin ? zone.zMin - z : z > zone.zMax ? z - zone.zMax : 0;
  return dx * dx + dz * dz;
}

/**
 * Zones whose rectangles intersect a radial camera horizon, most urgent first.
 * Urgency is the rectangle distance biased by STREAM_FORWARD_BIAS along the
 * camera's projected forward direction, so the zone the player is heading
 * into reaches the sequential prepare lane before a marginally nearer zone
 * off to the side. Remaining ties break toward the forward direction, then
 * world declaration order, so the terrain currently on screen wins.
 */
export function zonesWithinStreamingHorizon(
  zones: readonly ZoneDef[],
  cameraX: number,
  cameraZ: number,
  horizon: number,
  forwardX = 0,
  forwardZ = 0,
): ZoneDef[] {
  const radius = Math.max(0, horizon);
  const radiusSq = radius * radius;
  const forwardLength = Math.hypot(forwardX, forwardZ);
  const fx = forwardLength > 0 ? forwardX / forwardLength : 0;
  const fz = forwardLength > 0 ? forwardZ / forwardLength : 0;
  const candidates: Candidate[] = [];

  for (let order = 0; order < zones.length; order++) {
    const zone = zones[order];
    const distanceSq = distanceSqToZone(zone, cameraX, cameraZ);
    if (distanceSq > radiusSq) continue;
    const minX = zone.xMin ?? STRIP_MIN_X;
    const maxX = zone.xMax ?? STRIP_MAX_X;
    const nearestX = Math.max(minX, Math.min(maxX, cameraX));
    const nearestZ = Math.max(zone.zMin, Math.min(zone.zMax, cameraZ));
    const dx = nearestX - cameraX;
    const dz = nearestZ - cameraZ;
    const distance = Math.sqrt(distanceSq);
    const alignment = distance > 0 ? (dx * fx + dz * fz) / distance : 1;
    candidates.push({
      zone,
      distanceSq,
      alignment,
      urgency: distance - alignment * STREAM_FORWARD_BIAS,
      order,
    });
  }

  candidates.sort(
    (a, b) =>
      a.urgency - b.urgency ||
      a.distanceSq - b.distanceSq ||
      b.alignment - a.alignment ||
      a.order - b.order,
  );
  return candidates.map((candidate) => candidate.zone);
}

/**
 * The point of `zone`'s rectangle nearest (x, z), inset one yard inside every
 * edge. This is the likely entry point of an approaching camera, used as a
 * zone prepare's build-priority anchor. The inset is load-bearing: zone
 * rectangles are exclusive on their max edges (zoneAt resolves the exact
 * boundary to the neighbour), so an un-inset nearest point can resolve to the
 * WRONG zone, no-op the prepare, and silently starve the streaming queue
 * entry it was consumed by.
 */
export function zoneEntryPoint(zone: ZoneDef, x: number, z: number): { x: number; z: number } {
  const minX = zone.xMin ?? STRIP_MIN_X;
  const maxX = zone.xMax ?? STRIP_MAX_X;
  return {
    x: Math.max(minX + 1, Math.min(maxX - 1, x)),
    z: Math.max(zone.zMin + 1, Math.min(zone.zMax - 1, z)),
  };
}

/**
 * Cap outdoor visibility before the closest unloaded zone rectangle. The cap
 * drops immediately as the camera approaches a boundary and may ease back out
 * after the destination becomes resident; the renderer owns that temporal
 * policy. No geometry is generated by this query.
 */
export function fogFarForPreparedZones(
  zones: readonly ZoneDef[],
  preparedZoneIds: ReadonlySet<string>,
  cameraX: number,
  cameraZ: number,
  requestedFar: number,
): number {
  let nearestSq = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    if (preparedZoneIds.has(zone.id)) continue;
    nearestSq = Math.min(nearestSq, distanceSqToZone(zone, cameraX, cameraZ));
  }
  if (!Number.isFinite(nearestSq)) return Math.min(requestedFar, MAX_OUTDOOR_FOG_FAR);
  const beforeUnprepared = Math.sqrt(nearestSq) - UNPREPARED_ZONE_FOG_GUARD;
  return Math.max(
    MIN_OUTDOOR_FOG_FAR,
    Math.min(requestedFar, MAX_OUTDOOR_FOG_FAR, beforeUnprepared),
  );
}
