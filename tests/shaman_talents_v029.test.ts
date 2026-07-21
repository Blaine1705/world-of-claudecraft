import { describe, expect, it } from 'vitest';
import { iceFloesAuraForAbility } from '../src/sim/combat/empower_next';
import {
  consumeMendingCurrent,
  depositMendingCurrent,
  LIFESPRING_WEAPON_ID,
  mendingCurrent,
} from '../src/sim/combat/shaman_spiritmend';
import {
  applyPrimalExaltation,
  applyStoneward,
  FLOW_STATE_READY_ID,
  onGhostWolfEntered,
  onShamanCastCompleted,
  onShamanDamageTaken,
  onShamanManaSpent,
  onThunderWardRetaliated,
  SHAMAN_TALENT_IDS,
  shamanCastTimeMultiplier,
  shamanManaCost,
  shamanTalentSelected,
  triggerWardCycle,
} from '../src/sim/combat/shaman_talents';
import {
  addThunderCharges,
  consumeThunderVent,
  thunderCharges,
  thundercallOnArcBoltImpact,
} from '../src/sim/combat/shaman_thundercall';
import {
  advanceWarspiritCadence,
  applyWarspiritPosture,
  onStormcastConsumed,
  STONEBOUND_DR_ID,
  warspiritCadence,
} from '../src/sim/combat/shaman_warspirit';
import { ROW_LEVELS, rowForLevel } from '../src/sim/content/talents';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

function shaman(
  rows: Record<number, string> = {},
  spec: 'elemental' | 'enhancement' | 'restoration' = 'elemental',
): { sim: Sim; player: Entity; ally: Entity } {
  const sim = new Sim({ seed: 2904, playerClass: 'shaman', noPlayer: true });
  const pid = sim.addPlayer('shaman', 'Talent Shaman');
  const allyId = sim.addPlayer('warrior', 'Protected Ally');
  sim.setPlayerLevel(20, pid);
  sim.setPlayerLevel(20, allyId);
  expect(sim.applyTalents({ spec, rows }, pid)).toBe(true);
  const player = sim.entities.get(pid);
  const ally = sim.entities.get(allyId);
  if (!player || !ally) throw new Error('missing test player');
  sim.drainEvents();
  return { sim, player, ally };
}

function hostile(sim: Sim, player: Entity, id = 92_904): Entity {
  const target = createMob(id, MOBS.training_dummy, 20, {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z + 3,
  });
  target.hostile = true;
  target.hp = target.maxHp = 100_000;
  sim.entities.set(target.id, target);
  return target;
}

describe('Shaman v0.29 talent grid', () => {
  it('publishes exactly the approved six rows and eighteen choices', () => {
    const rows = ROW_LEVELS.map((level) => rowForLevel('shaman', level));
    expect(
      rows.map((row) => [row?.level, ...(row?.options.map((option) => option.name) ?? [])]),
    ).toEqual([
      [5, 'Wolfstep', 'Gathering Winds', 'Flowing Elements'],
      [8, 'Stoneward', 'Warded Elements', 'Ancestral Mending'],
      [11, 'Fault Rebuke', 'Rime Lock', 'Gripping Earth'],
      [14, 'Flow State', 'Imbue Mastery', 'Ward Cycle'],
      [17, 'Primal Exaltation', 'Wayfarer Grace', 'Ancestral Bulwark'],
      [20, 'Deep Reservoir', 'Echoing Elements', 'Living Weapon'],
    ]);
    expect(rows.flatMap((row) => row?.options ?? [])).toHaveLength(18);
  });

  it('keeps selection authoritative by row id', () => {
    const { sim, player } = shaman({ 14: SHAMAN_TALENT_IDS.imbueMastery });
    expect(shamanTalentSelected(sim.ctx, player, SHAMAN_TALENT_IDS.imbueMastery)).toBe(true);
    expect(shamanTalentSelected(sim.ctx, player, SHAMAN_TALENT_IDS.flowState)).toBe(false);
  });

  it('Stoneward owns one six-charge ally shield and heals through its ICD', () => {
    const { sim, player, ally } = shaman({ 8: SHAMAN_TALENT_IDS.stoneward });
    ally.hp = Math.round(ally.maxHp * 0.5);
    applyStoneward(sim.ctx, player, ally);
    const ward = ally.auras.find((aura) => aura.id === 'shaman_stoneward');
    expect(ward?.charges).toBe(6);
    expect(ward?.duration).toBe(60);
    const before = ally.hp;
    onShamanDamageTaken(sim.ctx, ally, 1);
    expect(ward?.charges).toBe(5);
    expect(ally.hp).toBe(before + Math.round(ally.maxHp * 0.05));
    onShamanDamageTaken(sim.ctx, ally, 1);
    expect(ward?.charges).toBe(5);
  });

  it('Primal Exaltation creates the shared twelve-second throughput window', () => {
    const { sim, player } = shaman({ 17: SHAMAN_TALENT_IDS.primalExaltation });
    applyPrimalExaltation(sim.ctx, player);
    const aura = player.auras.find((candidate) => candidate.id === 'shaman_primal_exaltation');
    expect(aura?.duration).toBe(12);
  });

  it('implements all three movement choices without a new action', () => {
    const wolf = shaman({ 5: SHAMAN_TALENT_IDS.wolfstep });
    wolf.player.auras.push({
      id: 'test_slow',
      name: 'Test Slow',
      kind: 'slow',
      value: 0.5,
      remaining: 5,
      duration: 5,
      sourceId: 999,
      school: 'frost',
    });
    onGhostWolfEntered(wolf.sim.ctx, wolf.player);
    expect(wolf.player.auras.some((aura) => aura.kind === 'slow')).toBe(false);
    expect(wolf.sim.resolvedAbility('ghost_wolf', wolf.player.id)?.castTime).toBe(0);

    const winds = shaman({ 5: SHAMAN_TALENT_IDS.gatheringWinds });
    onGhostWolfEntered(winds.sim.ctx, winds.player);
    expect(winds.player.auras.find((aura) => aura.id === 'shaman_gathering_winds')).toMatchObject({
      kind: 'buff_speed',
      value: 1.6,
      duration: 3,
    });
    expect(winds.player.auras.some((aura) => aura.id === 'shaman_gathering_winds_icd')).toBe(true);

    const flowing = shaman({ 5: SHAMAN_TALENT_IDS.flowingElements });
    onShamanCastCompleted(flowing.sim.ctx, flowing.player, 'frost_shock');
    expect(
      flowing.player.auras.find((aura) => aura.id === 'shaman_flowing_elements'),
    ).toMatchObject({
      kind: 'ice_floes',
      value: 1,
      duration: 8,
    });
  });

  it('implements reactive ward defense and Flow State accounting', () => {
    const warded = shaman({ 8: SHAMAN_TALENT_IDS.wardedElements });
    onThunderWardRetaliated(warded.sim.ctx, warded.player);
    expect(warded.player.auras.find((aura) => aura.id === 'shaman_warded_elements')).toMatchObject({
      kind: 'buff_dr',
      value: 0.1,
      duration: 3,
    });

    const flow = shaman({ 14: SHAMAN_TALENT_IDS.flowState });
    onShamanManaSpent(flow.sim.ctx, flow.player, 120);
    expect(flow.player.auras.some((aura) => aura.id === FLOW_STATE_READY_ID)).toBe(true);
    expect(shamanManaCost(flow.sim.ctx, flow.player, 65)).toBe(25);
    onShamanManaSpent(flow.sim.ctx, flow.player, 25);
    expect(flow.player.auras.some((aura) => aura.id === FLOW_STATE_READY_ID)).toBe(false);
  });

  it('spends a ready Flow State on an eligible action even when the discount makes it free', () => {
    const flow = shaman({ 14: SHAMAN_TALENT_IDS.flowState });
    onShamanManaSpent(flow.sim.ctx, flow.player, 120);
    expect(shamanManaCost(flow.sim.ctx, flow.player, 25)).toBe(0);
    onShamanManaSpent(flow.sim.ctx, flow.player, 0, true);
    expect(flow.player.auras.some((aura) => aura.id === FLOW_STATE_READY_ID)).toBe(false);
  });

  it('keeps a ready Flow State until it is spent or cleaned up', () => {
    const flow = shaman({ 14: SHAMAN_TALENT_IDS.flowState });
    onShamanManaSpent(flow.sim.ctx, flow.player, 120);
    const ready = flow.player.auras.find((aura) => aura.id === FLOW_STATE_READY_ID);
    expect(ready).toBeDefined();
    if (!ready) throw new Error('missing Flow State ready aura');
    ready.remaining = 0.01;

    flow.sim.tick();

    expect(flow.player.auras.some((aura) => aura.id === FLOW_STATE_READY_ID)).toBe(true);
  });

  it('scopes Flowing Elements movement casting to Arc Bolt and Mending Waters', () => {
    const flowing = shaman({ 5: SHAMAN_TALENT_IDS.flowingElements });
    onShamanCastCompleted(flowing.sim.ctx, flowing.player, 'frost_shock');
    expect(iceFloesAuraForAbility(flowing.player, 'lightning_bolt')).toBeDefined();
    expect(iceFloesAuraForAbility(flowing.player, 'healing_wave')).toBeDefined();
    expect(iceFloesAuraForAbility(flowing.player, 'chain_heal')).toBeUndefined();
  });

  it('Ward Cycle restores the canonical defensive ward and mana behind one ICD', () => {
    const { sim, player } = shaman({ 14: SHAMAN_TALENT_IDS.wardCycle });
    player.resource = player.maxResource - 20;
    player.auras.push({
      id: 'lightning_shield',
      name: 'Thunder Ward',
      kind: 'thorns',
      value: 29,
      charges: 1,
      remaining: 600,
      duration: 600,
      sourceId: player.id,
      school: 'nature',
    });
    triggerWardCycle(sim.ctx, player);
    expect(player.resource).toBe(player.maxResource - 10);
    expect(player.auras.find((aura) => aura.id === 'lightning_shield')?.charges).toBe(2);
    triggerWardCycle(sim.ctx, player);
    expect(player.resource).toBe(player.maxResource - 10);
  });

  it('Imbue Mastery strengthens the selected specialization weapon', () => {
    const thunder = shaman({ 14: SHAMAN_TALENT_IDS.imbueMastery });
    thunder.player.auras.push({
      id: 'flametongue_weapon',
      name: 'Pyrebrand Weapon',
      kind: 'imbue',
      value: 8,
      remaining: 300,
      duration: 300,
      sourceId: thunder.player.id,
      school: 'fire',
    });
    for (let count = 0; count < 3; count++) {
      thundercallOnArcBoltImpact(thunder.sim.ctx, thunder.player);
    }
    expect(thunderCharges(thunder.player)).toBe(4);

    const stone = shaman({ 14: SHAMAN_TALENT_IDS.imbueMastery }, 'enhancement');
    applyWarspiritPosture(stone.sim.ctx, stone.player, 'stonebound');
    expect(stone.player.auras.find((aura) => aura.id === STONEBOUND_DR_ID)?.value).toBeCloseTo(
      0.15,
    );

    const spirit = shaman({ 14: SHAMAN_TALENT_IDS.imbueMastery }, 'restoration');
    spirit.player.auras.push({
      id: LIFESPRING_WEAPON_ID,
      name: 'Lifespring Weapon',
      kind: 'imbue',
      value: 0,
      remaining: 300,
      duration: 300,
      sourceId: spirit.player.id,
      school: 'nature',
    });
    expect(
      depositMendingCurrent(spirit.sim.ctx, spirit.player, spirit.ally, 100, 'healing_wave'),
    ).toBe(70);
  });

  it('Primal Exaltation accelerates each specialization engine', () => {
    const thunder = shaman({ 17: SHAMAN_TALENT_IDS.primalExaltation });
    applyPrimalExaltation(thunder.sim.ctx, thunder.player);
    expect(shamanCastTimeMultiplier(thunder.player, 'lightning_bolt')).toBe(0.5);
    thundercallOnArcBoltImpact(thunder.sim.ctx, thunder.player);
    expect(thunderCharges(thunder.player)).toBe(2);

    const war = shaman({ 17: SHAMAN_TALENT_IDS.primalExaltation }, 'enhancement');
    const target = hostile(war.sim, war.player);
    applyWarspiritPosture(war.sim.ctx, war.player, 'galeheart');
    applyPrimalExaltation(war.sim.ctx, war.player);
    advanceWarspiritCadence(war.sim.ctx, war.player, target, 100);
    expect(warspiritCadence(war.player)).toBe(1);
    expect(advanceWarspiritCadence(war.sim.ctx, war.player, target, 100)).toBe(true);

    const spirit = shaman({ 17: SHAMAN_TALENT_IDS.primalExaltation }, 'restoration');
    applyPrimalExaltation(spirit.sim.ctx, spirit.player);
    expect(
      depositMendingCurrent(spirit.sim.ctx, spirit.player, spirit.ally, 100, 'healing_wave'),
    ).toBe(75);
  });

  it('Deep Reservoir retains each specialization rebuild state', () => {
    const thunder = shaman({ 20: SHAMAN_TALENT_IDS.deepReservoir });
    addThunderCharges(thunder.sim.ctx, thunder.player, 5);
    consumeThunderVent(thunder.sim.ctx, thunder.player, 'earth_shock');
    expect(thunderCharges(thunder.player)).toBe(2);

    const war = shaman({ 20: SHAMAN_TALENT_IDS.deepReservoir }, 'enhancement');
    applyWarspiritPosture(war.sim.ctx, war.player, 'galeheart');
    onStormcastConsumed(war.sim.ctx, war.player);
    expect(warspiritCadence(war.player)).toBe(1);

    const spirit = shaman({ 20: SHAMAN_TALENT_IDS.deepReservoir }, 'restoration');
    depositMendingCurrent(spirit.sim.ctx, spirit.player, spirit.ally, 200, 'tidecall');
    consumeMendingCurrent(spirit.sim.ctx, spirit.player, spirit.ally);
    expect(mendingCurrent(spirit.ally, spirit.player.id)?.value).toBe(50);
  });

  it('Echoing Elements and Living Weapon arm nonrecursive specialization payoffs', () => {
    const echo = shaman({ 20: SHAMAN_TALENT_IDS.echoingElements });
    const target = hostile(echo.sim, echo.player);
    addThunderCharges(echo.sim.ctx, echo.player, 5);
    consumeThunderVent(echo.sim.ctx, echo.player, 'earth_shock', target, 500);
    expect(target.auras.find((aura) => aura.id === 'shaman_echoing_elements_damage')).toMatchObject(
      {
        kind: 'dot',
        value: 200,
        tickTimer: 1,
      },
    );

    const faultwake = shaman({ 20: SHAMAN_TALENT_IDS.echoingElements });
    faultwake.player.resource = faultwake.player.maxResource;
    addThunderCharges(faultwake.sim.ctx, faultwake.player, 5);
    faultwake.sim.castAbility('earthquake', faultwake.player.id, {
      x: faultwake.player.pos.x,
      z: faultwake.player.pos.z + 3,
    });
    expect(
      faultwake.sim.ctx.groundAoEs.find((effect) => effect.ability === 'Echoing Elements'),
    ).toMatchObject({ tickTimer: 1, interval: 1.5 });
    expect(thunderCharges(faultwake.player)).toBe(0);

    const living = shaman({ 20: SHAMAN_TALENT_IDS.livingWeapon });
    living.player.auras.push({
      id: 'flametongue_weapon',
      name: 'Pyrebrand Weapon',
      kind: 'imbue',
      value: 8,
      remaining: 300,
      duration: 300,
      sourceId: living.player.id,
      school: 'fire',
    });
    addThunderCharges(living.sim.ctx, living.player, 5);
    consumeThunderVent(living.sim.ctx, living.player, 'earth_shock');
    expect(
      living.player.auras.find((aura) => aura.id === 'shaman_living_weapon_bolt'),
    ).toMatchObject({
      kind: 'next_cast_instant',
      empowerAbilities: ['lightning_bolt'],
    });

    const stone = shaman({ 20: SHAMAN_TALENT_IDS.livingWeapon }, 'enhancement');
    applyWarspiritPosture(stone.sim.ctx, stone.player, 'stonebound');
    onStormcastConsumed(stone.sim.ctx, stone.player);
    expect(
      stone.player.auras.find((aura) => aura.id === 'shaman_living_weapon_absorb')?.value,
    ).toBe(Math.round(stone.player.maxHp * 0.08));
  });

  it('Living Weapon Lifespring seeds one nearby injured ally from Tidecall', () => {
    const { sim, player, ally } = shaman({ 20: SHAMAN_TALENT_IDS.livingWeapon }, 'restoration');
    const secondId = sim.addPlayer('warrior', 'Nearby Injured');
    sim.setPlayerLevel(20, secondId);
    const second = sim.entities.get(secondId);
    if (!second) throw new Error('missing nearby ally');
    ally.hp = ally.maxHp;
    second.hp = Math.round(second.maxHp * 0.5);
    player.auras.push({
      id: LIFESPRING_WEAPON_ID,
      name: 'Lifespring Weapon',
      kind: 'imbue',
      value: 0,
      remaining: 300,
      duration: 300,
      sourceId: player.id,
      school: 'nature',
    });
    depositMendingCurrent(sim.ctx, player, ally, 100, 'tidecall');
    expect(mendingCurrent(second, player.id)?.value).toBe(50);
  });
});
