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
// - The Ritual Vault (Velkhar): the carved thaw pyres (Kit_ThawPyreV2, in
//   place of the first kit's Kit_ThawPyre when the second kit is there:
//   resolveInteriorReplacements), bone heaps against the walls between the
//   pools (knee low), and ice and slate lips under the stairs in and out
//   (the works road, the vault stair, the shore and lake stairs).
//
// Every piece is render-only dressing: nothing here stands in a body's way
// over walkable floor (tests/gravewyrm_sanctum_interior_kit.test.ts sweeps
// the shipped meshes against the walked floor). Three-free, DOM-free,
// deterministic (hashes only).

import {
  GRAVEWYRM_SANCTUM_FIELD,
  LOCK_TERRACE,
  RITUAL_VAULT,
  THAW_POOLS,
} from '../../sim/content/gravewyrm_sanctum_layout';
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
const LIP_ROCKS: readonly string[] = ['Kit_LipRockA', 'Kit_LipRockB', 'Kit_LipRockC'];
const LIP_ICE: readonly string[] = ['Kit_LipIceA', 'Kit_LipIceB'];
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
export function planStairLips(
  id: string,
  salt: number,
  pieces: readonly string[] = LIP_ROCKS,
): SanctumKitPlacement[] {
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
          piece: pieces[Math.floor(sanctumHash(k + salt, 41) * pieces.length)],
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

/** The interior pieces that stand in place of a first-kit piece at the same
 *  placement, and the piece each replaces. */
export const INTERIOR_REPLACES: Readonly<Record<string, string>> = {
  Kit_ThawPyreV2: 'Kit_ThawPyre',
};

/** Bone heaps in the vault: between the pools, against the walls (angle
 *  from north toward east, distance from the vault's centre). */
const BONE_HEAPS: readonly [number, number][] = [
  [Math.PI / 3, 17.2],
  [(5 * Math.PI) / 3, 17.2],
  // Either side of the vault stair's mouth (south), clear of its walk.
  [Math.PI * 0.8, 17.0],
  [Math.PI * 1.2, 17.0],
];

/** The Ritual Vault: the thaw pyres at the pools' centres (the props' own
 *  turn, toward the vault's centre) and the bone heaps. */
export function planRitualVault(): SanctumKitPlacement[] {
  const out: SanctumKitPlacement[] = THAW_POOLS.map((p) => ({
    piece: 'Kit_ThawPyreV2',
    x: p.x,
    z: p.z,
    rot: Math.atan2(RITUAL_VAULT.x - p.x, RITUAL_VAULT.z - p.z),
    scale: 1,
  }));
  for (const [i, [a, r]] of BONE_HEAPS.entries()) {
    out.push({
      piece: 'Kit_BoneHeap',
      x: RITUAL_VAULT.x + Math.sin(a) * r,
      z: RITUAL_VAULT.z + Math.cos(a) * r,
      // Its long side along the wall, its front toward the centre.
      rot: a + Math.PI + (sanctumHash(i, 51) - 0.5) * 0.4,
      scale: 0.95 + sanctumHash(i, 52) * 0.25,
      cosmetic: true,
    });
  }
  return out;
}

/** Drop whichever of each replaced pair cannot draw: the interior piece when
 *  its kit is missing (`has` false), else the first-kit piece it replaces at
 *  the same spot. */
export function resolveInteriorReplacements(
  plan: readonly SanctumKitPlacement[],
  has: (piece: string) => boolean,
): SanctumKitPlacement[] {
  const replaced = new Set<string>();
  for (const [v2, old] of Object.entries(INTERIOR_REPLACES)) if (has(v2)) replaced.add(old);
  return plan.filter((p) => (INTERIOR_REPLACES[p.piece] ? has(p.piece) : !replaced.has(p.piece)));
}

/** The whole interior plan (instance-local frame). */
export function planSanctumInteriorPlacements(): SanctumKitPlacement[] {
  return [
    ...planLockTerrace(),
    ...planStairLips('west_chain_stair', 0),
    ...planStairLips('east_chain_stair', 17),
    ...planRitualVault(),
    ...planStairLips('works_road', 31, LIP_ICE),
    ...planStairLips('vault_stair', 43, LIP_ICE),
    ...planStairLips('shore_stair', 57),
    ...planStairLips('lake_stair', 71),
  ];
}
