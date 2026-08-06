// A player pet's ranged bolt (petRangedAttack in src/sim/pet/pet_ai.ts: the
// Emberkin imp Firebolt, the mage Water Elemental bolt) must roll the same
// spell-resist table as every other spell path. The hostile-mob petSpell path
// (Sim.updateRangedPetAttack) and the player cast path (casting_lifecycle)
// both roll isMobSpellResisted / isSpellResisted; the imp-bolt projectile
// historically skipped the roll entirely, so player pet bolts could never be
// resisted, an engine asymmetry that made pet damage resist-immune.
//
// Same stub idiom as tests/spell_resist.test.ts: pin the shared rng's chance()
// so the hit roll deterministically fails (resist) or succeeds (land), and step
// the pending projectile directly so no other combat noise interferes.

import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { petRangedAttack } from '../src/sim/pet/pet_ai';
import { advancePendingProjectiles } from '../src/sim/projectile_travel';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

type AnySim = Sim & Record<string, any>;
type AnyEntity = Entity & Record<string, any>;

// Summon the warlock's imp for real (cast summon_imp to completion) so the pet
// carries genuine owned-pet state, then hand back sim + imp + a spawned target.
function makeImpVsTarget(targetLevel: number): {
  sim: AnySim;
  imp: AnyEntity;
  mob: AnyEntity;
} {
  const sim = new Sim({ seed: 7, playerClass: 'warlock', autoEquip: true }) as AnySim;
  sim.setPlayerLevel(12);
  sim.castAbility('summon_imp');
  for (let i = 0; i < 20 * 12 && sim.player.castingAbility; i++) sim.tick();
  const imp = sim.petOf(sim.playerId) as AnyEntity;
  expect(imp).not.toBeNull();
  expect(imp.templateId).toBe('emberkin');
  const p = sim.player;
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, targetLevel, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + 4,
  }) as AnyEntity;
  mob.maxHp = 50000;
  mob.hp = 50000;
  mob.hostile = true;
  mob.aiState = 'idle';
  sim.addEntity(mob);
  return { sim, imp, mob };
}

// Hurl one bolt directly at the unit under test and step it to impact.
function hurlBolt(sim: AnySim, imp: AnyEntity, mob: AnyEntity): any[] {
  const events: any[] = [];
  sim.ctx.emit = (e: any) => events.push(e);
  petRangedAttack(sim.ctx, imp, mob, MOBS.emberkin.petRanged!);
  for (let i = 0; i < 200 && sim.ctx.pendingProjectiles.length > 0; i++)
    advancePendingProjectiles(sim.ctx);
  return events;
}

describe('pet ranged bolt spell resist', () => {
  it('an avoided pet bolt emits kind:"resist" with zero damage instead of landing', () => {
    // Arrange: a wildly higher-level target and a pinned failing hit roll make
    // the resist certain, exactly like the player-cast resist test.
    const { sim, imp, mob } = makeImpVsTarget(60);
    sim.rng.chance = () => false;

    // Act
    const events = hurlBolt(sim, imp, mob);

    // Assert: the bolt resolves as a full resist, never as damage.
    const dmg = events.filter((e) => e.type === 'damage' && e.targetId === mob.id);
    expect(dmg.length).toBeGreaterThan(0);
    expect(dmg.every((e) => e.kind === 'resist')).toBe(true);
    expect(dmg.every((e) => e.amount === 0)).toBe(true);
  });

  it('a resisted bolt still pulls the target into combat with the pet', () => {
    // Arrange
    const { sim, imp, mob } = makeImpVsTarget(60);
    sim.rng.chance = () => false;

    // Act
    const events = hurlBolt(sim, imp, mob);

    // Assert: the resist arm mirrors Sim.updateRangedPetAttack, which calls
    // enterCombat so a fully resisted pull still aggros the target.
    expect(events.some((e) => e.type === 'damage' && e.kind === 'resist')).toBe(true);
    expect(imp.inCombat).toBe(true);
    expect(mob.inCombat).toBe(true);
  });

  it('a bolt that passes the hit roll still lands for real damage', () => {
    // Arrange: chance() always succeeds, so the hit roll passes (and the crit
    // roll does too); the bolt must deal its normal damage.
    const { sim, imp, mob } = makeImpVsTarget(12);
    sim.rng.chance = () => true;

    // Act
    const events = hurlBolt(sim, imp, mob);

    // Assert
    const dmg = events.filter((e) => e.type === 'damage' && e.targetId === mob.id);
    expect(dmg.length).toBeGreaterThan(0);
    expect(dmg.some((e) => e.amount > 0)).toBe(true);
    expect(dmg.some((e) => e.kind === 'resist')).toBe(false);
  });
});
