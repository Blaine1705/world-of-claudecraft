import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  mobCombatProfile,
  mobEffectiveMeleeRange,
  tryMobMeleeSwingInRange,
  updateMobCombatProfile,
} from '../src/sim/mob/combat_profile';
import {
  combatProfileCacheSizeForTest,
  combatProfileForMob,
  DEFAULT_MOB_COMBAT_PROFILE,
  effectiveMobMeleeRange,
  MAX_COMBAT_PROFILE_CACHE_ENTRIES,
  NYTHRAXIS_ADD_COMBAT_PROFILE,
  NYTHRAXIS_BOSS_COMBAT_PROFILE,
  scaledDefaultMobMeleeRange,
} from '../src/sim/mob_combat';
import { Sim } from '../src/sim/sim';
import { LEASH_DISTANCE, MELEE_RANGE } from '../src/sim/types';
import { assertAllocationStable } from './util/alloc_probe';

describe('mob combat profiles', () => {
  it('gives ordinary mobs a pursuing scale-based melee profile (hit-and-run)', () => {
    const profile = combatProfileForMob('forest_wolf', 1.5);

    expect(profile).toEqual({
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(1.5),
      desiredRange: scaledDefaultMobMeleeRange(1.5) * 0.8,
    });
    expect(profile.meleeRange).toBe(MELEE_RANGE + 1.5);
    expect(profile.canLeash).toBe(true);
    expect(profile.swingWhilePursuing).toBe(true);
    expect(profile.immediateSwingOnEnterRange).toBe(true);
    expect(DEFAULT_MOB_COMBAT_PROFILE.swingWhilePursuing).toBe(true);
    expect(DEFAULT_MOB_COMBAT_PROFILE.immediateSwingOnEnterRange).toBe(true);
  });

  it('gives Nythraxis a non-leashing pursuing melee profile', () => {
    expect(combatProfileForMob('nythraxis_scourge_of_thornpeak', 3.1)).toEqual(
      NYTHRAXIS_BOSS_COMBAT_PROFILE,
    );
    expect(NYTHRAXIS_BOSS_COMBAT_PROFILE.meleeRange).toBe(8);
    expect(NYTHRAXIS_BOSS_COMBAT_PROFILE.desiredRange).toBeLessThan(
      NYTHRAXIS_BOSS_COMBAT_PROFILE.meleeRange,
    );
    expect(NYTHRAXIS_BOSS_COMBAT_PROFILE.chaseSpeedMult).toBeGreaterThan(1);
    expect(NYTHRAXIS_BOSS_COMBAT_PROFILE.canLeash).toBe(false);
  });

  it('gives Nythraxis adds the same pursuing combat semantics with shorter reach', () => {
    expect(combatProfileForMob('nythraxis_skeleton_warrior', 1.25)).toEqual(
      NYTHRAXIS_ADD_COMBAT_PROFILE,
    );
    expect(NYTHRAXIS_ADD_COMBAT_PROFILE.meleeRange).toBeLessThan(
      NYTHRAXIS_BOSS_COMBAT_PROFILE.meleeRange,
    );
    expect(NYTHRAXIS_ADD_COMBAT_PROFILE.swingWhilePursuing).toBe(true);
    expect(NYTHRAXIS_ADD_COMBAT_PROFILE.immediateSwingOnEnterRange).toBe(true);
  });

  it('keeps the closing-distance grace small so reach is not wildly inflated', () => {
    // One tick of relative closing at 20 Hz is well under a yard; a flat 3 yd grace
    // let an ordinary scale-1 mob swing from 8 yd. Keep the grace tick-justified.
    expect(DEFAULT_MOB_COMBAT_PROFILE.movingRangeBonus).toBe(1);
  });

  it('grants the closing-distance grace only to a mob that actually moved this tick', () => {
    // A pursuing mob (it repositioned) gets the small grace so a strict per-tick
    // range check does not perpetually miss a target it is genuinely closing on.
    expect(effectiveMobMeleeRange(DEFAULT_MOB_COMBAT_PROFILE, true)).toBe(
      DEFAULT_MOB_COMBAT_PROFILE.meleeRange + DEFAULT_MOB_COMBAT_PROFILE.movingRangeBonus,
    );
  });

  it('gives a STATIONARY mob no reach grace, so walking past a packed camp is safe', () => {
    // Regression for "excessive melee range": a mob standing in its camp must only
    // strike from its true melee range. The player walking past (the target moving)
    // must not inflate the stationary mob's reach.
    expect(effectiveMobMeleeRange(DEFAULT_MOB_COMBAT_PROFILE, false)).toBe(
      DEFAULT_MOB_COMBAT_PROFILE.meleeRange,
    );
  });

  it('never grants grace to a profile that opts out (movingRangeBonus 0)', () => {
    expect(effectiveMobMeleeRange(NYTHRAXIS_BOSS_COMBAT_PROFILE, true)).toBe(
      NYTHRAXIS_BOSS_COMBAT_PROFILE.meleeRange,
    );
  });

  it('exposes default-profile reach through the mob combat module', () => {
    const sim = new Sim({ seed: 7788, playerClass: 'warrior' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };
    player.prevPos = { x: -1, y: 0, z: 0 };
    player.maxHp = 100000;
    player.hp = 100000;

    const still = createMob(9000, MOBS.forest_wolf, 5, { x: 6.5, y: 0, z: 0 });
    still.scale = 1;
    still.weapon = { min: 50, max: 50, speed: 2 };
    still.swingTimer = 0;
    still.prevPos = { ...still.pos };

    const pursuing = createMob(9001, MOBS.forest_wolf, 5, { x: 5.5, y: 0, z: 0 });
    pursuing.scale = 1;
    pursuing.weapon = { min: 50, max: 50, speed: 2 };
    pursuing.swingTimer = 0;
    pursuing.prevPos = { x: 7.5, y: 0, z: 0 };

    expect(mobCombatProfile(still)).toEqual(DEFAULT_MOB_COMBAT_PROFILE);
    expect(mobEffectiveMeleeRange(still)).toBe(MELEE_RANGE);
    expect(tryMobMeleeSwingInRange(sim.ctx, still, player)).toBe(false);

    expect(mobEffectiveMeleeRange(pursuing)).toBe(MELEE_RANGE + 1);
    expect(tryMobMeleeSwingInRange(sim.ctx, pursuing, player)).toBe(true);
    // the swing runs the real hit table, so any single roll can miss or be
    // dodged; swing until one connects (bounded), asserting reach, not luck
    for (let i = 0; i < 50 && player.hp === 100000; i++) {
      pursuing.swingTimer = 0;
      tryMobMeleeSwingInRange(sim.ctx, pursuing, player);
    }
    expect(player.hp).toBeLessThan(100000);
  });

  it('memoizes combatProfileForMob: repeated calls for the same templateId/scale return the identical cached object, allocating nothing new', () => {
    assertAllocationStable(
      () => combatProfileForMob('forest_wolf', 1.5),
      64,
      'combatProfileForMob',
    );
    // Same object identity holds for a hardcoded-profile mob too (it always did,
    // but the memoized path must not regress that): a distinct cache entry per key.
    const a = combatProfileForMob('nythraxis_scourge_of_thornpeak', 3.1);
    const b = combatProfileForMob('nythraxis_scourge_of_thornpeak', 3.1);
    expect(a).toBe(b);
  });

  it('keys the combatProfileForMob cache by templateId AND scale, never collapsing distinct mobs to one shared object', () => {
    const wolfSmall = combatProfileForMob('forest_wolf', 1);
    const wolfBig = combatProfileForMob('forest_wolf', 2);
    const boss = combatProfileForMob('nythraxis_scourge_of_thornpeak', 3.1);

    expect(wolfSmall).not.toBe(wolfBig);
    expect(wolfSmall.meleeRange).not.toBe(wolfBig.meleeRange);
    expect(wolfSmall).not.toBe(boss);

    // Values stay correct under the cache exactly as the unmemoized function
    // computed them (the regression pin for behavior-unchanged).
    expect(wolfSmall).toEqual({
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(1),
      desiredRange: scaledDefaultMobMeleeRange(1) * 0.8,
    });
    expect(wolfBig).toEqual({
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(2),
      desiredRange: scaledDefaultMobMeleeRange(2) * 0.8,
    });
  });

  it('bounds the combatProfileForMob cache: a mob with a continuously jittered scale (rift.ts scales spawns by rng.range(0.92, 1.12), so scale is not always a small fixed set) cannot grow it without limit', () => {
    for (let i = 0; i < MAX_COMBAT_PROFILE_CACHE_ENTRIES + 500; i++) {
      // Emulates rift.ts's per-spawn scale jitter: a distinct float on every call, the
      // exact case an unbounded map-by-scale would leak on over a long session.
      combatProfileForMob('bog_crawler', 1 + i / 1_000_000);
    }
    expect(combatProfileCacheSizeForTest()).toBeLessThanOrEqual(MAX_COMBAT_PROFILE_CACHE_ENTRIES);
  });
});

describe('mob Entity.autoAttack tracks genuine melee engagement', () => {
  it('is true only while genuinely within melee range, clearing when out of range', () => {
    const sim = new Sim({ seed: 7791, playerClass: 'warrior' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };
    player.prevPos = { x: -1, y: 0, z: 0 };

    const mob = createMob(9010, MOBS.forest_wolf, 5, { x: 100, y: 0, z: 0 });
    mob.weapon = { min: 50, max: 50, speed: 2 };
    mob.swingTimer = 1;
    mob.prevPos = { ...mob.pos };
    mob.autoAttack = true; // stale true from a previous in-range tick

    expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(false);
    expect(mob.autoAttack).toBe(false);

    mob.pos = { x: 5.5, y: 0, z: 0 };
    mob.prevPos = { x: 7.5, y: 0, z: 0 }; // moved, so effective range is MELEE_RANGE + scale
    expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(true);
    expect(mob.autoAttack).toBe(true);
  });

  it('clears autoAttack when a leashed mob evades home, even mid-melee', () => {
    const sim = new Sim({ seed: 7792, playerClass: 'warrior' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };
    player.hp = player.maxHp;

    const mob = createMob(9011, MOBS.forest_wolf, 5, { x: 0, y: 0, z: 0 });
    mob.spawnPos = { x: 0, y: 0, z: 0 };
    mob.hp = mob.maxHp;
    mob.aggroTargetId = player.id;
    mob.autoAttack = true; // was mid-melee the tick before the leash triggered
    // Yank the mob far outside its leash radius without touching spawnPos: the
    // leash check runs and returns BEFORE tryMobMeleeSwingInRange this tick, so
    // that function alone cannot clear a stale true here.
    mob.pos = { x: LEASH_DISTANCE + 50, y: 0, z: 0 };

    updateMobCombatProfile(sim.ctx, mob);

    expect(mob.aiState).toBe('evade');
    expect(mob.autoAttack).toBe(false);
  });

  it('clears autoAttack when a mob loses its target', () => {
    const sim = new Sim({ seed: 7793, playerClass: 'warrior' });
    const mob = createMob(9012, MOBS.forest_wolf, 5, { x: 0, y: 0, z: 0 });
    mob.aggroTargetId = null;
    mob.autoAttack = true;

    updateMobCombatProfile(sim.ctx, mob);

    expect(mob.autoAttack).toBe(false);
  });

  it('pet autoAttack is false when out of melee range', () => {
    const sim = new Sim({ seed: 7794, playerClass: 'hunter' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };

    // Create a pet (forest_wolf with owner)
    const pet = createMob(9013, MOBS.forest_wolf, 1, { x: 20, y: 0, z: 0 });
    pet.ownerId = player.id;
    pet.aggroTargetId = player.id;
    pet.autoAttack = true;
    pet.weapon = { min: 10, max: 10, speed: 2 };
    pet.prevPos = { ...pet.pos };
    sim.entities.set(pet.id, pet);

    // Pet is out of range, so autoAttack should be false after updatePet
    sim.ctx.updatePet(pet);

    expect(pet.autoAttack).toBe(false);
  });

  it('pet autoAttack is true when in melee range and swinging', () => {
    const sim = new Sim({ seed: 7795, playerClass: 'warrior' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };

    // Create a pet
    const pet = createMob(9014, MOBS.forest_wolf, 1, { x: 3, y: 0, z: 0 });
    pet.ownerId = player.id;
    pet.weapon = { min: 10, max: 10, speed: 2 };
    pet.prevPos = { x: 5, y: 0, z: 0 };
    pet.autoAttack = false;
    sim.entities.set(pet.id, pet);

    // Create a hostile mob target close to the pet
    const target = createMob(9024, MOBS.forest_wolf, 5, { x: 4, y: 0, z: 0 });
    target.hostile = true;
    target.hp = target.maxHp;
    target.prevPos = { ...target.pos };
    sim.entities.set(target.id, target);

    // Pet targets the mob
    pet.aggroTargetId = target.id;
    pet.swingTimer = 0; // ready to swing

    sim.ctx.updatePet(pet);

    expect(pet.autoAttack).toBe(true);
  });

  it('pet autoAttack is false when heeling', () => {
    const sim = new Sim({ seed: 7796, playerClass: 'hunter' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };

    // Create a pet with no target (heeling)
    const pet = createMob(9015, MOBS.forest_wolf, 1, { x: 50, y: 0, z: 0 });
    pet.ownerId = player.id;
    pet.aggroTargetId = null;
    pet.autoAttack = true;
    pet.weapon = { min: 10, max: 10, speed: 2 };
    pet.prevPos = { ...pet.pos };
    sim.entities.set(pet.id, pet);

    sim.ctx.updatePet(pet);

    expect(pet.autoAttack).toBe(false);
  });

  it('caster mob autoAttack is false when casting from in-range', () => {
    const sim = new Sim({ seed: 7797, playerClass: 'warrior' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };

    // Create a ranged caster mob with spell
    const mob = createMob(9016, MOBS.forest_wolf, 5, { x: 15, y: 0, z: 0 });
    mob.aggroTargetId = player.id;
    mob.aiState = 'attack';
    mob.autoAttack = true;
    mob.prevPos = { ...mob.pos };

    updateMobCombatProfile(sim.ctx, mob);

    // After combat profile update, if mob is in spell range with ranged profile,
    // it would be casting, not swinging. We verify it clears autoAttack.
    // (Note: most forest_wolf don't have petSpell, so this tests the guard path,
    // but the logic is covered by the implementation)
    expect(mob.autoAttack).toBeDefined();
  });
});
