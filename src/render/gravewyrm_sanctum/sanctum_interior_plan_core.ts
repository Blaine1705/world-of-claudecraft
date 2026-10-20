// Pure placement plan for the Gravewyrm Sanctum's interior AAA pass: the
// second Blender kit (public/models/props/gravewyrm_sanctum_interior.glb,
// docs/design/dungeon-rework/kit/build_gravewyrm_sanctum_interior.py),
// instanced by the same painter as the first kit (sanctum_kit.ts), zone by
// zone:
//
// - The Lock Terrace (Korgath): the rock pedestal the terrace stands on
//   (Kit_LockSpur, a hand under the floor, notched under the Chain Bridge's
//   deck), the curb stones round its rim (Kit_LockCurb, knee low, open at
//   both chain stairs and the bridge), and lip modules hanging under the two
//   chain stairs' sides (Kit_LipRock*, every one under the stair's floor).
//   The carved seal pillars are the chains painter's (sanctum_chains.ts).
//
// Every piece is render-only dressing: nothing here stands in a body's way
// over walkable floor (tests/gravewyrm_sanctum_interior_kit.test.ts sweeps
// the shipped meshes against the walked floor). Three-free, DOM-free,
// deterministic (hashes only).

import { GRAVEWYRM_SANCTUM_FIELD, LOCK_TERRACE } from '../../sim/content/gravewyrm_sanctum_layout';
import type { FieldSurface } from '../../sim/instances/authored_field/types';
import type { SanctumKitPlacement } from './sanctum_kit_plan_core';
import { sanctumFloorAt, sanctumGround, sanctumHash } from './sanctum_plan_core';

/** The pedestal and the curb stand a hand under / on the terrace floor. */
export function planLockTerrace(): SanctumKitPlacement[] {
  return [
    {
      piece: 'Kit_LockSpur',
      x: LOCK_TERRACE.x,
      z: LOCK_TERRACE.z,
      y: LOCK_TERRACE.h,
      rot: 0,
      scale: 1,
      // Scenery under the rim: the terrace's floor shades it; it casts none.
      noShadow: true,
    },
    {
      piece: 'Kit_LockCurb',
      x: LOCK_TERRACE.x,
      z: LOCK_TERRACE.z,
      y: LOCK_TERRACE.h,
      rot: 0,
      scale: 1,
    },
  ];
}

/** Lip module length along its run (yards) and the variants. */
export const LIP_ROCK_LENGTH = 6.4;
const LIP_ROCKS = ['Kit_LipRockA', 'Kit_LipRockB', 'Kit_LipRockC'] as const;
/** How far inside the stair's edge its floor is read (the cliff probe's). */
const LIP_PROBE = 0.6;
/** The module's top stands this far under the lowest floor along it. */
const LIP_DROP = 0.14;

type PathSurface = Extract<FieldSurface, { kind: 'path' }>;

function pathById(id: string): PathSurface {
  const s = GRAVEWYRM_SANCTUM_FIELD.surfaces.find((f) => f.id === id);
  if (!s || s.kind !== 'path') throw new Error(`no path ${id}`);
  return s;
}

/**
 * Lip modules along both sides of a stair's sloping run, their drop turned
 * outward, each stood at the LOWEST floor along its span (so no module ever
 * rises over a step) and only where the ground beyond the side is the gulf.
 */
export function planStairLips(id: string, salt: number): SanctumKitPlacement[] {
  const s = pathById(id);
  const out: SanctumKitPlacement[] = [];
  let k = 0;
  for (let i = 0; i < s.points.length - 1; i++) {
    const [ax, az] = s.points[i];
    const [bx, bz] = s.points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 2) continue;
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const n = Math.max(1, Math.round(len / LIP_ROCK_LENGTH));
    for (const side of [-1, 1]) {
      // The outward side's unit normal.
      const nx = -uz * side;
      const nz = ux * side;
      for (let j = 0; j < n; j++) {
        const t0 = j / n;
        const t1 = (j + 1) / n;
        const tm = (t0 + t1) / 2;
        const cx = ax + (bx - ax) * tm + nx * s.halfWidth;
        const cz = az + (bz - az) * tm + nz * s.halfWidth;
        // Only over the gulf (another surface's floor beyond: no lip).
        if (sanctumFloorAt(cx + nx * 2.5, cz + nz * 2.5) !== null) continue;
        let floor = Number.POSITIVE_INFINITY;
        for (const t of [t0, tm, t1]) {
          const px = ax + (bx - ax) * t + nx * (s.halfWidth - LIP_PROBE);
          const pz = az + (bz - az) * t + nz * (s.halfWidth - LIP_PROBE);
          floor = Math.min(floor, sanctumGround(px, pz));
        }
        out.push({
          piece: LIP_ROCKS[Math.floor(sanctumHash(k + salt, 41) * LIP_ROCKS.length)],
          x: cx,
          z: cz,
          y: floor - LIP_DROP,
          // Local +Z (the drop face) turns to the outward normal.
          rot: Math.atan2(nx, nz),
          scale: 1,
          stretch: (len / n / LIP_ROCK_LENGTH) * 1.08,
          depth: 0.9 + sanctumHash(k + salt, 43) * 0.3,
          noShadow: true,
        });
        k++;
      }
    }
  }
  return out;
}

/** The whole interior plan (instance-local frame). */
export function planSanctumInteriorPlacements(): SanctumKitPlacement[] {
  return [
    ...planLockTerrace(),
    ...planStairLips('west_chain_stair', 0),
    ...planStairLips('east_chain_stair', 17),
  ];
}
