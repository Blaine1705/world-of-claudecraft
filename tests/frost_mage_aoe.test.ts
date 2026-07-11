import { describe, expect, it } from 'vitest';
import {
  BLIZZARD_ORB_CDR_CAP,
  BLIZZARD_ORB_CDR_PER_ENEMY,
  FINGERS_OF_FROST_MAX_STACKS,
} from '../src/sim/combat/frost_mage';
import { FROZEN_ORB_SLOW_MULT, FROZEN_ORB_SPEED } from '../src/sim/combat/frozen_orb';
import { ABILITIES, abilitiesKnownAt } from '../src/sim/content/classes';
import {
  computeTalentModifiers,
  emptyAllocation,
  type TalentAllocation,
} from '../src/sim/content/talents';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import type { PlayerMeta } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

// Frost mage AoE half (owner design 2026-07-11): Frozen Orb, the drifting
// proc generator (combat/frozen_orb.ts), and Blizzard, the ground channel
// that snares and refunds Frozen Orb cooldown per enemy struck, capped per
// cast (combat/frost_mage.ts channel hooks).

type TestSim = Sim & {
  nextId: number;
  players: Map<number, PlayerMeta>;
  addEntity(entity: Entity): void;
};

function makeSim(seed = 60601): { sim: TestSim; p: Entity } {
  const sim = new Sim({ seed, playerClass: 'mage', autoEquip: true }) as unknown as TestSim;
  sim.setPlayerLevel(20);
  expect(sim.setSpec('frost')).toBe(true);
  sim.tick();
  return { sim, p: sim.player };
}

// Stationary targets (training dummies): the orb's drift and the channel's
// aimed point stay deterministic relative to them.
function spawnDummy(sim: TestSim, p: Entity, dz: number): Entity {
  const mob = createMob(sim.nextId++, MOBS.training_dummy, 20, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + dz,
  });
  mob.maxHp = 500000;
  mob.hp = 500000;
  mob.hostile = true;
  mob.aiState = 'idle';
  sim.addEntity(mob);
  return mob;
}

function face(p: Entity, target: Entity): void {
  p.facing = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
}

function damageEvents(events: SimEvent[], abilityName: string) {
  return events.filter(
    (e): e is Extract<SimEvent, { type: 'damage' }> =>
      e.type === 'damage' && e.ability === abilityName,
  );
}

function tickFor(sim: TestSim, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  const ticks = Math.round(seconds * 20);
  for (let i = 0; i < ticks; i++) events.push(...sim.tick());
  return events;
}

const alloc = (spec: string | null): TalentAllocation => ({ ...emptyAllocation(), spec });
const knownIds = (spec: string | null): Set<string> =>
  new Set(
    abilitiesKnownAt('mage', 20, computeTalentModifiers('mage', alloc(spec))).map((k) => k.def.id),
  );

describe('AoE content defs', () => {
  it('pins Frozen Orb: instant, 30s cooldown, frost-gated, orb effect', () => {
    const def = ABILITIES.frozen_orb;
    expect(def).toBeDefined();
    expect(def.name).toBe('Frozen Orb');
    expect(def.learnLevel).toBe(10);
    expect(def.specs).toEqual(['frost']);
    expect(def.castTime).toBe(0);
    expect(def.cooldown).toBe(30);
    expect(def.school).toBe('frost');
    expect(def.requiresTarget).toBe(false);
    expect(def.effects).toEqual([
      { type: 'frozenOrb', min: 8, max: 11, radius: 6, duration: 8, interval: 1 },
    ]);
  });

  it('pins Blizzard: 6s/6-tick ground channel with damage + snare, 8s cooldown', () => {
    const def = ABILITIES.blizzard;
    expect(def).toBeDefined();
    expect(def.name).toBe('Blizzard');
    expect(def.learnLevel).toBe(14);
    expect(def.specs).toEqual(['frost']);
    expect(def.targetMode).toBe('position');
    expect(def.channel).toEqual({ duration: 6, ticks: 6 });
    expect(def.cooldown).toBe(8);
    expect(def.effects).toEqual([
      { type: 'aoeDamage', min: 12, max: 16, radius: 7 },
      { type: 'aoeSlow', mult: 0.6, duration: 2, radius: 7 },
    ]);
  });

  it('gates both behind the frost spec', () => {
    const frost = knownIds('frost');
    expect(frost.has('frozen_orb')).toBe(true);
    expect(frost.has('blizzard')).toBe(true);
    for (const spec of ['fire', 'arcane']) {
      const ids = knownIds(spec);
      expect(ids.has('frozen_orb'), spec).toBe(false);
      expect(ids.has('blizzard'), spec).toBe(false);
    }
  });
});

describe('Frozen Orb in combat', () => {
  it('release emits the one orb-flight visual event carrying the whole path', () => {
    const { sim, p } = makeSim();
    const near = spawnDummy(sim, p, 4);
    face(p, near);
    sim.drainEvents();
    p.resource = p.maxResource;
    sim.castAbility('frozen_orb');
    const events = tickFor(sim, 0.2);
    const orb = events.filter((e: any) => e.type === 'spellfxAt' && e.fx === 'orb') as any[];
    // Exactly one release event: the client animates the straight-line flight
    // locally from it (src/render/frozen_orb_fx.ts), no per-tick sync.
    expect(orb).toHaveLength(1);
    expect(orb[0].school).toBe('frost');
    expect(orb[0].dirX).toBeCloseTo(Math.sin(p.facing), 6);
    expect(orb[0].dirZ).toBeCloseTo(Math.cos(p.facing), 6);
    expect(orb[0].speed).toBe(FROZEN_ORB_SPEED);
    expect(orb[0].duration).toBe(8);
    expect(orb[0].radius).toBe(6);
  });

  it('pulses damage and a 30% snare on nearby enemies, first strike guarantees Fingers', () => {
    const { sim, p } = makeSim();
    const near = spawnDummy(sim, p, 4);
    face(p, near);
    sim.drainEvents();
    p.resource = p.maxResource;
    sim.castAbility('frozen_orb');
    const events = tickFor(sim, 1.5); // first pulse fires at ~1s
    const hits = damageEvents(events, 'Frozen Orb');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].targetId).toBe(near.id);
    const slow = near.auras.find((a) => a.id === 'frozen_orb_slow');
    expect(slow).toBeDefined();
    expect(slow?.kind).toBe('slow');
    expect(slow?.value).toBe(FROZEN_ORB_SLOW_MULT);
    // The first strike's Fingers of Frost is guaranteed.
    const fingers = p.auras.find((a) => a.kind === 'fingers_of_frost');
    expect(fingers).toBeDefined();
  });

  it('drifts forward: a distant enemy is only reached after the orb travels', () => {
    const { sim, p } = makeSim();
    const far = spawnDummy(sim, p, 14);
    face(p, far);
    sim.drainEvents();
    p.resource = p.maxResource;
    sim.castAbility('frozen_orb');
    // Orb starts at the caster (radius 6): 14yd away needs ~(14-6)/speed
    // seconds of travel before the pulse can touch the dummy.
    const travelNeeded = (14 - 6) / FROZEN_ORB_SPEED;
    const early = tickFor(sim, travelNeeded - 1);
    expect(damageEvents(early, 'Frozen Orb')).toHaveLength(0);
    const late = tickFor(sim, 3);
    expect(damageEvents(late, 'Frozen Orb').length).toBeGreaterThanOrEqual(1);
  });

  it('expires after its 8s life and never overcaps Fingers of Frost', () => {
    const { sim, p } = makeSim();
    const near = spawnDummy(sim, p, 3);
    face(p, near);
    sim.drainEvents();
    p.resource = p.maxResource;
    sim.castAbility('frozen_orb');
    let total = 0;
    for (let i = 0; i < 20 * 9; i++) {
      const events = sim.tick();
      total += damageEvents(events, 'Frozen Orb').length;
      const fingers = p.auras.find((a) => a.kind === 'fingers_of_frost');
      if (fingers) expect(fingers.stacks ?? 1).toBeLessThanOrEqual(FINGERS_OF_FROST_MAX_STACKS);
    }
    expect(total).toBeGreaterThan(0);
    // Life over: two more seconds add nothing.
    const after = tickFor(sim, 2);
    expect(damageEvents(after, 'Frozen Orb')).toHaveLength(0);
  });

  it('same seed, same casts: identical orb pulse sequence (determinism)', () => {
    const run = (): number[] => {
      const { sim, p } = makeSim(31415);
      const near = spawnDummy(sim, p, 4);
      face(p, near);
      sim.drainEvents();
      p.resource = p.maxResource;
      sim.castAbility('frozen_orb');
      return damageEvents(tickFor(sim, 9), 'Frozen Orb').map((e) => e.amount);
    };
    const first = run();
    expect(first.length).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  });
});

describe('Blizzard in combat', () => {
  it('pulses damage + snare each second on the aimed pack for the full channel', () => {
    const { sim, p } = makeSim();
    const pack = [spawnDummy(sim, p, 10), spawnDummy(sim, p, 12), spawnDummy(sim, p, 11)];
    face(p, pack[0]);
    sim.drainEvents();
    p.resource = p.maxResource;
    sim.castAbility('blizzard', undefined, { x: p.pos.x, z: p.pos.z + 11 });
    const events = tickFor(sim, 6.6);
    const hits = damageEvents(events, 'Blizzard');
    // 6 pulses x 3 enemies (the storm covers the whole pack).
    expect(hits).toHaveLength(18);
    for (const dummy of pack) {
      const slow = dummy.auras.find((a) => a.id === 'blizzard_slow');
      expect(slow?.kind).toBe('slow');
      expect(slow?.value).toBe(0.6);
    }
    expect(p.cooldowns.has('blizzard')).toBe(true);
  });

  it('refunds Frozen Orb cooldown per enemy struck, capped per cast, and re-arms next cast', () => {
    const { sim, p } = makeSim();
    const pack = [spawnDummy(sim, p, 10), spawnDummy(sim, p, 12), spawnDummy(sim, p, 11)];
    face(p, pack[0]);
    sim.drainEvents();
    p.resource = p.maxResource;
    p.cooldowns.set('frozen_orb', 30);
    sim.castAbility('blizzard', undefined, { x: p.pos.x, z: p.pos.z + 11 });
    const seconds = 6.6;
    tickFor(sim, seconds);
    // Natural tick-down (elapsed) + the capped refund, never more.
    const expected = 30 - seconds - BLIZZARD_ORB_CDR_CAP;
    expect(p.cooldowns.get('frozen_orb')).toBeCloseTo(expected, 0);

    // A second cast gets a FRESH budget (the per-cast reset).
    tickFor(sim, 2); // let Blizzard's own 8s cooldown clear
    p.cooldowns.set('frozen_orb', 20);
    p.resource = p.maxResource;
    p.gcdRemaining = 0;
    sim.castAbility('blizzard', undefined, { x: p.pos.x, z: p.pos.z + 11 });
    tickFor(sim, seconds);
    expect(p.cooldowns.get('frozen_orb')).toBeCloseTo(20 - seconds - BLIZZARD_ORB_CDR_CAP, 0);
  });

  it('scales the refund with pack size: one enemy refunds slower than three', () => {
    const midChannel = 2.4; // two pulses in
    const run = (packSize: number): number => {
      const { sim, p } = makeSim(2718);
      for (let i = 0; i < packSize; i++) spawnDummy(sim, p, 10 + i);
      sim.drainEvents();
      p.resource = p.maxResource;
      p.cooldowns.set('frozen_orb', 30);
      sim.castAbility('blizzard', undefined, { x: p.pos.x, z: p.pos.z + 11 });
      tickFor(sim, midChannel);
      return p.cooldowns.get('frozen_orb') ?? 0;
    };
    const solo = run(1);
    const pack = run(3);
    // Two pulses in: 1 enemy has refunded 2 x 0.5 = 1s; 3 enemies already hit
    // the 3s cap. The pack's cooldown must sit ~2s lower.
    expect(solo - pack).toBeCloseTo(
      2 * 3 * BLIZZARD_ORB_CDR_PER_ENEMY - 2 * BLIZZARD_ORB_CDR_PER_ENEMY,
      0,
    );
  });
});
