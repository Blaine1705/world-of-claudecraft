import { describe, expect, it } from 'vitest';
import {
  HOARD_MARK_ENRAGED_EVERY_SEC,
  HOARD_MARK_ENRAGED_WINDUP_SEC,
  HOARD_MARK_EVERY_SEC,
  HOARD_MARK_HAZARD_SEC,
  HOARD_MARK_HAZARD_TICK_SEC,
  HOARD_MARK_WINDUP_SEC,
  HOARD_SWEEP_ENRAGED_WINDUP_SEC,
  HOARD_SWEEP_HALF_ANGLE,
  HOARD_SWEEP_RANGE,
  HOARD_SWEEP_WINDUP_SEC,
  hoardMarkTargetCount,
  hoardMarkTargets,
  nextHoardBossMechanic,
  pointInHoardSweep,
  tickHoardBossMechanics,
} from '../src/sim/rift/hoard_boss';
import { riftStateEventFor } from '../src/sim/rift/runs';
import type { HoardBossState, RiftInstance } from '../src/sim/rift/types';
import { makeVaultSeed } from '../src/sim/rift/vault_seed';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type SimEvent } from '../src/sim/types';

function makeEncounter(): {
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
});

describe('Buried Hoard boss encounter', () => {
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
    expect(inst.hoardBoss?.cues).toHaveLength(1);
    tickMechanic(sim, HOARD_SWEEP_WINDUP_SEC);
    expect(sim.player.hp).toBe(hpBefore - Math.round(sim.player.maxHp * 0.24));
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
    const { sim, inst } = makeEncounter();
    tickHoardBossMechanics(sim.ctx);
    hoardState(inst).sweepTimer = 0;
    hoardState(inst).markTimer = 99;
    tickHoardBossMechanics(sim.ctx);
    const resumed = riftStateEventFor(sim.ctx, sim.player.id);
    expect(resumed?.hoardCues).toEqual([
      expect.objectContaining({
        instanceId: inst.instanceId,
        cueId: 1,
        kind: 'sweep',
        remaining: HOARD_SWEEP_WINDUP_SEC,
        total: HOARD_SWEEP_WINDUP_SEC,
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
