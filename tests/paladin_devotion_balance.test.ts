import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

type PaladinSpec = 'holy' | 'protection' | 'retribution';

const PRIORITY: Readonly<Record<PaladinSpec, readonly string[]>> = {
  holy: ['radiant_chorus', 'dawns_embrace', 'mercy_lance', 'holy_light'],
  protection: ['sunward_disc', 'bastion_rite', 'vowkeeper_strike'],
  retribution: ['final_edict', 'dawnfall', 'oathstrike'],
};

const EXPECTED_SECONDS: Readonly<Record<PaladinSpec, number>> = {
  holy: 36.15,
  protection: 40.05,
  retribution: 32.65,
};

function addDummy(sim: Sim): Entity {
  const player = sim.player;
  const dummy = createMob(9700, MOBS.training_dummy, 20, {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z + 2,
  });
  dummy.maxHp = dummy.hp = 1_000_000_000;
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(dummy);
  return dummy;
}

function isFree(player: Entity): boolean {
  return player.castingAbility === null && player.gcdRemaining <= 1e-6;
}

function castFirstReady(sim: Sim, ids: readonly string[], target: Entity): void {
  const player = sim.player;
  for (const id of ids) {
    const beforeGcd = player.gcdRemaining;
    sim.targetEntity(target.id);
    sim.castAbility(id);
    if (player.castingAbility === id || player.gcdRemaining > beforeGcd) return;
  }
}

function secondsToTwenty(spec: PaladinSpec): number {
  const sim = new Sim({ seed: 53, playerClass: 'paladin', autoEquip: true });
  sim.setPlayerLevel(20);
  sim.setSpec(spec);
  sim.tick();
  const player = sim.player;
  let target: Entity;
  if (spec === 'holy') {
    const allyId = sim.addPlayer('warrior', 'Test Ally');
    const ally = sim.entities.get(allyId);
    if (!ally) throw new Error('missing Holy rotation test ally');
    target = ally;
  } else {
    target = addDummy(sim);
  }

  for (let tick = 0; tick < 60 * 20; tick++) {
    if (spec === 'holy') target.hp = 1;
    if (isFree(player)) castFirstReady(sim, PRIORITY[spec], target);
    sim.tick();
    if ((player.paladinDevotion?.value ?? 0) >= 20) return (tick + 1) / 20;
  }
  return Infinity;
}

function protectionSecondsToTwentyWhileBlocking(): { seconds: number; devotionFromBlocks: number } {
  const sim = new Sim({ seed: 61, playerClass: 'paladin', autoEquip: true });
  sim.setPlayerLevel(20);
  sim.setSpec('protection');
  sim.addItem('eastbrook_buckler', 1);
  sim.equipItem('eastbrook_buckler');
  sim.tick();

  const player = sim.player;
  const attacker = addDummy(sim);
  attacker.weapon = { min: 1, max: 1, speed: 2 };
  attacker.attackPower = 0;
  player.facing = 0;
  player.dodgeChance = 0;
  player.blockChance = 1;
  player.stats.armor = 0;
  sim.rng.next = () => 0.9;

  const mobSwing = (sim as unknown as { mobSwing(attacker: Entity, target: Entity): void })
    .mobSwing;
  let devotionFromBlocks = 0;
  for (let tick = 0; tick < 60 * 20; tick++) {
    player.hp = player.maxHp;
    if (tick % 40 === 0) {
      const before = player.paladinDevotion?.value ?? 0;
      mobSwing.call(sim, attacker, player);
      if ((player.paladinDevotion?.value ?? 0) > before) devotionFromBlocks++;
    }
    if (isFree(player)) castFirstReady(sim, PRIORITY.protection, attacker);
    sim.tick();
    if ((player.paladinDevotion?.value ?? 0) >= 20) {
      return { seconds: (tick + 1) / 20, devotionFromBlocks };
    }
  }
  return { seconds: Infinity, devotionFromBlocks };
}

describe('Paladin Devotion rotation pacing', () => {
  it.each(['holy', 'protection', 'retribution'] as const)(
    '%s reaches Ascension readiness in 30 to 45 seconds of active play',
    (spec) => {
      const seconds = secondsToTwenty(spec);
      expect(seconds).toBeGreaterThanOrEqual(30);
      expect(seconds).toBeLessThanOrEqual(45);
      expect(seconds).toBeCloseTo(EXPECTED_SECONDS[spec], 5);
    },
  );

  it('keeps Protection in the target cadence while earning Devotion from real blocks', () => {
    const result = protectionSecondsToTwentyWhileBlocking();
    expect(result.devotionFromBlocks).toBeGreaterThan(0);
    expect(result.seconds).toBeGreaterThanOrEqual(30);
    expect(result.seconds).toBeLessThanOrEqual(45);
    expect(result.seconds).toBeLessThan(EXPECTED_SECONDS.protection);
  });
});
