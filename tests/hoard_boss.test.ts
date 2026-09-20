import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { runMobSwingAffixes } from '../src/sim/mob/mob_swing';
import {
  HOARD_BONE_WAVE_COUNT,
  HOARD_BROOD_EGG_COUNT,
  HOARD_BROOD_HATCH_HP,
  HOARD_MARK_ENRAGED_EVERY_SEC,
  HOARD_MARK_ENRAGED_WINDUP_SEC,
  HOARD_MARK_EVERY_SEC,
  HOARD_MARK_HAZARD_SEC,
  HOARD_MARK_HAZARD_TICK_SEC,
  HOARD_MARK_WINDUP_SEC,
  HOARD_SWEEP_ENRAGED_WINDUP_SEC,
  HOARD_SWEEP_HALF_ANGLE,
  HOARD_SWEEP_METEOR_COUNT,
  HOARD_SWEEP_RANGE,
  HOARD_SWEEP_WINDUP_SEC,
  HOARD_TOTEM_HEAL_FRACTION,
  HOARD_TOTEM_TRIGGER_HP,
  hoardBossKit,
  hoardMarkTargetCount,
  hoardMarkTargets,
  hoardSweepMeteorPoints,
  nextHoardBossMechanic,
  pointInHoardSweep,
  tickHoardBossMechanics,
} from '../src/sim/rift/hoard_boss';
import {
  HOARD_BRUTE_COMBO,
  HOARD_FROST_GUST,
  HOARD_TIDE_WAVE,
  hoardMarkSpec,
} from '../src/sim/rift/hoard_boss_kits';
import { riftStateEventFor } from '../src/sim/rift/runs';
import type { HoardBossState, RiftInstance } from '../src/sim/rift/types';
import { makeVaultSeed } from '../src/sim/rift/vault_seed';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type SimEvent } from '../src/sim/types';

function makeEncounter(templateId = 'rift_boss_ember'): {
  sim: Sim;
  inst: RiftInstance;
  boss: Entity;
} {
  const sim = new Sim({
    seed: 9321,
    playerClass: 'warrior',
    autoEquip: false,
    devCommands: true,
  });
  sim.chat('/dev level 20', sim.player.id);
  sim.drainEvents();
  const portal = {
    ...sim.player,
    id: -1,
    vaultOwnerPid: sim.player.id,
    vaultRarity: 'legendary' as const,
  };
  sim.enterRift(makeVaultSeed(3, 183), 23, sim.player.id, undefined, portal);
  const inst = sim.riftInstances.find((candidate) => candidate.partyKey !== null);
  if (!inst || inst.bossId === null) throw new Error('missing Hoard instance boss');
  const boss = sim.entities.get(inst.bossId);
  if (!boss) throw new Error('missing Hoard boss entity');
  boss.templateId = templateId;
  boss.aiState = 'attack';
  boss.inCombat = true;
  boss.targetId = sim.player.id;
  boss.aggroTargetId = sim.player.id;
  boss.facing = 0;
  sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z + 5 };
  sim.drainEvents();
  return { sim, inst, boss };
}

function hoardState(inst: RiftInstance): HoardBossState {
  if (!inst.hoardBoss) throw new Error('missing Hoard boss state');
  return inst.hoardBoss;
}

function tickMechanic(sim: Sim, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let elapsed = 0; elapsed < seconds + DT * 0.5; elapsed += DT) {
    tickHoardBossMechanics(sim.ctx);
    events.push(...sim.drainEvents());
  }
  return events;
}

describe('Buried Hoard boss pure decisions', () => {
  it('assigns one deterministic kit to every Hoard boss', () => {
    expect(hoardBossKit('rift_boss_frost')).toBe('frost');
    expect(hoardBossKit('rift_boss_ember')).toBe('ember');
    expect(hoardBossKit('rift_boss_necro')).toBe('bone-legion');
    expect(hoardBossKit('rift_boss_venom')).toBe('brood');
    expect(hoardBossKit('rift_boss_brute')).toBe('brute');
    expect(hoardBossKit('rift_boss_arcane')).toBe('arcane');
    expect(hoardBossKit('rift_boss_storm')).toBe('storm');
    expect(hoardBossKit('rift_boss_tide')).toBe('tide');
  });

  it('scales marks with living party size and rotates targets without rng', () => {
    expect([1, 2, 3, 4, 5].map(hoardMarkTargetCount)).toEqual([1, 1, 2, 2, 3]);
    expect(hoardMarkTargets([10, 20, 30, 40, 50], 0)).toEqual({
      ids: [10, 20, 30],
      nextCursor: 3,
    });
    expect(hoardMarkTargets([10, 20, 30, 40, 50], 3)).toEqual({
      ids: [40, 50, 10],
      nextCursor: 1,
    });
  });

  it('uses the oldest due mechanic and a snapshotted frontal sector', () => {
    expect(nextHoardBossMechanic(1, 2)).toBeNull();
    expect(nextHoardBossMechanic(-0.4, -0.1)).toBe('sweep');
    expect(nextHoardBossMechanic(-0.1, -0.4)).toBe('mark');
    expect(pointInHoardSweep({ x: 0, z: 0 }, 0, { x: 0, z: 8 })).toBe(true);
    expect(pointInHoardSweep({ x: 0, z: 0 }, 0, { x: 0, z: -2 })).toBe(false);
    expect(pointInHoardSweep({ x: 0, z: 0 }, 0, { x: HOARD_SWEEP_RANGE + 1, z: 0 })).toBe(false);
    expect(HOARD_SWEEP_HALF_ANGLE).toBeLessThan(Math.PI / 2);
  });

  it('places the reused meteor falls deterministically inside the frontal', () => {
    const cue = {
      x: 12,
      z: -8,
      facing: 0.7,
      radius: HOARD_SWEEP_RANGE,
      halfAngle: HOARD_SWEEP_HALF_ANGLE,
    };
    const first = hoardSweepMeteorPoints(cue);
    expect(first).toHaveLength(HOARD_SWEEP_METEOR_COUNT);
    expect(hoardSweepMeteorPoints(cue)).toEqual(first);
    for (const point of first) expect(pointInHoardSweep(cue, cue.facing, point)).toBe(true);
  });
});

describe('Buried Hoard boss encounter', () => {
  it('replaces the skeleton frontal with two necromancy portal waves', () => {
    const { sim, inst, boss } = makeEncounter();
    boss.templateId = 'rift_boss_necro';
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).sweepTimer = 0;
    hoardState(inst).markTimer = 99;
    boss.hp = Math.floor(boss.maxHp * 0.69);
    tickHoardBossMechanics(sim.ctx);
    let events = sim.drainEvents();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'spellfxAt',
        ability: 'Hoard Bone Legion',
        fx: 'burst',
        sourceId: boss.id,
      }),
    );
    expect(events.some((event) => event.type === 'hoardBossCue' && event.kind === 'sweep')).toBe(
      false,
    );
    expect(
      boss.summonedIds.filter((id) => sim.entities.get(id)?.templateId === 'rift_bonewalker'),
    ).toHaveLength(HOARD_BONE_WAVE_COUNT);

    boss.hp = Math.floor(boss.maxHp * 0.34);
    tickHoardBossMechanics(sim.ctx);
    events = sim.drainEvents();
    expect(
      events.filter((event) => event.type === 'spellfxAt' && event.ability === 'Hoard Bone Legion'),
    ).toHaveLength(1);
    expect(
      boss.summonedIds.filter((id) => sim.entities.get(id)?.templateId === 'rift_bonewalker'),
    ).toHaveLength(HOARD_BONE_WAVE_COUNT * 2);
  });

  it('surrounds the spider with eggs that hatch once at half health', () => {
    const { sim, inst, boss } = makeEncounter();
    boss.templateId = 'rift_boss_venom';
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    const eggIds = boss.summonedIds.filter(
      (id) => sim.entities.get(id)?.templateId === 'spider_egg_sac',
    );
    expect(eggIds).toHaveLength(HOARD_BROOD_EGG_COUNT);
    for (const [index, id] of eggIds.entries()) {
      const egg = sim.entities.get(id);
      expect(egg?.damageImmune).toBe(true);
      expect(
        Math.hypot((egg?.pos.x ?? 0) - boss.spawnPos.x, (egg?.pos.z ?? 0) - boss.spawnPos.z),
      ).toBeCloseTo(index % 2 === 0 ? 5.2 : 6.1, 4);
    }
    expect(MOBS.rift_boss_venom.stackPoison).toBeDefined();
    expect(MOBS.rift_boss_venom.ensnare).toBeDefined();
    expect(HOARD_BROOD_HATCH_HP).toBe(0.5);

    hoardState(inst).sweepTimer = 0;
    hoardState(inst).markTimer = 99;
    boss.hp = Math.floor(boss.maxHp * 0.5) + 1;
    tickHoardBossMechanics(sim.ctx);
    expect(eggIds.every((id) => sim.entities.has(id))).toBe(true);
    expect(
      boss.summonedIds.filter((id) => sim.entities.get(id)?.templateId === 'rift_spawnling'),
    ).toHaveLength(0);

    boss.hp = Math.floor(boss.maxHp * 0.5);
    tickHoardBossMechanics(sim.ctx);
    const events = sim.drainEvents();
    expect(events.some((event) => event.type === 'hoardBossCue' && event.kind === 'sweep')).toBe(
      false,
    );
    for (const id of eggIds) expect(sim.entities.has(id)).toBe(false);
    expect(
      boss.summonedIds.filter((id) => sim.entities.get(id)?.templateId === 'rift_spawnling'),
    ).toHaveLength(HOARD_BROOD_EGG_COUNT);

    tickHoardBossMechanics(sim.ctx);
    expect(
      boss.summonedIds.filter((id) => sim.entities.get(id)?.templateId === 'rift_spawnling'),
    ).toHaveLength(HOARD_BROOD_EGG_COUNT);
  });

  it('removes unhatched eggs without spawning adds when a lethal hit skips the threshold', () => {
    const { sim, boss } = makeEncounter();
    boss.templateId = 'rift_boss_venom';
    tickHoardBossMechanics(sim.ctx);
    const eggIds = boss.summonedIds.filter(
      (id) => sim.entities.get(id)?.templateId === 'spider_egg_sac',
    );
    expect(eggIds).toHaveLength(4);
    boss.hp = 0;
    boss.dead = true;
    tickHoardBossMechanics(sim.ctx);
    expect(eggIds.every((id) => !sim.entities.has(id))).toBe(true);
    expect(
      boss.summonedIds.some((id) => sim.entities.get(id)?.templateId === 'rift_spawnling'),
    ).toBe(false);
  });

  it('applies the spider poison and root through the live mob affix path', () => {
    const { sim, boss } = makeEncounter();
    boss.templateId = 'rift_boss_venom';
    const originalChance = sim.ctx.rng.chance;
    sim.ctx.rng.chance = () => true;
    try {
      runMobSwingAffixes(sim.ctx, boss, sim.player, { dealt: 1, crit: false, rawDmg: 1 });
    } finally {
      sim.ctx.rng.chance = originalChance;
    }
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({
        id: 'stackpoison_rift_boss_venom',
        name: 'Deadly Venom',
        kind: 'dot',
        stacks: 1,
        school: 'nature',
      }),
    );
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({
        id: 'ensnare_rift_boss_venom',
        name: 'Web',
        kind: 'root',
        school: 'nature',
      }),
    );
  });

  it('regenerates the same skeleton and spider summon traces from the same seed', () => {
    const trace = (templateId: 'rift_boss_necro' | 'rift_boss_venom'): unknown => {
      const { sim, boss } = makeEncounter();
      boss.templateId = templateId;
      tickHoardBossMechanics(sim.ctx);
      sim.drainEvents();
      boss.hp = Math.floor(boss.maxHp * (templateId === 'rift_boss_necro' ? 0.34 : 0.5));
      tickHoardBossMechanics(sim.ctx);
      return {
        firedSummons: boss.firedSummons,
        summons: boss.summonedIds.map((id) => {
          const summon = sim.entities.get(id);
          return summon && { templateId: summon.templateId, pos: summon.pos };
        }),
        effects: sim
          .drainEvents()
          .filter((event) => event.type === 'spellfxAt')
          .map(({ type, ...event }) => event),
      };
    };
    expect(trace('rift_boss_necro')).toEqual(trace('rift_boss_necro'));
    expect(trace('rift_boss_venom')).toEqual(trace('rift_boss_venom'));
  });

  it('telegraphs a frontal sweep, then damages only the snapshotted cone', () => {
    const { sim, inst, boss } = makeEncounter();
    expect(boss.riftMechanicLimit).toBe(0);
    const hpBefore = sim.player.hp;
    const warningEvents = tickMechanic(sim, 3.6);
    const warning = warningEvents.find(
      (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
        event.type === 'hoardBossCue' && event.kind === 'sweep',
    );
    expect(warning).toMatchObject({
      kind: 'sweep',
      phase: 'warning',
      radius: HOARD_SWEEP_RANGE,
      durationSecs: HOARD_SWEEP_WINDUP_SEC,
    });
    expect(
      warningEvents.filter((event) => event.type === 'spellfxAt' && event.fx === 'meteorFall'),
    ).toHaveLength(HOARD_SWEEP_METEOR_COUNT);
    expect(inst.hoardBoss?.cues).toHaveLength(1);
    const impactEvents = tickMechanic(sim, HOARD_SWEEP_WINDUP_SEC);
    expect(sim.player.hp).toBe(hpBefore - Math.round(sim.player.maxHp * 0.24));
    expect(
      impactEvents.filter((event) => event.type === 'spellfxAt' && event.fx === 'meteorImpact'),
    ).toHaveLength(HOARD_SWEEP_METEOR_COUNT);
    expect(inst.hoardBoss?.cues).toHaveLength(0);
  });

  it('snapshots the mark, leaves a short hazard, and lets a player dodge both hits', () => {
    const { sim, inst } = makeEncounter();
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).sweepTimer = 99;
    hoardState(inst).markTimer = 0;
    tickHoardBossMechanics(sim.ctx);
    const warning = sim
      .drainEvents()
      .find(
        (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
          event.type === 'hoardBossCue' && event.kind === 'mark',
      );
    expect(warning?.durationSecs).toBe(HOARD_MARK_WINDUP_SEC);
    const hpBefore = sim.player.hp;
    sim.player.pos.x += 10;
    const detonation = tickMechanic(sim, HOARD_MARK_WINDUP_SEC);
    expect(sim.player.hp).toBe(hpBefore);
    expect(detonation).toContainEqual(
      expect.objectContaining({
        type: 'hoardBossCue',
        cueId: warning?.cueId,
        kind: 'mark',
        phase: 'hazard',
        durationSecs: HOARD_MARK_HAZARD_SEC,
      }),
    );
    tickMechanic(sim, HOARD_MARK_HAZARD_SEC);
    expect(sim.player.hp).toBe(hpBefore);
    expect(inst.hoardBoss?.cues).toHaveLength(0);
  });

  it('damages the mark center on detonation and pulses while the hazard remains', () => {
    const { sim, inst } = makeEncounter();
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).sweepTimer = 99;
    hoardState(inst).markTimer = 0;
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    const marked = { ...sim.player.pos };
    const hpBefore = sim.player.hp;
    tickMechanic(sim, HOARD_MARK_WINDUP_SEC);
    expect(sim.player.hp).toBe(hpBefore - Math.round(sim.player.maxHp * 0.18));
    sim.player.pos.x += 10;
    tickMechanic(sim, HOARD_MARK_HAZARD_TICK_SEC * 0.5);
    sim.player.pos = marked;
    const beforePulse = sim.player.hp;
    tickMechanic(sim, HOARD_MARK_HAZARD_TICK_SEC);
    expect(sim.player.hp).toBe(beforePulse - Math.round(sim.player.maxHp * 0.03));
    sim.player.pos.x += 10;
    const afterLeaving = sim.player.hp;
    tickMechanic(sim, HOARD_MARK_HAZARD_SEC);
    expect(sim.player.hp).toBe(afterLeaving);
  });

  it('emits three personal marks for a live five-player group', () => {
    const { sim, inst, boss } = makeEncounter();
    for (let index = 0; index < 4; index++) {
      const pid = sim.addPlayer('warrior', `Hoard Ally ${index}`);
      const player = sim.entities.get(pid);
      if (!player) throw new Error('missing hoard ally');
      player.pos = { x: boss.pos.x + index + 1, y: boss.pos.y, z: boss.pos.z + 4 };
      inst.memberIds.add(pid);
    }
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).sweepTimer = 99;
    hoardState(inst).markTimer = 0;
    tickHoardBossMechanics(sim.ctx);
    const marks = sim
      .drainEvents()
      .filter(
        (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
          event.type === 'hoardBossCue' && event.kind === 'mark',
      );
    expect(marks).toHaveLength(15);
    expect(new Set(marks.map((event) => event.pid)).size).toBe(5);
    expect(new Set(marks.map((event) => event.cueId)).size).toBe(3);
    expect(inst.hoardBoss?.cues).toHaveLength(3);
  });

  it('speeds up marks below 30 percent and clears cues when combat resets', () => {
    const { sim, inst, boss } = makeEncounter();
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    boss.hp = Math.floor(boss.maxHp * 0.29);
    hoardState(inst).sweepTimer = 99;
    hoardState(inst).markTimer = 0;
    tickHoardBossMechanics(sim.ctx);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'hoardBossCue',
        kind: 'mark',
        durationSecs: HOARD_MARK_ENRAGED_WINDUP_SEC,
      }),
    );
    boss.aiState = 'idle';
    tickHoardBossMechanics(sim.ctx);
    expect(inst.hoardBoss).toBeUndefined();
    expect(sim.drainEvents()).toContainEqual({
      type: 'hoardBossCueClear',
      pid: sim.player.id,
    });
  });

  it('keeps two seconds of frontal reaction time during the final phase', () => {
    const { sim, inst, boss } = makeEncounter();
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    boss.hp = Math.floor(boss.maxHp * 0.29);
    hoardState(inst).sweepTimer = 0;
    hoardState(inst).markTimer = 99;
    tickHoardBossMechanics(sim.ctx);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'hoardBossCue',
        kind: 'sweep',
        durationSecs: HOARD_SWEEP_ENRAGED_WINDUP_SEC,
      }),
    );
    expect(HOARD_SWEEP_ENRAGED_WINDUP_SEC).toBeGreaterThanOrEqual(2);
  });

  it('switches the recurring mark cadence at the exact 30 percent boundary', () => {
    const normal = makeEncounter();
    tickHoardBossMechanics(normal.sim.ctx);
    hoardState(normal.inst).sweepTimer = 99;
    hoardState(normal.inst).markTimer = 0;
    normal.boss.hp = Math.floor(normal.boss.maxHp * 0.3) + 1;
    tickHoardBossMechanics(normal.sim.ctx);
    expect(normal.inst.hoardBoss?.markTimer).toBe(HOARD_MARK_EVERY_SEC);

    const enraged = makeEncounter();
    tickHoardBossMechanics(enraged.sim.ctx);
    hoardState(enraged.inst).sweepTimer = 99;
    hoardState(enraged.inst).markTimer = 0;
    enraged.boss.hp = Math.floor(enraged.boss.maxHp * 0.3);
    tickHoardBossMechanics(enraged.sim.ctx);
    expect(enraged.inst.hoardBoss?.markTimer).toBe(HOARD_MARK_ENRAGED_EVERY_SEC);
  });

  it('gives Hoarfrost slippery ice and a telegraphed pushing gust', () => {
    const { sim, inst } = makeEncounter('rift_boss_frost');
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).sweepTimer = 0;
    hoardState(inst).markTimer = 99;
    tickHoardBossMechanics(sim.ctx);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'hoardBossCue',
        variant: 'frost-gust',
        radius: HOARD_FROST_GUST.radius,
        durationSecs: HOARD_FROST_GUST.windup,
      }),
    );

    const hpBeforeGust = sim.player.hp;
    const zBeforeGust = sim.player.pos.z;
    tickMechanic(sim, HOARD_FROST_GUST.windup);
    expect(sim.player.hp).toBeLessThan(hpBeforeGust);
    expect(sim.player.pos.z).toBeGreaterThan(zBeforeGust);
    hoardState(inst).sweepTimer = 99;
    hoardState(inst).markTimer = 0;
    tickHoardBossMechanics(sim.ctx);
    const ice = sim
      .drainEvents()
      .find(
        (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
          event.type === 'hoardBossCue' && event.variant === 'frost-ice',
      );
    expect(ice).toMatchObject({ radius: hoardMarkSpec('frost-ice').radius });
    sim.player.prevPos = { ...sim.player.pos, x: sim.player.pos.x - 1 };
    const xBeforeSlide = sim.player.pos.x;
    tickMechanic(sim, hoardMarkSpec('frost-ice').windup + hoardMarkSpec('frost-ice').pulseEvery);
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({ kind: 'slow', name: 'Treacherous Ice' }),
    );
    expect(sim.player.pos.x).toBeGreaterThan(xBeforeSlide);
  });

  it('runs Grask through three locked frontals before his recovery window', () => {
    const { sim, inst, boss } = makeEncounter('rift_boss_brute');
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).sweepTimer = 0;
    const events = tickMechanic(
      sim,
      HOARD_BRUTE_COMBO.reduce((sum, step) => sum + step.windup, 0) + 1,
    );
    const frontals = events.filter(
      (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
        event.type === 'hoardBossCue' && event.kind === 'sweep',
    );
    expect(frontals.map((event) => event.variant)).toEqual([
      'brute-wide',
      'brute-medium',
      'brute-long',
    ]);
    expect(new Set(frontals.map((event) => event.facing))).toEqual(new Set([boss.facing]));
    expect(hoardState(inst).sweepTimer).toBeGreaterThan(11);
  });

  it('alternates Nyxaris Blizzard with a one-time Ring of Frost', () => {
    const { sim, inst, boss } = makeEncounter('rift_boss_arcane');
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).markTimer = 0;
    tickHoardBossMechanics(sim.ctx);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'hoardBossCue', variant: 'arcane-blizzard' }),
    );
    tickMechanic(sim, hoardMarkSpec('arcane-blizzard').windup + 0.1);
    boss.hp = Math.floor(boss.maxHp * 0.5);
    tickHoardBossMechanics(sim.ctx);
    const ring = sim
      .drainEvents()
      .find(
        (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
          event.type === 'hoardBossCue' && event.variant === 'arcane-ring',
      );
    expect(ring).toMatchObject({ innerRadius: 4.5, radius: 8.5 });
    expect(hoardState(inst).specialTriggered).toBe(true);
  });

  it('casts Vharok thunder with time to escape and leaves charged ground', () => {
    const { sim, inst } = makeEncounter('rift_boss_storm');
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).markTimer = 0;
    tickHoardBossMechanics(sim.ctx);
    const warning = sim
      .drainEvents()
      .find(
        (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
          event.type === 'hoardBossCue' && event.variant === 'storm-charge',
      );
    expect(warning?.durationSecs).toBeGreaterThanOrEqual(3);
    const hazardEvents = tickMechanic(sim, hoardMarkSpec('storm-charge').windup);
    expect(hazardEvents).toContainEqual(
      expect.objectContaining({
        type: 'hoardBossCue',
        cueId: warning?.cueId,
        variant: 'storm-field',
        phase: 'hazard',
        durationSecs: 6,
      }),
    );
  });

  it('sends two opposing Abyssal waves and stops healing when the totem dies', () => {
    const { sim, inst, boss } = makeEncounter('rift_boss_tide');
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    hoardState(inst).sweepTimer = 0;
    sim.player.pos.x = boss.pos.x + 4;
    const hpBeforeWaves = sim.player.hp;
    const firstEvents = tickMechanic(sim, DT);
    const firstWave = firstEvents.find(
      (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
        event.type === 'hoardBossCue' && event.variant === 'tide-wave',
    );
    boss.hp = Math.floor(boss.maxHp * HOARD_TOTEM_TRIGGER_HP);
    tickHoardBossMechanics(sim.ctx);
    expect(hoardState(inst).totemId).toBeNull();
    sim.drainEvents();
    const restEvents = tickMechanic(sim, HOARD_TIDE_WAVE.windup * 2 + 1);
    const secondWave = restEvents.find(
      (event): event is Extract<SimEvent, { type: 'hoardBossCue' }> =>
        event.type === 'hoardBossCue' && event.variant === 'tide-wave',
    );
    expect(firstWave).toBeDefined();
    expect(secondWave).toBeDefined();
    expect(Math.abs((secondWave?.facing ?? 0) - (firstWave?.facing ?? 0))).toBeCloseTo(Math.PI, 4);
    expect(sim.player.hp).toBeLessThanOrEqual(
      hpBeforeWaves - Math.round(sim.player.maxHp * HOARD_TIDE_WAVE.damageFraction) * 2,
    );

    const totemId = hoardState(inst).totemId;
    expect(totemId).not.toBeNull();
    if (totemId === null) throw new Error('expected a healing tide totem');
    const totem = sim.entities.get(totemId);
    expect(totem?.templateId).toBe('hoard_healing_tide_totem');
    expect(restEvents).toContainEqual(
      expect.objectContaining({ type: 'hoardBossCue', variant: 'tide-tether' }),
    );
    const beforeHeal = boss.hp;
    hoardState(inst).totemPulseTimer = 0;
    const healingEvents = tickMechanic(sim, DT);
    expect(boss.hp).toBeGreaterThanOrEqual(
      beforeHeal + Math.round(boss.maxHp * HOARD_TOTEM_HEAL_FRACTION),
    );
    expect(healingEvents).toContainEqual(
      expect.objectContaining({
        type: 'spellfxAt',
        ability: 'healing_wave',
        fx: 'burst',
        sourceId: totemId,
      }),
    );
    if (!totem) throw new Error('missing Healing Tide Totem');
    totem.hp = 0;
    totem.dead = true;
    const afterKill = boss.hp;
    tickMechanic(sim, 2.5);
    expect(boss.hp).toBe(afterKill);
    expect(hoardState(inst).totemId).toBeNull();
    expect(sim.entities.has(totemId)).toBe(false);
    expect(inst.mobIds).not.toContain(totemId);
    expect(boss.summonedIds).not.toContain(totemId);
  });

  it('runs through Sim.tick and regenerates the same cue trace from the same seed', () => {
    const trace = (): unknown[] => {
      const { sim, inst } = makeEncounter();
      tickHoardBossMechanics(sim.ctx);
      sim.drainEvents();
      hoardState(inst).sweepTimer = 0;
      hoardState(inst).markTimer = 99;
      return sim
        .tick()
        .filter((event) => event.type === 'hoardBossCue')
        .map(({ pid, ...event }) => event);
    };
    const first = trace();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: 'hoardBossCue', kind: 'sweep' });
    expect(trace()).toEqual(first);
  });

  it('includes every active telegraph in the reconnect rift state', () => {
    const { sim, inst, boss } = makeEncounter('rift_boss_arcane');
    tickHoardBossMechanics(sim.ctx);
    sim.drainEvents();
    boss.hp = Math.floor(boss.maxHp * 0.5);
    tickHoardBossMechanics(sim.ctx);
    const resumed = riftStateEventFor(sim.ctx, sim.player.id);
    expect(resumed?.hoardCues).toEqual([
      expect.objectContaining({
        instanceId: inst.instanceId,
        cueId: 1,
        kind: 'mark',
        variant: 'arcane-ring',
        innerRadius: 4.5,
        remaining: hoardMarkSpec('arcane-ring').windup,
        total: hoardMarkSpec('arcane-ring').windup,
      }),
    ]);
  });

  it('stays inert for an ordinary Rift instance', () => {
    const { sim, inst } = makeEncounter();
    inst.vault = null;
    const events = tickMechanic(sim, 20);
    expect(inst.hoardBoss).toBeUndefined();
    expect(events.some((event) => event.type === 'hoardBossCue')).toBe(false);
  });
});
