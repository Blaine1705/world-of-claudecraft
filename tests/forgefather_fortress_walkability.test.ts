// The Forgefather's Isle walkability gate: the full route from the
// mainland shore over the bridge to the summit court climbs within
// MAX_STEP_HEIGHT at every yard, and a flood of the isle's movement graph
// (up-steps bounded, drops free, water traversable) finds no reachable
// cell that cannot return: no player gets stuck anywhere in the fortress.
// Both scans mirror supportHeightAt's terrain-vs-deck max rule; re-tune
// the ember_coast.ts stamps if a fortress or terrain change reds this.
import { describe, expect, it } from 'vitest';
import {
  FORGEFATHER_FORTRESS_PLACEMENTS,
  FORTRESS_STANDABLE_KEYS,
} from '../src/sim/forgefather_fortress';
import { IGNIVAR_NON_COLLIDING_PROPS, IGNIVAR_PROP_NATIVE } from '../src/sim/ignivar_props';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';
import { terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

function walkHeight(x: number, z: number): number {
  let h = terrainHeight(x, z, WORLD_SEED);
  for (const p of FORGEFATHER_FORTRESS_PLACEMENTS) {
    if (!FORTRESS_STANDABLE_KEYS.has(p.key)) continue;
    const native = IGNIVAR_PROP_NATIVE[p.key];
    const dx = x - p.x;
    const dz = z - p.z;
    const cos = Math.cos(-p.ry);
    const sin = Math.sin(-p.ry);
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    if (Math.abs(lx) <= (native.len * p.scale) / 2 && Math.abs(lz) <= (native.dep * p.scale) / 2) {
      const top = p.y + native.hei * p.scale;
      if (top > h && top - h < 40) h = Math.max(h, top);
    }
  }
  return h;
}

describe('forgefather fortress walkability', () => {
  it('the shore-to-summit route climbs within the step limit at every yard', () => {
    const route: Array<[string, number, number]> = [];
    const seg = (name: string, x0: number, z0: number, x1: number, z1: number) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
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
    const blockers = FORGEFATHER_FORTRESS_PLACEMENTS.filter((p) => {
      if (FORTRESS_STANDABLE_KEYS.has(p.key) || IGNIVAR_NON_COLLIDING_PROPS.has(p.key))
        return false;
      const ground = terrainHeight(p.x, p.z, WORLD_SEED);
      if (p.y > ground + 2.5) return false;
      return p.y + IGNIVAR_PROP_NATIVE[p.key].hei * p.scale >= ground + 0.5;
    });
    const blocked = (x: number, z: number): boolean => {
      for (const b of blockers) {
        const native = IGNIVAR_PROP_NATIVE[b.key];
        const dx = x - b.x;
        const dz = z - b.z;
        const cos = Math.cos(-b.ry);
        const sin = Math.sin(-b.ry);
        const lx = dx * cos + dz * sin;
        const lz = -dx * sin + dz * cos;
        if (
          Math.abs(lx) <= (native.len * b.scale) / 2 + 0.4 &&
          Math.abs(lz) <= (native.dep * b.scale) / 2 + 0.4
        )
          return true;
      }
      return false;
    };
    const hts = new Float64Array(W * H);
    const wet = new Uint8Array(W * H);
    const solid = new Uint8Array(W * H);
    for (let ix = 0; ix < W; ix++)
      for (let iz = 0; iz < H; iz++) {
        const x = X0 + ix;
        const z = Z0 + iz;
        const i = ix + iz * W;
        hts[i] = walkHeight(x, z);
        wet[i] = hts[i] < -4.25 ? 1 : 0;
        solid[i] = blocked(x, z) ? 1 : 0;
      }
    const canStep = (a: number, b: number): boolean => {
      if (solid[b]) return false;
      if (wet[b]) return true;
      return hts[b] - Math.max(hts[a], -4.25) <= MAX_STEP_HEIGHT + 0.01 || wet[a] === 1;
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
});
