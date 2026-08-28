// The Forgefather's Isle walkability gate: the full route from the
// mainland shore over the bridge to the summit court climbs within
// MAX_STEP_HEIGHT at every yard AND inside the movement kernel's terrain
// steepness gate (PLAYER_MAX_CLIMB_SLOPE over 1-yard cells, the arm the
// first bake missed: stamp rims passed the step check but read as cliffs),
// and a flood of the isle's movement graph (up-steps bounded, steep dry
// cells refused, drops free, water traversable) finds no reachable cell
// that cannot return: no player gets stuck anywhere in the fortress.
// Walk support comes from the REAL fortress collider set, so the deck
// plates and the staircase tread platforms carry the walker exactly as
// supportHeightAt does in game; re-tune the ember_coast.ts stamps or the
// staircase seatings if a fortress or terrain change reds this.
import { describe, expect, it } from 'vitest';
import type { ObbCollider } from '../src/sim/colliders';
import {
  FORGEFATHER_FORTRESS_PLACEMENTS,
  forgefatherFortressColliders,
} from '../src/sim/forgefather_fortress';
import { IGNIVAR_NON_COLLIDING_PROPS, IGNIVAR_PROP_NATIVE } from '../src/sim/ignivar_props';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';
import { terrainDownhill, terrainHeight, terrainSteepness } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const STANDABLES = (forgefatherFortressColliders(WORLD_SEED) as ObbCollider[]).filter(
  (collider) => collider.standable === true,
);

function walkHeight(x: number, z: number): number {
  let h = terrainHeight(x, z, WORLD_SEED);
  for (const c of STANDABLES) {
    const dx = x - c.x;
    const dz = z - c.z;
    const cos = Math.cos(-c.rot);
    const sin = Math.sin(-c.rot);
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    if (Math.abs(lx) <= c.hw && Math.abs(lz) <= c.hd) {
      const top = c.moveTopY as number;
      if (top > h && top - h < 40) h = Math.max(h, top);
    }
  }
  return h;
}

describe('forgefather fortress walkability', () => {
  it('the shore-to-summit route climbs within the step and steepness limits at every yard', () => {
    const route: Array<[string, number, number]> = [];
    const seg = (name: string, x0: number, z0: number, x1: number, z1: number) => {
      // Half-yard sampling: a real movement tick advances ~0.35 yd, so a
      // coarser walk straddles two stair treads and reads a double rise.
      const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2);
      for (let i = 0; i <= steps; i++)
        route.push([name, x0 + ((x1 - x0) * i) / steps, z0 + ((z1 - z0) * i) / steps]);
    };
    seg('mainland approach', 443.7, 2178, 443.7, 2186);
    seg('bridge west leg', 440, 2189, 448, 2192);
    seg('bridge main span', 448, 2193, 490, 2193);
    seg('deck to quay', 490, 2196, 492, 2202);
    seg('quay', 492, 2202, 493, 2206);
    seg('quay stair east', 493, 2202, 501, 2200.5);
    seg('gate passage', 501, 2200.5, 504, 2200.5);
    seg('forecourt', 504, 2200.5, 506, 2205);
    seg('bailey stair', 507.8, 2202, 507.8, 2212);
    seg('middle court', 507.8, 2212, 506, 2218);
    seg('court stair', 504.1, 2216, 504.1, 2226);
    seg('tier three', 504.1, 2226, 504.05, 2229);
    seg('upper stair', 503.35, 2229, 503.35, 2238);
    seg('upper landing', 503.35, 2238, 504.3, 2241);
    seg('keep stair', 503.05, 2239, 503.05, 2246);
    seg('summit court', 503.05, 2246, 503, 2249);
    const bad: string[] = [];
    let prev: number | null = null;
    for (const [name, x, z] of route) {
      const h = walkHeight(x, z);
      if (prev !== null && h - prev > MAX_STEP_HEIGHT + 0.01)
        bad.push(`${name} (${x.toFixed(1)}, ${z.toFixed(1)}): rise ${(h - prev).toFixed(2)}`);
      // The steepness gate reads terrain only where terrain IS the support:
      // a walker on a deck or tread platform is carried over the cell.
      if (h <= terrainHeight(x, z, WORLD_SEED) + 0.01) {
        const steep = terrainSteepness(Math.round(x), Math.round(z), WORLD_SEED);
        if (steep > PLAYER_MAX_CLIMB_SLOPE)
          bad.push(`${name} (${x.toFixed(1)}, ${z.toFixed(1)}): steepness ${steep.toFixed(2)}`);
      }
      prev = h;
    }
    expect(bad, bad.slice(0, 12).join('; ')).toEqual([]);
  });

  it('no reachable cell on the isle is a stuck pocket', () => {
    const X0 = 430;
    const X1 = 535;
    const Z0 = 2178;
    const Z1 = 2266;
    const W = X1 - X0 + 1;
    const H = Z1 - Z0 + 1;
    const blockers = forgefatherFortressColliders(WORLD_SEED).filter(
      (collider) => !collider.standable,
    );
    const blocked = (x: number, z: number): boolean => {
      for (const b of blockers) {
        const dx = x - b.x;
        const dz = z - b.z;
        if (b.type === 'circle') {
          if (Math.hypot(dx, dz) <= b.r + 0.4) return true;
          continue;
        }
        const cos = Math.cos(-b.rot);
        const sin = Math.sin(-b.rot);
        const lx = dx * cos + dz * sin;
        const lz = -dx * sin + dz * cos;
        if (Math.abs(lx) <= b.hw + 0.4 && Math.abs(lz) <= b.hd + 0.4) return true;
      }
      return false;
    };
    const hts = new Float64Array(W * H);
    const wet = new Uint8Array(W * H);
    const solid = new Uint8Array(W * H);
    const cliff = new Uint8Array(W * H); // dry terrain too steep to walk onto
    for (let ix = 0; ix < W; ix++)
      for (let iz = 0; iz < H; iz++) {
        const x = X0 + ix;
        const z = Z0 + iz;
        const i = ix + iz * W;
        hts[i] = walkHeight(x, z);
        wet[i] = hts[i] < -4.25 ? 1 : 0;
        solid[i] = blocked(x, z) ? 1 : 0;
        cliff[i] =
          !wet[i] &&
          hts[i] <= terrainHeight(x, z, WORLD_SEED) + 0.01 &&
          terrainSteepness(x, z, WORLD_SEED) > PLAYER_MAX_CLIMB_SLOPE
            ? 1
            : 0;
      }
    const onTerrain = new Uint8Array(W * H);
    for (let ix = 0; ix < W; ix++)
      for (let iz = 0; iz < H; iz++) {
        const i = ix + iz * W;
        onTerrain[i] = hts[i] <= terrainHeight(X0 + ix, Z0 + iz, WORLD_SEED) + 0.01 ? 1 : 0;
      }
    const canStep = (a: number, b: number): boolean => {
      if (solid[b] || cliff[b]) return false;
      if (wet[b]) return true;
      if (wet[a]) return true;
      // Terrain-to-terrain hops follow the slope gate (a smooth grade is
      // walkable up to PLAYER_MAX_CLIMB_SLOPE per yard); any hop involving
      // a deck or tread platform is a collider step under MAX_STEP_HEIGHT.
      const limit =
        onTerrain[a] && onTerrain[b] ? PLAYER_MAX_CLIMB_SLOPE + 0.01 : MAX_STEP_HEIGHT + 0.01;
      return hts[b] - Math.max(hts[a], -4.25) <= limit;
    };
    const flood = (seed: number, reverse: boolean): Uint8Array => {
      const seen = new Uint8Array(W * H);
      const queue = [seed];
      seen[seed] = 1;
      while (queue.length) {
        const i = queue.pop() as number;
        const ix = i % W;
        const iz = (i / W) | 0;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jx >= W || jz < 0 || jz >= H) continue;
          const j = jx + jz * W;
          if (seen[j]) continue;
          const ok = reverse ? canStep(j, i) : canStep(i, j);
          if (ok) {
            seen[j] = 1;
            queue.push(j);
          }
        }
      }
      return seen;
    };
    const seedIdx = 443 - X0 + (2181 - Z0) * W; // the mainland shore
    const reach = flood(seedIdx, false);
    const back = flood(seedIdx, true);
    const traps: string[] = [];
    for (let ix = 0; ix < W; ix++)
      for (let iz = 0; iz < H; iz++) {
        const i = ix + iz * W;
        if (reach[i] && !back[i] && !wet[i] && !solid[i])
          traps.push(`(${X0 + ix}, ${Z0 + iz}) h${hts[i].toFixed(1)}`);
      }
    expect(traps, traps.slice(0, 12).join('; ')).toEqual([]);
  });

  it('no walk cell can strip control with no slide to escape by (the freeze-spot rule)', () => {
    // The movement kernel's steepness strip reads the RAW heightfield. A
    // platform-CARRIED body (feet > ground + 0.5) is exempt by the kernel's
    // platform-carry clearance; what must never exist is a walkable cell
    // whose support sits close enough to steep sliding ground to strip
    // input while a collider still pins the body in place (the tier-three
    // trench bug). Mirror the kernel's exact arms here.
    const frozen: string[] = [];
    for (let x = 430; x <= 535; x++)
      for (let z = 2178; z <= 2266; z++) {
        const walk = walkHeight(x, z);
        const terr = terrainHeight(x, z, WORLD_SEED);
        if (walk <= terr + 0.01) continue; // terrain-supported: slides free
        if (walk > terr + 0.5) continue; // platform-carried: kernel exempts
        if (walk < -4.25) continue;
        // Submerged ground under a deck reads through the waterline-clamped
        // ride arm in the engine, never the raw seabed gradient.
        if (terr < -4.3) continue;
        const steep = terrainSteepness(x, z, WORLD_SEED);
        if (steep <= PLAYER_MAX_CLIMB_SLOPE) continue;
        // The kernel's second arm: the strip fires only where an ACTUAL
        // downhill exists at the exact position.
        if (terrainDownhill(x, z, WORLD_SEED) === null) continue;
        frozen.push(`(${x}, ${z}) walk ${walk.toFixed(1)} steep ${steep.toFixed(2)}`);
      }
    expect(frozen, frozen.slice(0, 12).join('; ')).toEqual([]);
  });

  it('every staircase emits ascending tread platforms inside the step limit', () => {
    const stairs = FORGEFATHER_FORTRESS_PLACEMENTS.filter((p) => p.key === 'staircase');
    expect(stairs.length).toBe(6);
    expect(IGNIVAR_NON_COLLIDING_PROPS.has('staircase')).toBe(true);
    for (const s of stairs) {
      const halfDep = (IGNIVAR_PROP_NATIVE.staircase.dep * s.scale) / 2;
      const treads = STANDABLES.filter(
        (c) =>
          c.rot === s.ry && c.hd === halfDep && Math.hypot(c.x - s.x, c.z - s.z) <= s.scale / 2,
      ).sort((a, b) => (a.moveTopY as number) - (b.moveTopY as number));
      expect(treads.length, `stair at (${s.x}, ${s.z})`).toBe(11);
      let prev = s.y;
      for (const tread of treads) {
        const top = tread.moveTopY as number;
        expect(top - prev, `tread rise at (${s.x}, ${s.z})`).toBeLessThanOrEqual(MAX_STEP_HEIGHT);
        // The top tread and the landing share the flight's crest height.
        expect(top).toBeGreaterThanOrEqual(prev);
        prev = top;
      }
      // The flight tops out at the stair's landing height.
      expect(prev).toBeCloseTo(s.y + 0.74 * s.scale, 5);
    }
  });
});
