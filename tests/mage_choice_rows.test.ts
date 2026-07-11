// The owner's mage choice-row tree (bilingual Artifact calculator, 2026-07-11),
// which replaced the first-draft rows wholesale: one decisive test per working
// option, plus the coming-soon placeholders staying pickable. Follows the
// choice_rows_wave2 harness idiom (a real Sim, applyTalents with a rows map).

import { describe, expect, it } from 'vitest';
import { MAGE_CHOICE_ROWS } from '../src/sim/content/choice_rows_classic';
import { abilitiesKnownAt } from '../src/sim/content/classes';
import { rowTreeFor } from '../src/sim/content/talent_rows';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

function rig(rows: Record<number, string>, level = 20) {
  const sim = new Sim({ seed: 17, playerClass: 'mage', autoEquip: true });
  sim.setPlayerLevel(level);
  expect(sim.applyTalents({ spec: null, rows })).toBe(true);
  const p = sim.player;
  p.resource = p.maxResource;
  return { sim, p };
}

function addTargetMob(sim: Sim, hp = 100000, dist = 10): Entity {
  const p = sim.player;
  // Stationary target: the harness wolf wanders (known gotcha); the dummy sits.
  const mob = createMob(9300, MOBS.training_dummy, 20, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + dist,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = hp;
  (sim as unknown as { addEntity(e: Entity): void }).addEntity(mob);
  sim.targetEntity(mob.id);
  p.facing = 0;
  return mob;
}

function tickFor(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 20); i++) sim.tick();
}

describe('mage base kit', () => {
  it('Flickerstep (blink) is a BASE ability at level 5, no row pick needed', () => {
    const ids = abilitiesKnownAt('mage', 5).map((k) => k.def.id);
    expect(ids).toContain('blink');
  });
});

describe('mage choice rows (owner tree)', () => {
  it('Ice Floes banks two protected casts; completing a hard cast spends one', () => {
    const { sim, p } = rig({ 5: 'mag_r5_ice_floes' });
    addTargetMob(sim);
    sim.castAbility('ice_floes');
    const floes = () => p.auras.find((a) => a.kind === 'ice_floes');
    expect(floes()?.value).toBe(2);
    sim.castAbility('fireball');
    tickFor(sim, 4); // the fireball hard cast completes
    expect(floes()?.value).toBe(1);
  });

  it('Double Blink banks 2 back-to-back uses on a 30% slower recharge', () => {
    const { sim, p } = rig({ 5: 'mag_r5_double_blink' });
    const res = (
      sim as unknown as {
        resolvedAbility(id: string, pid: number): { cooldown: number; charges?: number };
      }
    ).resolvedAbility('blink', p.id);
    expect(res.charges).toBe(2);
    expect(res.cooldown).toBeCloseTo(15 * 1.3, 5); // 30% slower recharge
    const full = p.resource;
    sim.castAbility('blink');
    (p as { gcdRemaining: number }).gcdRemaining = 0;
    sim.castAbility('blink'); // the banked second charge fires back to back
    expect(p.resource).toBe(full - 80); // both 40-mana blinks actually cast
    (p as { gcdRemaining: number }).gcdRemaining = 0;
    sim.castAbility('blink'); // no third charge: nothing is spent
    expect(p.resource).toBe(full - 80);
  });

  it('Warded cuts damage 15% while Frostveil is up and heals 39 when it breaks', () => {
    const { sim, p } = rig({ 8: 'mag_r8_warded' });
    const mob = addTargetMob(sim);
    sim.castAbility('ice_barrier'); // 130 absorb
    const deal = (n: number) =>
      (
        sim as unknown as {
          dealDamage(
            s: Entity,
            t: Entity,
            n: number,
            c: boolean,
            sc: string,
            a: string | null,
            k: string,
          ): void;
        }
      ).dealDamage(mob, p, n, false, 'physical', null, 'hit');
    p.hp -= 100; // the break heal resolves before the landing hit: leave room
    const hp0 = p.hp;
    deal(100); // cut to 85, fully soaked (barrier 130 -> 45)
    expect(p.hp).toBe(hp0);
    deal(100); // cut to 85, 45 soaked, the break heals 39, then 40 lands
    expect(p.hp).toBe(hp0 + 39 - 40);
    expect(p.auras.some((a) => a.id === 'ice_barrier' && a.kind === 'absorb')).toBe(false);
  });

  it('Temporal Rift cleanses the next stun instantly, then cools down 20 sec', () => {
    const { sim, p } = rig({ 8: 'mag_r8_temporal_rift' });
    const mob = addTargetMob(sim);
    const applyStun = () =>
      (sim as unknown as { applyAura(t: Entity, a: object): void }).applyAura(p, {
        id: 'test_stun',
        name: 'Test Stun',
        kind: 'stun',
        value: 0,
        remaining: 3,
        duration: 3,
        sourceId: mob.id,
        school: 'physical',
      });
    applyStun();
    expect(p.auras.some((a) => a.kind === 'stun')).toBe(false); // cleansed
    expect(p.auras.some((a) => a.id === 'temporal_rift_cd')).toBe(true);
    applyStun();
    expect(p.auras.some((a) => a.kind === 'stun')).toBe(true); // ICD running
  });

  it('Greater Invisibility strips 2 DoTs, vanishes, and cuts damage 90%', () => {
    const { sim, p } = rig({ 8: 'mag_r8_greater_invis' });
    const mob = addTargetMob(sim);
    for (const id of ['dot_a', 'dot_b', 'dot_c']) {
      (sim as unknown as { applyAura(t: Entity, a: object): void }).applyAura(p, {
        id,
        name: id,
        kind: 'dot',
        value: 5,
        remaining: 10,
        duration: 10,
        sourceId: mob.id,
        school: 'shadow',
      });
    }
    sim.castAbility('greater_invisibility');
    expect(p.auras.filter((a) => a.kind === 'dot')).toHaveLength(1); // 2 removed
    expect(p.stealthed).toBe(true);
    const dr = p.auras.find((a) => a.id === 'greater_invisibility_dr');
    expect(dr?.kind).toBe('buff_dr');
    expect(dr?.value).toBeCloseTo(0.9);
    expect(dr?.duration).toBeCloseTo(23); // 20s vanish + 3s linger
  });

  it('Ring of Frost roots enemies at the aimed point after its cast, with 2 charges', () => {
    const { sim, p } = rig({ 11: 'mag_r11_rings_of_frost' });
    const mob = addTargetMob(sim, 100000, 15);
    sim.castAbilityAt('rings_of_frost', { x: mob.pos.x, z: mob.pos.z });
    tickFor(sim, 2); // the 1.5s cast is the arming delay
    expect(mob.auras.some((a) => a.kind === 'root')).toBe(true);
    const res = (
      sim as unknown as { resolvedAbility(id: string, pid: number): { charges?: number } }
    ).resolvedAbility('rings_of_frost', p.id);
    expect(res.charges).toBe(2);
  });

  it('Snap Polymorph makes Bewitch instant on a real 20 sec cooldown', () => {
    const { sim, p } = rig({ 11: 'mag_r11_snap_polymorph' });
    const mob = addTargetMob(sim, 100000, 8);
    sim.castAbility('polymorph');
    // Instant: no cast bar, and the traded-in cooldown arms at once; the bolt
    // is a projectile, so the sheep lands when it arrives a few ticks later.
    expect(p.castingAbility).toBeNull();
    expect(p.cooldowns.get('polymorph')).toBe(20);
    tickFor(sim, 1.5);
    expect(mob.auras.some((a) => a.kind === 'polymorph')).toBe(true);
  });

  it('Twin Frost Nova stores 2 independent charges', () => {
    const { sim, p } = rig({ 11: 'mag_r11_twin_nova' });
    const res = (
      sim as unknown as {
        resolvedAbility(id: string, pid: number): { charges?: number; cost: number };
      }
    ).resolvedAbility('frost_nova', p.id);
    expect(res.charges).toBe(2);
    addTargetMob(sim, 100000, 3);
    const full = p.resource;
    sim.castAbility('frost_nova');
    (p as { gcdRemaining: number }).gcdRemaining = 0;
    sim.castAbility('frost_nova'); // the banked second charge fires back to back
    expect(p.resource).toBe(full - res.cost * 2);
  });

  it('Racing Mind is granted and arms the next-cast-instant window', () => {
    const { sim, p } = rig({ 14: 'mag_r14_presence_of_mind' });
    sim.castAbility('presence_of_mind');
    expect(p.auras.some((a) => a.kind === 'next_cast_instant')).toBe(true);
  });

  it('Cold Snap finishes the cooldowns of Flickerstep, Frostveil and Greater Invisibility', () => {
    const { sim, p } = rig({ 8: 'mag_r8_greater_invis', 17: 'mag_r17_cold_snap' });
    p.cooldowns.set('blink', 12);
    p.cooldowns.set('ice_barrier', 25);
    p.cooldowns.set('greater_invisibility', 100);
    sim.castAbility('cold_snap');
    expect(p.cooldowns.has('blink')).toBe(false);
    expect(p.cooldowns.has('ice_barrier')).toBe(false);
    expect(p.cooldowns.has('greater_invisibility')).toBe(false);
  });

  it('Mass Barrier shields the caster (and any nearby allies) for 130', () => {
    const { sim, p } = rig({ 17: 'mag_r17_mass_barrier' });
    sim.castAbility('mass_barrier');
    const shield = p.auras.find((a) => a.id === 'mass_barrier');
    expect(shield?.kind).toBe('absorb');
    expect(shield?.value).toBe(130);
  });

  it('Overflowing Power shaves defensive cooldowns as mana is spent, capped by the window', () => {
    const { sim, p } = rig({ 20: 'mag_r20_overflowing_power' });
    addTargetMob(sim, 100000, 3);
    p.cooldowns.set('blink', 15);
    const before = p.resource;
    sim.castAbility('arcane_explosion'); // instant mana spender
    const spent = before - p.resource;
    expect(spent).toBeGreaterThan(0);
    const shave = (spent / p.maxResource) * 10 * 2;
    expect(p.cooldowns.get('blink')).toBeCloseTo(15 - shave, 5);
    const cap = p.auras.find((a) => a.id === 'overflowing_power_cap');
    expect(cap?.value).toBeCloseTo(shave, 5);
  });

  it('Aetherwell (Evocation) is granted and restores mana', () => {
    const { sim, p } = rig({ 20: 'mag_r20_evocation' });
    p.resource = 10;
    sim.castAbility('evocation');
    tickFor(sim, 4);
    expect(p.resource).toBeGreaterThan(10);
  });

  it('the five coming-soon options are pickable and inert', () => {
    for (const [level, id] of [
      [5, 'mag_r5_blink_cast'],
      [14, 'mag_r14_power_echo'],
      [14, 'mag_r14_overload'],
      [17, 'mag_r17_convergence'],
      [20, 'mag_r20_rune_of_power'],
    ] as const) {
      const { sim } = rig({ [level]: id });
      expect(sim.player.dead).toBe(false); // picked, booted, and inert
    }
  });
});

describe('the talents-window registry mirror', () => {
  it('ROW_TREES.mage stays in lockstep with MAGE_CHOICE_ROWS (id, name, level)', () => {
    const mirror = rowTreeFor('mage');
    expect(mirror).not.toBeNull();
    expect(mirror).toHaveLength(MAGE_CHOICE_ROWS.rows.length);
    MAGE_CHOICE_ROWS.rows.forEach((row, i) => {
      expect(mirror?.[i].level).toBe(row.level);
      expect(mirror?.[i].options.map((o) => o.id)).toEqual(row.options.map((o) => o.id));
      expect(mirror?.[i].options.map((o) => o.name)).toEqual(row.options.map((o) => o.name));
    });
  });

  it('the window flow works: a mage pickRowTalent pick applies its effect live', () => {
    const sim = new Sim({ seed: 17, playerClass: 'mage', autoEquip: true });
    sim.setPlayerLevel(20);
    expect(sim.setSpec('frost')).toBe(true);
    const p = sim.player;
    // Row index 1 = the level-8 survival row; the pick flows through the same
    // pickChoiceRowTalent path the talents window's Choices tab drives.
    expect(sim.pickRowTalent(1, 'mag_r8_temporal_rift')).toBe(true);
    (sim as unknown as { applyAura(t: Entity, a: object): void }).applyAura(p, {
      id: 'test_stun',
      name: 'Test Stun',
      kind: 'stun',
      value: 0,
      remaining: 3,
      duration: 3,
      sourceId: 424242,
      school: 'physical',
    });
    expect(p.auras.some((a) => a.kind === 'stun')).toBe(false); // cleansed
    expect(p.auras.some((a) => a.id === 'temporal_rift_cd')).toBe(true);
  });
});
