import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/content/classes';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { ENRAGE_DMG_DONE, ENRAGE_HASTE, ENRAGE_MOVE_MULT } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

// Fury Enrage (owner 2026-07-08): a short self-buff (+11% damage, +25% attack
// speed, +10% move speed) procced by Bloodletting (30%) and Desenfreno / Rampage
// (always). One 'enrage' aura carries all three halves.

const makeFury = (seed = 42): Sim => {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.setSpec('fury')).toBe(true);
  sim.tick();
  return sim;
};

const nearestMob = (sim: Sim): Entity => {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead) continue;
    const d = (e.pos.x - sim.player.pos.x) ** 2 + (e.pos.z - sim.player.pos.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) throw new Error('no mob');
  return best;
};

const approach = (sim: Sim, mob: Entity): void => {
  const p = sim.player;
  p.pos.x = mob.pos.x;
  p.pos.z = mob.pos.z - 1.5;
  p.pos.y = terrainHeight(p.pos.x, p.pos.z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.facing = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
};

describe('Fury Enrage: proc sources', () => {
  it('Desenfreno (red_harvest) always Enrages for 4 sec', () => {
    expect(ABILITIES.red_harvest.effects).toContainEqual({
      type: 'enrageChance',
      chance: 1,
      duration: 4,
    });
  });

  it('Bloodletting (bloodthirst) has a 30% Enrage chance for 4 sec', () => {
    expect(ABILITIES.bloodthirst.effects).toContainEqual({
      type: 'enrageChance',
      chance: 0.3,
      duration: 4,
    });
  });

  it('casting Desenfreno applies the enrage buff (guaranteed proc)', () => {
    const sim = makeFury();
    const mob = nearestMob(sim);
    mob.maxHp = 100000;
    mob.hp = mob.maxHp;
    approach(sim, mob);
    sim.player.resource = 80;
    sim.player.gcdRemaining = 0;
    sim.targetEntity(mob.id);
    sim.castAbility('red_harvest');
    sim.tick();
    const a = sim.player.auras.find((x) => x.id === 'fury_enrage');
    expect(a?.kind).toBe('enrage');
    expect(a?.value).toBe(ENRAGE_DMG_DONE);
    expect(a?.duration).toBe(4);
  });
});

describe('Fury Enrage: the buff carries all three halves', () => {
  it('gives +25% attack speed, +10% move speed and +11% outgoing damage', () => {
    const sim = makeFury();
    const p = sim.player;
    const mob = nearestMob(sim);
    mob.maxHp = 1_000_000;

    const baseSwing = (
      sim as unknown as { swingIntervalMult(e: Entity): number }
    ).swingIntervalMult(p);
    const baseMove = (sim as unknown as { moveSpeedMult(e: Entity): number }).moveSpeedMult(p);

    // Damage baseline (no enrage). Same armor DR applies to both deals, so the
    // ratio isolates the +11% amp.
    mob.hp = mob.maxHp;
    (sim as unknown as { dealDamage: (...a: unknown[]) => void }).dealDamage(
      p,
      mob,
      1000,
      false,
      'physical',
      null,
      'hit',
    );
    const dropNoEnrage = mob.maxHp - mob.hp;

    p.auras.push({
      id: 'fury_enrage',
      name: 'Enraged',
      kind: 'enrage',
      remaining: 4,
      duration: 4,
      value: ENRAGE_DMG_DONE,
      sourceId: p.id,
      school: 'physical',
    });

    expect(
      (sim as unknown as { swingIntervalMult(e: Entity): number }).swingIntervalMult(p),
    ).toBeCloseTo(baseSwing / ENRAGE_HASTE, 5);
    expect((sim as unknown as { moveSpeedMult(e: Entity): number }).moveSpeedMult(p)).toBeCloseTo(
      baseMove * ENRAGE_MOVE_MULT,
      5,
    );

    mob.hp = mob.maxHp;
    (sim as unknown as { dealDamage: (...a: unknown[]) => void }).dealDamage(
      p,
      mob,
      1000,
      false,
      'physical',
      null,
      'hit',
    );
    const dropEnrage = mob.maxHp - mob.hp;
    expect(dropEnrage / dropNoEnrage).toBeCloseTo(1 + ENRAGE_DMG_DONE, 2);
  });
});
