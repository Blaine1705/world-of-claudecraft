// The Stormbrass Foundry route contract (docs/design/dungeon-rework/
// stormbrass_foundry.md section 3, "no skipping"): walk the walkable graph of
// the open-air foundry shelf from the lift, with the gates open exactly as the
// dead packs and bosses allow, and prove every pack and boss is unreachable
// until the packs before it die; that BOTH wings open on the Line-Master; and
// that the Crane Bridge to the Drafting Yard extends only once both wing
// bosses are dead.
//
// The walk is a flood fill over a one-yard grid that asks the REAL collision
// seam (colliders.ts isBlocked, which reads the field's generated cliffs,
// props and the per-slot gate view). It ignores height, so a missing cliff
// wall would let it spill into the mountain drop, which the last cases forbid.

import { beforeEach, describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import {
  STORMBRASS_FOUNDRY_GATES,
  STORMBRASS_FOUNDRY_PACKS,
  STORMBRASS_FOUNDRY_PATROLS,
  STORMBRASS_FOUNDRY_SPAWNS,
} from '../src/sim/content/stormbrass_foundry';
import {
  MAIN_LINE_BELTS,
  STORMBRASS_FOUNDRY_ANCHORS,
  STORMBRASS_FOUNDRY_FIELD,
} from '../src/sim/content/stormbrass_foundry_layout';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';
import {
  clearDungeonGateStateForTest,
  setOpenDungeonGates,
} from '../src/sim/instances/dungeon_gate_state';

const SEED = 7;
const DUNGEON = DUNGEONS.stormbrass_foundry;
const SLOT = 5;
const O = instanceOrigin(DUNGEON.index, SLOT);
const { minX, maxX, minZ, maxZ } = STORMBRASS_FOUNDRY_FIELD.bounds;
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
  for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
    // A patrol is reachable when any point of its loop is.
    const pts = s.patrol ? s.patrol.points : [{ x: s.x, z: s.z }];
    if (!pts.some((p) => spawnReached(seen, p.x, p.z))) continue;
    out.add(s.packId ?? s.mobId);
  }
  return [...out].sort();
}

/** The gates a set of dead packs and bosses opens (seals idle: nobody engaged). */
function openGates(dead: Set<string>): string[] {
  return STORMBRASS_FOUNDRY_GATES.filter(
    (g) => (g.packs ?? []).every((p) => dead.has(p)) && (g.bosses ?? []).every((b) => dead.has(b)),
  ).map((g) => g.id);
}

const TOCK = 'line_master_tock';
const RANGEWARDEN = 'rangewarden';
const VOLTAIC = 'voltaic_warden';
const PRIME = 'prime_draft';
const YARD = ['g1', 'g2', 'pa'];
const TERRACES = ['g3', 'g4'];
const WEST = ['g5', 'g6', 'pb'];
const EAST = ['g7', 'g8', 'pc'];
const NORTH = ['g9', 'g10', 'g11', 'g12', 'g13', 'pd'];

/** Everything dead up to and including a stage. */
function upTo(...stages: string[][]): Set<string> {
  return new Set(stages.flat());
}

describe('Stormbrass Foundry route contract: every pack is mandatory', () => {
  beforeEach(() => clearDungeonGateStateForTest());

  it('lists 13 groups and 4 patrols, each a real pack of the spawn list', () => {
    expect(STORMBRASS_FOUNDRY_PACKS).toHaveLength(17);
    expect(STORMBRASS_FOUNDRY_PATROLS).toHaveLength(4);
    const groups = STORMBRASS_FOUNDRY_PACKS.filter(
      (p) => !(STORMBRASS_FOUNDRY_PATROLS as readonly string[]).includes(p),
    );
    expect(groups).toHaveLength(13);
    const packs = new Set(STORMBRASS_FOUNDRY_SPAWNS.map((s) => s.packId));
    for (const p of STORMBRASS_FOUNDRY_PACKS) expect(packs.has(p), p).toBe(true);
    for (const p of STORMBRASS_FOUNDRY_PATROLS) {
      const members = STORMBRASS_FOUNDRY_SPAWNS.filter((s) => s.packId === p);
      expect(members.length, p).toBeGreaterThanOrEqual(1);
      for (const m of members) expect(m.patrol, `${p} ${m.mobId}`).toBeDefined();
    }
    // Patrol A is the Gantry Hauler alone (the showpiece).
    expect(STORMBRASS_FOUNDRY_SPAWNS.filter((s) => s.packId === 'pa').map((s) => s.mobId)).toEqual([
      'gantry_hauler',
    ]);
    // Every group is three to five mobs (the design's section 4.2 table).
    for (const p of groups) {
      const n = STORMBRASS_FOUNDRY_SPAWNS.filter((s) => s.packId === p).length;
      expect(n, p).toBeGreaterThanOrEqual(3);
      expect(n, p).toBeLessThanOrEqual(5);
    }
    // Every placed mob resolves, and no placement repeats a spot.
    const spots = new Set<string>();
    for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
      expect(MOBS[s.mobId], s.mobId).toBeDefined();
      if (s.patrol) continue;
      const key = `${s.x},${s.z}`;
      expect(spots.has(key), key).toBe(false);
      spots.add(key);
    }
  });

  it('matches the design roster: about 60 trash mobs and the four bosses', () => {
    const trash = STORMBRASS_FOUNDRY_SPAWNS.filter((s) => s.packId !== undefined);
    expect(trash.length).toBeGreaterThanOrEqual(55);
    expect(trash.length).toBeLessThanOrEqual(65);
    for (const boss of [TOCK, RANGEWARDEN, VOLTAIC, PRIME]) {
      expect(
        STORMBRASS_FOUNDRY_SPAWNS.filter((s) => s.mobId === boss),
        boss,
      ).toHaveLength(1);
    }
  });

  it('with nothing dead, only the Rail Yard is reachable', () => {
    const seen = reachable(openGates(new Set()));
    expect(reachedPacks(seen)).toEqual([...YARD].sort());
  });

  it('the Yard Shutter needs both yard packs and the Gantry Hauler', () => {
    for (const missing of YARD) {
      const dead = new Set(YARD.filter((p) => p !== missing));
      const packs = reachedPacks(reachable(openGates(dead)));
      for (const p of TERRACES) expect(packs, `${missing} alive`).not.toContain(p);
    }
    const packs = reachedPacks(reachable(openGates(upTo(YARD))));
    expect(packs).toEqual(expect.arrayContaining(TERRACES));
    expect(packs).not.toContain(TOCK);
  });

  it('the Line Shutter needs both terrace packs, onto the Main Line alone', () => {
    for (const missing of TERRACES) {
      const dead = upTo(
        YARD,
        TERRACES.filter((p) => p !== missing),
      );
      expect(reachedPacks(reachable(openGates(dead))), `${missing} alive`).not.toContain(TOCK);
    }
    const packs = reachedPacks(reachable(openGates(upTo(YARD, TERRACES))));
    expect(packs).toContain(TOCK);
    for (const p of [...WEST, ...EAST, ...NORTH]) expect(packs).not.toContain(p);
  });

  it('the Range and Coil Shutters open on the Line-Master, onto both wings', () => {
    const packs = reachedPacks(reachable(openGates(upTo(YARD, TERRACES, [TOCK]))));
    expect(packs).toEqual(expect.arrayContaining([...WEST, ...EAST]));
    expect(packs).not.toContain(RANGEWARDEN);
    expect(packs).not.toContain(VOLTAIC);
    for (const p of NORTH) expect(packs).not.toContain(p);
  });

  it('each wing boss waits behind its Arc Fence until its packs and patrol die', () => {
    const base = upTo(YARD, TERRACES, [TOCK]);
    for (const [wing, boss] of [
      [WEST, RANGEWARDEN],
      [EAST, VOLTAIC],
    ] as const) {
      for (const missing of wing) {
        const dead = upTo(
          [...base],
          wing.filter((p) => p !== missing),
        );
        expect(reachedPacks(reachable(openGates(dead))), `${missing} alive`).not.toContain(boss);
      }
      expect(reachedPacks(reachable(openGates(upTo([...base], [...wing]))))).toContain(boss);
    }
  });

  it('the Crane Bridge extends only when BOTH wing bosses are dead', () => {
    const wings = upTo(YARD, TERRACES, [TOCK], WEST, EAST);
    for (const alive of [RANGEWARDEN, VOLTAIC]) {
      const dead = upTo(
        [...wings],
        [RANGEWARDEN, VOLTAIC].filter((b) => b !== alive),
      );
      const packs = reachedPacks(reachable(openGates(dead)));
      for (const p of NORTH) expect(packs, `${alive} alive`).not.toContain(p);
    }
    const packs = reachedPacks(reachable(openGates(upTo([...wings], [RANGEWARDEN, VOLTAIC]))));
    expect(packs).toEqual(expect.arrayContaining(NORTH));
    expect(packs).not.toContain(PRIME);
  });

  it('the Prime Draft waits behind the Gantry Arc Fence until every northern pack dies', () => {
    const base = upTo(YARD, TERRACES, [TOCK], WEST, EAST, [RANGEWARDEN, VOLTAIC]);
    for (const missing of NORTH) {
      const dead = upTo(
        [...base],
        NORTH.filter((p) => p !== missing),
      );
      expect(reachedPacks(reachable(openGates(dead))), `${missing} alive`).not.toContain(PRIME);
    }
    expect(reachedPacks(reachable(openGates(upTo([...base], NORTH))))).toContain(PRIME);
  });

  it('a fully cleared route reaches every placement and never the drop', () => {
    const dead = new Set<string>([
      ...STORMBRASS_FOUNDRY_GATES.flatMap((g) => g.packs ?? []),
      TOCK,
      RANGEWARDEN,
      VOLTAIC,
      PRIME,
    ]);
    const seen = reachable(openGates(dead));
    for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
      expect(spawnReached(seen, s.x, s.z), `${s.mobId} at ${s.x},${s.z}`).toBe(true);
    }
    let voidCells = 0;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (!seen[cell(x, z)]) continue;
        const h = authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);
        if (h <= STORMBRASS_FOUNDRY_FIELD.voidHeight) voidCells++;
      }
    }
    expect(voidCells).toBe(0);
    // The boss exit portal stands on the Gantry's reached floor.
    const portal = DUNGEON.bossExitPortal;
    expect(portal).toBeDefined();
    if (portal) expect(spawnReached(seen, portal.x, portal.z)).toBe(true);
  });

  it('keeps the whole walkable field inside the slot footprint the claim counts', () => {
    const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = STORMBRASS_FOUNDRY_FIELD.bounds;
    expect(Math.max(Math.abs(x0), Math.abs(x1))).toBeLessThan(120);
    expect(Math.max(Math.abs(z0), Math.abs(z1))).toBeLessThan(250);
  });

  it('keeps each patrol walk clear of the held packs (it passes them, never through them)', () => {
    const held = STORMBRASS_FOUNDRY_SPAWNS.filter((s) => !s.patrol && s.packId);
    for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
      if (!s.patrol) continue;
      const pts = s.patrol.points;
      let nearest = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
        for (let k = 0; k <= steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          for (const h of held) nearest = Math.min(nearest, Math.hypot(h.x - x, h.z - z));
        }
      }
      expect(nearest, `${s.packId} ${s.mobId}`).toBeGreaterThanOrEqual(7.5);
    }
  });

  it('every patrol loop stays on walkable ground, clear of props', () => {
    for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
      if (!s.patrol) continue;
      const pts = s.patrol.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
        for (let k = 0; k <= steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          expect(
            authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z),
            `${s.packId} over the drop at ${x},${z}`,
          ).toBeGreaterThan(STORMBRASS_FOUNDRY_FIELD.voidHeight);
          expect(isBlocked(SEED, O.x + x, O.z + z, 0.5), `${s.packId} at ${x},${z}`).toBe(false);
        }
      }
    }
  });

  it('the arrival stands on the Lift Landing, above and clear of the first pack', () => {
    const e = STORMBRASS_FOUNDRY_ANCHORS.entry;
    expect(authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, e.x, e.z)).toBe(12);
    for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
      const pts = s.patrol ? s.patrol.points : [{ x: s.x, z: s.z }];
      for (const p of pts) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        expect(d, `${s.mobId} at ${p.x},${p.z}`).toBeGreaterThan(35);
      }
    }
  });

  it('floors every area at its designed height (one floor height per point)', () => {
    const h = (x: number, z: number) => authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);
    const A = STORMBRASS_FOUNDRY_ANCHORS;
    expect(h(A.landing.x, A.landing.z)).toBe(12);
    expect(h(A.railYard.x, A.railYard.z)).toBe(0);
    expect(h(A.terraceLow.x, A.terraceLow.z)).toBe(4);
    expect(h(A.terraceHigh.x, A.terraceHigh.z)).toBe(8);
    expect(h(A.mainLine.x, A.mainLine.z)).toBe(8);
    expect(h(A.rangeLanes.x, A.rangeLanes.z)).toBe(10);
    expect(h(A.provingRange.x, A.provingRange.z)).toBe(10);
    expect(h(A.coilLanding.x, A.coilLanding.z)).toBe(10);
    expect(h(A.coilUpper.x, A.coilUpper.z)).toBe(24);
    expect(h(A.coilCrown.x + 12, A.coilCrown.z)).toBe(40);
    expect(h(A.draftingYard.x, A.draftingYard.z)).toBe(20);
    expect(h(A.approach.x, A.approach.z)).toBe(25);
    expect(h(A.gantry.x, A.gantry.z)).toBe(25);
    // The four belts run on the Main Line's floor from the chute to the press.
    for (const x of MAIN_LINE_BELTS.xs) {
      expect(h(x, MAIN_LINE_BELTS.z0)).toBe(8);
      expect(h(x, MAIN_LINE_BELTS.z1)).toBe(8);
    }
  });

  it('gate state is per slot: opening slot 5 leaves slot 6 shut', () => {
    setOpenDungeonGates(O.x, O.z, ['yard_shutter']);
    const o6 = instanceOrigin(DUNGEON.index, SLOT + 1);
    expect(isBlocked(SEED, O.x, O.z - 126, 0.5)).toBe(false);
    expect(isBlocked(SEED, o6.x, o6.z - 126, 0.5)).toBe(true);
  });
});
