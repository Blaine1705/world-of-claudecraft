// The relocated Highwatch Stables: the timed show-jumping course geometry contract
// and the ambient stable horses (purely decorative, wander the NORTH pasture only,
// never cross the divider into the course arena, never fightable).
import { describe, expect, it } from 'vitest';
import { RIDING_COURSE } from '../src/sim/content/mounts';
import { ZONE3_PROPS } from '../src/sim/content/zone3';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const STABLE_HORSE = 'stable_horse';
// The live world seed (src/main.ts). The stable yard sits on open ground west of
// Highwatch at these heights (verified terrain facts in the task brief).
const WORLD_SEED = 20061;

const PADDOCK = RIDING_COURSE.paddock;
const DIVIDER = RIDING_COURSE.divider;
const COURSE = RIDING_COURSE.courseSection;

// Distance from point (px,pz) to the segment (x1,z1)-(x2,z2), in the xz plane.
function distToSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2));
  const cx = x1 + t * dx;
  const cz = z1 + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

// The stable fence runs (paddock perimeter + interior divider), isolated from the
// town south-gate runs by their endpoints lying on/inside the paddock rectangle.
const inPaddockRect = (x: number, z: number): boolean =>
  x >= PADDOCK.x1 - 1 && x <= PADDOCK.x2 + 1 && z >= PADDOCK.z1 - 1 && z <= PADDOCK.z2 + 1;
const stableFences = ZONE3_PROPS.fences.filter(
  (f) => inPaddockRect(f.x1, f.z1) && inPaddockRect(f.x2, f.z2),
);

const inCourseSection = (x: number, z: number): boolean =>
  x >= COURSE.x1 && x <= COURSE.x2 && z >= COURSE.z1 && z <= COURSE.z2;

// The north pasture: inside the paddock and NORTH of (i.e. at or beyond) the divider.
const inNorthSection = (x: number, z: number): boolean =>
  x >= PADDOCK.x1 && x <= PADDOCK.x2 && z >= DIVIDER.z && z <= PADDOCK.z2;

function horses(sim: Sim): Entity[] {
  return [...sim.entities.values()].filter((e) => e.templateId === STABLE_HORSE);
}

describe('RIDING_COURSE geometry contract', () => {
  it('documents the paddock, divider, course arena, and 6-jump course', () => {
    expect(PADDOCK).toEqual({ x1: 78, x2: 126, z1: 668, z2: 706, opening: { x1: 88, x2: 94 } });
    expect(DIVIDER).toEqual({ z: 688, opening: { x1: 98, x2: 106 } });
    expect(COURSE).toEqual({ x1: 78, x2: 126, z1: 668, z2: 688 });
    expect(RIDING_COURSE.center).toEqual({ x: 102, z: 678 });
    expect(RIDING_COURSE.jumpRadius).toBe(4);
    expect(RIDING_COURSE.boundsRadius).toBe(50);
    expect(RIDING_COURSE.timeLimitSeconds).toBe(45);
    expect(RIDING_COURSE.jumps).toHaveLength(6);
  });

  it('every jump sits inside the south course arena', () => {
    for (const j of RIDING_COURSE.jumps) {
      expect(inCourseSection(j.x, j.z), `jump ${j.x},${j.z} inside course arena`).toBe(true);
    }
  });

  it('every jump clears each stable fence run (perimeter AND divider) by at least jumpRadius', () => {
    // The 5 perimeter runs (north split around the opening) plus the 2 divider runs.
    expect(stableFences.length).toBe(7);
    for (const j of RIDING_COURSE.jumps) {
      for (const f of stableFences) {
        const d = distToSegment(j.x, j.z, f.x1, f.z1, f.x2, f.z2);
        expect(
          d,
          `jump ${j.x},${j.z} vs fence ${f.x1},${f.z1}-${f.x2},${f.z2}`,
        ).toBeGreaterThanOrEqual(RIDING_COURSE.jumpRadius);
      }
    }
  });

  it('each jump crossbar points radially out from the course centre', () => {
    for (const j of RIDING_COURSE.jumps) {
      const expected = Math.atan2(j.x - RIDING_COURSE.center.x, j.z - RIDING_COURSE.center.z);
      expect(j.rot).toBeCloseTo(expected, 6);
    }
  });

  it('a jump prop marks every jump point with its rotation (no drift from the data)', () => {
    const props = ZONE3_PROPS.courseJumps ?? [];
    expect(props).toHaveLength(RIDING_COURSE.jumps.length);
    for (const j of RIDING_COURSE.jumps) {
      expect(props.some((p) => p.x === j.x && p.z === j.z && p.rot === j.rot)).toBe(true);
    }
  });

  it('has a real divider fence split into two runs around the rider gap', () => {
    const dividerRuns = stableFences.filter((f) => f.z1 === DIVIDER.z && f.z2 === DIVIDER.z);
    expect(dividerRuns).toHaveLength(2);
    // The two runs together cover the paddock width except the opening gap.
    const west = dividerRuns.find((f) => f.x1 === PADDOCK.x1);
    const east = dividerRuns.find((f) => f.x2 === PADDOCK.x2);
    expect(west).toBeDefined();
    expect(east).toBeDefined();
    expect(west!.x2).toBe(DIVIDER.opening.x1);
    expect(east!.x1).toBe(DIVIDER.opening.x2);
  });
});

describe('ambient stable horses', () => {
  it('spawns exactly three, all in the north pasture (never in the course arena)', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true });
    const hs = horses(sim);
    expect(hs).toHaveLength(3);
    for (const h of hs) {
      expect(inNorthSection(h.pos.x, h.pos.z), `horse spawn ${h.pos.x},${h.pos.z}`).toBe(true);
      expect(inCourseSection(h.pos.x, h.pos.z)).toBe(false);
    }
  });

  it('stays non-hostile, idle, and in the north pasture over a long run, and wanders', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true });
    const hs = horses(sim);
    const spawns = hs.map((h) => ({ x: h.pos.x, z: h.pos.z }));
    let maxDisplacement = 0;
    for (let t = 0; t < 20 * 200; t++) {
      sim.tick();
      hs.forEach((h, i) => {
        expect(h.hostile, 'horse never hostile').toBe(false);
        expect(h.inCombat, 'horse never in combat').toBe(false);
        expect(h.aiState, 'horse stays idle').toBe('idle');
        expect(h.dead, 'horse never dies').toBe(false);
        // Never cross the divider south into the course arena.
        expect(
          h.pos.z,
          `horse ${i} stays north of the divider at ${h.pos.x},${h.pos.z}`,
        ).toBeGreaterThanOrEqual(DIVIDER.z);
        expect(
          inNorthSection(h.pos.x, h.pos.z),
          `horse ${i} in pasture at ${h.pos.x},${h.pos.z}`,
        ).toBe(true);
        maxDisplacement = Math.max(
          maxDisplacement,
          Math.hypot(h.pos.x - spawns[i].x, h.pos.z - spawns[i].z),
        );
      });
    }
    // They actually amble (the wander drew rng and moved a horse off its spawn).
    expect(maxDisplacement).toBeGreaterThan(1);
  }, 30000);

  it('cannot be targeted as an enemy, attacked, or damaged by a player', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true });
    for (let t = 0; t < 5; t++) sim.tick(); // let the ambient arm settle hostility
    const horse = horses(sim)[0];
    const p = sim.player;
    // Stand the player right on top of the horse.
    p.pos = { ...horse.pos };
    p.prevPos = { ...p.pos };
    sim.rebucket(p);

    // Tab / nearest-enemy must skip it (isHostileTo is false for a non-hostile mob).
    p.targetId = null;
    sim.targetNearestEnemy(p.id);
    expect(p.targetId).not.toBe(horse.id);

    // Even hard-selected, auto-attack is refused with an error and the horse is
    // never pulled into combat.
    sim.targetEntity(horse.id, p.id);
    const events = sim.tick();
    sim.startAutoAttack(p.id);
    const afterAttack = sim.tick();
    expect(p.autoAttack).toBe(false);
    expect([...events, ...afterAttack].some((e) => e.type === 'error')).toBe(true);
    expect(horse.aggroTargetId).toBeNull();

    const hpBefore = horse.hp;
    for (let t = 0; t < 40; t++) sim.tick();
    expect(horse.hp).toBe(hpBefore);
    expect(horse.dead).toBe(false);
    expect(horse.hostile).toBe(false);
  }, 15000);

  it('is deterministic (same seed -> same horse positions)', () => {
    const run = () => {
      const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true });
      for (let t = 0; t < 20 * 30; t++) sim.tick();
      return horses(sim)
        .map((h) => `${h.pos.x.toFixed(4)},${h.pos.z.toFixed(4)}`)
        .join('|');
    };
    expect(run()).toBe(run());
  }, 15000);
});
