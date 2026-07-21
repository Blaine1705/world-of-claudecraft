import { describe, expect, it } from 'vitest';
import {
  addGloomtithe,
  GLOOMTITHE_GRACE,
  TITHEFIEND_ECHO_RATE,
  TITHEFIEND_MANA_RETURN_RATE,
  TITHEFIEND_STRIKE_ID,
  vespersAfterAbility,
  vespersEchoDamage,
  vespersOnDotTick,
} from '../src/sim/combat/priest/vespers';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity } from '../src/sim/types';

type DealDamage = (
  source: Entity | null,
  target: Entity,
  amount: number,
  crit: boolean,
  school: string,
  ability: string | null,
  kind: 'hit' | 'miss' | 'dodge',
  noRage?: boolean,
  threatOpts?: { flat?: number; mult?: number },
  direct?: boolean,
  attackAnimationStarted?: boolean,
  alreadyFinal?: boolean,
  abilityId?: string | null,
  aoe?: boolean,
) => void;

type GuardianEntity = Entity & { guardianState?: { key: string } };

function vespersPriest(): { sim: Sim; priest: Entity } {
  const sim = new Sim({ seed: 2803, playerClass: 'priest', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.setSpec('shadow')).toBe(true);
  sim.tick();
  sim.player.resource = sim.player.maxResource;
  return { sim, priest: sim.player };
}

function addDummy(sim: Sim, id: number, x: number, z: number): Entity {
  const mob = createMob(id, MOBS.training_dummy, 20, { x, y: sim.player.pos.y, z });
  mob.hostile = true;
  mob.maxHp = mob.hp = 100000;
  mob.aiState = 'idle';
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  return mob;
}

function castAndSettle(sim: Sim, priest: Entity, target: Entity, abilityId: string): void {
  priest.gcdRemaining = 0;
  priest.resource = priest.maxResource;
  priest.cooldowns.delete(abilityId);
  sim.targetEntity(target.id, priest.id);
  sim.castAbility(abilityId, priest.id);
  for (let tick = 0; tick < 100; tick++) sim.tick();
}

function prepareEffigy(sim: Sim, priest: Entity, primary: Entity, secondary?: Entity): void {
  castAndSettle(sim, priest, primary, 'shadow_word_pain');
  if (secondary) castAndSettle(sim, priest, secondary, 'shadow_word_pain');
  castAndSettle(sim, priest, primary, 'mind_blast');
}

describe('Vespers baseline loop', () => {
  it('binds Effigy only through Mindfracture on the priest own Dirge', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9900, priest.pos.x, priest.pos.z + 8);

    castAndSettle(sim, priest, primary, 'mind_blast');
    expect(primary.auras.some((a) => a.id === 'priest_effigy')).toBe(false);

    prepareEffigy(sim, priest, primary);
    expect(primary.auras.some((a) => a.id === 'priest_effigy' && a.sourceId === priest.id)).toBe(
      true,
    );
    expect(priest.auras.find((a) => a.id === 'priest_gloomtithe')?.stacks).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('does not bind Effigy from a Mindfracture cast that failed to land', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9901, priest.pos.x, priest.pos.z + 8);
    castAndSettle(sim, priest, primary, 'shadow_word_pain');
    const ctx = (sim as unknown as { ctx: SimContext }).ctx;
    const meta = ctx.players.get(priest.id);
    if (!meta) throw new Error('priest meta missing');

    // The post-cast hook still runs after a miss. Only the landed-damage hook may
    // establish the relationship or build the bank.
    vespersAfterAbility(ctx, priest, meta, primary, 'mind_blast', 0);

    expect(primary.auras.some((a) => a.id === 'priest_effigy')).toBe(false);
    expect(priest.auras.some((a) => a.id === 'priest_gloomtithe')).toBe(false);
  });

  it('does not bind or bank from an invalid authoritative Mindfracture cast', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9902, priest.pos.x, priest.pos.z + 100);
    primary.auras.push({
      id: 'shadow_word_pain',
      name: 'Dirge of Decay',
      kind: 'dot',
      remaining: 18,
      duration: 18,
      value: 10,
      tickInterval: 3,
      tickTimer: 3,
      sourceId: priest.id,
      school: 'shadow',
    });

    sim.targetEntity(primary.id, priest.id);
    sim.castAbility('mind_blast', priest.id);
    sim.tick();

    expect(priest.castingAbility).toBeNull();
    expect(primary.auras.some((aura) => aura.id === 'priest_effigy')).toBe(false);
    expect(priest.auras.some((aura) => aura.id === 'priest_gloomtithe')).toBe(false);
  });

  it('banks exactly once per eligible own-Dirge tick and suppresses duplicates', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9903, priest.pos.x, priest.pos.z + 8);
    const secondary = addDummy(sim, 9904, priest.pos.x + 3, priest.pos.z + 9);
    const ctx = (sim as unknown as { ctx: SimContext }).ctx;
    const ownTick = {
      id: 'shadow_word_pain',
      name: 'Dirge of Decay',
      kind: 'dot' as const,
      remaining: 18,
      duration: 18,
      value: 10,
      tickInterval: 3,
      tickTimer: 3,
      sourceId: priest.id,
      school: 'shadow' as const,
    };
    primary.auras.push(ownTick);
    secondary.auras.push({ ...ownTick });
    // The landed hook owns binding; use the public bind path through a landed hit.
    (sim as unknown as { dealDamage: DealDamage }).dealDamage(
      priest,
      primary,
      1,
      false,
      'shadow',
      'Mindfracture',
      'hit',
      false,
      undefined,
      true,
      false,
      true,
      'mind_blast',
      false,
    );
    priest.auras = priest.auras.filter((aura) => aura.id !== 'priest_gloomtithe');

    vespersOnDotTick(ctx, primary, ownTick);
    vespersOnDotTick(ctx, primary, ownTick);
    expect(priest.auras.find((aura) => aura.id === 'priest_gloomtithe')?.stacks).toBe(1);

    vespersOnDotTick(ctx, secondary, secondary.auras[0]);
    vespersOnDotTick(ctx, primary, { ...ownTick, sourceId: priest.id + 100 });
    expect(priest.auras.find((aura) => aura.id === 'priest_gloomtithe')?.stacks).toBe(1);

    addGloomtithe(ctx, priest, 99);
    expect(priest.auras.find((aura) => aura.id === 'priest_gloomtithe')?.stacks).toBe(5);
  });

  it('echoes landed Mindfracture damage to other own-Dirge enemies without recursion', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9910, priest.pos.x, priest.pos.z + 8);
    const secondary = addDummy(sim, 9911, priest.pos.x + 3, priest.pos.z + 9);
    prepareEffigy(sim, priest, primary, secondary);
    const before = secondary.hp;

    (sim as unknown as { dealDamage: DealDamage }).dealDamage(
      priest,
      primary,
      100,
      false,
      'shadow',
      'Mindfracture',
      'hit',
      false,
      undefined,
      true,
      false,
      true,
      'mind_blast',
      false,
    );

    expect(before - secondary.hp).toBe(30);
  });

  it('caps Gloomtithe at five and returns mana only from landed Tithefiend strikes', () => {
    const { sim, priest } = vespersPriest();
    const target = addDummy(sim, 9912, priest.pos.x, priest.pos.z + 8);
    castAndSettle(sim, priest, target, 'shadow_word_pain');
    addGloomtithe((sim as unknown as { ctx: SimContext }).ctx, priest, 9);
    expect(priest.auras.find((a) => a.id === 'priest_gloomtithe')?.stacks).toBe(5);

    priest.resource = 0;
    const ctx = (sim as unknown as { ctx: SimContext }).ctx;
    const guardian = { ...priest, kind: 'mob', ownerId: priest.id } as Entity;
    guardian.guardianState = {
      key: 'tithefiend',
      remaining: 5,
      attackTimer: 0,
      attackInterval: 2,
      minDamage: 1,
      maxDamage: 1,
      school: 'shadow',
      abilityId: TITHEFIEND_STRIKE_ID,
      abilityName: 'Tithefiend Strike',
      preferredTargetId: null,
      maxRange: 35,
    };
    vespersEchoDamage(ctx, guardian, target, 0, TITHEFIEND_STRIKE_ID);
    expect(priest.resource).toBe(0);
    vespersEchoDamage(ctx, guardian, target, 10, TITHEFIEND_STRIKE_ID);
    expect(priest.resource).toBe(
      Math.max(1, Math.round(priest.maxResource * TITHEFIEND_MANA_RETURN_RATE)),
    );
  });

  it('holds Gloomtithe while an eligible Effigy exists, then grants the full grace period', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9913, priest.pos.x, priest.pos.z + 8);
    prepareEffigy(sim, priest, primary);
    const dirge = primary.auras.find((aura) => aura.id === 'shadow_word_pain');
    const effigy = primary.auras.find((aura) => aura.id === 'priest_effigy');
    if (!dirge || !effigy) throw new Error('prepared links missing');
    dirge.remaining = dirge.duration = 60;
    effigy.remaining = effigy.duration = 60;
    const bank = priest.auras.find((aura) => aura.id === 'priest_gloomtithe');
    if (!bank) throw new Error('Gloomtithe missing');
    bank.remaining = GLOOMTITHE_GRACE;

    for (let tick = 0; tick < (GLOOMTITHE_GRACE + 1) * 20; tick++) sim.tick();

    expect(priest.auras.find((aura) => aura.id === 'priest_gloomtithe')).toBe(bank);
    primary.auras = primary.auras.filter((aura) => aura.id !== 'priest_effigy');
    for (let tick = 0; tick < (GLOOMTITHE_GRACE - 1) * 20; tick++) sim.tick();
    expect(priest.auras.find((aura) => aura.id === 'priest_gloomtithe')).toBe(bank);
    for (let tick = 0; tick < 40; tick++) sim.tick();
    expect(priest.auras.some((aura) => aura.id === 'priest_gloomtithe')).toBe(false);
  });

  it('requires at least one Gloomtithe stack for a valid Tithefiend summon', () => {
    const { sim, priest } = vespersPriest();
    const resourceBefore = priest.resource;

    sim.castAbility('summon_tithefiend', priest.id);
    sim.tick();

    expect(priest.resource).toBe(resourceBefore);
    expect(priest.cooldowns.has('summon_tithefiend')).toBe(false);
    expect(
      [...sim.entities.values()].some(
        (entity) => entity.ownerId === priest.id && entity.guardianState?.key === 'tithefiend',
      ),
    ).toBe(false);
  });

  it('uses a smaller Tithefiend echo against eligible linked enemies', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9914, priest.pos.x, priest.pos.z + 8);
    const secondary = addDummy(sim, 9915, priest.pos.x + 3, priest.pos.z + 9);
    prepareEffigy(sim, priest, primary, secondary);
    const ctx = (sim as unknown as { ctx: SimContext }).ctx;
    const guardian = { ...priest, kind: 'mob', ownerId: priest.id } as Entity;
    guardian.guardianState = {
      key: 'tithefiend',
      remaining: 5,
      attackTimer: 0,
      attackInterval: 2,
      minDamage: 1,
      maxDamage: 1,
      school: 'shadow',
      abilityId: TITHEFIEND_STRIKE_ID,
      abilityName: 'Tithefiend Strike',
      preferredTargetId: primary.id,
      maxRange: 35,
    };
    const before = secondary.hp;

    vespersEchoDamage(ctx, guardian, primary, 100, TITHEFIEND_STRIKE_ID);

    expect(before - secondary.hp).toBe(Math.round(100 * TITHEFIEND_ECHO_RATE));
    expect(TITHEFIEND_ECHO_RATE).toBeLessThan(0.3);
  });

  it('consumes Gloomtithe to summon a temporary guardian, not a command pet', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9920, priest.pos.x, priest.pos.z + 8);
    prepareEffigy(sim, priest, primary);
    const before = primary.hp;

    priest.gcdRemaining = 0;
    priest.resource = priest.maxResource;
    priest.cooldowns.delete('summon_tithefiend');
    sim.castAbility('summon_tithefiend', priest.id);
    sim.tick();

    const guardian = [...sim.entities.values()].find(
      (entity): entity is GuardianEntity =>
        entity.ownerId === priest.id && entity.guardianState?.key === 'tithefiend',
    );
    expect(guardian).toBeDefined();
    expect(sim.petOf(priest.id)).toBeNull();
    expect(priest.auras.some((a) => a.id === 'priest_gloomtithe')).toBe(false);

    for (let tick = 0; tick < 60; tick++) sim.tick();
    expect(primary.hp).toBeLessThan(before);

    for (let tick = 0; tick < 360; tick++) sim.tick();
    expect(
      [...sim.entities.values()].some(
        (entity) => entity.ownerId === priest.id && entity.guardianState?.key === 'tithefiend',
      ),
    ).toBe(false);
  });

  it('dismisses Tithefiend when no Effigy or own-Dirge fallback remains', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9923, priest.pos.x, priest.pos.z + 8);
    prepareEffigy(sim, priest, primary);
    priest.gcdRemaining = 0;
    priest.resource = priest.maxResource;
    priest.cooldowns.delete('summon_tithefiend');
    sim.castAbility('summon_tithefiend', priest.id);
    sim.tick();
    expect(
      [...sim.entities.values()].some(
        (entity) => entity.ownerId === priest.id && entity.guardianState?.key === 'tithefiend',
      ),
    ).toBe(true);

    primary.auras = primary.auras.filter(
      (aura) => aura.id !== 'priest_effigy' && aura.id !== 'shadow_word_pain',
    );
    for (let tick = 0; tick < 12; tick++) sim.tick();

    expect(
      [...sim.entities.values()].some(
        (entity) => entity.ownerId === priest.id && entity.guardianState?.key === 'tithefiend',
      ),
    ).toBe(false);
  });

  it('produces the same Effigy, bank, echo, and guardian outcome for the same seed', () => {
    const run = () => {
      const { sim, priest } = vespersPriest();
      const primary = addDummy(sim, 9921, priest.pos.x, priest.pos.z + 8);
      const secondary = addDummy(sim, 9922, priest.pos.x + 3, priest.pos.z + 9);
      prepareEffigy(sim, priest, primary, secondary);
      priest.gcdRemaining = 0;
      priest.resource = priest.maxResource;
      priest.cooldowns.delete('summon_tithefiend');
      sim.castAbility('summon_tithefiend', priest.id);
      const events: Array<Record<string, unknown>> = [];
      for (let tick = 0; tick < 50; tick++) {
        events.push(
          ...sim.tick().map((event) => ({
            type: event.type,
            ...('ability' in event ? { ability: event.ability } : {}),
            ...('amount' in event ? { amount: event.amount } : {}),
          })),
        );
      }
      const guardian = [...sim.entities.values()].find(
        (entity) => entity.ownerId === priest.id && entity.guardianState?.key === 'tithefiend',
      );
      return {
        primaryHp: primary.hp,
        secondaryHp: secondary.hp,
        resource: priest.resource,
        gloom: priest.auras.find((a) => a.id === 'priest_gloomtithe')?.stacks ?? 0,
        guardian: guardian
          ? {
              target: guardian.guardianState?.preferredTargetId,
              remaining: guardian.guardianState?.remaining,
            }
          : null,
        events,
      };
    };

    expect(run()).toEqual(run());
  });
});
