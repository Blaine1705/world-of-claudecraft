// The Gravewyrm Sanctum's drawn walls and its walked floor agree (owner's
// playtest, 2026-10-03): after Velkhar the way down to the shore ran THROUGH
// the vault's rim, and on the way to Korzul the lake stair ran through an ice
// rim on the shore. Both were the same class of bug: the terrain drew a
// surface's rock skirt along its WHOLE outline, also where a later, lower
// surface (a stair cut down through the lip, the lake's shelf) owns the ground,
// so a wall stood across a walk with no collider behind it.
//
// This suite sweeps the whole cirque for that class, in the spirit of
// tests/wildheart_basin_walkways.test.ts:
// - every face the terrain draws (skirts and risers) that rises through a
//   body's height over walkable, reachable floor is backed by a collider;
// - every standing kit wall (the vault's walls, the glacier walls, the
//   icefalls, the frozen falls, the crags, the tunnel's flanks) that stands
//   over walkable floor is backed by a collider;
// - every ramp and stair runs clear end to end: no generated cliff across its
//   corridor, no step taller than the cliff step;
// - the two openings the owner walked through are real openings.
//
// It asks the REAL seams: the terrain's own mesh plan (planFieldCliffs with
// the live options), the kit's own placement plan, and the collision seam
// (colliders.ts isBlocked over the field's cliffs, props and gates).

import { beforeAll, describe, expect, it } from 'vitest';
import {
  type FieldMeshData,
  planFieldCliffs,
} from '../src/render/authored_field/field_mesh_core';
import {
  planSanctumKitPlacements,
  planVaultWalls,
  SANCTUM_KIT_SIZES,
  type SanctumKitPlacement,
} from '../src/render/gravewyrm_sanctum/sanctum_kit_plan_core';
import { isBlocked } from '../src/sim/colliders';
import { GRAVEWYRM_SANCTUM_GATES } from '../src/sim/content/gravewyrm_sanctum';
import {
  GRAVEWYRM_HEIGHTS,
  GRAVEWYRM_SANCTUM_FIELD,
  RITUAL_VAULT,
  SHORE,
  WYRMS_HOLLOW,
} from '../src/sim/content/gravewyrm_sanctum_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  authoredFieldCliffRuns,
  authoredFieldHeight,
  authoredFieldSurfaceAt,
  type FieldSurface,
} from '../src/sim/instances/authored_field';
import { setOpenDungeonGates } from '../src/sim/instances/dungeon_gate_state';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';

const SEED = 7;
const DUNGEON = DUNGEONS.gravewyrm_sanctum;
const SLOT = 6;
const O = instanceOrigin(DUNGEON.index, SLOT);
const FIELD = GRAVEWYRM_SANCTUM_FIELD;
const VOID = FIELD.voidHeight;
const { minX, maxX, minZ, maxZ } = FIELD.bounds;
const W = maxX - minX + 1;
const H = maxZ - minZ + 1;
type PathSurface = Extract<FieldSurface, { kind: 'path' }>;
const PATHS = FIELD.surfaces.filter((s): s is PathSurface => s.kind === 'path');

/** The body's height band over the floor: a face crossing it is one a body
 *  walks into (under it is a step; over it is an overhang). */
const BAND_LOW = Math.max(MAX_STEP_HEIGHT, FIELD.cliffStep) + 0.05;
const BAND_HIGH = 2.2;

function cell(x: number, z: number): number {
  return (Math.round(z) - minZ) * W + (Math.round(x) - minX);
}

/** Every one-yard cell a body reaches from the arrival with EVERY gate open
 *  (the whole cleared run), flood-filled over the real collision seam. */
let reach: Uint8Array;

function floodReach(): Uint8Array {
  setOpenDungeonGates(
    O.x,
    O.z,
    GRAVEWYRM_SANCTUM_GATES.map((g) => g.id),
  );
  const seen = new Uint8Array(W * H);
  const start = DUNGEON.entry;
  const queue: number[] = [Math.round(start.x), Math.round(start.z)];
  seen[cell(start.x, start.z)] = 1;
  for (let q = 0; q < queue.length; q += 2) {
    const x = queue[q];
    const z = queue[q + 1];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const i = cell(nx, nz);
      if (seen[i]) continue;
      if (isBlocked(SEED, O.x + nx, O.z + nz, 0.5)) continue;
      seen[i] = 1;
      queue.push(nx, nz);
    }
  }
  return seen;
}

/** Can a body stand at (x, z) on the cleared run? (A reached cell, a real
 *  floor, and no collider pushing a body off the very point.) */
function standable(x: number, z: number): boolean {
  if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
  if (!reach[cell(x, z)]) return false;
  if (authoredFieldHeight(FIELD, x, z) <= VOID + 1) return false;
  return !isBlocked(SEED, O.x + x, O.z + z, 0.5);
}

/** The live terrain options of field_terrain.ts (high and low tier). */
function cliffMeshes(): FieldMeshData[] {
  return [
    { columnStep: 1.6, rowStep: 3 },
    { columnStep: 3, rowStep: 6 },
  ].map((o) => planFieldCliffs(FIELD, { voidFloor: VOID - 25, flare: 0.22, ...o }));
}

/** Points spread over a triangle (its corners, edges and inside). */
function* trianglePoints(
  a: number[],
  b: number[],
  c: number[],
  n: number,
): Generator<[number, number, number]> {
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n - i; j++) {
      const u = i / n;
      const v = j / n;
      const w = 1 - u - v;
      yield [
        a[0] * w + b[0] * u + c[0] * v,
        a[1] * w + b[1] * u + c[1] * v,
        a[2] * w + b[2] * u + c[2] * v,
      ];
    }
  }
}

/** Faces of a drawn mesh that cross a body's height over standable floor
 *  with no collider: (x, z) rounded, deduplicated. */
function walkThroughFaces(mesh: FieldMeshData): string[] {
  const p = mesh.positions;
  const found = new Map<string, string>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t] * 3;
    const b = mesh.indices[t + 1] * 3;
    const c = mesh.indices[t + 2] * 3;
    const va = [p[a], p[a + 1], p[a + 2]];
    const vb = [p[b], p[b + 1], p[b + 2]];
    const vc = [p[c], p[c + 1], p[c + 2]];
    const span = Math.max(
      Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]),
      Math.hypot(vb[0] - vc[0], vb[1] - vc[1], vb[2] - vc[2]),
      Math.hypot(vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]),
    );
    const n = Math.max(2, Math.ceil(span / 0.5));
    for (const [x, y, z] of trianglePoints(va, vb, vc, n)) {
      const floor = authoredFieldHeight(FIELD, x, z);
      if (floor <= VOID + 1) continue;
      if (y < floor + BAND_LOW || y > floor + BAND_HIGH) continue;
      if (!standable(x, z)) continue;
      const key = `${Math.round(x)},${Math.round(z)}`;
      if (!found.has(key)) {
        const s = authoredFieldSurfaceAt(FIELD, x, z);
        found.set(
          key,
          `face at (${x.toFixed(1)}, ${z.toFixed(1)}) y ${y.toFixed(2)} over ${s?.id} floor ${floor.toFixed(2)}`,
        );
      }
    }
  }
  return [...found.values()];
}

/** Standing kit walls (the class a body could walk through): never the
 *  lip modules hung under a cliff run (their top is the lip), never the
 *  flat floor dressing. */
const STANDING = /VaultWall|GlacierWall|IceFall|FrozenFall|Crag|RockCliff|GateTunnel|Serac/;
/** Hung from a lip: the piece's top is its origin (they hang below). */
const HUNG = /CrevasseEdge|RockCliff/;

function pieceSize(piece: string): readonly [number, number, number] | null {
  return SANCTUM_KIT_SIZES[piece] ?? SANCTUM_KIT_SIZES[piece.replace(/[B-Z]$/, 'A')] ?? null;
}

/** Points over a standing piece's footprint (its inner 90 percent) that
 *  stand through a body's height over standable floor with no collider. */
function walkThroughPiece(k: SanctumKitPlacement): string[] {
  const size = pieceSize(k.piece);
  if (!size) return [];
  const hw = (size[0] * k.scale * (k.stretch ?? 1)) / 2;
  const hd = (size[1] * k.scale * (k.depth ?? 1)) / 2;
  const tall = size[2] * k.scale * (k.scaleY ?? 1);
  const cos = Math.cos(k.rot);
  const sin = Math.sin(k.rot);
  const out: string[] = [];
  const nx = Math.max(2, Math.ceil(hw / 0.75));
  const nz = Math.max(2, Math.ceil(hd / 0.75));
  for (let i = -nx; i <= nx; i++) {
    for (let j = -nz; j <= nz; j++) {
      const lx = (i / nx) * hw * 0.9;
      const lz = (j / nz) * hd * 0.9;
      // three.js yaw: local +X turns to (cos, -sin), local +Z to (sin, cos).
      const x = k.x + lx * cos + lz * sin;
      const z = k.z - lx * sin + lz * cos;
      const floor = authoredFieldHeight(FIELD, x, z);
      if (floor <= VOID + 1) continue;
      const base = k.y ?? floor + (k.lift ?? 0);
      const top = HUNG.test(k.piece) ? base : base + tall;
      const bottom = HUNG.test(k.piece) ? base - tall : base;
      if (top < floor + BAND_LOW || bottom > floor + BAND_HIGH) continue;
      if (!standable(x, z)) continue;
      out.push(`${k.piece} at (${x.toFixed(1)}, ${z.toFixed(1)}) over floor ${floor.toFixed(1)}`);
    }
  }
  return out;
}

/** Points along a path's centreline every `step` yards, with its unit side. */
function centreline(s: PathSurface, step = 0.5): { x: number; z: number; nx: number; nz: number }[] {
  const out: { x: number; z: number; nx: number; nz: number }[] = [];
  for (let i = 0; i < s.points.length - 1; i++) {
    const [ax, az] = s.points[i];
    const [bx, bz] = s.points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push({
        x: ax + (bx - ax) * t,
        z: az + (bz - az) * t,
        nx: -(bz - az) / len,
        nz: (bx - ax) / len,
      });
    }
  }
  return out;
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

beforeAll(() => {
  reach = floodReach();
});

describe('Gravewyrm Sanctum: the drawn walls and the walked floor agree', () => {
  it('the cleared run reaches the lake (the sweep below covers the whole route)', () => {
    expect(reach[cell(0, -222)]).toBe(1);
    expect(reach[cell(0, 120)]).toBe(1);
    expect(reach[cell(0, 150)]).toBe(1);
    expect(reach[cell(WYRMS_HOLLOW.x, WYRMS_HOLLOW.z)]).toBe(1);
  });

  it('no face of the drawn terrain stands across walkable floor without a collider', () => {
    for (const mesh of cliffMeshes()) {
      const bad = walkThroughFaces(mesh);
      expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
    }
  });

  it('every standing kit wall over walkable floor is backed by a collider', () => {
    const bad = planSanctumKitPlacements()
      .filter((k) => STANDING.test(k.piece))
      .flatMap(walkThroughPiece);
    expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
  });

  it('every ramp and stair runs clear end to end', () => {
    const cliffs = authoredFieldCliffRuns(FIELD);
    const failures: string[] = [];
    for (const s of PATHS) {
      let prev: number | null = null;
      for (const p of centreline(s, 0.25)) {
        const h = authoredFieldHeight(FIELD, p.x, p.z);
        if (prev !== null && Math.abs(h - prev) >= FIELD.cliffStep) {
          failures.push(`${s.id}: a step of ${Math.abs(h - prev).toFixed(2)} at (${p.x}, ${p.z})`);
          break;
        }
        prev = h;
        const across = cliffs.find(
          (r) => segDist(p.x, p.z, r.ax, r.az, r.bx, r.bz) < s.halfWidth * 0.5,
        );
        if (across) {
          failures.push(`${s.id}: the cliff of ${across.surface} across it at (${p.x}, ${p.z})`);
          break;
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('the way down from the Ritual Vault leaves through a real opening in its rim', () => {
    const stair = PATHS.find((s) => s.id === 'shore_stair');
    if (!stair) throw new Error('no shore_stair');
    // The stair starts on the vault floor and only drops once out of the bowl.
    const edgeZ = RITUAL_VAULT.z + RITUAL_VAULT.r;
    expect(authoredFieldHeight(FIELD, 0, edgeZ - 0.3)).toBeCloseTo(GRAVEWYRM_HEIGHTS.vault, 5);
    // Every vault wall stands clear of the stair's corridor (with a body's
    // margin) and off the vault's own floor.
    for (const w of planVaultWalls()) {
      const size = SANCTUM_KIT_SIZES.Kit_VaultWall;
      const half = (size[0] * w.scale * (w.stretch ?? 1)) / 2;
      const ux = Math.cos(w.rot);
      const uz = -Math.sin(w.rot);
      const d = segDist(
        0,
        edgeZ + 2,
        w.x - ux * half,
        w.z - uz * half,
        w.x + ux * half,
        w.z + uz * half,
      );
      expect(d, `vault wall at (${w.x.toFixed(1)}, ${w.z.toFixed(1)})`).toBeGreaterThan(
        stair.halfWidth + 1,
      );
      const inner = Math.hypot(w.x - RITUAL_VAULT.x, w.z - RITUAL_VAULT.z);
      const depth = (size[1] * w.scale * (w.depth ?? 1)) / 2;
      expect(inner - depth).toBeGreaterThanOrEqual(RITUAL_VAULT.r);
    }
  });

  it('the lake stair comes down onto the shelf with no rim across it', () => {
    // The shore's drawn inner rim is the shelf's edge, where the shore really
    // drops to the lake shelf (never inside the shelf, where a body walks).
    expect(SHORE.innerR).toBe(WYRMS_HOLLOW.shelfR);
    const stair = PATHS.find((s) => s.id === 'lake_stair');
    if (!stair) throw new Error('no lake_stair');
    const last = stair.points[stair.points.length - 1];
    expect(last[2]).toBe(GRAVEWYRM_HEIGHTS.lake);
  });
});

describe('Gravewyrm Sanctum: the descent from the Chain Bridge is glacier ice', () => {
  it('the Thaw Works road down to the lower terrace is ice, not rock', () => {
    const road = PATHS.find((s) => s.id === 'works_road');
    expect(road?.ground).toBe('ice');
    // The rest of the way down to the vault is ice as well.
    expect(PATHS.find((s) => s.id === 'vault_stair')?.ground).toBe('ice');
  });
});
