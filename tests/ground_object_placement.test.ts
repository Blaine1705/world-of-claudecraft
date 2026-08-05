// Authored ground pickups (GROUND_OBJECTS) are the one spawn family that is
// placed VERBATIM: the NPC and camp loops in sim.ts run their data position
// through findSafePos first, but a ground object is spawned at
// groundPos(p.x, p.z) exactly as authored. Nothing nudges it, and a walkable
// lift field (a castle wall-walk, the beacon stair, a grandstand tier) is a
// heightfield rather than a collider, so findSafePos would not have moved it
// anyway. That makes structure geometry authored LATER able to silently lift a
// pickup onto masonry the player cannot see from the ground: the Scorched
// Supply Crate at x 360 landed on the Last Keep's west curtain wall
// (CASTLE.wx0 is 360, walkAbs 13) once the keep was built over the Wyrmwatch
// road, stranding the quest 3 crates short of its 4-crate objective.
//
// These are the guards for that class of bug, not just the one instance.
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { GROUND_OBJECTS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { groundHeight, terrainHeight } from '../src/sim/world';

// A pickup deliberately authored onto a walkable structure would go here, as
// `'<itemId>@<x>,<z>'`, with the reason. Empty on purpose: every shipped
// pickup stands on natural ground.
const ON_STRUCTURE_ALLOWLIST: ReadonlySet<string> = new Set<string>();

// groundHeight adds the walkable lift fields (castle walls and bastions, the
// beacon spiral, the Vale Cup tiers) over terrainHeight, so any gap between
// the two IS a structure surface under the object.
const LIFT_EPSILON = 0.01;

// How far the crate may stand ABOVE the ground within a body-radius ring
// before it is perched on something rather than lying on the ground. Only the
// crate-is-higher direction is a defect: crates 3 and 4 legitimately lie at the
// foot of the barbican's side walls, so ground that RISES beside a crate is
// masonry it rests against, not masonry it rests on.
const CRATE_PERCH_TOLERANCE = 1.5;

const makeSim = (): Sim => new Sim({ seed: 1337, playerClass: 'warrior', noPlayer: true });

const RING: readonly (readonly [number, number])[] = [
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
  [1.4, 1.4],
  [-1.4, 1.4],
  [1.4, -1.4],
  [-1.4, -1.4],
];

describe('authored ground pickups stand on reachable natural ground', () => {
  it('places no pickup on a walkable structure lift', () => {
    const sim = makeSim();
    const seed = sim.cfg.seed;
    const stranded: string[] = [];
    for (const def of GROUND_OBJECTS) {
      for (const p of def.positions) {
        const lift = groundHeight(p.x, p.z, seed) - terrainHeight(p.x, p.z, seed);
        if (lift <= LIFT_EPSILON) continue;
        if (ON_STRUCTURE_ALLOWLIST.has(`${def.itemId}@${p.x},${p.z}`)) continue;
        stranded.push(`${def.itemId} at ${p.x},${p.z} sits ${lift.toFixed(1)}yd up on a structure`);
      }
    }
    expect(stranded, stranded.join('; ')).toEqual([]);
  });

  it('lies every Scorched Supply Crate on level, unobstructed ground', () => {
    const sim = makeSim();
    const seed = sim.cfg.seed;
    const def = GROUND_OBJECTS.find((g) => g.itemId === 'scorched_supply_crate');
    expect(def).toBeTruthy();
    // The quest objective needs all four, so every single one has to be
    // reachable: one stranded crate makes the quest uncompletable.
    expect(def?.positions.length).toBe(4);
    for (const p of def?.positions ?? []) {
      const g = groundHeight(p.x, p.z, seed);
      expect(g - terrainHeight(p.x, p.z, seed)).toBeLessThanOrEqual(LIFT_EPSILON);
      expect(isBlocked(seed, p.x, p.z, 0.5), `crate at ${p.x},${p.z} is inside a collider`).toBe(
        false,
      );
      for (const [dx, dz] of RING) {
        const around = groundHeight(p.x + dx, p.z + dz, seed);
        expect(
          g - around,
          `crate at ${p.x},${p.z} is perched: it stands at ${g.toFixed(1)} over ground ${around.toFixed(1)} at +${dx},${dz}`,
        ).toBeLessThan(CRATE_PERCH_TOLERANCE);
      }
    }
  });

  // End-to-end satisfiability, not the decisive pin for this bug: the interact
  // range check is dist2d, so a player who happened to stand at the wall foot
  // could blind-credit even the stranded crate. What the stranding actually cost
  // the player was SEEING it. The geometry guards above are what fail on a
  // regression; this proves the objective can be finished from the four spots.
  it('credits all four crates and readies Scorched Stores for turn-in', () => {
    const sim = new Sim({ seed: 1337, playerClass: 'warrior' });
    const player = sim.player;
    const meta = sim.ctx.resolve(undefined)?.meta;
    expect(meta, 'the primary player resolves').toBeTruthy();
    if (!meta) throw new Error('unreachable');
    sim.setPlayerLevel(18); // the quest's minLevel is 17
    meta.questsDone.add('q_dk_trolls_on_the_road'); // its requiresQuest
    const sela = [...sim.entities.values()].find(
      (e) => e.templateId === 'quartermaster_sela',
    ) as Entity;
    expect(sela, 'Quartermaster Sela spawns').toBeTruthy();
    const place = (x: number, z: number): void => {
      player.pos.x = x;
      player.pos.z = z;
      player.pos.y = sim.groundPos(x, z).y;
      player.prevPos = { ...player.pos };
      player.onGround = true;
      sim.rebucket(player);
    };
    place(sela.pos.x, sela.pos.z);
    sim.acceptQuest('q_dk_scorched_stores');
    const qp = meta.questLog.get('q_dk_scorched_stores');
    expect(qp?.state, 'the quest accepted').toBe('active');
    if (!qp) throw new Error('unreachable');
    const crates = [...sim.entities.values()].filter(
      (e) => e.kind === 'object' && e.objectItemId === 'scorched_supply_crate',
    );
    expect(crates.length).toBe(4);
    for (const crate of crates) {
      place(crate.pos.x, crate.pos.z);
      expect(
        sim.pickUpObject(crate.id),
        `the crate at ${crate.pos.x},${crate.pos.z} accepts the interact`,
      ).toBe(true);
    }
    expect(qp.counts[0], 'all four crates credited').toBe(4);
    expect(qp.state, 'the quest is ready to hand in').toBe('ready');
  });

  it('spawns all four crate entities on the terrain surface', () => {
    const sim = makeSim();
    const crates = [...sim.entities.values()].filter(
      (e: Entity) => e.kind === 'object' && e.objectItemId === 'scorched_supply_crate',
    );
    expect(crates.length).toBe(4);
    for (const c of crates) {
      expect(c.lootable).toBe(true);
      // The spawned entity's own y, not just the authored column: this is what
      // the client renders and what the interact range measures against.
      expect(c.pos.y).toBeCloseTo(terrainHeight(c.pos.x, c.pos.z, sim.cfg.seed), 5);
    }
  });
});
