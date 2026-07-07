import { describe, expect, it } from 'vitest';
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
import type { Aura, Entity, SimEvent } from '../src/sim/types';
import { localizeSimAuraName } from '../src/ui/sim_i18n';

// Fury support cooldowns (operator design): Emboldening Roar
// (emboldening_roar), a 3 min support cooldown that Emboldens the caster and
// friendly players within 40 yd (aura kind 'sure_crit', 3 charges: the next 3
// damaging ability CASTS are guaranteed crits, the normal crit rng still drawn
// and only its outcome overridden, one charge per cast, auto-attacks exempt;
// src/sim/combat/sure_crit.ts), and Furious Mending (furious_mending), a 2 min
// defensive cooldown healing 20% of maximum health over 10 sec (a 'hot' aura
// via selfHotPctMax) while taking 20% reduced damage (a 'buff_dr' aura read by
// combat/damage.ts). Both are spec-gated base kit (`specs: ['fury']`).

type TestSim = Sim & {
  nextId: number;
  players: Map<number, PlayerMeta>;
  addEntity(entity: Entity): void;
};

function makeSim(seed = 31337, level = 20): { sim: TestSim; p: Entity } {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true }) as unknown as TestSim;
  sim.setPlayerLevel(level);
  expect(sim.setSpec('fury')).toBe(true);
  return { sim, p: sim.player };
}

function spawnMob(sim: TestSim, p: Entity, dz: number): Entity {
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, 1, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + dz,
  });
  mob.maxHp = 50000;
  mob.hp = 50000;
  mob.hostile = true;
  mob.aiState = 'idle';
  sim.addEntity(mob);
  return mob;
}

function spawnTarget(sim: TestSim, p: Entity, dz = 4): Entity {
  const mob = spawnMob(sim, p, dz);
  p.facing = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
  sim.targetEntity(mob.id, p.id);
  return mob;
}

function sureCritAura(e: Entity): Aura | undefined {
  return e.auras.find((a) => a.kind === 'sure_crit');
}

function recast(sim: TestSim, p: Entity, abilityId: string): SimEvent[] {
  p.gcdRemaining = 0;
  p.cooldowns.delete(abilityId);
  p.resource = 100;
  sim.drainEvents();
  sim.castAbility(abilityId);
  return sim.drainEvents();
}

function hitsBy(events: SimEvent[], abilityName: string) {
  return events.filter(
    (e): e is Extract<SimEvent, { type: 'damage' }> =>
      e.type === 'damage' && e.ability === abilityName && e.kind === 'hit',
  );
}

const alloc = (spec: string | null): TalentAllocation => ({ ...emptyAllocation(), spec });
const knownIds = (spec: string | null): Set<string> =>
  new Set(
    abilitiesKnownAt('warrior', 20, computeTalentModifiers('warrior', alloc(spec))).map(
      (k) => k.def.id,
    ),
  );

describe('(a) fury support content defs', () => {
  it('pins Emboldening Roar: free 3 min support cooldown, fury only, 3 sure-crit charges at 40 yd', () => {
    const def = ABILITIES.emboldening_roar;
    expect(def).toBeDefined();
    expect(def.name).toBe('Emboldening Roar');
    expect(def.class).toBe('warrior');
    expect(def.learnLevel).toBe(18);
    expect(def.cost).toBe(0);
    expect(def.castTime).toBe(0);
    expect(def.cooldown).toBe(180);
    expect(def.school).toBe('physical');
    expect(def.requiresTarget).toBe(false);
    expect(def.specs).toEqual(['fury']);
    expect(def.effects).toEqual([
      { type: 'aoeAllySureCrit', charges: 3, duration: 20, radius: 40 },
    ]);
  });

  it('pins Furious Mending: free 2 min defensive cooldown, fury only, 20% HoT plus 20% DR for 10 sec', () => {
    const def = ABILITIES.furious_mending;
    expect(def).toBeDefined();
    expect(def.name).toBe('Furious Mending');
    expect(def.class).toBe('warrior');
    expect(def.learnLevel).toBe(14);
    expect(def.cost).toBe(0);
    expect(def.castTime).toBe(0);
    expect(def.cooldown).toBe(120);
    expect(def.school).toBe('physical');
    expect(def.requiresTarget).toBe(false);
    expect(def.specs).toEqual(['fury']);
    expect(def.effects).toEqual([
      { type: 'selfHotPctMax', pct: 0.2, duration: 10, interval: 2 },
      {
        type: 'selfBuff',
        kind: 'buff_dr',
        value: 0.2,
        duration: 10,
        auraId: 'furious_mending_dr',
        auraName: 'Furious Mending',
      },
    ]);
  });
});

describe('(b) Emboldening Roar grants the aura to caster and nearby allies', () => {
  it('Emboldens the caster and a 20 yd friendly player, not a 60 yd player nor a hostile', () => {
    const { sim, p } = makeSim();
    const nearId = sim.addPlayer('priest', 'Nearby');
    const near = sim.entities.get(nearId)!;
    near.pos = { x: p.pos.x + 20, y: p.pos.y, z: p.pos.z };
    near.prevPos = { ...near.pos };
    const farId = sim.addPlayer('mage', 'Faraway');
    const far = sim.entities.get(farId)!;
    far.pos = { x: p.pos.x + 60, y: p.pos.y, z: p.pos.z };
    far.prevPos = { ...far.pos };
    const hostile = spawnMob(sim, p, 5);

    sim.drainEvents();
    sim.castAbility('emboldening_roar');

    for (const carrier of [p, near]) {
      const aura = sureCritAura(carrier);
      expect(aura).toBeDefined();
      expect(aura?.id).toBe('emboldening_roar_crit');
      expect(aura?.name).toBe('Emboldened');
      expect(aura?.charges).toBe(3);
      expect(aura?.duration).toBe(20);
    }
    expect(sureCritAura(far)).toBeUndefined();
    expect(sureCritAura(hostile)).toBeUndefined();
  });

  it('the aura name has a client i18n matcher row (buff bar + combat log)', () => {
    expect(localizeSimAuraName('Emboldened')).not.toBeNull();
  });
});

describe('(c) guaranteed crits: 3 casts, one charge per cast, autos exempt', () => {
  it('the next 3 single-target casts ALL crit and the 4th returns to the normal roll', () => {
    // Twin control: same seed, same cast sequence WITHOUT the roar. The roar
    // itself draws no rng and the override never skips the crit draw, so both
    // runs consume identical rng streams and the 4th cast must match exactly.
    const casts = (withRoar: boolean) => {
      const { sim, p } = makeSim(7);
      spawnTarget(sim, p);
      if (withRoar) {
        sim.drainEvents();
        sim.castAbility('emboldening_roar');
        expect(sureCritAura(p)?.charges).toBe(3);
      }
      const out: { crit: boolean; amount: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const hits = hitsBy(recast(sim, p, 'bloodthirst'), 'Bloodletting');
        expect(hits).toHaveLength(1);
        out.push({ crit: hits[0].crit, amount: hits[0].amount });
      }
      return { out, aura: sureCritAura(p) };
    };

    const control = casts(false);
    const { sim, p } = makeSim(7);
    spawnTarget(sim, p);
    sim.drainEvents();
    sim.castAbility('emboldening_roar');

    const first = hitsBy(recast(sim, p, 'bloodthirst'), 'Bloodletting');
    expect(first).toHaveLength(1);
    expect(first[0].crit).toBe(true);
    expect(sureCritAura(p)?.charges).toBe(2);

    const second = hitsBy(recast(sim, p, 'bloodthirst'), 'Bloodletting');
    expect(second[0].crit).toBe(true);
    expect(sureCritAura(p)?.charges).toBe(1);

    sim.drainEvents();
    const thirdEvents = recast(sim, p, 'bloodthirst');
    const third = hitsBy(thirdEvents, 'Bloodletting');
    expect(third[0].crit).toBe(true);
    // The last charge drops the aura with its fade event.
    expect(sureCritAura(p)).toBeUndefined();
    expect(
      thirdEvents.some((e) => e.type === 'aura' && e.name === 'Emboldened' && e.gained === false),
    ).toBe(true);

    // 4th cast: back to the normal roll, byte-identical to the no-roar twin.
    const fourth = hitsBy(recast(sim, p, 'bloodthirst'), 'Bloodletting');
    expect({ crit: fourth[0].crit, amount: fourth[0].amount }).toEqual(control.out[3]);
    expect(control.aura).toBeUndefined();
  });

  it('Red Harvest crits all three strikes but spends ONE charge; a no-roll cast spends none', () => {
    const { sim, p } = makeSim();
    spawnTarget(sim, p);
    sim.drainEvents();
    sim.castAbility('emboldening_roar');
    expect(sureCritAura(p)?.charges).toBe(3);

    // A pure buff cast has no crit roll: no charge spent.
    recast(sim, p, 'battle_shout');
    expect(sureCritAura(p)?.charges).toBe(3);

    const events = recast(sim, p, 'red_harvest');
    const hits = hitsBy(events, 'Red Harvest');
    expect(hits).toHaveLength(3);
    for (const h of hits) expect(h.crit).toBe(true);
    expect(sureCritAura(p)?.charges).toBe(2);
  });

  it('plain auto-attack swings neither consume charges nor always crit', () => {
    const { sim, p } = makeSim();
    spawnTarget(sim, p, 2);
    sim.drainEvents();
    sim.castAbility('emboldening_roar');
    expect(sureCritAura(p)?.charges).toBe(3);

    sim.drainEvents();
    sim.startAutoAttack();
    const autoHits: Extract<SimEvent, { type: 'damage' }>[] = [];
    for (let i = 0; i < 20 * 12; i++) {
      for (const e of sim.tick()) {
        if (e.type === 'damage' && e.ability === null && e.sourceId === p.id && e.kind === 'hit')
          autoHits.push(e);
      }
    }
    expect(autoHits.length).toBeGreaterThanOrEqual(5);
    // Not force-critted: at least one plain white hit rolled non-crit.
    expect(autoHits.some((e) => !e.crit)).toBe(true);
    // And no charge was consumed by any of those swings (the aura itself may
    // have expired by TIME here only if the duration passed; 12s < 20s).
    expect(sureCritAura(p)?.charges).toBe(3);
  });
});

describe('(d) Furious Mending heals over time and cuts damage taken', () => {
  it('heals about 20% of maximum health over 10 sec (vs a no-cast twin)', () => {
    const run = (cast: boolean): { healed: number; maxHp: number } => {
      const { sim, p } = makeSim(11);
      p.hp = Math.round(p.maxHp * 0.2);
      const before = p.hp;
      sim.drainEvents();
      if (cast) {
        sim.castAbility('furious_mending');
        const hot = p.auras.find((a) => a.id === 'furious_mending' && a.kind === 'hot');
        expect(hot).toBeDefined();
        expect(hot?.duration).toBe(10);
        const dr = p.auras.find((a) => a.id === 'furious_mending_dr');
        expect(dr?.kind).toBe('buff_dr');
        expect(dr?.value).toBe(0.2);
        expect(dr?.duration).toBe(10);
      }
      for (let i = 0; i < 20 * 11; i++) sim.tick();
      return { healed: p.hp - before, maxHp: p.maxHp };
    };
    const withCast = run(true);
    const withoutCast = run(false);
    // The twin isolates natural regen; the difference is the HoT's total.
    const hotTotal = withCast.healed - withoutCast.healed;
    expect(hotTotal).toBeGreaterThanOrEqual(Math.floor(0.19 * withCast.maxHp));
    expect(hotTotal).toBeLessThanOrEqual(Math.ceil(0.21 * withCast.maxHp));
  });

  it('reduces damage taken by 20% while active, and not after it fades', () => {
    const { sim, p } = makeSim();
    const mob = spawnMob(sim, p, 5);
    p.hp = p.maxHp;

    // Control hit without the buff.
    (sim as unknown as { dealDamage(...args: unknown[]): void }).dealDamage(
      mob,
      p,
      100,
      false,
      'physical',
      'Test Maul',
      'hit',
    );
    expect(p.maxHp - p.hp).toBe(100);

    p.hp = p.maxHp;
    sim.drainEvents();
    sim.castAbility('furious_mending');
    (sim as unknown as { dealDamage(...args: unknown[]): void }).dealDamage(
      mob,
      p,
      100,
      false,
      'physical',
      'Test Maul',
      'hit',
    );
    expect(p.maxHp - p.hp).toBe(80);

    // Let the 10s buff lapse (the HoT will heal along the way), then re-hit.
    for (let i = 0; i < 20 * 11; i++) sim.tick();
    expect(p.auras.some((a) => a.id === 'furious_mending_dr')).toBe(false);
    p.hp = p.maxHp;
    (sim as unknown as { dealDamage(...args: unknown[]): void }).dealDamage(
      mob,
      p,
      100,
      false,
      'physical',
      'Test Maul',
      'hit',
    );
    expect(p.maxHp - p.hp).toBe(100);
  });
});

describe('(e) spec gating', () => {
  it('fury and no-spec know both; arms and prot know neither', () => {
    for (const id of ['emboldening_roar', 'furious_mending']) {
      expect(knownIds(null).has(id), `${id} (no spec)`).toBe(true);
      expect(knownIds('fury').has(id), `${id} (fury)`).toBe(true);
      expect(knownIds('arms').has(id), `${id} (arms)`).toBe(false);
      expect(knownIds('prot').has(id), `${id} (prot)`).toBe(false);
    }
  });
});

describe('(f) determinism', () => {
  it('an identical seeded roar + mending fight replays byte-identically', () => {
    const run = (): string => {
      const { sim, p } = makeSim(23);
      const mob = spawnTarget(sim, p);
      const amounts: number[] = [];
      const record = (events: SimEvent[]) => {
        for (const e of events) {
          if (e.type === 'damage') amounts.push(e.amount);
          if (e.type === 'heal2') amounts.push(-e.amount);
        }
      };
      sim.drainEvents();
      sim.castAbility('emboldening_roar');
      record(sim.drainEvents());
      record(recast(sim, p, 'bloodthirst'));
      record(recast(sim, p, 'red_harvest'));
      p.hp = Math.round(p.maxHp * 0.4);
      record(recast(sim, p, 'furious_mending'));
      for (let i = 0; i < 20 * 12; i++) record(sim.tick());
      return JSON.stringify([
        amounts,
        mob.hp,
        p.hp,
        sureCritAura(p)?.charges ?? null,
        p.auras.map((a) => a.id),
      ]);
    };
    expect(run()).toBe(run());
  });
});
