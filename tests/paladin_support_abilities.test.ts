import { describe, expect, it } from 'vitest';
import { paladinDevotionConflicts } from '../src/sim/combat/paladin_support';
import { ABILITIES, abilitiesKnownAt } from '../src/sim/content/classes';
import { computeTalentModifiers } from '../src/sim/content/talents';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { type ResolvedAbility, Sim } from '../src/sim/sim';
import { fiestaDownEntity } from '../src/sim/social/fiesta';
import { threatModifier } from '../src/sim/threat';
import type { Aura, Entity } from '../src/sim/types';

function hostileNear(sim: Sim): Entity {
  const player = sim.player;
  const mob = createMob(9101, MOBS.ridge_stalker, 20, {
    x: player.pos.x + 2,
    y: player.pos.y,
    z: player.pos.z,
  });
  mob.maxHp = mob.hp = 1_000_000;
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  return mob;
}

function resolve(sim: Sim, id: string): ResolvedAbility {
  const ability = sim.resolvedAbility(id);
  if (!ability) throw new Error(`missing ability ${id}`);
  return ability;
}

function run(sim: Sim, target: Entity | null, resolved: ResolvedAbility): void {
  const internals = sim as unknown as {
    players: Map<number, unknown>;
    ctx: {
      runEffects(
        player: Entity,
        meta: unknown,
        target: Entity | null,
        ability: ResolvedAbility,
      ): void;
      applyHeal(
        source: Entity,
        target: Entity,
        amount: number,
        ability: string,
        abilityId: string | null,
        canCrit: boolean,
      ): number;
    };
  };
  internals.ctx.runEffects(sim.player, internals.players.get(sim.playerId), target, resolved);
}

function aura(
  id: string,
  kind: Aura['kind'],
  sourceId: number,
  value: number,
  value2?: number,
): Aura {
  return {
    id,
    name: id,
    kind,
    remaining: 1800,
    duration: 1800,
    value,
    value2,
    sourceId,
    school: 'holy',
  };
}

describe('Paladin support abilities', () => {
  it('exposes the restored support kit with the requested values and gates', () => {
    expect(ABILITIES.lay_on_hands).toMatchObject({
      name: 'Last Rite',
      cooldown: 600,
      castTime: 0,
    });
    expect(ABILITIES.lay_on_hands.hiddenFromPlayer).not.toBe(true);
    expect(ABILITIES.lay_on_hands.effects).toEqual([{ type: 'heal', min: 250, max: 250 }]);
    expect(ABILITIES.lay_on_hands.ranks?.at(-1)?.effects).toEqual([
      { type: 'heal', min: 600, max: 600 },
    ]);
    expect(ABILITIES.hammer_of_justice).toMatchObject({
      name: 'Sundering Gavel',
      cooldown: 60,
      range: 10,
    });
    expect(ABILITIES.hammer_of_justice.hiddenFromPlayer).not.toBe(true);
    expect(ABILITIES.hammer_of_justice.effects).toEqual([{ type: 'stun', duration: 3 }]);
    expect(ABILITIES.hammer_of_justice.ranks).toBeUndefined();
    expect(ABILITIES.sacred_challenge).toMatchObject({
      name: 'Sacred Goad',
      range: 30,
      specs: ['protection'],
      effects: [{ type: 'taunt' }],
    });
    expect(ABILITIES.holy_taunt.hiddenFromPlayer).toBe(true);
    expect(ABILITIES.righteous_fury).toMatchObject({
      name: 'Burning Oath',
      passive: true,
      specs: ['protection'],
    });
    expect(ABILITIES.righteous_fury.hiddenFromPlayer).not.toBe(true);
    expect(ABILITIES.consecration).toMatchObject({
      name: 'Holy Ground',
      learnLevel: 18,
      specs: ['protection', 'retribution'],
    });
    expect(ABILITIES.consecration.hiddenFromPlayer).not.toBe(true);
    expect(ABILITIES.retribution_aura).toMatchObject({
      name: 'Requital Aura',
    });
    expect(ABILITIES.retribution_aura.hiddenFromPlayer).not.toBe(true);

    const mods = (spec: 'protection' | 'holy' | 'retribution') =>
      computeTalentModifiers('paladin', { spec, ranks: {}, choices: {} }, 20);
    const known = (spec: 'protection' | 'holy' | 'retribution') =>
      abilitiesKnownAt('paladin', 20, mods(spec)).map((entry) => entry.def.id);
    expect(known('protection')).toEqual(
      expect.arrayContaining(['sacred_challenge', 'righteous_fury', 'consecration']),
    );
    for (const id of ['sacred_challenge', 'righteous_fury', 'consecration']) {
      expect(known('holy')).not.toContain(id);
    }
    expect(known('retribution')).toContain('consecration');
    expect(known('retribution')).not.toContain('sacred_challenge');
    expect(known('retribution')).not.toContain('righteous_fury');
  });

  it('offers only Devotion Aura and Requital Aura in the current aura family', () => {
    const known = abilitiesKnownAt('paladin', 20).map((entry) => entry.def.id);
    expect(known).toEqual(expect.arrayContaining(['devotion_ward', 'retribution_aura']));
    expect(known).not.toContain('devotion_aura');
    for (const id of ['radiant_devotion', 'dawn_devotion', 'grace_devotion']) {
      expect(known).not.toContain(id);
    }
  });

  it('authors the requested first-pass values and spec restrictions', () => {
    const paladin = new Sim({ seed: 101, playerClass: 'paladin', autoEquip: true });
    paladin.setPlayerLevel(20);

    expect(resolve(paladin, 'devotion_ward').effects).toEqual([
      {
        type: 'buffTarget',
        kind: 'buff_dr',
        value: 0.05,
        duration: 0,
        permanent: true,
        party: true,
      },
    ]);
    expect(resolve(paladin, 'retribution_aura').effects).toEqual([
      {
        type: 'buffTarget',
        kind: 'thorns',
        value: 5,
        duration: 0,
        permanent: true,
        party: true,
      },
    ]);
    expect(resolve(paladin, 'solar_step')).toMatchObject({ cooldown: 30 });
    expect(resolve(paladin, 'solar_step').effects).toEqual([
      { type: 'selfBuff', kind: 'buff_speed', value: 2.5, duration: 2 },
    ]);
    expect(resolve(paladin, 'solar_invocation')).toMatchObject({
      castTime: 2,
      cooldown: 90,
    });
    expect(resolve(paladin, 'solar_invocation').def.range).toBe(0);
    expect(resolve(paladin, 'solar_invocation').effects).toEqual([
      { type: 'aoeHeal', min: 180, max: 220, radius: 40, playersOnly: true },
    ]);
    expect(resolve(paladin, 'hammer_of_grace').cooldown).toBe(10);
    expect(resolve(paladin, 'hammer_of_light').cooldown).toBe(10);

    expect(paladin.setSpec('retribution')).toBe(true);
    expect(paladin.resolvedAbility('sacred_form')).toBeNull();
    expect(paladin.setSpec('holy')).toBe(true);
    expect(resolve(paladin, 'sacred_form').effects).toEqual([
      {
        type: 'selfBuff',
        kind: 'sacred_form',
        value: 0.1,
        value2: 0.05,
        value3: 0.5,
        duration: 0,
        permanent: true,
      },
    ]);
  });

  it('keeps one Devotion per source while allowing different Paladins to stack', () => {
    const current = [
      aura('radiant_devotion', 'buff_spellpower', 1, 20),
      aura('dawn_devotion', 'buff_ap', 2, 40),
      aura('grace_devotion', 'buff_mana_grace', 1, 15),
    ];

    expect(paladinDevotionConflicts(current, 1, 'devotion_ward')).toEqual([2, 0]);
    expect(paladinDevotionConflicts(current, 2, 'devotion_ward')).toEqual([1]);

    const sim = new Sim({ seed: 102, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.player.auras.push(aura('radiant_devotion', 'buff_spellpower', sim.player.id, 20));
    sim.player.auras.push(aura('dawn_devotion', 'buff_ap', 999, 40));
    run(sim, null, resolve(sim, 'devotion_ward'));
    expect(sim.player.auras).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'devotion_ward', sourceId: sim.player.id }),
        expect.objectContaining({ id: 'dawn_devotion', sourceId: 999 }),
      ]),
    );
    expect(
      sim.player.auras.some(
        (active) => active.id === 'radiant_devotion' && active.sourceId === sim.player.id,
      ),
    ).toBe(false);
  });

  it('switches Devotion and Requital through one aura family across the party', () => {
    const sim = new Sim({ seed: 142, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    const allyId = sim.addPlayer('priest', 'Aura Ally');
    sim.setPlayerLevel(20, allyId);
    sim.partyInvite(allyId, sim.player.id);
    sim.partyAccept(allyId);
    const ally = sim.entities.get(allyId);
    if (!ally) throw new Error('missing aura ally');

    run(sim, null, resolve(sim, 'devotion_ward'));
    expect(ally.auras).toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: sim.player.id }),
    );
    ally.auras.push(aura('devotion_ward', 'buff_dr', 999, 0.05));
    sim.player.auras.push(aura('devotion_ward', 'buff_dr', 999, 0.05));

    run(sim, null, resolve(sim, 'retribution_aura'));
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({ id: 'retribution_aura', sourceId: sim.player.id }),
    );
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: 999 }),
    );
    expect(ally.auras).not.toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: sim.player.id }),
    );
    expect(ally.auras).toContainEqual(
      expect.objectContaining({ id: 'retribution_aura', sourceId: sim.player.id }),
    );
    expect(ally.auras).toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: 999 }),
    );

    run(sim, null, resolve(sim, 'devotion_ward'));
    expect(sim.player.auras).not.toContainEqual(
      expect.objectContaining({ id: 'retribution_aura', sourceId: sim.player.id }),
    );
  });

  it('removes a permanent Devotion from allies when its Paladin dies', () => {
    const sim = new Sim({ seed: 143, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    const allyId = sim.addPlayer('priest', 'Aura Survivor');
    sim.setPlayerLevel(20, allyId);
    sim.partyInvite(allyId, sim.player.id);
    sim.partyAccept(allyId);
    const ally = sim.entities.get(allyId);
    if (!ally) throw new Error('missing aura survivor');

    run(sim, null, resolve(sim, 'devotion_ward'));
    ally.auras.push(aura('devotion_ward', 'buff_dr', 999, 0.05));
    expect(ally.auras).toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: sim.player.id, permanent: true }),
    );

    const attacker = hostileNear(sim);
    (
      sim as unknown as {
        dealDamage(
          source: Entity,
          target: Entity,
          amount: number,
          crit: boolean,
          school: string,
          ability: string,
          kind: 'hit',
        ): void;
      }
    ).dealDamage(attacker, sim.player, 1_000_000, false, 'holy', 'Test', 'hit');

    expect(ally.auras).not.toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: sim.player.id }),
    );
    expect(ally.auras).toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: 999 }),
    );
  });

  it('removes a permanent Devotion from allies through the Fiesta death path', () => {
    const sim = new Sim({ seed: 145, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    const allyId = sim.addPlayer('priest', 'Fiesta Aura Ally');
    sim.setPlayerLevel(20, allyId);
    sim.partyInvite(allyId, sim.player.id);
    sim.partyAccept(allyId);
    const ally = sim.entities.get(allyId);
    if (!ally) throw new Error('missing Fiesta aura ally');

    run(sim, null, resolve(sim, 'devotion_ward'));
    fiestaDownEntity(sim.ctx, sim.player, null);

    expect(ally.auras).not.toContainEqual(
      expect.objectContaining({ id: 'devotion_ward', sourceId: sim.player.id }),
    );
  });

  it("removes only the casting Paladin's permanent Devotion from the party when canceled", () => {
    const sim = new Sim({ seed: 144, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    const allyId = sim.addPlayer('priest', 'Aura Cancel Ally');
    sim.setPlayerLevel(20, allyId);
    sim.partyInvite(allyId, sim.player.id);
    sim.partyAccept(allyId);
    const ally = sim.entities.get(allyId);
    if (!ally) throw new Error('missing aura cancel ally');

    run(sim, null, resolve(sim, 'devotion_ward'));
    sim.player.auras.unshift(aura('devotion_ward', 'buff_dr', 999, 0.05));
    ally.auras.push(aura('devotion_ward', 'buff_dr', 999, 0.05));

    sim.cancelAura('devotion_ward');

    for (const entity of [sim.player, ally]) {
      expect(entity.auras).not.toContainEqual(
        expect.objectContaining({ id: 'devotion_ward', sourceId: sim.player.id }),
      );
      expect(entity.auras).toContainEqual(
        expect.objectContaining({ id: 'devotion_ward', sourceId: 999 }),
      );
    }
  });

  it('makes both hammers distinct, successful-hit effects, with one shared cooldown', () => {
    const grace = new Sim({ seed: 107, playerClass: 'paladin', autoEquip: true });
    grace.setPlayerLevel(20);
    grace.setSpec('retribution');
    const graceTarget = hostileNear(grace);
    grace.player.resource = 0;
    grace.rng.next = () => 0.9;
    run(grace, graceTarget, resolve(grace, 'hammer_of_grace'));
    expect(grace.player.resource).toBe(70);

    grace.player.targetId = graceTarget.id;
    grace.player.gcdRemaining = 0;
    grace.castAbility('hammer_of_grace');
    expect(grace.player.cooldowns.get('hammer_of_grace')).toBe(10);
    expect(grace.player.cooldowns.get('hammer_of_light')).toBe(10);
    const hpAfterGrace = graceTarget.hp;
    grace.player.gcdRemaining = 0;
    grace.castAbility('hammer_of_light');
    expect(graceTarget.hp).toBe(hpAfterGrace);

    const light = new Sim({ seed: 109, playerClass: 'paladin', autoEquip: true });
    light.setPlayerLevel(20);
    light.setSpec('retribution');
    const lightTarget = hostileNear(light);
    light.player.hp = 1;
    light.rng.next = () => 0.9;
    run(light, lightTarget, resolve(light, 'hammer_of_light'));
    const events = light.drainEvents();
    const damage = events.find(
      (event) => event.type === 'damage' && event.targetId === lightTarget.id,
    );
    expect(damage?.type).toBe('damage');
    if (damage?.type !== 'damage') throw new Error('missing Hammer of Light damage');
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'heal2',
        targetId: light.player.id,
        amount: Math.round(damage.amount * 0.5),
      }),
    );

    const reverse = new Sim({ seed: 111, playerClass: 'paladin', autoEquip: true });
    reverse.setPlayerLevel(20);
    reverse.setSpec('retribution');
    const reverseTarget = hostileNear(reverse);
    reverse.player.targetId = reverseTarget.id;
    reverse.player.hp = 1;
    reverse.rng.next = () => 0.9;
    reverse.castAbility('hammer_of_light');
    expect(reverse.player.cooldowns.get('hammer_of_grace')).toBe(10);
    expect(reverse.player.cooldowns.get('hammer_of_light')).toBe(10);
  });

  it('grants neither hammer payout on a miss and heals Light from effective damage only', () => {
    const miss = new Sim({ seed: 112, playerClass: 'paladin', autoEquip: true });
    miss.setPlayerLevel(20);
    miss.setSpec('retribution');
    const missTarget = hostileNear(miss);
    miss.player.resource = 0;
    miss.player.hp = 1;
    miss.rng.next = () => 0;
    run(miss, missTarget, resolve(miss, 'hammer_of_grace'));
    run(miss, missTarget, resolve(miss, 'hammer_of_light'));
    expect(miss.player.resource).toBe(0);
    expect(miss.player.hp).toBe(1);

    const absorbed = new Sim({ seed: 114, playerClass: 'paladin', autoEquip: true });
    absorbed.setPlayerLevel(20);
    absorbed.setSpec('retribution');
    const absorbedTarget = hostileNear(absorbed);
    absorbedTarget.auras.push(aura('test_absorb', 'absorb', absorbedTarget.id, 1_000_000));
    absorbed.player.hp = 1;
    absorbed.rng.next = () => 0.9;
    run(absorbed, absorbedTarget, resolve(absorbed, 'hammer_of_light'));
    expect(absorbedTarget.hp).toBe(absorbedTarget.maxHp);
    expect(absorbed.player.hp).toBe(1);
    expect(absorbed.drainEvents()).not.toContainEqual(
      expect.objectContaining({ type: 'heal2', ability: 'Hammer of Light' }),
    );
  });

  it('applies Sacred Form healing and threat modifiers', () => {
    const sim = new Sim({ seed: 113, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('holy');
    const critBefore = sim.ctx.spellCrit(sim.player);
    run(sim, null, resolve(sim, 'sacred_form'));

    expect(threatModifier(sim.player, 'holy')).toBeCloseTo(0.5, 10);
    expect(sim.ctx.spellCrit(sim.player)).toBeCloseTo(critBefore + 0.05, 10);
    expect(sim.player.auras.filter((active) => active.id.startsWith('sacred_form'))).toEqual([
      expect.objectContaining({
        id: 'sacred_form',
        kind: 'sacred_form',
        permanent: true,
        remaining: Number.POSITIVE_INFINITY,
      }),
    ]);
    sim.player.hp = 1;
    const internals = sim as unknown as {
      ctx: {
        applyHeal(
          source: Entity,
          target: Entity,
          amount: number,
          ability: string,
          abilityId: string | null,
          canCrit: boolean,
        ): number;
      };
    };
    expect(internals.ctx.applyHeal(sim.player, sim.player, 100, 'Test', null, false)).toBe(110);

    for (let i = 0; i < 40; i++) sim.tick();
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({ id: 'sacred_form', permanent: true }),
    );

    const attacker = hostileNear(sim);
    (
      sim as unknown as {
        dealDamage(
          source: Entity,
          target: Entity,
          amount: number,
          crit: boolean,
          school: string,
          ability: string,
          kind: 'hit',
        ): void;
      }
    ).dealDamage(attacker, sim.player, 1_000_000, false, 'holy', 'Test', 'hit');
    expect(sim.player.dead).toBe(true);
    expect(sim.player.auras.some((active) => active.id === 'sacred_form')).toBe(false);
  });

  it('drives Solar Step forward even without held movement input', () => {
    const sim = new Sim({ seed: 127, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    run(sim, null, resolve(sim, 'solar_step'));
    const before = { ...sim.player.pos };

    sim.tick();

    expect(Math.hypot(sim.player.pos.x - before.x, sim.player.pos.z - before.z)).toBeGreaterThan(
      0.5,
    );
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({ id: 'solar_step', kind: 'buff_speed' }),
    );
  });

  it('heals allied players with Solar Invocation but excludes allied pets', () => {
    const sim = new Sim({ seed: 131, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    const allyId = sim.addPlayer('priest', 'Solar Ally');
    sim.setPlayerLevel(20, allyId);
    const ally = sim.entities.get(allyId);
    if (!ally) throw new Error('missing allied player');
    ally.pos = { ...sim.player.pos };
    ally.hp = 1;

    const pet = createMob(9102, MOBS.ridge_stalker, 20, { ...sim.player.pos });
    pet.ownerId = sim.player.id;
    pet.hp = 1;
    (sim as unknown as { addEntity(entity: Entity): void }).addEntity(pet);

    run(sim, null, resolve(sim, 'solar_invocation'));

    expect(ally.hp).toBeGreaterThan(1);
    expect(pet.hp).toBe(1);
  });

  it('stacks Devotion Aura by source in the real damage pipeline', () => {
    const sim = new Sim({ seed: 137, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    const attacker = hostileNear(sim);
    sim.player.auras.push(aura('devotion_ward', 'buff_dr', 50, 0.05));
    sim.player.auras.push(aura('devotion_ward', 'buff_dr', 51, 0.05));
    sim.player.hp = sim.player.maxHp;
    const before = sim.player.hp;

    (
      sim as unknown as {
        dealDamage(
          source: Entity,
          target: Entity,
          amount: number,
          crit: boolean,
          school: string,
          ability: string,
          kind: 'hit',
        ): void;
      }
    ).dealDamage(attacker, sim.player, 100, false, 'physical', 'Test', 'hit');

    expect(before - sim.player.hp).toBe(90);
  });
});
