// The relocated Highwatch Stables: the riding-course geometry contract and the
// ambient stable horses (purely decorative, wander the paddock, never fightable).
import { describe, expect, it } from 'vitest';
import { RIDING_COURSE, STABLE_PADDOCK } from '../src/sim/content/mounts';
import { ZONE3_PROPS } from '../src/sim/content/zone3';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const STABLE_HORSE = 'stable_horse';
// The live world seed (src/main.ts). The stable yard sits on open ground west of
// Highwatch at these heights (verified terrain facts in the task brief).
const WORLD_SEED = 20061;

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

// The paddock fence runs (the perimeter), isolated from the town south-gate runs
// by their endpoints lying on the paddock rectangle.
const paddockFences = ZONE3_PROPS.fences.filter(
  (f) =>
    f.x1 >= STABLE_PADDOCK.xMin - 1 &&
    f.x1 <= STABLE_PADDOCK.xMax + 1 &&
    f.z1 >= STABLE_PADDOCK.zMin - 1 &&
    f.z1 <= STABLE_PADDOCK.zMax + 1 &&
    f.x2 >= STABLE_PADDOCK.xMin - 1 &&
    f.x2 <= STABLE_PADDOCK.xMax + 1 &&
    f.z2 >= STABLE_PADDOCK.zMin - 1 &&
    f.z2 <= STABLE_PADDOCK.zMax + 1,
);

const inPaddock = (x: number, z: number): boolean =>
  x >= STABLE_PADDOCK.xMin &&
  x <= STABLE_PADDOCK.xMax &&
  z >= STABLE_PADDOCK.zMin &&
  z <= STABLE_PADDOCK.zMax;

function horses(sim: Sim): Entity[] {
  return [...sim.entities.values()].filter((e) => e.templateId === STABLE_HORSE);
}

describe('RIDING_COURSE geometry contract', () => {
  it('has 8 gates in a single loop with the documented centre/radii', () => {
    expect(RIDING_COURSE.gates).toHaveLength(8);
    expect(RIDING_COURSE.center).toEqual({ x: 100, z: 685 });
    expect(RIDING_COURSE.gateRadius).toBe(4);
    expect(RIDING_COURSE.boundsRadius).toBe(40);
  });

  it('every gate sits inside the paddock rectangle', () => {
    for (const g of RIDING_COURSE.gates) {
      expect(inPaddock(g.x, g.z), `gate ${g.x},${g.z} inside paddock`).toBe(true);
    }
  });

  it('every gate clears each paddock fence run by at least gateRadius', () => {
    // Four full sides worth of runs (north split around the opening) must all be
    // present so the clearance check is meaningful.
    expect(paddockFences.length).toBeGreaterThanOrEqual(5);
    for (const g of RIDING_COURSE.gates) {
      for (const f of paddockFences) {
        const d = distToSegment(g.x, g.z, f.x1, f.z1, f.x2, f.z2);
        expect(
          d,
          `gate ${g.x},${g.z} vs fence ${f.x1},${f.z1}-${f.x2},${f.z2}`,
        ).toBeGreaterThanOrEqual(RIDING_COURSE.gateRadius);
      }
    }
  });

  it('a course-flag prop marks every gate (no drift from the data)', () => {
    const flags = ZONE3_PROPS.courseFlags ?? [];
    expect(flags).toHaveLength(RIDING_COURSE.gates.length);
    for (const g of RIDING_COURSE.gates) {
      expect(flags.some((fl) => fl.x === g.x && fl.z === g.z)).toBe(true);
    }
  });
});

describe('ambient stable horses', () => {
  it('spawns exactly three, all inside the paddock', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true });
    const hs = horses(sim);
    expect(hs).toHaveLength(3);
    for (const h of hs) expect(inPaddock(h.pos.x, h.pos.z)).toBe(true);
  });

  it('stays non-hostile, idle, and inside the paddock over a long run, and wanders', () => {
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
        expect(inPaddock(h.pos.x, h.pos.z), `horse ${i} in paddock at ${h.pos.x},${h.pos.z}`).toBe(
          true,
        );
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
