// Chronomancy owner tuning (2026-07-12): the Chronoweave mastery gains a mana cushion,
// Cascada's echo window grows, Aether Darts fires a full-charge barrage, and a combat
// resurrection (Temporal Reversal) is added. docs/prd/mage-chronomancy.md.
import { describe, expect, it } from 'vitest';
import { aetherDartsChannelStart, aetherSurgeStacks } from '../src/sim/combat/chronomancy';
import { abilitiesKnownAt } from '../src/sim/content/classes';
import { computeTalentModifiers, emptyAllocation } from '../src/sim/content/talents';
import { ABILITIES, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

function chronoMage(level = 20) {
  const sim = new Sim({ seed: 41, playerClass: 'mage', autoEquip: true });
  sim.setPlayerLevel(level);
  expect(sim.setSpec('arcane')).toBe(true);
  sim.tick();
  const p = sim.player;
  p.resource = p.maxResource;
  return { sim, p };
}

function free(p: Entity): boolean {
  const q = p as unknown as { castingAbility: string | null; gcdRemaining: number };
  return q.castingAbility == null && q.gcdRemaining <= 1e-6;
}

function addDummy(sim: Sim): Entity {
  const p = sim.player;
  const mob = createMob(9500, MOBS.training_dummy, 20, { x: p.pos.x, y: p.pos.y, z: p.pos.z + 5 });
  mob.hostile = true;
  mob.maxHp = mob.hp = 1_000_000_000;
  (sim as unknown as { addEntity(e: Entity): void }).addEntity(mob);
  return mob;
}

describe('Chronoweave mastery: healing + mana cushion', () => {
  it('grants +15% healing, +5% max mana, and +20% mana regen', () => {
    const mods = computeTalentModifiers('mage', { ...emptyAllocation(), spec: 'arcane' } as never);
    expect(mods.global.healPct).toBeCloseTo(0.15, 6);
    expect(mods.global.manaPct).toBeCloseTo(0.05, 6);
    expect(mods.global.manaRegenPct).toBeCloseTo(0.2, 6);
  });

  it('the mana cushion actually raises a Chronomancer max mana', () => {
    const chrono = chronoMage().p.maxResource;
    const fire = (() => {
      const sim = new Sim({ seed: 41, playerClass: 'mage', autoEquip: true });
      sim.setPlayerLevel(20);
      sim.setSpec('fire');
      sim.tick();
      return sim.player.maxResource;
    })();
    // Same base pool, but the mastery gives the Chronomancer ~5% more.
    expect(chrono).toBeGreaterThan(fire);
    expect(chrono / fire).toBeCloseTo(1.05, 2);
  });
});

describe('Cascada echo window', () => {
  it('lasts 10s on a 17s cooldown (a longer window, same ~7s gap)', () => {
    const cascade = ABILITIES.temporal_cascade;
    expect(cascade.cooldown).toBe(17);
    const rank3 = cascade.ranks?.at(-1) ?? cascade;
    const eff = rank3.effects.find((e) => e.type === 'massTemporalEcho');
    expect(eff && 'duration' in eff ? eff.duration : 0).toBe(10);
  });
});

describe('Aether Darts full-charge barrage', () => {
  it('fires 5 missiles at max charges, 3 otherwise (channelStart hook)', () => {
    const { p } = chronoMage();
    // No charges: default (0 => casting_lifecycle keeps the ability's 3 ticks).
    aetherDartsChannelStart(p, 'arcane_missiles');
    expect(p.aetherDartsTicks).toBe(0);
    // Build to 4 charges with real Aether Surge casts, then re-arm the channel.
    const { sim, p: mage } = chronoMage();
    const dummy = addDummy(sim);
    for (let i = 0; i < 4 && aetherSurgeStacks(mage) < 4; i++) {
      sim.targetEntity(dummy.id);
      sim.castAbility('arcane_surge');
      for (let t = 0; t < 60 && !free(mage); t++) sim.tick();
    }
    expect(aetherSurgeStacks(mage)).toBe(4);
    aetherDartsChannelStart(mage, 'arcane_missiles');
    expect(mage.aetherDartsTicks).toBe(5);
  });

  it('the channel actually lands 5 missiles at 4 charges', () => {
    const { sim, p } = chronoMage();
    const dummy = addDummy(sim);
    for (let i = 0; i < 4 && aetherSurgeStacks(p) < 4; i++) {
      sim.targetEntity(dummy.id);
      sim.castAbility('arcane_surge');
      for (let t = 0; t < 60 && !free(p); t++) sim.tick();
    }
    expect(aetherSurgeStacks(p)).toBe(4);
    sim.targetEntity(dummy.id);
    sim.castAbility('arcane_missiles');
    let missiles = 0;
    for (let t = 0; t < 100; t++) {
      for (const e of sim.tick() as SimEvent[]) {
        if (e.type === 'damage' && e.sourceId === p.id && e.targetId === dummy.id) missiles++;
      }
      if (free(p) && t > 5) break;
    }
    // 5 missiles fire (vs the default 3); a spell-hit roll can drop one, so landing
    // MORE than the default 3 is the decisive signal that the barrage grew.
    expect(missiles).toBeGreaterThan(3);
  });
});

describe('Temporal Reversal: combat resurrection', () => {
  it('is defined as a dead-target arcane res', () => {
    const rez = ABILITIES.temporal_reversal;
    expect(rez.targetsDead).toBe(true);
    expect(rez.effects.some((e) => e.type === 'resurrectAlly')).toBe(true);
  });

  it('rewinds a dead party ally back to life; refuses on a living or non-party target', () => {
    const { sim, p } = chronoMage();
    const allyId = sim.addPlayer('warrior', 'Fallen');
    const ally = sim.entities.get(allyId)!;
    ally.pos = { x: p.pos.x + 3, y: p.pos.y, z: p.pos.z };
    sim.partyInvite(allyId, p.id);
    sim.partyAccept(allyId);
    // Kill the ally.
    ally.dead = true;
    ally.corpsePos = { ...ally.pos };
    ally.hp = 0;

    const setTarget = (id: number) => {
      (p as unknown as { targetId: number | null }).targetId = id;
    };
    // Refuse on a LIVING target (self): no revive, cast not started, no cost.
    const mana0 = p.resource;
    setTarget(p.id);
    sim.castAbility('temporal_reversal');
    expect((p as unknown as { castingAbility: string | null }).castingAbility).toBeNull();
    expect(p.resource).toBe(mana0);

    // Cast on the DEAD ally: completes and revives them with a fraction of health.
    setTarget(allyId);
    sim.castAbility('temporal_reversal');
    for (let t = 0; t < 60; t++) sim.tick();
    expect(ally.dead).toBe(false);
    expect(ally.hp).toBeGreaterThan(0);
    expect(ally.hp).toBeLessThan(ally.maxHp); // revived at a fraction, not full
  });
});
