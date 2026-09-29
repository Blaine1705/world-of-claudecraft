// The Hollow Crypt route contract (docs/design/dungeon-rework/hollow_crypt.md,
// "no skipping"): walk the walkable graph of the open-air layout from the
// arrival point, with the gates open exactly as the dead packs and bosses
// allow, and prove every boss is unreachable until its gating packs die.
//
// The walk is a flood fill over a one-yard grid that asks the REAL collision
// seam (colliders.ts isBlocked, which reads the field's generated cliffs,
// walls, props and the per-slot gate view). It deliberately ignores height, so
// a missing cliff wall would let it spill into the mist chasm, which the last
// case forbids.

import { beforeEach, describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { HOLLOW_CRYPT_GATES, HOLLOW_CRYPT_SPAWNS } from '../src/sim/content/hollow_crypt';
import { HOLLOW_CRYPT_FIELD } from '../src/sim/content/hollow_crypt_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';
import {
  clearDungeonGateStateForTest,
  setOpenDungeonGates,
} from '../src/sim/instances/dungeon_gate_state';

const SEED = 7;
const DUNGEON = DUNGEONS.hollow_crypt;
const SLOT = 3;
const O = instanceOrigin(DUNGEON.index, SLOT);
const { minX, maxX, minZ, maxZ } = HOLLOW_CRYPT_FIELD.bounds;
const W = maxX - minX + 1;
const H = maxZ - minZ + 1;

function cell(x: number, z: number): number {
  return (Math.round(z) - minZ) * W + (Math.round(x) - minX);
}

/** Flood fill from the arrival point with the given gates open. */
function reachable(open: string[]): Uint8Array {
  setOpenDungeonGates(O.x, O.z, open);
  const seen = new Uint8Array(W * H);
  const blocked = new Int8Array(W * H).fill(-1);
  const isFree = (x: number, z: number): boolean => {
    const i = cell(x, z);
    if (blocked[i] === -1) blocked[i] = isBlocked(SEED, O.x + x, O.z + z, 0.5) ? 1 : 0;
    return blocked[i] === 0;
  };
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
      if (seen[i] || !isFree(nx, nz)) continue;
      seen[i] = 1;
      queue.push(nx, nz);
    }
  }
  return seen;
}

/** Is a spawn standing inside the reached region (its own or a next cell)? */
function spawnReached(seen: Uint8Array, x: number, z: number): boolean {
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const cx = Math.round(x) + dx;
      const cz = Math.round(z) + dz;
      if (cx < minX || cx > maxX || cz < minZ || cz > maxZ) continue;
      if (seen[cell(cx, cz)]) return true;
    }
  }
  return false;
}

function reachedPacks(seen: Uint8Array): string[] {
  const out = new Set<string>();
  for (const s of HOLLOW_CRYPT_SPAWNS) {
    if (!spawnReached(seen, s.x, s.z)) continue;
    out.add(s.packId ?? s.mobId);
  }
  return [...out].sort();
}

/** The gates a set of dead packs and bosses opens (seals idle: nobody engaged). */
function openGates(dead: Set<string>): string[] {
  return HOLLOW_CRYPT_GATES.filter(
    (g) => (g.packs ?? []).every((p) => dead.has(p)) && (g.bosses ?? []).every((b) => dead.has(b)),
  ).map((g) => g.id);
}

const BOSSES = ['sexton_marrow', 'rimeweb', 'cantor_ilvane', 'morthen'];

describe('Hollow Crypt route contract: every pack is mandatory', () => {
  beforeEach(() => clearDungeonGateStateForTest());

  it('with nothing dead, only the Undercroft packs are reachable', () => {
    const seen = reachable(openGates(new Set()));
    expect(reachedPacks(seen)).toEqual(['p1', 'p2', 'p3']);
  });

  it('the Grille opens both wings and the Processional, but no boss arena', () => {
    const seen = reachable(openGates(new Set(['p1', 'p2', 'p3'])));
    const packs = reachedPacks(seen);
    expect(packs).toEqual(expect.arrayContaining(['p4', 'p5', 'p6', 'p7', 'p8']));
    for (const boss of BOSSES) expect(packs).not.toContain(boss);
    expect(packs).not.toContain('p9');
    expect(packs).not.toContain('ilvane');
  });

  it('each wing boss is reachable only after its own wing packs die', () => {
    const base = ['p1', 'p2', 'p3'];
    const west = reachedPacks(reachable(openGates(new Set([...base, 'p4', 'p5']))));
    expect(west).toContain('sexton_marrow');
    expect(west).not.toContain('rimeweb');
    const westOnlyP4 = reachedPacks(reachable(openGates(new Set([...base, 'p4']))));
    expect(westOnlyP4).not.toContain('sexton_marrow');
    const east = reachedPacks(reachable(openGates(new Set([...base, 'p6', 'p7']))));
    expect(east).toContain('rimeweb');
    expect(east).not.toContain('sexton_marrow');
    const eastOnlyP6 = reachedPacks(reachable(openGates(new Set([...base, 'p6']))));
    expect(eastOnlyP6).not.toContain('rimeweb');
  });

  it('the Twin Seals need BOTH wing bosses and the choir approach pack', () => {
    const wings = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const oneBoss = reachedPacks(reachable(openGates(new Set([...wings, 'sexton_marrow']))));
    expect(oneBoss).not.toContain('ilvane');
    const noP8 = new Set([...wings.filter((p) => p !== 'p8'), 'sexton_marrow', 'rimeweb']);
    expect(reachedPacks(reachable(openGates(noP8)))).not.toContain('ilvane');
    const both = reachedPacks(
      reachable(openGates(new Set([...wings, 'sexton_marrow', 'rimeweb']))),
    );
    expect(both).toContain('ilvane');
    expect(both).not.toContain('p9');
    expect(both).not.toContain('morthen');
  });

  it('Morthen is reachable only after Ilvane and the procession die', () => {
    const upTo = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'sexton_marrow', 'rimeweb'];
    const afterIlvane = reachedPacks(reachable(openGates(new Set([...upTo, 'cantor_ilvane']))));
    expect(afterIlvane).toContain('p9');
    expect(afterIlvane).not.toContain('morthen');
    const all = new Set([...upTo, 'cantor_ilvane', 'p9']);
    expect(reachedPacks(reachable(openGates(all)))).toContain('morthen');
  });

  it('a fully cleared route reaches every placement and never the mist chasm', () => {
    const dead = new Set<string>([...HOLLOW_CRYPT_GATES.flatMap((g) => g.packs ?? []), ...BOSSES]);
    const seen = reachable(openGates(dead));
    for (const s of HOLLOW_CRYPT_SPAWNS) {
      expect(spawnReached(seen, s.x, s.z), `${s.mobId} at ${s.x},${s.z}`).toBe(true);
    }
    let voidCells = 0;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (!seen[cell(x, z)]) continue;
        if (authoredFieldHeight(HOLLOW_CRYPT_FIELD, x, z) <= HOLLOW_CRYPT_FIELD.voidHeight) {
          voidCells++;
        }
      }
    }
    expect(voidCells).toBe(0);
  });

  it('gate state is per slot: opening slot 3 leaves slot 4 sealed', () => {
    setOpenDungeonGates(O.x, O.z, ['grille']);
    const o4 = instanceOrigin(DUNGEON.index, SLOT + 1);
    expect(isBlocked(SEED, O.x, O.z + 21, 0.5)).toBe(false);
    expect(isBlocked(SEED, o4.x, o4.z + 21, 0.5)).toBe(true);
  });
});
