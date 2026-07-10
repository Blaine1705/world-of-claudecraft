// Pure spatial policy for renderer zone streaming. The renderer materializes
// terrain outside the player's current zone only when that zone's rectangle can
// enter the camera's fog horizon. This keeps travel seamless without returning
// to the old whole-world eager build.

import { STRIP_MAX_X, STRIP_MIN_X } from '../sim/data';
import type { ZoneDef } from '../sim/types';

export const ZONE_STREAM_RECHECK_DISTANCE = 24;

interface Candidate {
  zone: ZoneDef;
  distanceSq: number;
  alignment: number;
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
 * Zones whose rectangles intersect a radial camera horizon, nearest first.
 * When distances tie, the zone in the camera's projected forward direction is
 * first so the terrain currently on screen wins the sequential build queue.
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
    candidates.push({ zone, distanceSq, alignment, order });
  }

  candidates.sort(
    (a, b) => a.distanceSq - b.distanceSq || b.alignment - a.alignment || a.order - b.order,
  );
  return candidates.map((candidate) => candidate.zone);
}
