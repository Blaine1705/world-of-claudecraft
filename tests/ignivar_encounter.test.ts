import { describe, expect, it } from 'vitest';
import { isDispellableAura } from '../src/sim/aura_classify';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  IGNIVAR_APOCALYPSE_ADD_ID,
  IGNIVAR_APOCALYPSE_CAST_ID,
  IGNIVAR_APOCALYPSE_CAST_SECONDS,
  IGNIVAR_APOCALYPSE_HP_THRESHOLD,
  IGNIVAR_BRAND_AURA_ID,
  IGNIVAR_BRAND_EVERY,
  IGNIVAR_BRAND_MAX_STACKS,
  IGNIVAR_BRAND_TARGETS_NORMAL,
  IGNIVAR_CONDUIT_ACTIVE_SECONDS,
  IGNIVAR_CONDUIT_COOLDOWN_SECONDS,
  IGNIVAR_FIRST_ROTATING_RAYS_SECONDS,
  IGNIVAR_FIRST_SKYFIRE_SECONDS,
  IGNIVAR_FIRST_SOAK_SECONDS,
  IGNIVAR_FORGE_STRIKE_EVERY,
  IGNIVAR_FORGE_STRIKE_MAX_HP,
  IGNIVAR_FORGE_WAVE_CAST_ID,
  IGNIVAR_FRONTAL_CAST_ID,
  IGNIVAR_FRONTAL_CAST_SECONDS,
  IGNIVAR_FRONTAL_EVERY,
  IGNIVAR_FRONTAL_VFX_DISTANCE,
  IGNIVAR_LAST_INFERNO_AURA_ID,
  IGNIVAR_LAST_INFERNO_HP_THRESHOLD,
  IGNIVAR_LAST_INFERNO_SECONDS,
  IGNIVAR_MAJOR_ABILITY_GAP_SECONDS,
  IGNIVAR_MOLTEN_ARMOR_AURA_ID,
  IGNIVAR_MOLTEN_ARMOR_DURATION,
  IGNIVAR_MOLTEN_ARMOR_PER_STACK,
  IGNIVAR_ROTATING_RAYS_ACTIVE_SECONDS,
  IGNIVAR_ROTATING_RAYS_ANGULAR_SPEED,
  IGNIVAR_ROTATING_RAYS_CAST_ID,
  IGNIVAR_ROTATING_RAYS_DAMAGE_MAX_HP,
  IGNIVAR_ROTATING_RAYS_EVERY,
  IGNIVAR_ROTATING_RAYS_PULSE_SECONDS,
  IGNIVAR_ROTATING_RAYS_WINDUP_SECONDS,
  IGNIVAR_SKYFIRE_CAST_ID,
  IGNIVAR_SKYFIRE_CAST_SECONDS,
  IGNIVAR_SKYFIRE_CONE_COUNT,
  IGNIVAR_SKYFIRE_DAMAGE_MAX_HP,
  IGNIVAR_SKYFIRE_EVERY,
  IGNIVAR_SKYFIRE_HALF_ANGLE,
  IGNIVAR_SKYFIRE_RANGE,
  IGNIVAR_SOAK_AURA_ID,
  IGNIVAR_SOAK_CAST_SECONDS,
  IGNIVAR_SOAK_EVERY,
  IGNIVAR_SOAK_FAILURE_MAX_HP,
  IGNIVAR_SOAK_RADIUS,
  IGNIVAR_SOAK_REQUIRED_PLAYERS,
  IGNIVAR_SOAK_SHARED_MAX_HP,
  resetIgnivarEncounter,
  updateIgnivarEncounter,
} from '../src/sim/encounters/ignivar';
import { IGNIVAR_WATER_CONDUIT_TEMPLATES } from '../src/sim/ignivar_arena';
import {
  IGNIVAR_FIRST_FORGE_WAVE_SECONDS,
  IGNIVAR_FORGE_WAVE_ACTIVE_SECONDS,
  IGNIVAR_FORGE_WAVE_DAMAGE_MAX_HP,
  IGNIVAR_FORGE_WAVE_EVERY,
  IGNIVAR_FORGE_WAVE_KNOCKBACK,
  IGNIVAR_FORGE_WAVE_RANGE,
  IGNIVAR_FORGE_WAVE_WINDUP_SECONDS,
} from '../src/sim/ignivar_forge_wave';
import {
  IGNIVAR_FIRST_METEOR_SECONDS,
  IGNIVAR_METEOR_CAST_ID,
  IGNIVAR_METEOR_COUNT,
  IGNIVAR_METEOR_DAMAGE_MAX_HP,
  IGNIVAR_METEOR_EVERY,
  IGNIVAR_METEOR_RADIUS,
  IGNIVAR_METEOR_REVEAL_DELAY_SECONDS,
  IGNIVAR_METEOR_TELEGRAPH_SECONDS,
} from '../src/sim/ignivar_meteors';
import { enterDungeon, leaveDungeon } from '../src/sim/instances/dungeons';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';
import { DT, IGNIVAR_BOSS_ID, type PlayerClass, type SimEvent } from '../src/sim/types';

function claimedEncounter(seed = 42): {
  sim: Sim;
  boss: NonNullable<ReturnType<Sim['entities']['get']>>;
  conduit: NonNullable<ReturnType<Sim['entities']['get']>>;
} {
  const sim = new Sim({ seed, playerClass: 'warrior', devCommands: true });
  expect(enterDungeon(sim.ctx, 'ignivar_raid_arena', sim.player.id, true)).toBe(true);
  const boss = [...sim.entities.values()].find((e) => e.templateId === IGNIVAR_BOSS_ID);
  if (!boss) throw new Error('Ignivar did not spawn');
  const conduit = [...sim.entities.values()].find(
    (e) => e.templateId === IGNIVAR_WATER_CONDUIT_TEMPLATES.ready && e.pos.x < boss.pos.x,
  );
  if (!conduit) throw new Error('Ignivar conduit did not spawn');
  boss.inCombat = true;
  boss.aiState = 'attack';
  boss.aggroTargetId = sim.player.id;
  return { sim, boss, conduit };
}

function addEncounterPlayer(
  sim: Sim,
  boss: NonNullable<ReturnType<Sim['entities']['get']>>,
  name: string,
  cls: PlayerClass = 'priest',
) {
  const pid = sim.addPlayer(cls, name);
  const player = sim.entities.get(sim.players.get(pid)?.entityId ?? -1);
  if (!player) throw new Error(`${name} did not spawn`);
  player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z + 2 };
  player.prevPos = { ...player.pos };
  return player;
}

function forgeWaveCadenceTrace(seed: number) {
  const { sim, boss } = claimedEncounter(seed);
  const party = [
    sim.player,
    addEncounterPlayer(sim, boss, 'Cadence Two'),
    addEncounterPlayer(sim, boss, 'Cadence Three'),
    addEncounterPlayer(sim, boss, 'Cadence Four'),
  ];
  const casts: Array<{
    startTick: number;
    endTick: number;
    facingSlot: number;
    windupFrames: number;
    activeFrames: number;
  }> = [];
  let current: (typeof casts)[number] | null = null;
  let wasWave = false;
  for (let tick = 0; tick < 3_000; tick++) {
    for (const player of party) {
      player.hp = player.maxHp;
      player.dead = false;
    }
    updateIgnivarEncounter(sim.ctx, boss);
    const isWave = boss.castingAbility === IGNIVAR_FORGE_WAVE_CAST_ID;
    if (isWave && !wasWave) {
      if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
      current = {
        startTick: tick,
        endTick: -1,
        facingSlot: Math.round(boss.ignivar.forgeWaveFacing / (Math.PI / 4)),
        windupFrames: 0,
        activeFrames: 0,
      };
      casts.push(current);
    }
    if (isWave && current) {
      if (boss.channeling) current.activeFrames++;
      else current.windupFrames++;
    }
    if (!isWave && wasWave && current) {
      current.endTick = tick;
      current = null;
      if (casts.length === 2) break;
    }
    wasWave = isWave;
  }
  return casts;
}

describe('Ignivar encounter', () => {
  it('ships the Normal cadence as explicit tuning constants', () => {
    expect(IGNIVAR_BRAND_TARGETS_NORMAL).toBe(3);
    expect(IGNIVAR_BRAND_EVERY).toBe(28);
    expect(IGNIVAR_BRAND_MAX_STACKS).toBe(3);
    expect(IGNIVAR_FORGE_STRIKE_EVERY).toBe(14);
    expect(IGNIVAR_FORGE_STRIKE_MAX_HP).toBe(0.35);
    expect(IGNIVAR_MAJOR_ABILITY_GAP_SECONDS).toBe(6);
    expect(IGNIVAR_FIRST_FORGE_WAVE_SECONDS).toBe(44);
    expect(IGNIVAR_FORGE_WAVE_EVERY).toBe(46);
    expect(IGNIVAR_FORGE_WAVE_WINDUP_SECONDS).toBe(2.5);
    expect(IGNIVAR_FORGE_WAVE_ACTIVE_SECONDS).toBe(3);
    expect(IGNIVAR_FORGE_WAVE_DAMAGE_MAX_HP).toBe(0.35);
    expect(IGNIVAR_FORGE_WAVE_KNOCKBACK).toBe(4);
    expect(IGNIVAR_MOLTEN_ARMOR_DURATION).toBe(30);
    expect(IGNIVAR_MOLTEN_ARMOR_PER_STACK).toBe(0.35);
    expect(IGNIVAR_FRONTAL_CAST_SECONDS).toBe(3);
    expect(IGNIVAR_CONDUIT_ACTIVE_SECONDS).toBe(10);
    expect(IGNIVAR_CONDUIT_COOLDOWN_SECONDS).toBe(35);
    expect(IGNIVAR_LAST_INFERNO_HP_THRESHOLD).toBe(0.2);
    expect(IGNIVAR_LAST_INFERNO_SECONDS).toBe(45);
    expect(IGNIVAR_SKYFIRE_CAST_SECONDS).toBe(3);
    expect(IGNIVAR_FIRST_SKYFIRE_SECONDS).toBe(16);
    expect(IGNIVAR_SKYFIRE_EVERY).toBe(20);
    expect(IGNIVAR_SKYFIRE_DAMAGE_MAX_HP).toBe(0.45);
    expect(IGNIVAR_SKYFIRE_RANGE).toBe(24);
    expect(IGNIVAR_SKYFIRE_HALF_ANGLE).toBe(Math.PI / 10);
    expect(IGNIVAR_SKYFIRE_CONE_COUNT).toBe(3);
    expect(IGNIVAR_FIRST_METEOR_SECONDS).toBe(13);
    expect(IGNIVAR_METEOR_EVERY).toBe(17);
    expect(IGNIVAR_METEOR_TELEGRAPH_SECONDS).toBe(2.5);
    expect(IGNIVAR_METEOR_REVEAL_DELAY_SECONDS).toBe(0.75);
    expect(IGNIVAR_METEOR_DAMAGE_MAX_HP).toBe(0.35);
    expect(IGNIVAR_FIRST_ROTATING_RAYS_SECONDS).toBe(32);
    expect(IGNIVAR_ROTATING_RAYS_EVERY).toBe(40);
    expect(IGNIVAR_ROTATING_RAYS_WINDUP_SECONDS).toBe(2);
    expect(IGNIVAR_ROTATING_RAYS_ACTIVE_SECONDS).toBe(8);
    expect(IGNIVAR_ROTATING_RAYS_ANGULAR_SPEED).toBe(Math.PI / 10);
    expect(IGNIVAR_ROTATING_RAYS_PULSE_SECONDS).toBe(0.5);
    expect(IGNIVAR_ROTATING_RAYS_DAMAGE_MAX_HP).toBe(0.2);
    expect(IGNIVAR_SOAK_CAST_SECONDS).toBe(6);
    expect(IGNIVAR_FIRST_SOAK_SECONDS).toBe(24);
    expect(IGNIVAR_SOAK_EVERY).toBe(34);
    expect(IGNIVAR_SOAK_REQUIRED_PLAYERS).toBe(4);
    expect(IGNIVAR_SOAK_RADIUS).toBe(5.5);
    expect(IGNIVAR_SOAK_SHARED_MAX_HP).toBe(1.2);
    expect(IGNIVAR_SOAK_FAILURE_MAX_HP).toBe(0.8);
  });

  it('expands Forge Wave once through unsafe arcs while opposite gaps remain safe', () => {
    const { sim, boss } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.forgeWaveTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.castingAbility).toBe(IGNIVAR_FORGE_WAVE_CAST_ID);
    expect(boss.castTotal).toBe(IGNIVAR_FORGE_WAVE_WINDUP_SECONDS);
    expect(boss.channeling).toBe(false);
    const lockedFacing = boss.ignivar.forgeWaveFacing;

    const safe = addEncounterPlayer(sim, boss, 'Safe Gap');
    const secondUnsafe = addEncounterPlayer(sim, boss, 'Second Unsafe');
    const pointAt = (angle: number, radius: number) => ({
      x: boss.pos.x + Math.sin(angle) * radius,
      y: boss.pos.y,
      z: boss.pos.z + Math.cos(angle) * radius,
    });
    sim.player.pos = pointAt(lockedFacing + Math.PI / 2, 10);
    sim.player.prevPos = { ...sim.player.pos };
    safe.pos = pointAt(lockedFacing, 10);
    safe.prevPos = { ...safe.pos };
    secondUnsafe.pos = pointAt(lockedFacing - Math.PI / 2, 10);
    secondUnsafe.prevPos = { ...secondUnsafe.pos };

    boss.ignivar.forgeWaveWindupRemaining = 0.01;
    const releaseEvents = sim.tick();
    const releaseBursts = releaseEvents.filter(
      (event): event is Extract<SimEvent, { type: 'spellfxAt' }> =>
        event.type === 'spellfxAt' && event.ability === IGNIVAR_FORGE_WAVE_CAST_ID,
    );
    expect(releaseBursts).toHaveLength(1);
    expect(releaseBursts[0]).toMatchObject({
      x: boss.pos.x,
      z: boss.pos.z,
      school: 'fire',
      fx: 'burst',
      sourceId: boss.id,
    });
    expect(releaseBursts[0]?.radius).toBeUndefined();
    expect(boss.channeling).toBe(true);
    expect(boss.castTotal).toBe(IGNIVAR_FORGE_WAVE_ACTIVE_SECONDS);

    boss.ignivar.forgeWaveRadius = 9;
    boss.ignivar.forgeWaveActiveRemaining =
      IGNIVAR_FORGE_WAVE_ACTIVE_SECONDS * (1 - 10 / IGNIVAR_FORGE_WAVE_RANGE) + DT;
    const unsafeHp = sim.player.hp;
    const secondUnsafeHp = secondUnsafe.hp;
    const safeHp = safe.hp;
    const unsafeDistance = Math.hypot(sim.player.pos.x - boss.pos.x, sim.player.pos.z - boss.pos.z);
    updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.hp).toBe(
      unsafeHp - Math.ceil(sim.player.maxHp * IGNIVAR_FORGE_WAVE_DAMAGE_MAX_HP),
    );
    expect(Math.hypot(sim.player.pos.x - boss.pos.x, sim.player.pos.z - boss.pos.z)).toBeCloseTo(
      unsafeDistance + IGNIVAR_FORGE_WAVE_KNOCKBACK,
      5,
    );
    expect(safe.hp).toBe(safeHp);
    expect(secondUnsafe.hp).toBe(
      secondUnsafeHp - Math.ceil(secondUnsafe.maxHp * IGNIVAR_FORGE_WAVE_DAMAGE_MAX_HP),
    );
    expect(boss.ignivar.forgeWaveHitPlayerIds).toEqual([sim.player.id, secondUnsafe.id]);
    expect(boss.facing).toBe(lockedFacing);

    const hpAfterFirstHit = sim.player.hp;
    const secondHpAfterFirstHit = secondUnsafe.hp;
    const nextRadius = boss.ignivar.forgeWaveRadius + 0.5;
    sim.player.pos = pointAt(lockedFacing + Math.PI / 2, nextRadius);
    sim.player.prevPos = { ...sim.player.pos };
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.hp).toBe(hpAfterFirstHit);
    expect(secondUnsafe.hp).toBe(secondHpAfterFirstHit);

    boss.ignivar.forgeWaveActiveRemaining = DT;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.castingAbility).toBeNull();
    expect(boss.channeling).toBe(false);
    expect(boss.castTotal).toBe(0);
    expect(boss.castRemaining).toBe(0);
    expect(boss.castTargetId).toBeNull();
    expect(boss.castAim).toBeNull();
  });

  it('replays the complete Forge Wave windup, sweep, and cadence deterministically', () => {
    const first = forgeWaveCadenceTrace(418);
    expect(forgeWaveCadenceTrace(418)).toEqual(first);
    expect(first).toEqual([
      {
        startTick: 1023,
        endTick: 1133,
        facingSlot: 6,
        windupFrames: 50,
        activeFrames: 60,
      },
      {
        startTick: 2179,
        endTick: 2289,
        facingSlot: 1,
        windupFrames: 50,
        activeFrames: 60,
      },
    ]);
  });

  it('warns before three rays rotate, damages crossings, and reverses the next cast', () => {
    const { sim, boss } = claimedEncounter(8120);
    const safePlayer = addEncounterPlayer(sim, boss, 'Ray Gap');
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.rotatingRaysTimer = 0;
    boss.swingTimer = 999;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.castingAbility).toBe(IGNIVAR_ROTATING_RAYS_CAST_ID);
    expect(boss.castTotal).toBe(
      IGNIVAR_ROTATING_RAYS_WINDUP_SECONDS + IGNIVAR_ROTATING_RAYS_ACTIVE_SECONDS,
    );
    expect(boss.ignivar.rotatingRaysDirection).toBe(1);
    const lockedFacing = boss.ignivar.rotatingRaysFacing;
    sim.player.hp = sim.player.maxHp;
    safePlayer.hp = safePlayer.maxHp;
    sim.player.pos = {
      x: boss.pos.x + Math.sin(lockedFacing) * 15,
      y: boss.pos.y,
      z: boss.pos.z + Math.cos(lockedFacing) * 15,
    };
    safePlayer.pos = {
      x: boss.pos.x + Math.sin(lockedFacing + Math.PI / 3) * 15,
      y: boss.pos.y,
      z: boss.pos.z + Math.cos(lockedFacing + Math.PI / 3) * 15,
    };
    boss.ignivar.rotatingRaysWindupRemaining = DT;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.hp).toBe(sim.player.maxHp);
    expect(safePlayer.hp).toBe(safePlayer.maxHp);
    expect(boss.facing).toBeCloseTo(lockedFacing, 8);

    const damagingFacing = lockedFacing + IGNIVAR_ROTATING_RAYS_ANGULAR_SPEED * DT;
    sim.player.pos = {
      x: boss.pos.x + Math.sin(damagingFacing) * 15,
      y: boss.pos.y,
      z: boss.pos.z + Math.cos(damagingFacing) * 15,
    };
    safePlayer.pos = {
      x: boss.pos.x + Math.sin(damagingFacing + Math.PI / 3) * 15,
      y: boss.pos.y,
      z: boss.pos.z + Math.cos(damagingFacing + Math.PI / 3) * 15,
    };
    boss.ignivar.rotatingRaysPulseTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.facing).toBeCloseTo(damagingFacing, 8);
    expect(sim.player.hp).toBe(
      sim.player.maxHp - Math.ceil(sim.player.maxHp * IGNIVAR_ROTATING_RAYS_DAMAGE_MAX_HP),
    );
    expect(safePlayer.hp).toBe(safePlayer.maxHp);

    boss.ignivar.rotatingRaysActiveRemaining = DT;
    boss.ignivar.rotatingRaysPulseTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.castingAbility).toBeNull();
    boss.ignivar.rotatingRaysTimer = 0;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.ignivar.rotatingRaysDirection).toBe(-1);
  });

  it('keeps a clear gap after Revolving Inferno and does not overlap Shared Pyre', () => {
    const { sim, boss } = claimedEncounter(8122);
    sim.player.devGod = true;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.rotatingRaysTimer = 0;
    boss.ignivar.forgeWaveTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.swingTimer = 999;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.castingAbility).toBe(IGNIVAR_ROTATING_RAYS_CAST_ID);

    boss.ignivar.frontalTimer = 0;
    boss.ignivar.skyfireTimer = 0;
    boss.ignivar.forgeWaveTimer = 0;
    boss.ignivar.soakTimer = 0;
    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.castingAbility).toBe(IGNIVAR_ROTATING_RAYS_CAST_ID);
    expect(boss.ignivar.soakTargetId).toBeNull();
    expect(boss.ignivar.soakTimer).toBe(0);

    boss.ignivar.rotatingRaysWindupRemaining = 0;
    boss.ignivar.rotatingRaysActiveRemaining = DT;
    boss.ignivar.rotatingRaysPulseTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.castingAbility).toBeNull();
    expect(boss.ignivar.frontalTimer).toBeGreaterThanOrEqual(IGNIVAR_MAJOR_ABILITY_GAP_SECONDS);
    expect(boss.ignivar.skyfireTimer).toBeGreaterThanOrEqual(IGNIVAR_MAJOR_ABILITY_GAP_SECONDS);
    expect(boss.ignivar.forgeWaveTimer).toBeGreaterThanOrEqual(IGNIVAR_MAJOR_ABILITY_GAP_SECONDS);
    expect(boss.ignivar.soakTimer).toBeGreaterThanOrEqual(IGNIVAR_MAJOR_ABILITY_GAP_SECONDS);
  });

  it('applies the six-second gap after every cast-based major ability', () => {
    const assertReleaseGap = (
      seed: number,
      primeRelease: (boss: ReturnType<typeof claimedEncounter>['boss']) => void,
    ) => {
      const { sim, boss } = claimedEncounter(seed);
      sim.player.devGod = true;
      updateIgnivarEncounter(sim.ctx, boss);
      if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
      boss.ignivar.brandTimer = 999;
      boss.ignivar.forgeStrikeTimer = 999;
      boss.ignivar.frontalTimer = 999;
      boss.ignivar.skyfireTimer = 0;
      boss.ignivar.rotatingRaysTimer = 999;
      boss.ignivar.forgeWaveTimer = 999;
      boss.ignivar.soakTimer = 999;
      boss.swingTimer = 999;
      primeRelease(boss);

      updateIgnivarEncounter(sim.ctx, boss);

      expect(boss.castingAbility).toBeNull();
      expect(boss.ignivar.skyfireTimer).toBeGreaterThanOrEqual(6);
    };

    assertReleaseGap(8123, (boss) => {
      if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
      boss.ignivar.frontalCastRemaining = DT;
    });
    assertReleaseGap(8124, (boss) => {
      if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
      boss.ignivar.skyfireCastRemaining = DT;
    });
    assertReleaseGap(8125, (boss) => {
      if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
      boss.ignivar.forgeWaveActiveRemaining = DT;
    });
  });

  it('keeps Revolving Inferno active for ten seconds and turns the rays by 144 degrees', () => {
    const { sim, boss } = claimedEncounter(8121);
    sim.player.devGod = true;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.ignivar.rotatingRaysTimer = 0;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    const startFacing = boss.ignivar.rotatingRaysFacing;

    let castTicks = 0;
    while (boss.castingAbility === IGNIVAR_ROTATING_RAYS_CAST_ID && castTicks < 400) {
      updateIgnivarEncounter(sim.ctx, boss);
      castTicks++;
    }

    expect(castTicks * DT).toBeCloseTo(
      IGNIVAR_ROTATING_RAYS_WINDUP_SECONDS + IGNIVAR_ROTATING_RAYS_ACTIVE_SECONDS,
      5,
    );
    expect(boss.ignivar.rotatingRaysFacing - startFacing).toBeCloseTo(
      IGNIVAR_ROTATING_RAYS_ANGULAR_SPEED * IGNIVAR_ROTATING_RAYS_ACTIVE_SECONDS,
      8,
    );
    expect(boss.ignivar.rotatingRaysTimer).toBeCloseTo(
      IGNIVAR_ROTATING_RAYS_EVERY -
        IGNIVAR_ROTATING_RAYS_WINDUP_SECONDS -
        IGNIVAR_ROTATING_RAYS_ACTIVE_SECONDS,
      5,
    );
  });

  it('restores the boss facing when the encounter resets during rotating rays', () => {
    const { sim, boss } = claimedEncounter(8126);
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.rotatingRaysTimer = 0;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    const lockedBossFacing = boss.ignivar.rotatingRaysBossFacing;
    boss.ignivar.rotatingRaysWindupRemaining = 0;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.facing).not.toBeCloseTo(lockedBossFacing, 8);

    resetIgnivarEncounter(sim.ctx, boss);

    expect(boss.ignivar).toBeUndefined();
    expect(boss.facing).toBeCloseTo(lockedBossFacing, 8);
  });

  it('pulses an active rotating ray every half second without floating-point drift', () => {
    const { sim, boss } = claimedEncounter(8122);
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.ignivar.rotatingRaysTimer = 0;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    boss.ignivar.rotatingRaysWindupRemaining = 0;
    const pulseTicks: number[] = [];

    for (let tick = 1; tick <= 21; tick++) {
      const nextFacing =
        boss.ignivar.rotatingRaysFacing +
        boss.ignivar.rotatingRaysDirection * IGNIVAR_ROTATING_RAYS_ANGULAR_SPEED * DT;
      sim.player.pos = {
        x: boss.pos.x + Math.sin(nextFacing) * 15,
        y: boss.pos.y,
        z: boss.pos.z + Math.cos(nextFacing) * 15,
      };
      sim.player.hp = sim.player.maxHp;
      updateIgnivarEncounter(sim.ctx, boss);
      if (sim.player.hp < sim.player.maxHp) pulseTicks.push(tick);
    }

    expect(pulseTicks).toEqual([1, 11, 21]);
  });

  it('telegraphs three skyfire cones, then releases three fire eruptions at cast end', () => {
    const { sim, boss } = claimedEncounter(8102);
    const safePlayer = addEncounterPlayer(sim, boss, 'Safe Raider');
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.skyfireTimer = 0;

    const events = sim.tick();

    expect(boss.castingAbility).toBe(IGNIVAR_SKYFIRE_CAST_ID);
    expect(boss.castTotal).toBe(IGNIVAR_SKYFIRE_CAST_SECONDS);
    expect(
      events.some(
        (event) =>
          event.type === 'spellfxAt' &&
          (event.fx === 'meteorFall' || event.fx === 'ambientMeteorFall'),
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'spellfxAt' &&
          event.fx === 'burst' &&
          event.ability === IGNIVAR_SKYFIRE_CAST_ID,
      ),
    ).toBe(false);
    const facing = boss.ignivar.skyfireFacing;
    const conePlayers = [
      sim.player,
      addEncounterPlayer(sim, boss, 'Second Cone'),
      addEncounterPlayer(sim, boss, 'Third Cone'),
    ];
    const gapPlayers = [
      safePlayer,
      addEncounterPlayer(sim, boss, 'Second Gap'),
      addEncounterPlayer(sim, boss, 'Third Gap'),
    ];
    for (let index = 0; index < conePlayers.length; index++) {
      const angle = facing + (index * Math.PI * 2) / IGNIVAR_SKYFIRE_CONE_COUNT;
      conePlayers[index].pos = {
        x: boss.pos.x + Math.sin(angle) * 12,
        y: boss.pos.y,
        z: boss.pos.z + Math.cos(angle) * 12,
      };
    }
    for (let index = 0; index < gapPlayers.length; index++) {
      const angle = facing + Math.PI / 3 + (index * Math.PI * 2) / IGNIVAR_SKYFIRE_CONE_COUNT;
      gapPlayers[index].pos = {
        x: boss.pos.x + Math.sin(angle) * 12,
        y: boss.pos.y,
        z: boss.pos.z + Math.cos(angle) * 12,
      };
    }
    for (const player of [...conePlayers, ...gapPlayers]) player.hp = player.maxHp;
    const midCastEvents = sim.tick();
    expect(boss.castingAbility).toBe(IGNIVAR_SKYFIRE_CAST_ID);
    expect(boss.ignivar.skyfireCastRemaining).toBeGreaterThan(DT);
    expect(
      midCastEvents.some(
        (event) =>
          event.type === 'spellfxAt' &&
          event.fx === 'burst' &&
          event.ability === IGNIVAR_SKYFIRE_CAST_ID,
      ),
    ).toBe(false);
    boss.ignivar.skyfireCastRemaining = DT;
    const lockedFacing = boss.ignivar.skyfireFacing;
    safePlayer.pos = { x: boss.pos.x - 12, y: boss.pos.y, z: boss.pos.z };

    const releaseEvents = sim.tick();

    const fireEruptions = releaseEvents.filter(
      (event): event is Extract<SimEvent, { type: 'spellfxAt' }> =>
        event.type === 'spellfxAt' &&
        event.fx === 'burst' &&
        event.ability === IGNIVAR_SKYFIRE_CAST_ID,
    );
    expect(fireEruptions).toHaveLength(IGNIVAR_SKYFIRE_CONE_COUNT);
    for (let cone = 0; cone < IGNIVAR_SKYFIRE_CONE_COUNT; cone++) {
      const eruption = fireEruptions[cone];
      const eruptionFacing = lockedFacing + (cone * Math.PI * 2) / IGNIVAR_SKYFIRE_CONE_COUNT;
      expect(eruption.x).toBeCloseTo(
        boss.pos.x + Math.sin(eruptionFacing) * IGNIVAR_SKYFIRE_RANGE,
        8,
      );
      expect(eruption.z).toBeCloseTo(
        boss.pos.z + Math.cos(eruptionFacing) * IGNIVAR_SKYFIRE_RANGE,
        8,
      );
      expect(eruption.school).toBe('fire');
      expect(eruption.sourceId).toBe(boss.id);
      expect(eruption.radius).toBeUndefined();
    }

    for (const player of conePlayers) {
      expect(player.hp).toBe(
        player.maxHp - Math.ceil(player.maxHp * IGNIVAR_SKYFIRE_DAMAGE_MAX_HP),
      );
    }
    for (const player of gapPlayers) expect(player.hp).toBe(player.maxHp);
    expect(boss.ignivar.skyfireFacing).toBe(lockedFacing);
    expect(boss.castingAbility).toBeNull();
  });

  it('warns with red meteor circles independently, then damages only on impact', () => {
    const { sim, boss } = claimedEncounter(8103);
    const safePlayer = addEncounterPlayer(sim, boss, 'Meteor Safe');
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.forgeWaveTimer = 999;
    boss.ignivar.skyfireTimer = 0;
    boss.ignivar.meteorTimer = 0;
    boss.swingTimer = 999;
    sim.player.hp = sim.player.maxHp;
    safePlayer.hp = safePlayer.maxHp;

    const events = sim.tick();

    expect(boss.castingAbility).toBe(IGNIVAR_SKYFIRE_CAST_ID);
    const warnings = events.filter(
      (event): event is Extract<SimEvent, { type: 'spellfxAt' }> =>
        event.type === 'spellfxAt' &&
        event.fx === 'meteorFall' &&
        event.ability === IGNIVAR_METEOR_CAST_ID,
    );
    expect(warnings).toHaveLength(IGNIVAR_METEOR_COUNT);
    expect(warnings.every((warning) => warning.radius === IGNIVAR_METEOR_RADIUS)).toBe(true);
    expect(warnings.every((warning) => warning.duration === IGNIVAR_METEOR_TELEGRAPH_SECONDS)).toBe(
      true,
    );
    expect(
      warnings.every((warning) => warning.warningLead === IGNIVAR_METEOR_REVEAL_DELAY_SECONDS),
    ).toBe(true);
    expect(sim.player.hp).toBe(sim.player.maxHp);
    expect(boss.ignivar.meteorTimer).toBeCloseTo(IGNIVAR_METEOR_EVERY, 8);

    const impact = boss.ignivar.meteorPoints[0];
    sim.player.pos = { x: impact.x, y: boss.pos.y, z: impact.z };
    safePlayer.pos = { ...boss.pos };
    sim.tick();
    expect(sim.player.hp).toBe(sim.player.maxHp);
    expect(safePlayer.hp).toBe(safePlayer.maxHp);

    boss.ignivar.meteorImpactRemaining = DT;
    sim.tick();

    expect(sim.player.hp).toBe(
      sim.player.maxHp - Math.ceil(sim.player.maxHp * IGNIVAR_METEOR_DAMAGE_MAX_HP),
    );
    expect(safePlayer.hp).toBe(safePlayer.maxHp);
    expect(boss.ignivar.meteorPoints).toEqual([]);
  });

  it('starts Falling Cinders naturally after 13 seconds and every 17 seconds thereafter', () => {
    const { sim, boss } = claimedEncounter(8104);
    sim.player.devGod = true;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.forgeWaveTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.swingTimer = 999;
    const warningTicks: number[] = [];

    for (let tick = 1; tick <= 650 && warningTicks.length < 2; tick++) {
      const events = sim.tick();
      if (
        events.some(
          (event) =>
            event.type === 'spellfxAt' &&
            event.fx === 'meteorFall' &&
            event.ability === IGNIVAR_METEOR_CAST_ID,
        )
      ) {
        warningTicks.push(tick);
      }
    }

    expect(warningTicks).toEqual([259, 599]);
  });

  it('keeps Rain of Cinders on cadence without crowding another major ability', () => {
    const { sim, boss } = claimedEncounter(8110);
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.soakTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.swingTimer = 999;
    sim.player.pos = { x: boss.pos.x + 30, y: boss.pos.y, z: boss.pos.z };
    const starts: number[] = [];
    let previous: string | null = boss.castingAbility;

    for (let i = 0; i < 1_400 && starts.length < 2; i++) {
      sim.tick();
      if (boss.castingAbility === IGNIVAR_SKYFIRE_CAST_ID && previous !== boss.castingAbility) {
        starts.push(sim.time);
      }
      previous = boss.castingAbility;
    }

    expect(starts).toHaveLength(2);
    expect(starts[0]).toBeGreaterThanOrEqual(IGNIVAR_FIRST_SKYFIRE_SECONDS);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(IGNIVAR_SKYFIRE_EVERY);
  });

  it('marks a non-tank for a four-player soak and splits its damage', () => {
    const { sim, boss } = claimedEncounter(8103);
    const offTank = addEncounterPlayer(sim, boss, 'Off Tank', 'paladin');
    sim.setPlayerLevel(20, offTank.id);
    expect(sim.setSpec('protection', offTank.id)).toBe(true);
    const raiders = [
      offTank,
      addEncounterPlayer(sim, boss, 'Soaker One'),
      addEncounterPlayer(sim, boss, 'Soaker Two'),
      addEncounterPlayer(sim, boss, 'Soaker Three'),
      addEncounterPlayer(sim, boss, 'Soaker Four'),
    ];
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);

    const marked = sim.entities.get(boss.ignivar.soakTargetId ?? -1);
    if (!marked) throw new Error('Ignivar did not mark a soak target');
    expect(marked.id).not.toBe(sim.player.id);
    expect(marked.id).not.toBe(offTank.id);
    const soakAura = marked.auras.find((aura) => aura.id === IGNIVAR_SOAK_AURA_ID);
    expect(soakAura).toBeDefined();
    if (!soakAura) throw new Error('Shared Pyre aura was not applied');
    expect(soakAura.school).toBe('physical');
    expect(isDispellableAura(soakAura, false)).toBe(false);
    expect(isDispellableAura({ ...soakAura, encounterOwned: undefined }, false)).toBe(false);
    const soakers = [marked, ...raiders.filter((player) => player.id !== marked.id).slice(0, 3)];
    const outsider = raiders.find((player) => !soakers.includes(player));
    if (!outsider) throw new Error('Soak outsider was not found');
    for (const player of soakers) {
      player.pos = { ...marked.pos };
      player.hp = player.maxHp;
    }
    outsider.pos = { x: marked.pos.x + 20, y: marked.pos.y, z: marked.pos.z };
    outsider.hp = outsider.maxHp;
    boss.ignivar.soakRemaining = DT;

    updateIgnivarEncounter(sim.ctx, boss);

    for (const player of soakers) {
      expect(player.hp).toBe(
        player.maxHp -
          Math.ceil(player.maxHp * (IGNIVAR_SOAK_SHARED_MAX_HP / IGNIVAR_SOAK_REQUIRED_PLAYERS)),
      );
    }
    expect(outsider.hp).toBe(outsider.maxHp);
    expect(marked.auras.some((aura) => aura.id === IGNIVAR_SOAK_AURA_ID)).toBe(false);
    expect(boss.ignivar.soakTargetId).toBeNull();
  });

  it('punishes the whole raid when fewer than four players enter the soak', () => {
    const { sim, boss } = claimedEncounter(8104);
    const markedCandidate = addEncounterPlayer(sim, boss, 'Marked Candidate');
    const secondRaider = addEncounterPlayer(sim, boss, 'Second Raider');
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 0;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    const marked = sim.entities.get(boss.ignivar.soakTargetId ?? -1);
    if (!marked) throw new Error('Ignivar did not mark a soak target');
    for (const player of [sim.player, markedCandidate, secondRaider]) player.hp = player.maxHp;
    markedCandidate.pos = { ...marked.pos };
    secondRaider.pos = {
      x: marked.pos.x + 20,
      y: marked.pos.y,
      z: marked.pos.z,
    };
    sim.player.pos = { x: marked.pos.x - 20, y: marked.pos.y, z: marked.pos.z };
    boss.ignivar.soakRemaining = DT;

    updateIgnivarEncounter(sim.ctx, boss);

    for (const player of [sim.player, markedCandidate, secondRaider]) {
      expect(player.hp).toBe(player.maxHp - Math.ceil(player.maxHp * IGNIVAR_SOAK_FAILURE_MAX_HP));
    }
    expect(marked.auras.some((aura) => aura.id === IGNIVAR_SOAK_AURA_ID)).toBe(false);
    expect(boss.ignivar.soakTargetId).toBeNull();
  });

  it('prefers an unbranded non-tank as the Shared Pyre target', () => {
    const { sim, boss } = claimedEncounter(8111);
    const branded = addEncounterPlayer(sim, boss, 'Branded Raider');
    const unbranded = addEncounterPlayer(sim, boss, 'Unbranded Raider');
    branded.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 10,
      duration: 10,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
    });
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.ignivar.soakTargetId).toBe(unbranded.id);
  });

  it('splits a successful Shared Pyre across every player inside, including a fifth', () => {
    const { sim, boss } = claimedEncounter(8112);
    const raiders = Array.from({ length: 5 }, (_, index) =>
      addEncounterPlayer(sim, boss, `Five-player Soaker ${index + 1}`),
    );
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 0;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    const marked = sim.entities.get(boss.ignivar.soakTargetId ?? -1);
    if (!marked) throw new Error('Ignivar did not mark a soak target');
    for (const player of raiders) {
      player.pos = { ...marked.pos };
      player.hp = player.maxHp;
    }
    sim.player.pos = { x: marked.pos.x + 20, y: marked.pos.y, z: marked.pos.z };
    boss.ignivar.soakRemaining = DT;

    updateIgnivarEncounter(sim.ctx, boss);

    for (const player of raiders) {
      expect(player.hp).toBe(player.maxHp - Math.ceil(player.maxHp * (1.2 / 5)));
    }
  });

  it('fails Shared Pyre if its marked player dies before four survivors gather', () => {
    const { sim, boss } = claimedEncounter(8113);
    const raiders = Array.from({ length: 5 }, (_, index) =>
      addEncounterPlayer(sim, boss, `Survivor ${index + 1}`),
    );
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 0;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    const marked = sim.entities.get(boss.ignivar.soakTargetId ?? -1);
    if (!marked) throw new Error('Ignivar did not mark a soak target');
    marked.dead = true;
    marked.hp = 0;
    const survivors = [sim.player, ...raiders.filter((player) => player.id !== marked.id)];
    for (const player of survivors) {
      player.pos = { ...marked.pos };
      player.hp = player.maxHp;
    }
    boss.ignivar.soakRemaining = DT;

    updateIgnivarEncounter(sim.ctx, boss);

    for (const player of survivors) {
      expect(player.hp).toBe(player.maxHp - Math.ceil(player.maxHp * 0.8));
    }
    expect(marked.auras.some((aura) => aura.id === IGNIVAR_SOAK_AURA_ID)).toBe(false);
    expect(boss.ignivar.soakTargetId).toBeNull();
  });

  it('never chains a follow-up ability on the Shared Pyre resolution tick', () => {
    const { sim, boss } = claimedEncounter(8114);
    const raiders = Array.from({ length: 5 }, (_, index) =>
      addEncounterPlayer(sim, boss, `Follow-up Raider ${index + 1}`),
    );
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.soakTimer = 0;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    const marked = sim.entities.get(boss.ignivar.soakTargetId ?? -1);
    if (!marked) throw new Error('Ignivar did not mark a soak target');
    const soakers = [marked, ...raiders.filter((player) => player.id !== marked.id).slice(0, 3)];
    for (const player of soakers) {
      player.pos = { ...marked.pos };
      player.hp = player.maxHp;
    }
    marked.hp = 1;
    boss.ignivar.soakRemaining = DT;
    boss.ignivar.brandTimer = 0;
    boss.ignivar.skyfireTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(marked.dead).toBe(true);
    expect(marked.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
    expect(boss.castingAbility).toBeNull();
    expect(boss.ignivar.skyfireTimer).toBeGreaterThanOrEqual(IGNIVAR_MAJOR_ABILITY_GAP_SECONDS);
  });

  it('keeps other major abilities paused while Shared Pyre is active', () => {
    const { sim, boss } = claimedEncounter(8116);
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 0;
    boss.ignivar.skyfireTimer = 0;
    boss.ignivar.rotatingRaysTimer = 0;
    boss.ignivar.forgeWaveTimer = 0;
    boss.ignivar.soakTargetId = sim.player.id;
    boss.ignivar.soakRemaining = 1;
    boss.swingTimer = 999;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.ignivar.soakRemaining).toBeCloseTo(1 - DT, 8);
    expect(boss.castingAbility).toBeNull();
    expect(boss.ignivar.frontalTimer).toBe(0);
    expect(boss.ignivar.skyfireTimer).toBe(0);
    expect(boss.ignivar.rotatingRaysTimer).toBe(0);
    expect(boss.ignivar.forgeWaveTimer).toBe(0);
  });

  it('starts Shared Pyre at 24 seconds and begins its cooldown after resolution', () => {
    const { sim, boss } = claimedEncounter(8115);
    const raiders = Array.from({ length: 4 }, (_, index) =>
      addEncounterPlayer(sim, boss, `Cadence Raider ${index + 1}`),
    );
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.forgeWaveTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.swingTimer = 999;
    const starts: number[] = [];
    let priorTarget = boss.ignivar.soakTargetId;

    for (let i = 0; i < 1_600 && starts.length < 2; i++) {
      for (const player of [sim.player, ...raiders]) player.hp = player.maxHp;
      sim.tick();
      const targetId = boss.ignivar.soakTargetId;
      if (targetId !== null && priorTarget === null) starts.push(sim.time);
      const marked = targetId === null ? undefined : sim.entities.get(targetId);
      if (marked) {
        for (const player of [sim.player, ...raiders]) player.pos = { ...marked.pos };
      }
      priorTarget = targetId;
    }

    expect(starts).toHaveLength(2);
    expect(starts[0]).toBeCloseTo(IGNIVAR_FIRST_SOAK_SECONDS, 1);
    expect(starts[1] - starts[0]).toBeCloseTo(IGNIVAR_SOAK_CAST_SECONDS + IGNIVAR_SOAK_EVERY, 1);
  });

  it('marks every available player when fewer than three are present', () => {
    const { sim, boss } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);

    const brand = sim.player.auras.find((a) => a.id === IGNIVAR_BRAND_AURA_ID);
    expect(brand).toMatchObject({
      kind: 'dot',
      tickInterval: 2,
      sourceId: boss.id,
      encounterOwned: true,
    });
    if (!brand) throw new Error('Ignivar brand was not applied');
    expect(isDispellableAura(brand, false)).toBe(false);
    const hpBeforeTick = sim.player.hp;
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(sim.player.hp).toBe(hpBeforeTick - Math.ceil(sim.player.maxHp * 0.05));
  });

  it('ramps each uncleansed Brand tick from one to three stacks without exceeding the cap', () => {
    const { sim, boss } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 0;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    const brand = sim.player.auras.find((aura) => aura.id === IGNIVAR_BRAND_AURA_ID);
    if (!brand) throw new Error('Ignivar brand was not applied');
    const base = Math.ceil(sim.player.maxHp * 0.05);
    expect(brand).toMatchObject({ stacks: 1, value: base });

    const startingHp = sim.player.hp;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(sim.player.hp).toBe(startingHp - base);
    expect(brand).toMatchObject({ stacks: 2, value: base * 2 });

    for (let i = 0; i < 40; i++) sim.tick();
    expect(sim.player.hp).toBe(startingHp - base * 3);
    expect(brand).toMatchObject({ stacks: 3, value: base * 3 });

    sim.player.hp = sim.player.maxHp;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(sim.player.hp).toBe(sim.player.maxHp - base * 3);
    expect(brand).toMatchObject({
      stacks: IGNIVAR_BRAND_MAX_STACKS,
      value: base * 3,
    });
  });

  it('does not reset an uncleansed Brand when that player is selected again', () => {
    const { sim, boss } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 0;
    updateIgnivarEncounter(sim.ctx, boss);
    const brand = sim.player.auras.find((aura) => aura.id === IGNIVAR_BRAND_AURA_ID);
    if (!brand) throw new Error('Ignivar brand was not applied');
    brand.stacks = 3;
    brand.value *= 3;
    brand.tickTimer = 0.75;
    brand.remaining = 1;
    const rampedValue = brand.value;

    boss.ignivar.brandTimer = 0;
    updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.auras.filter((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toHaveLength(1);
    expect(brand).toMatchObject({
      stacks: 3,
      value: rampedValue,
      tickTimer: 0.75,
      remaining: 600,
    });
  });

  it('makes Forge Strike force a tank swap at two Molten Armor stacks', () => {
    const { sim, boss } = claimedEncounter();
    const secondTankPid = sim.addPlayer('paladin', 'Second Tank');
    sim.setPlayerLevel(20);
    sim.setPlayerLevel(20, secondTankPid);
    const secondTank = sim.entities.get(sim.players.get(secondTankPid)?.entityId ?? -1);
    if (!secondTank) throw new Error('Second tank did not spawn');
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    secondTank.pos = { ...sim.player.pos };
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.swingTimer = 999;
    boss.ignivar.forgeStrikeTimer = 0;
    sim.player.hp = sim.player.maxHp;
    secondTank.hp = secondTank.maxHp;
    const firstTankHp = sim.player.hp;

    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.hp).toBe(
      firstTankHp - Math.ceil(sim.player.maxHp * IGNIVAR_FORGE_STRIKE_MAX_HP),
    );
    expect(sim.player.auras.find((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)).toMatchObject(
      {
        stacks: 1,
        value: IGNIVAR_MOLTEN_ARMOR_PER_STACK,
        remaining: IGNIVAR_MOLTEN_ARMOR_DURATION,
        encounterOwned: true,
      },
    );
    expect(boss.ignivar.forgeStrikeTimer).toBe(IGNIVAR_FORGE_STRIKE_EVERY);

    boss.ignivar.forgeStrikeTimer = 0;
    const hpBeforeSecond = sim.player.hp;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.hp).toBe(
      hpBeforeSecond -
        Math.round(
          Math.ceil(sim.player.maxHp * IGNIVAR_FORGE_STRIKE_MAX_HP) *
            (1 + IGNIVAR_MOLTEN_ARMOR_PER_STACK),
        ),
    );
    expect(sim.player.auras.find((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)?.stacks).toBe(
      2,
    );

    boss.forcedTargetId = secondTank.id;
    boss.forcedTargetTimer = 3;
    boss.ignivar.forgeStrikeTimer = 0;
    const secondTankHp = secondTank.hp;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(secondTank.hp).toBe(
      secondTankHp - Math.ceil(secondTank.maxHp * IGNIVAR_FORGE_STRIKE_MAX_HP),
    );
    expect(secondTank.auras.find((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)?.stacks).toBe(
      1,
    );
  });

  it('makes two real Forge Strike stacks amplify Ignivar melee swings by seventy percent', () => {
    const normal = claimedEncounter(7441);
    const molten = claimedEncounter(7441);
    normal.sim.setPlayerLevel(20);
    molten.sim.setPlayerLevel(20);
    normal.sim.player.maxHp = 1_000_000;
    normal.sim.player.hp = normal.sim.player.maxHp;
    molten.sim.player.maxHp = 1_000_000;
    molten.sim.player.hp = molten.sim.player.maxHp;
    molten.sim.player.pos = {
      x: molten.boss.pos.x,
      y: molten.boss.pos.y,
      z: molten.boss.pos.z - 2,
    };
    updateIgnivarEncounter(molten.sim.ctx, molten.boss);
    if (!molten.boss.ignivar) throw new Error('Ignivar state was not initialized');
    molten.boss.ignivar.brandTimer = 999;
    molten.boss.ignivar.frontalTimer = 999;
    molten.boss.ignivar.overlapTimer = 999;
    molten.boss.swingTimer = 999;
    molten.boss.ignivar.forgeStrikeTimer = 0;
    updateIgnivarEncounter(molten.sim.ctx, molten.boss);
    molten.boss.ignivar.forgeStrikeTimer = 0;
    updateIgnivarEncounter(molten.sim.ctx, molten.boss);
    expect(
      molten.sim.player.auras.find((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID),
    ).toMatchObject({ stacks: 2, value: 0.7 });
    molten.sim.player.hp = molten.sim.player.maxHp;
    normal.sim.rng = new Rng(1907);
    molten.sim.rng = new Rng(1907);

    const normalHp = normal.sim.player.hp;
    const moltenHp = molten.sim.player.hp;
    for (let attempt = 0; attempt < 20 && normal.sim.player.hp === normalHp; attempt++) {
      normal.sim.ctx.mobSwing(normal.boss, normal.sim.player);
      molten.sim.ctx.mobSwing(molten.boss, molten.sim.player);
    }
    const normalDamage = normalHp - normal.sim.player.hp;
    const moltenDamage = moltenHp - molten.sim.player.hp;

    expect(normalDamage).toBeGreaterThan(0);
    expect(moltenDamage / normalDamage).toBeCloseTo(1.7, 1);
  });

  it('holds a due Forge Strike out of melee, then repeats exactly fourteen seconds after landing', () => {
    const { sim, boss } = claimedEncounter();
    sim.setPlayerLevel(20);
    sim.player.devGod = true;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.swingTimer = 999;
    boss.ignivar.forgeStrikeTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)).toBe(false);
    expect(boss.ignivar.forgeStrikeTimer).toBeLessThanOrEqual(0);

    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    updateIgnivarEncounter(sim.ctx, boss);
    const armor = sim.player.auras.find((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID);
    expect(armor?.stacks).toBe(1);
    for (let i = 0; i < 279; i++) updateIgnivarEncounter(sim.ctx, boss);
    expect(armor?.stacks).toBe(1);
    updateIgnivarEncounter(sim.ctx, boss);
    expect(armor?.stacks).toBe(2);
  });

  it('retargets a living tank before a melee swing when Forge Strike kills its target', () => {
    const { sim, boss } = claimedEncounter();
    const secondTankPid = sim.addPlayer('paladin', 'Second Tank');
    sim.setPlayerLevel(20);
    sim.setPlayerLevel(20, secondTankPid);
    const secondTank = sim.entities.get(sim.players.get(secondTankPid)?.entityId ?? -1);
    if (!secondTank) throw new Error('Second tank did not spawn');
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    secondTank.pos = { ...sim.player.pos };
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.overlapTimer = 999;
    boss.ignivar.forgeStrikeTimer = 0;
    boss.forcedTargetId = sim.player.id;
    boss.forcedTargetTimer = 3;
    boss.swingTimer = 0;
    sim.player.hp = 1;
    const secondTankHp = secondTank.hp;
    let draws = 0;
    sim.rng.setObserver(() => draws++);

    updateIgnivarEncounter(sim.ctx, boss);
    sim.rng.setObserver(null);

    expect(sim.player.dead).toBe(true);
    expect(boss.aggroTargetId).toBe(secondTank.id);
    expect(secondTank.hp).toBeLessThan(secondTankHp);
    expect(boss.swingTimer).toBeGreaterThan(0);
    expect(draws).toBeGreaterThan(0);
  });

  it('retargets a living tank before starting a frontal when Forge Strike kills its target', () => {
    const { sim, boss } = claimedEncounter();
    const secondTankPid = sim.addPlayer('paladin', 'Second Tank');
    sim.setPlayerLevel(20);
    sim.setPlayerLevel(20, secondTankPid);
    const secondTank = sim.entities.get(sim.players.get(secondTankPid)?.entityId ?? -1);
    if (!secondTank) throw new Error('Second tank did not spawn');
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    secondTank.pos = { ...sim.player.pos };
    boss.swingTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 0;
    boss.ignivar.overlapTimer = 999;
    boss.ignivar.forgeStrikeTimer = 0;
    boss.forcedTargetId = sim.player.id;
    boss.forcedTargetTimer = 3;
    sim.player.hp = 1;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.dead).toBe(true);
    expect(boss.aggroTargetId).toBe(secondTank.id);
    expect(boss.castingAbility).toBe(IGNIVAR_FRONTAL_CAST_ID);
    expect(boss.castTargetId).toBe(secondTank.id);
    expect(boss.castAim).toEqual(secondTank.pos);
  });

  it('retargets a living ally before starting a frontal when Brand overlap kills its target', () => {
    const { sim, boss } = claimedEncounter();
    const allyPid = sim.addPlayer('paladin', 'Surviving Tank');
    const ally = sim.entities.get(sim.players.get(allyPid)?.entityId ?? -1);
    if (!ally) throw new Error('Surviving tank did not spawn');
    sim.setPlayerLevel(20);
    sim.setPlayerLevel(20, allyPid);
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    ally.pos = { ...sim.player.pos };
    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 0;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.overlapTimer = 0;
    boss.forcedTargetId = sim.player.id;
    boss.forcedTargetTimer = 3;
    sim.player.hp = 1;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.dead).toBe(true);
    expect(ally.dead).toBe(false);
    expect(boss.aggroTargetId).toBe(ally.id);
    expect(boss.castingAbility).toBe(IGNIVAR_FRONTAL_CAST_ID);
    expect(boss.castTargetId).toBe(ally.id);
    expect(boss.castAim).toEqual(ally.pos);
  });

  it('stops the mechanic tick without RNG or casts when Brand overlap leaves no living target', () => {
    const { sim, boss } = claimedEncounter();
    const allyPid = sim.addPlayer('priest', 'Last Ally');
    const ally = sim.entities.get(sim.players.get(allyPid)?.entityId ?? -1);
    if (!ally) throw new Error('Last ally did not spawn');
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    ally.pos = { ...sim.player.pos };
    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 0;
    boss.ignivar.forgeStrikeTimer = 0;
    boss.ignivar.overlapTimer = 0;
    boss.swingTimer = 0;
    sim.player.hp = 1;
    ally.hp = 1;
    let draws = 0;
    sim.rng.setObserver(() => draws++);

    updateIgnivarEncounter(sim.ctx, boss);
    sim.rng.setObserver(null);

    expect(sim.player.dead).toBe(true);
    expect(ally.dead).toBe(true);
    expect(boss.castingAbility).toBeNull();
    expect(boss.swingTimer).toBe(0);
    expect(draws).toBe(0);
  });

  it('keeps Molten Armor and Shared Pyre out of water and removes both on reset', () => {
    const { sim, boss, conduit } = claimedEncounter();
    sim.setPlayerLevel(20);
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.forgeStrikeTimer = 0;
    boss.swingTimer = 999;
    conduit.templateId = IGNIVAR_WATER_CONDUIT_TEMPLATES.active;
    boss.ignivar.conduitTimers.north_west = 5;

    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)).toBe(true);
    sim.player.auras.push({
      id: IGNIVAR_SOAK_AURA_ID,
      name: 'Shared Pyre',
      kind: 'vulnerability',
      remaining: IGNIVAR_SOAK_CAST_SECONDS,
      duration: IGNIVAR_SOAK_CAST_SECONDS,
      value: 0,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    sim.player.pos = { ...conduit.pos };
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)).toBe(true);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_SOAK_AURA_ID)).toBe(true);

    resetIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)).toBe(false);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_SOAK_AURA_ID)).toBe(false);
  });

  it('survives a real friendly dispel cast and still requires encounter water', () => {
    const sim = new Sim({
      seed: 7,
      playerClass: 'paladin',
      autoEquip: true,
      devCommands: true,
    });
    sim.setPlayerLevel(20);
    expect(sim.applyTalents({ spec: null, rows: { 8: 'pal_r8_cleansing_verdict' } })).toBe(true);
    expect(enterDungeon(sim.ctx, 'ignivar_raid_arena', sim.player.id, true)).toBe(true);
    const boss = [...sim.entities.values()].find((e) => e.templateId === IGNIVAR_BOSS_ID);
    if (!boss) throw new Error('Ignivar did not spawn');
    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    sim.player.resource = sim.player.maxResource;
    sim.targetEntity(sim.player.id);

    sim.castAbility('cleansing_verdict');
    sim.tick();

    expect(sim.player.cooldowns.has('cleansing_verdict')).toBe(true);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);
  });

  it('runs the encounter through the production mob tick dispatcher', () => {
    const { sim, boss } = claimedEncounter();
    sim.player.devGod = true;

    for (let i = 0; i < 45; i++) sim.tick();
    expect(sim.player.auras.some((a) => a.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);

    for (let i = 0; i < 120; i++) sim.tick();
    expect(boss.castingAbility).toBe(IGNIVAR_FRONTAL_CAST_ID);
    expect(boss.ignivar?.frontalCastRemaining).toBeGreaterThan(0);
  });

  it('locks a visible frontal, activates the aimed conduit, and cleanses its water zone', () => {
    const { sim, boss, conduit } = claimedEncounter();
    const bystanderPid = sim.addPlayer('mage', 'Bystander');
    const bystanderMeta = sim.players.get(bystanderPid);
    const bystander = bystanderMeta ? sim.entities.get(bystanderMeta.entityId) : undefined;
    if (!bystander) throw new Error('Raid bystander did not spawn');
    const origin = instanceOrigin(DUNGEONS.ignivar_raid_arena.index, 0);
    sim.player.pos.x = origin.x - 18;
    sim.player.pos.z = origin.z + 18;
    bystander.pos = { x: origin.x + 18, y: 0, z: origin.z - 18 };
    boss.facing = Math.atan2(sim.player.pos.x - boss.pos.x, sim.player.pos.z - boss.pos.z);
    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      tickInterval: 2,
      tickTimer: 2,
      sourceId: boss.id,
      school: 'fire',
      finalDamage: true,
    });
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.frontalTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.castingAbility).toBe(IGNIVAR_FRONTAL_CAST_ID);
    expect(boss.castTotal).toBe(IGNIVAR_FRONTAL_CAST_SECONDS);
    const hpBeforeFrontal = sim.player.hp;
    const bystanderHp = bystander.hp;
    boss.ignivar.frontalCastRemaining = 0.01;
    const events = sim.tick();

    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.active);
    expect(sim.player.hp).toBe(hpBeforeFrontal - Math.ceil(sim.player.maxHp * 0.3));
    expect(bystander.hp).toBe(bystanderHp);
    expect(IGNIVAR_FRONTAL_VFX_DISTANCE).toBe(30);
    const blasts = events.filter(
      (event): event is Extract<SimEvent, { type: 'spellfxAt' }> =>
        event.type === 'spellfxAt' &&
        event.ability === IGNIVAR_FRONTAL_CAST_ID &&
        event.fx === 'burst',
    );
    expect(blasts).toHaveLength(1);
    const blast = blasts[0];
    expect(blast).toBeDefined();
    if (!blast) throw new Error('Searing Torrent did not emit its frontal VFX');
    expect(blast.sourceId).toBe(boss.id);
    expect(blast.school).toBe('fire');
    expect(blast.radius).toBeUndefined();
    const blastDx = blast.x - boss.pos.x;
    const blastDz = blast.z - boss.pos.z;
    expect(Math.hypot(blastDx, blastDz)).toBeCloseTo(IGNIVAR_FRONTAL_VFX_DISTANCE, 8);
    expect(
      (blastDx * Math.sin(boss.ignivar.frontalFacing) +
        blastDz * Math.cos(boss.ignivar.frontalFacing)) /
        IGNIVAR_FRONTAL_VFX_DISTANCE,
    ).toBeCloseTo(1, 8);
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((a) => a.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);
    sim.player.auras.push({
      id: 'control_debuff',
      name: 'Control Debuff',
      kind: 'slow',
      remaining: 5,
      duration: 5,
      value: 0.5,
      sourceId: boss.id,
      school: 'physical',
    });
    sim.player.pos.x = conduit.pos.x;
    sim.player.pos.z = conduit.pos.z;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((a) => a.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
    expect(sim.player.auras.some((a) => a.id === 'control_debuff')).toBe(true);
  });

  it('only cleanses inside an active conduit, never ready or cooldown water', () => {
    const { sim, boss, conduit } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.swingTimer = 999;
    sim.player.pos = { ...conduit.pos };
    const applyBrand = () => {
      sim.player.auras = sim.player.auras.filter((aura) => aura.id !== IGNIVAR_BRAND_AURA_ID);
      sim.player.auras.push({
        id: IGNIVAR_BRAND_AURA_ID,
        name: 'Brand of the Pyre',
        kind: 'dot',
        remaining: 600,
        duration: 600,
        value: 1,
        sourceId: boss.id,
        school: 'fire',
        encounterOwned: true,
      });
    };

    applyBrand();
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);
    conduit.templateId = IGNIVAR_WATER_CONDUIT_TEMPLATES.cooldown;
    boss.ignivar.conduitTimers.north_west = 20;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);
    conduit.templateId = IGNIVAR_WATER_CONDUIT_TEMPLATES.active;
    boss.ignivar.conduitTimers.north_west = 5;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
  });

  it('damages both a branded carrier and an overlapping unbranded ally without propagation', () => {
    const { sim, boss } = claimedEncounter();
    const allyPid = sim.addPlayer('priest', 'Waterbearer');
    const allyMeta = sim.players.get(allyPid);
    const ally = allyMeta ? sim.entities.get(allyMeta.entityId) : undefined;
    if (!ally) throw new Error('Raid ally did not spawn');
    const origin = instanceOrigin(DUNGEONS.ignivar_raid_arena.index, 0);
    sim.player.pos = { x: origin.x + 15, y: 0, z: origin.z };
    ally.pos = { ...sim.player.pos };
    boss.swingTimer = 999;
    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.overlapTimer = 0;
    const carrierHp = sim.player.hp;
    const allyHp = ally.hp;

    updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.hp).toBe(carrierHp - Math.ceil(sim.player.maxHp * 0.06));
    expect(ally.hp).toBe(allyHp - Math.ceil(ally.maxHp * 0.06));
    expect(ally.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
    ally.pos.x += 10;
    boss.ignivar.overlapTimer = 0;
    const separatedCarrierHp = sim.player.hp;
    const separatedAllyHp = ally.hp;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.hp).toBe(separatedCarrierHp);
    expect(ally.hp).toBe(separatedAllyHp);
  });

  it('preserves the exact pull during combat-exit memory but cleans brands outside on reset', () => {
    const { sim, boss, conduit } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    conduit.templateId = IGNIVAR_WATER_CONDUIT_TEMPLATES.active;
    boss.ignivar.conduitTimers.north_west = 7;
    boss.combatExitHoldUntil = sim.ctx.time + 5;
    sim.player.pos = { x: 0, y: 0, z: 0 };

    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.aiState).toBe('evade');
    expect(boss.ignivar).toBeDefined();
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.active);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);

    boss.combatExitHoldUntil = sim.ctx.time;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.ignivar).toBeUndefined();
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
  });

  it('removes encounter-owned player auras immediately when leaving the development raid', () => {
    const { sim, boss } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 0;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);
    sim.player.auras.push({
      id: IGNIVAR_MOLTEN_ARMOR_AURA_ID,
      name: 'Molten Armor',
      kind: 'vulnerability',
      remaining: 30,
      duration: 30,
      value: IGNIVAR_MOLTEN_ARMOR_PER_STACK,
      stacks: 2,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });

    expect(leaveDungeon(sim.ctx, sim.player.id)).toBe(true);

    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)).toBe(false);
  });

  it('cleans brands, casts, and conduit state immediately when Ignivar dies', () => {
    const { sim, boss, conduit } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.apocalypseTriggered = true;
    boss.ignivar.apocalypseResolved = true;
    boss.ignivar.forgeJudgmentPhase = 'done';
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_LAST_INFERNO_HP_THRESHOLD);
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.enraged).toBe(true);
    boss.ignivar.frontalCastRemaining = 2;
    boss.castingAbility = IGNIVAR_FRONTAL_CAST_ID;
    conduit.templateId = IGNIVAR_WATER_CONDUIT_TEMPLATES.active;
    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });

    boss.dead = true;
    sim.tick();

    expect(boss.ignivar).toBeUndefined();
    expect(boss.enraged).toBe(false);
    expect(boss.auras.some((aura) => aura.id === IGNIVAR_LAST_INFERNO_AURA_ID)).toBe(false);
    expect(boss.castingAbility).toBeNull();
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
  });

  it('ticks the frontal cadence during its cast and honors forced-target threat', () => {
    const { sim, boss } = claimedEncounter();
    const tankPid = sim.addPlayer('paladin', 'Second Tank');
    const tankMeta = sim.players.get(tankPid);
    const tank = tankMeta ? sim.entities.get(tankMeta.entityId) : undefined;
    if (!tank) throw new Error('Second tank did not spawn');
    tank.pos = { ...sim.player.pos };
    boss.forcedTargetId = tank.id;
    boss.forcedTargetTimer = 3;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.aggroTargetId).toBe(tank.id);
    expect(boss.forcedTargetTimer).toBeLessThan(3);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.frontalTimer = 0;

    updateIgnivarEncounter(sim.ctx, boss);
    let sawRelease = false;
    let secondCastTicks = 0;
    for (let i = 1; i <= 600; i++) {
      updateIgnivarEncounter(sim.ctx, boss);
      if (boss.castingAbility === null) sawRelease = true;
      if (sawRelease && boss.castingAbility === IGNIVAR_FRONTAL_CAST_ID) {
        secondCastTicks = i;
        break;
      }
    }

    expect(secondCastTicks * DT).toBeCloseTo(IGNIVAR_FRONTAL_EVERY, 5);
  });

  it('selects exactly three unique targets deterministically from a ten-player raid', () => {
    const selectTargets = (seed: number): number[] => {
      const { sim, boss } = claimedEncounter(seed);
      const origin = instanceOrigin(DUNGEONS.ignivar_raid_arena.index, 0);
      for (let i = 1; i < 10; i++) sim.addPlayer(i % 2 === 0 ? 'mage' : 'priest', `Raider ${i}`);
      for (const meta of sim.players.values()) {
        const player = sim.entities.get(meta.entityId);
        if (player) player.pos = { x: origin.x + 15, y: 0, z: origin.z };
      }
      boss.swingTimer = 999;
      updateIgnivarEncounter(sim.ctx, boss);
      if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
      boss.ignivar.brandTimer = 0;
      boss.ignivar.frontalTimer = 999;
      updateIgnivarEncounter(sim.ctx, boss);
      return [...sim.players.values()]
        .map((meta) => sim.entities.get(meta.entityId))
        .filter((player) => player?.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID))
        .map((player) => player?.id ?? -1)
        .sort((a, b) => a - b);
    };

    const first = selectTargets(99);
    expect(first).toHaveLength(IGNIVAR_BRAND_TARGETS_NORMAL);
    expect(new Set(first).size).toBe(IGNIVAR_BRAND_TARGETS_NORMAL);
    expect(selectTargets(99)).toEqual(first);
  });

  it('honors the full ten-second active and thirty-five-second cooldown windows', () => {
    const { sim, boss, conduit } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.swingTimer = 999;
    conduit.templateId = IGNIVAR_WATER_CONDUIT_TEMPLATES.active;
    boss.ignivar.conduitTimers.north_west = IGNIVAR_CONDUIT_ACTIVE_SECONDS;

    let activeTicks = 0;
    while (conduit.templateId === IGNIVAR_WATER_CONDUIT_TEMPLATES.active && activeTicks < 1_000) {
      updateIgnivarEncounter(sim.ctx, boss);
      activeTicks++;
    }
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.cooldown);
    expect(activeTicks * DT).toBeCloseTo(IGNIVAR_CONDUIT_ACTIVE_SECONDS, 5);

    let cooldownTicks = 0;
    while (
      conduit.templateId === IGNIVAR_WATER_CONDUIT_TEMPLATES.cooldown &&
      cooldownTicks < 1_000
    ) {
      updateIgnivarEncounter(sim.ctx, boss);
      cooldownTicks++;
    }
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready);
    expect(cooldownTicks * DT).toBeCloseTo(IGNIVAR_CONDUIT_COOLDOWN_SECONDS, 5);
  });

  it('advances active conduits through cooldown back to ready and resets a failed pull', () => {
    const { sim, boss, conduit } = claimedEncounter();
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    conduit.templateId = IGNIVAR_WATER_CONDUIT_TEMPLATES.active;
    boss.ignivar.conduitTimers.north_west = 0.01;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.cooldown);
    boss.ignivar.conduitTimers.north_west = 0.01;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready);

    sim.player.auras.push({
      id: IGNIVAR_BRAND_AURA_ID,
      name: 'Brand of the Pyre',
      kind: 'dot',
      remaining: 600,
      duration: 600,
      value: 1,
      sourceId: boss.id,
      school: 'fire',
    });
    resetIgnivarEncounter(sim.ctx, boss);
    expect(boss.ignivar).toBeUndefined();
    expect(boss.castingAbility).toBeNull();
    expect(conduit.templateId).toBe(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready);
    expect(sim.player.auras.some((a) => a.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
  });

  it('starts Last Inferno at twenty percent and replaces overlapping normal mechanics', () => {
    const { sim, boss } = claimedEncounter();
    sim.player.devGod = true;
    const normalSwingInterval = boss.weapon.speed * sim.ctx.swingIntervalMult(boss);
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.apocalypseTriggered = true;
    boss.ignivar.apocalypseResolved = true;
    boss.ignivar.forgeJudgmentPhase = 'done';
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_LAST_INFERNO_HP_THRESHOLD) + 1;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.enraged).toBe(false);
    expect(boss.ignivar?.lastInfernoTriggered).toBe(false);

    boss.hp = Math.floor(boss.maxHp * IGNIVAR_LAST_INFERNO_HP_THRESHOLD);
    boss.ignivar.brandTimer = DT;
    boss.ignivar.frontalTimer = DT;
    boss.ignivar.forgeStrikeTimer = DT;
    boss.ignivar.forgeWaveTimer = DT;
    boss.ignivar.soakTimer = DT;
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.enraged).toBe(true);
    expect(boss.ignivar.lastInfernoTriggered).toBe(true);
    expect(boss.ignivar.lastInfernoRemaining).toBe(IGNIVAR_LAST_INFERNO_SECONDS);
    expect(boss.auras.find((aura) => aura.id === IGNIVAR_LAST_INFERNO_AURA_ID)).toMatchObject({
      remaining: IGNIVAR_LAST_INFERNO_SECONDS,
      value: 1.2,
      encounterOwned: true,
    });
    expect(boss.weapon.speed * sim.ctx.swingIntervalMult(boss)).toBeCloseTo(
      normalSwingInterval / 1.2,
      5,
    );
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(false);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_MOLTEN_ARMOR_AURA_ID)).toBe(false);
    expect(boss.castingAbility).toBeNull();
    expect(boss.ignivar.forgeWaveTimer).toBe(DT);
    expect(boss.ignivar.soakTimer).toBe(DT);
    expect(boss.ignivar.finalNextFrontal).toBe('searing');

    boss.ignivar.meteorTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.finalFrontalTimer = 999;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(boss.ignivar.forgeWaveTimer).toBe(DT);
    expect(boss.ignivar.soakTimer).toBe(DT);
    expect(boss.castingAbility).toBeNull();
  });

  it('waits for Shared Pyre to resolve before entering Last Inferno', () => {
    const { sim, boss } = claimedEncounter(9218);
    sim.player.devGod = true;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.apocalypseTriggered = true;
    boss.ignivar.apocalypseResolved = true;
    boss.ignivar.forgeJudgmentPhase = 'done';
    boss.ignivar.brandTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.skyfireTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.forgeWaveTimer = 999;
    boss.ignivar.soakTargetId = sim.player.id;
    boss.ignivar.soakRemaining = DT;
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_LAST_INFERNO_HP_THRESHOLD);

    updateIgnivarEncounter(sim.ctx, boss);

    expect(boss.ignivar.lastInfernoTriggered).toBe(false);
    expect(boss.ignivar.soakTargetId).toBeNull();

    let ticksUntilFirstFinalCast = 0;
    while (boss.castingAbility === null && ticksUntilFirstFinalCast < 200) {
      updateIgnivarEncounter(sim.ctx, boss);
      ticksUntilFirstFinalCast++;
    }

    expect(boss.ignivar.lastInfernoTriggered).toBe(true);
    expect(ticksUntilFirstFinalCast * DT).toBeGreaterThanOrEqual(6);
    expect(boss.castingAbility).toBe(IGNIVAR_FRONTAL_CAST_ID);
  });

  it('increases Ignivar melee damage by thirty-five percent during Last Inferno', () => {
    const normal = claimedEncounter(9217);
    const enraged = claimedEncounter(9217);
    normal.sim.setPlayerLevel(20);
    enraged.sim.setPlayerLevel(20);
    normal.boss.enraged = false;
    enraged.boss.enraged = true;
    normal.sim.player.maxHp = 1_000_000;
    normal.sim.player.hp = normal.sim.player.maxHp;
    enraged.sim.player.maxHp = 1_000_000;
    enraged.sim.player.hp = enraged.sim.player.maxHp;

    const normalHp = normal.sim.player.hp;
    const enragedHp = enraged.sim.player.hp;
    for (let attempt = 0; attempt < 20; attempt++) {
      normal.sim.ctx.mobSwing(normal.boss, normal.sim.player);
      enraged.sim.ctx.mobSwing(enraged.boss, enraged.sim.player);
    }
    const normalDamage = normalHp - normal.sim.player.hp;
    const enragedDamage = enragedHp - enraged.sim.player.hp;

    expect(normalDamage).toBeGreaterThan(0);
    expect(enragedDamage).toBeGreaterThan(normalDamage);
    expect(enragedDamage / normalDamage).toBeCloseTo(1.35, 1);
  });

  it('wipes the claimed raid exactly when the forty-five-second Last Inferno expires', () => {
    const { sim, boss } = claimedEncounter();
    const outsiderPid = sim.addPlayer('mage', 'Outsider');
    const outsider = sim.entities.get(sim.players.get(outsiderPid)?.entityId ?? -1);
    if (!outsider) throw new Error('Outsider did not spawn');
    outsider.pos = { x: 0, y: 0, z: 0 };
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.apocalypseTriggered = true;
    boss.ignivar.apocalypseResolved = true;
    boss.ignivar.forgeJudgmentPhase = 'done';
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_LAST_INFERNO_HP_THRESHOLD);
    updateIgnivarEncounter(sim.ctx, boss);
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.ignivar.rotatingRaysTimer = 999;
    boss.ignivar.meteorTimer = 999;
    boss.ignivar.finalFrontalTimer = 999;
    boss.swingTimer = 999;

    const preWipeTicks = Math.round(IGNIVAR_LAST_INFERNO_SECONDS / DT) - 1;
    for (let i = 0; i < preWipeTicks; i++) updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.dead).toBe(false);
    expect(boss.ignivar.lastInfernoRemaining).toBeCloseTo(DT, 5);

    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.dead).toBe(true);
    expect(outsider.dead).toBe(false);
    expect(boss.ignivar.lastInfernoResolved).toBe(true);
  });

  it('announces Last Inferno without taking over the boss cast bar', () => {
    const { sim, boss } = claimedEncounter();
    sim.player.devGod = true;
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.apocalypseTriggered = true;
    boss.ignivar.apocalypseResolved = true;
    boss.ignivar.forgeJudgmentPhase = 'done';
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.ignivar.forgeStrikeTimer = 999;
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_LAST_INFERNO_HP_THRESHOLD);

    const events = sim.tick();

    expect(boss.castingAbility).toBeNull();
    expect(
      events.some(
        (event) =>
          event.type === 'chat' &&
          event.channel === 'yell' &&
          event.text === 'The last flame consumes all!',
      ),
    ).toBe(true);

    const nextEvents = sim.tick();
    expect(
      nextEvents.some(
        (event) =>
          event.type === 'chat' &&
          event.channel === 'yell' &&
          event.text === 'The last flame consumes all!',
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === 'spellfx' &&
          event.sourceId === boss.id &&
          event.targetId === boss.id &&
          event.fx === 'nova',
      ),
    ).toBe(true);
  });

  it('ships one Normal Apocalypse add at the sixty-five-percent health gate', () => {
    expect(IGNIVAR_APOCALYPSE_HP_THRESHOLD).toBe(0.65);
    expect(IGNIVAR_APOCALYPSE_CAST_SECONDS).toBe(20);

    const { sim, boss } = claimedEncounter();
    sim.player.devGod = true;
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_APOCALYPSE_HP_THRESHOLD) + 1;
    updateIgnivarEncounter(sim.ctx, boss);
    expect(
      [...sim.entities.values()].filter(
        (entity) => entity.templateId === IGNIVAR_APOCALYPSE_ADD_ID,
      ),
    ).toHaveLength(0);
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_APOCALYPSE_HP_THRESHOLD);

    updateIgnivarEncounter(sim.ctx, boss);

    const adds = [...sim.entities.values()].filter(
      (entity) => entity.templateId === IGNIVAR_APOCALYPSE_ADD_ID,
    );
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({
      hostile: true,
      inCombat: true,
      castingAbility: IGNIVAR_APOCALYPSE_CAST_ID,
      castTotal: IGNIVAR_APOCALYPSE_CAST_SECONDS,
      castRemaining: IGNIVAR_APOCALYPSE_CAST_SECONDS,
      channeling: true,
    });
    expect(boss).toMatchObject({
      hostile: true,
      inCombat: true,
      aiState: 'attack',
    });
    expect(boss.ignivar?.apocalypseAddId).toBe(adds[0].id);
    expect(boss.summonedIds).toContain(adds[0].id);
    for (let i = 0; i < 50; i++) updateIgnivarEncounter(sim.ctx, boss);
    expect(
      [...sim.entities.values()].filter(
        (entity) => entity.templateId === IGNIVAR_APOCALYPSE_ADD_ID,
      ),
    ).toHaveLength(1);
  });

  it('announces Apocalypse with a raid-wide yell and a location-safe spawn effect', () => {
    const { sim, boss } = claimedEncounter();
    sim.player.devGod = true;
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_APOCALYPSE_HP_THRESHOLD);

    const events = sim.tick();
    const add = [...sim.entities.values()].find(
      (entity) => entity.templateId === IGNIVAR_APOCALYPSE_ADD_ID,
    );
    if (!add) throw new Error('Apocalypse add did not spawn');
    expect(
      events.some(
        (event) =>
          event.type === 'chat' &&
          event.channel === 'yell' &&
          event.text === 'The Heart of the End awakens. Let the world burn!',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'spellfxAt' &&
          event.x === add.pos.x &&
          event.z === add.pos.z &&
          event.fx === 'nova',
      ),
    ).toBe(true);

    const nextEvents = sim.tick();
    expect(
      nextEvents.some(
        (event) =>
          event.type === 'chat' &&
          event.channel === 'yell' &&
          event.text === 'The Heart of the End awakens. Let the world burn!',
      ),
    ).toBe(false);
  });

  it('keeps the Apocalypse add stationary and non-attacking while Ignivar stays active', () => {
    const { sim, boss } = claimedEncounter();
    sim.player.devGod = true;
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_APOCALYPSE_HP_THRESHOLD);
    updateIgnivarEncounter(sim.ctx, boss);
    const add = [...sim.entities.values()].find(
      (entity) => entity.templateId === IGNIVAR_APOCALYPSE_ADD_ID,
    );
    if (!add) throw new Error('Apocalypse add did not spawn');
    const spawn = { ...add.pos };
    const swingBefore = add.swingTimer;
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = DT;
    boss.ignivar.frontalTimer = DT;

    updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.auras.some((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)).toBe(true);
    expect(boss.castingAbility).toBe(IGNIVAR_FRONTAL_CAST_ID);

    for (let i = 0; i < 40; i++) sim.tick();

    expect(add.pos).toEqual(spawn);
    expect(add.swingTimer).toBe(swingBefore);
    expect(add.castingAbility).toBe(IGNIVAR_APOCALYPSE_CAST_ID);
    expect(add.castRemaining).toBeLessThan(IGNIVAR_APOCALYPSE_CAST_SECONDS);
    expect(boss.inCombat).toBe(true);
    expect(boss.aiState).toBe('attack');
  });

  it('cancels Apocalypse when the add dies and never summons it twice in one pull', () => {
    const { sim, boss } = claimedEncounter();
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_APOCALYPSE_HP_THRESHOLD);
    updateIgnivarEncounter(sim.ctx, boss);
    const add = [...sim.entities.values()].find(
      (entity) => entity.templateId === IGNIVAR_APOCALYPSE_ADD_ID,
    );
    if (!add) throw new Error('Apocalypse add did not spawn');

    sim.ctx.dealDamage(
      sim.player,
      add,
      add.maxHp * 100,
      false,
      'physical',
      'Test Kill',
      'hit',
      true,
    );
    expect(add.dead).toBe(true);
    const hpBefore = sim.player.hp;
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.swingTimer = 999;

    const ticksPastOriginalDeadline = Math.round(IGNIVAR_APOCALYPSE_CAST_SECONDS / DT) + 1;
    for (let i = 0; i < ticksPastOriginalDeadline; i++) updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.dead).toBe(false);
    expect(sim.player.hp).toBe(hpBefore);
    expect(boss.ignivar?.apocalypseResolved).toBe(true);
    expect(
      [...sim.entities.values()].filter(
        (entity) => entity.templateId === IGNIVAR_APOCALYPSE_ADD_ID && !entity.dead,
      ),
    ).toHaveLength(0);
  });

  it('wipes only living players inside the claimed arena when Apocalypse completes', () => {
    const { sim, boss } = claimedEncounter();
    const raiderPid = sim.addPlayer('priest', 'Raid Healer');
    const outsiderPid = sim.addPlayer('mage', 'Outsider');
    const raider = sim.entities.get(sim.players.get(raiderPid)?.entityId ?? -1);
    const outsider = sim.entities.get(sim.players.get(outsiderPid)?.entityId ?? -1);
    if (!raider || !outsider) throw new Error('Test players did not spawn');
    raider.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 12 };
    outsider.pos = { x: 0, y: 0, z: 0 };
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_APOCALYPSE_HP_THRESHOLD);
    updateIgnivarEncounter(sim.ctx, boss);
    if (!boss.ignivar) throw new Error('Ignivar state was not initialized');
    boss.ignivar.brandTimer = 999;
    boss.ignivar.frontalTimer = 999;
    boss.swingTimer = 999;

    const preWipeTicks = Math.round(IGNIVAR_APOCALYPSE_CAST_SECONDS / DT) - 1;
    for (let i = 0; i < preWipeTicks; i++) updateIgnivarEncounter(sim.ctx, boss);
    expect(sim.player.dead).toBe(false);
    expect(raider.dead).toBe(false);
    expect(boss.ignivar.apocalypseCastRemaining).toBeCloseTo(DT, 5);

    updateIgnivarEncounter(sim.ctx, boss);

    expect(sim.player.dead).toBe(true);
    expect(raider.dead).toBe(true);
    expect(outsider.dead).toBe(false);
    expect(boss.ignivar.apocalypseResolved).toBe(true);
  });

  it('despawns the Apocalypse add on reset and rearms it for a fresh pull', () => {
    const { sim, boss } = claimedEncounter();
    boss.hp = Math.floor(boss.maxHp * IGNIVAR_APOCALYPSE_HP_THRESHOLD);
    updateIgnivarEncounter(sim.ctx, boss);
    const firstAddId = boss.ignivar?.apocalypseAddId;
    if (firstAddId === null || firstAddId === undefined) {
      throw new Error('Apocalypse add did not spawn');
    }
    sim.player.targetId = firstAddId;

    resetIgnivarEncounter(sim.ctx, boss);

    expect(sim.entities.has(firstAddId)).toBe(false);
    expect(sim.player.targetId).toBeNull();
    expect(boss.summonedIds).toEqual([]);
    updateIgnivarEncounter(sim.ctx, boss);
    const secondAddId = boss.ignivar?.apocalypseAddId;
    expect(secondAddId).not.toBeNull();
    expect(secondAddId).not.toBe(firstAddId);
    expect(sim.entities.get(secondAddId ?? -1)?.templateId).toBe(IGNIVAR_APOCALYPSE_ADD_ID);
  });
});
