import { describe, expect, it } from 'vitest';

import {
  resetVarkhulEncounter,
  updateVarkhulEncounter,
  VARKHUL_BOSS_ID,
  VARKHUL_CINDER_ARTIFICER_ID,
  VARKHUL_CRUCIBLE_WARDEN_ID,
  VARKHUL_EMBER_SENTINEL_ID,
  VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID,
  VARKHUL_FORGE_MELTDOWN_ABILITY_ID,
  VARKHUL_FORGE_PORTAL_ABILITY_ID,
} from '../src/sim/encounters/varkhul';
import { IGNIVAR_SECOND_WING_ID } from '../src/sim/ignivar_raid_ids';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';
import {
  VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS,
  VARKHUL_FORGE_BEAM_WARMUP_SECONDS,
  VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS,
  varkhulForgeBeamExposureResetSeconds,
  varkhulForgeMeltdownInitialDamageMaxHp,
  varkhulForgeMeltdownTickDamageMaxHp,
} from '../src/sim/varkhul_forge_beams';
import {
  VARKHUL_FORGE_INTERMISSION_SECONDS_HEROIC,
  VARKHUL_FORGE_INTERMISSION_SECONDS_NORMAL,
  VARKHUL_FORGE_LOCAL_POS,
  VARKHUL_FORGE_PORTAL_LOCAL_POSITIONS,
  VARKHUL_FORGE_PORTAL_TELEGRAPH_SECONDS,
  VARKHUL_FORGE_TEACHING_BEAM_SECONDS,
  VARKHUL_FORGE_TEACHING_GAP_SECONDS,
  VARKHUL_WORK_FACING,
  VARKHUL_WORK_LOCAL_POS,
} from '../src/sim/varkhul_forge_intermission';

function claimedEncounter(seed: number, heroic = false, engage = true): { sim: Sim; boss: Entity } {
  const sim = new Sim({ seed, playerClass: 'warrior', devCommands: true });
  expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, sim.player.id, true)).toBe(true);
  const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
  if (!instance) throw new Error('Inner Crucible did not claim an instance');
  instance.difficulty = heroic ? 'heroic' : 'normal';
  const boss = instance.mobIds
    .map((id) => sim.entities.get(id))
    .find((entity) => entity?.templateId === VARKHUL_BOSS_ID);
  if (!boss) throw new Error('Inner Crucible did not spawn Varkhul');
  sim.player.damageImmune = true;
  if (engage) {
    boss.inCombat = true;
    boss.aiState = 'attack';
    boss.aggroTargetId = sim.player.id;
    boss.swingTimer = 999;
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2 };
    sim.player.prevPos = { ...sim.player.pos };
  }
  const meta = sim.players.get(sim.playerId);
  if (!meta) throw new Error('Local player metadata missing');
  meta.talentMods.role = 'tank';
  return { sim, boss };
}

function addTank(sim: Sim, boss: Entity, name: string): Entity {
  return addEncounterPlayer(sim, boss, name, 'tank');
}

function addEncounterPlayer(
  sim: Sim,
  boss: Entity,
  name: string,
  role: 'tank' | 'healer' | 'dps' = 'dps',
): Entity {
  const pid = sim.addPlayer(
    role === 'healer' ? 'priest' : role === 'dps' ? 'mage' : 'warrior',
    name,
  );
  const meta = sim.players.get(pid);
  const player = meta ? sim.entities.get(meta.entityId) : undefined;
  if (!meta || !player) throw new Error(`${name} did not spawn`);
  meta.talentMods.role = role;
  player.damageImmune = true;
  player.pos = { x: boss.pos.x + 2, y: boss.pos.y, z: boss.pos.z - 2 };
  player.prevPos = { ...player.pos };
  return player;
}

describe('Varkhul forge pillars and add intermission', () => {
  it('keeps the authored boss set-piece in front of the anvil, facing away from the raid', () => {
    const { sim, boss } = claimedEncounter(701, false, false);
    const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
    if (!instance) throw new Error('instance missing');
    const origin = sim.ctx.instanceOriginOf(instance);
    sim.tick();
    expect(boss.pos.x).toBeCloseTo(origin.x + VARKHUL_WORK_LOCAL_POS.x, 5);
    expect(boss.pos.z).toBeCloseTo(origin.z + VARKHUL_WORK_LOCAL_POS.z, 5);
    expect(boss.facing).toBe(VARKHUL_WORK_FACING);
    expect(sim.activeVarkhulAssemblies).toEqual([
      expect.objectContaining({
        bossId: boss.id,
        phase: 'idle',
        forgeOverheat: 0,
        forgeBeamActiveMask: 0,
        forgeBeams: [
          expect.objectContaining({ index: 0, active: false, blocked: false }),
          expect.objectContaining({ index: 1, active: false, blocked: false }),
        ],
      }),
    ]);

    boss.facing = 1;
    boss.prevFacing = 1;
    boss.inCombat = true;
    boss.aiState = 'evade';
    sim.ctx.resetEvadingMob(boss);
    expect(boss.facing).toBe(VARKHUL_WORK_FACING);
    expect(boss.prevFacing).toBe(VARKHUL_WORK_FACING);

    boss.facing = 1;
    boss.prevFacing = 1;
    boss.dead = true;
    sim.ctx.respawnMob(boss);
    expect(boss.pos.x).toBeCloseTo(origin.x + VARKHUL_WORK_LOCAL_POS.x, 5);
    expect(boss.pos.z).toBeCloseTo(origin.z + VARKHUL_WORK_LOCAL_POS.z, 5);
    expect(boss.facing).toBe(VARKHUL_WORK_FACING);
    expect(boss.prevFacing).toBe(VARKHUL_WORK_FACING);
  });

  it.each([
    { heroic: false, seed: 707 },
    { heroic: true, seed: 708 },
  ])(
    'runs one complete $heroic Meltdown before rearming the intermission beams',
    ({ heroic, seed }) => {
      const { sim, boss } = claimedEncounter(seed, heroic);
      const originalDealDamage = sim.ctx.dealDamage;
      const meltdownDamage: number[] = [];
      sim.ctx.dealDamage = ((...args: Parameters<typeof originalDealDamage>) => {
        const [source, target, amount, , , ability] = args;
        if (
          source?.id === boss.id &&
          target.id === sim.player.id &&
          ability === VARKHUL_FORGE_MELTDOWN_ABILITY_ID
        ) {
          meltdownDamage.push(amount);
          return;
        }
        return originalDealDamage(...args);
      }) as typeof sim.ctx.dealDamage;

      boss.hp = Math.floor(boss.maxHp * 0.5);
      updateVarkhulEncounter(sim.ctx, boss);
      const state = boss.varkhul;
      if (!state) throw new Error('Varkhul state missing');
      state.assemblyForgeBeamWarmupRemaining = 0;
      state.assemblyForgeOverheat = 0.999;
      updateVarkhulEncounter(sim.ctx, boss);

      expect(state.assemblyForgeMeltdownRemaining).toBe(VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS);
      expect(meltdownDamage).toEqual([
        Math.ceil(
          sim.player.maxHp * varkhulForgeMeltdownInitialDamageMaxHp(heroic ? 'heroic' : 'normal'),
        ),
      ]);

      let previousRemaining = state.assemblyForgeMeltdownRemaining;
      for (let tick = 0; tick < VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS / DT; tick++) {
        updateVarkhulEncounter(sim.ctx, boss);
        expect(state.assemblyForgeMeltdownRemaining).toBeLessThan(previousRemaining);
        previousRemaining = state.assemblyForgeMeltdownRemaining;
        if (tick + 1 < VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS / DT) {
          expect(state.assemblyForgeOverheat).toBe(1);
          expect(state.forgeBeamWindow).toBe('meltdown');
          expect(state.assemblyForgeBeamActiveMask).toBe(3);
        }
        expect(
          sim.player.auras.some((aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID),
        ).toBe(false);
      }

      const pulseDamage = Math.ceil(
        sim.player.maxHp * varkhulForgeMeltdownTickDamageMaxHp(heroic ? 'heroic' : 'normal'),
      );
      expect(meltdownDamage).toEqual([
        Math.ceil(
          sim.player.maxHp * varkhulForgeMeltdownInitialDamageMaxHp(heroic ? 'heroic' : 'normal'),
        ),
        ...Array.from({ length: 5 }, () => pulseDamage),
      ]);
      expect(state.assemblyForgeMeltdownRemaining).toBe(0);
      expect(state.assemblyForgeOverheat).toBe(0);
      expect(state.assemblyPhase).toBe('adds');
      expect(boss.damageImmune).toBe(true);
      expect(state.forgeBeamWindow).toBe('intermission');
      expect(state.assemblyForgeBeamActiveMask).toBe(3);
      expect(state.assemblyForgeBeamWarmupRemaining).toBe(VARKHUL_FORGE_BEAM_WARMUP_SECONDS);

      for (let tick = 0; tick < 20; tick++) updateVarkhulEncounter(sim.ctx, boss);
      expect(meltdownDamage).toHaveLength(6);
      expect(state.assemblyForgeOverheat).toBe(0);
    },
  );

  it('pauses Meltdown, then resumes pending and future portals with a fresh pillar warning', () => {
    const { sim, boss } = claimedEncounter(731);
    const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
    if (!instance) throw new Error('Varkhul instance missing');
    const origin = sim.ctx.instanceOriginOf(instance);
    sim.player.pos = sim.ctx.groundPos(origin.x, origin.z - 30);
    sim.player.prevPos = { ...sim.player.pos };
    boss.hp = Math.floor(boss.maxHp * 0.5);

    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    const liveAddIds = [...state.assemblyAddIds];
    expect(liveAddIds.length).toBeGreaterThan(0);

    state.assemblyNextWaveRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyPortalSpawns.length).toBeGreaterThan(0);
    expect(state.assemblyNextWaveIndex).toBeLessThan(state.assemblyIntermissionWaves);
    const pendingBeforeMeltdown = state.assemblyPortalSpawns.map((pending) => ({ ...pending }));
    const nextWaveIndexBeforeMeltdown = state.assemblyNextWaveIndex;
    const nextWaveRemainingBeforeMeltdown = state.assemblyNextWaveRemaining;
    const intermissionWavesBeforeMeltdown = state.assemblyIntermissionWaves;
    const assemblyRemainingBeforeMeltdown = state.assemblyRemaining;
    expect(sim.activeVarkhulForgePortalTelegraphs).toHaveLength(4);
    const portalEventCount = sim.events.filter(
      (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_FORGE_PORTAL_ABILITY_ID,
    ).length;
    const chargingCalloutsBeforeMeltdown = sim.events.filter(
      (event) => event.type === 'varkhulCallout' && event.call === 'bothPillarsCharging',
    ).length;
    const portalCalloutsBeforeMeltdown = sim.events.filter(
      (event) => event.type === 'varkhulCallout' && event.call === 'portalsOpening',
    ).length;

    state.assemblyForgeBeamWarmupRemaining = 0;
    state.assemblyForgeOverheat = 0.999;
    updateVarkhulEncounter(sim.ctx, boss);

    expect(state.assemblyPhase).toBe('adds');
    expect(boss.damageImmune).toBe(true);
    expect(state.assemblyForgeMeltdownRemaining).toBe(VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS);
    expect(state.assemblyAddIds).toEqual(liveAddIds);
    expect(liveAddIds.every((id) => sim.entities.has(id))).toBe(true);
    expect(liveAddIds.every((id) => boss.summonedIds.includes(id))).toBe(true);
    expect(state.assemblyPortalSpawns).toEqual(pendingBeforeMeltdown);
    expect(state.assemblyNextWaveIndex).toBe(nextWaveIndexBeforeMeltdown);
    expect(state.assemblyNextWaveRemaining).toBe(nextWaveRemainingBeforeMeltdown);
    expect(state.assemblyIntermissionWaves).toBe(intermissionWavesBeforeMeltdown);
    expect(state.assemblyRemaining).toBe(assemblyRemainingBeforeMeltdown);
    expect(sim.activeVarkhulForgePortalTelegraphs).toEqual([]);

    const meltdownTicks = VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS / DT;
    for (let tick = 1; tick < meltdownTicks; tick++) {
      updateVarkhulEncounter(sim.ctx, boss);
    }
    expect(state.assemblyForgeMeltdownRemaining).toBeGreaterThan(0);
    expect(state.assemblyPortalSpawns).toEqual(pendingBeforeMeltdown);
    expect(
      sim.events.filter(
        (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_FORGE_PORTAL_ABILITY_ID,
      ),
    ).toHaveLength(portalEventCount);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyAddIds).toEqual(liveAddIds);
    expect(liveAddIds.every((id) => sim.entities.has(id))).toBe(true);
    expect(liveAddIds.every((id) => boss.summonedIds.includes(id))).toBe(true);
    expect(state.assemblyPhase).toBe('adds');
    expect(boss.damageImmune).toBe(true);
    expect(state.assemblyForgeMeltdownRemaining).toBe(0);
    expect(state.assemblyForgeOverheat).toBe(0);
    expect(state.forgeBeamWindow).toBe('intermission');
    expect(state.assemblyForgeBeamActiveMask).toBe(3);
    expect(state.assemblyForgeBeamWarmupRemaining).toBe(VARKHUL_FORGE_BEAM_WARMUP_SECONDS);
    expect(state.assemblyPortalSpawns).toEqual(pendingBeforeMeltdown);
    expect(state.assemblyNextWaveIndex).toBe(nextWaveIndexBeforeMeltdown);
    expect(state.assemblyNextWaveRemaining).toBe(nextWaveRemainingBeforeMeltdown);
    expect(state.assemblyRemaining).toBe(assemblyRemainingBeforeMeltdown);
    expect(state.assemblyWipeResolved).toBe(false);
    expect(
      sim.events.filter(
        (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_FORGE_PORTAL_ABILITY_ID,
      ),
    ).toHaveLength(portalEventCount + 4);
    const resumedPortalEvents = sim.events
      .filter(
        (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_FORGE_PORTAL_ABILITY_ID,
      )
      .slice(portalEventCount);
    const resumedPortalCoordinates = resumedPortalEvents.flatMap((event) =>
      event.type === 'spellfxAt' ? [`${event.x.toFixed(5)},${event.z.toFixed(5)}`] : [],
    );
    expect(new Set(resumedPortalCoordinates).size).toBe(4);
    expect([...resumedPortalCoordinates].sort()).toEqual(
      VARKHUL_FORGE_PORTAL_LOCAL_POSITIONS.map(
        (portal) => `${(origin.x + portal.x).toFixed(5)},${(origin.z + portal.z).toFixed(5)}`,
      ).sort(),
    );
    const authoritativePortalTelegraphs = sim.activeVarkhulForgePortalTelegraphs;
    expect(authoritativePortalTelegraphs).toHaveLength(4);
    expect(
      authoritativePortalTelegraphs
        .map((event) => `${event.x.toFixed(5)},${event.z.toFixed(5)}`)
        .sort(),
    ).toEqual(
      VARKHUL_FORGE_PORTAL_LOCAL_POSITIONS.map(
        (portal) => `${(origin.x + portal.x).toFixed(5)},${(origin.z + portal.z).toFixed(5)}`,
      ).sort(),
    );
    for (const event of authoritativePortalTelegraphs) {
      expect(event).toMatchObject({
        type: 'spellfxAt',
        school: 'fire',
        fx: 'burst',
        sourceId: boss.id,
        radius: 4,
        ability: VARKHUL_FORGE_PORTAL_ABILITY_ID,
      });
      expect(event.duration).toBeCloseTo(pendingBeforeMeltdown[0].remaining, 8);
    }
    expect(
      resumedPortalEvents.every(
        (event) =>
          event.type === 'spellfxAt' &&
          Math.abs((event.duration ?? 0) - pendingBeforeMeltdown[0].remaining) < 1e-8,
      ),
    ).toBe(true);
    expect(
      sim.events.filter(
        (event) => event.type === 'varkhulCallout' && event.call === 'bothPillarsCharging',
      ),
    ).toHaveLength(chargingCalloutsBeforeMeltdown + 1);
    expect(
      sim.events.filter(
        (event) => event.type === 'varkhulCallout' && event.call === 'portalsOpening',
      ),
    ).toHaveLength(portalCalloutsBeforeMeltdown + 1);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyPortalSpawns[0]?.remaining).toBeCloseTo(
      pendingBeforeMeltdown[0].remaining - DT,
      5,
    );
    expect(state.assemblyNextWaveRemaining).toBeCloseTo(nextWaveRemainingBeforeMeltdown - DT, 5);
    expect(state.assemblyRemaining).toBeCloseTo(assemblyRemainingBeforeMeltdown - DT, 5);

    for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyAddIds.length).toBeGreaterThan(liveAddIds.length);
    state.assemblyNextWaveRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyNextWaveIndex).toBe(nextWaveIndexBeforeMeltdown + 1);
    expect(
      sim.events.filter(
        (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_FORGE_PORTAL_ABILITY_ID,
      ),
    ).toHaveLength(portalEventCount + 8);

    const ignitionCalloutsBeforeResume = sim.events.filter(
      (event) => event.type === 'varkhulCallout' && event.call === 'bothPillars',
    ).length;
    const ticksUntilIgnition = Math.round(state.assemblyForgeBeamWarmupRemaining / DT);
    for (let tick = 1; tick < ticksUntilIgnition; tick++) {
      updateVarkhulEncounter(sim.ctx, boss);
      expect(
        sim.events.filter(
          (event) => event.type === 'varkhulCallout' && event.call === 'bothPillars',
        ),
      ).toHaveLength(ignitionCalloutsBeforeResume);
    }
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyForgeBeamWarmupRemaining).toBe(0);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout' && event.call === 'bothPillars'),
    ).toHaveLength(ignitionCalloutsBeforeResume + 1);

    expect(state.assemblyNextWaveIndex).toBe(state.assemblyIntermissionWaves);
    expect(state.assemblyPortalSpawns).toEqual([]);

    state.assemblyRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyRemaining).toBe(0);
    expect(state.assemblyWipeResolved).toBe(true);
    expect(state.assemblyForgeMeltdownRemaining).toBe(VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS);
    for (let tick = 0; tick < VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS / DT; tick++) {
      updateVarkhulEncounter(sim.ctx, boss);
    }
    expect(state.assemblyForgeMeltdownRemaining).toBe(0);
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyForgeMeltdownRemaining).toBe(0);
    expect(state.assemblyForgeBeamWarmupRemaining).toBeCloseTo(
      VARKHUL_FORGE_BEAM_WARMUP_SECONDS - DT,
      5,
    );

    for (const id of state.assemblyAddIds) {
      const add = sim.entities.get(id);
      if (add) add.dead = true;
    }
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyPhase).toBe('stunned');
    expect(state.assemblyStunRemaining).toBe(15);
    expect(boss.damageImmune).toBe(false);
  });

  it('ends the trigger tick at Meltdown before Brand, Masterpiece, or another major can run', () => {
    const { sim, boss } = claimedEncounter(720);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    state.assemblyTriggered = true;
    state.assemblyPhase = 'done';
    state.forgeBeamFinalTriggered = true;
    state.forgeBeamWindow = 'final_left';
    state.forgeBeamWindowRemaining = 8;
    state.assemblyForgeBeamActiveMask = 1;
    state.assemblyForgeBeamWarmupRemaining = 0;
    state.assemblyForgeOverheat = 0.999;
    state.majorAbility = 'forgestorm';
    state.forgestormWarningRemaining = DT;
    state.forgestormPoints = [{ ...sim.player.pos }];
    state.makersBrandTimer = DT;
    state.frontalTimer = DT;
    state.cinderOrbsTimer = DT;
    state.forgestormTimer = DT;
    state.anvilTimer = DT;
    boss.castingAbility = 'forgestorm';
    boss.castRemaining = DT;
    boss.hp = boss.maxHp * 0.19;

    const originalDealDamage = sim.ctx.dealDamage;
    const bossDamageAbilities: Array<string | null | undefined> = [];
    sim.ctx.dealDamage = ((...args: Parameters<typeof originalDealDamage>) => {
      const [source, target, , , , ability] = args;
      if (source?.id === boss.id && target.id === sim.player.id) {
        bossDamageAbilities.push(ability);
        return;
      }
      return originalDealDamage(...args);
    }) as typeof sim.ctx.dealDamage;

    updateVarkhulEncounter(sim.ctx, boss);

    expect(state.assemblyForgeMeltdownRemaining).toBe(VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS);
    expect(bossDamageAbilities).toEqual([VARKHUL_FORGE_MELTDOWN_ABILITY_ID]);
    expect(state.majorAbility).toBe('none');
    expect(boss.castingAbility).toBeNull();
    expect(state.makersBrandTimer).toBe(DT);
  });

  it('preserves the 50% floor through a teaching Meltdown and still starts the add phase', () => {
    const { sim, boss } = claimedEncounter(709);
    boss.hp = Math.floor(boss.maxHp * 0.79);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    state.assemblyForgeBeamWarmupRemaining = 0;
    state.assemblyForgeOverheat = 0.999;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyForgeMeltdownRemaining).toBe(VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS);
    expect(boss.damageFloorHp).toBe(Math.ceil(boss.maxHp * 0.5));

    for (let tick = 0; tick < VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS / DT; tick++) {
      updateVarkhulEncounter(sim.ctx, boss);
      expect(boss.damageFloorHp).toBe(Math.ceil(boss.maxHp * 0.5));
    }
    boss.hp = Math.floor(boss.maxHp * 0.5);
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyPhase).toBe('adds');
    expect(boss.damageImmune).toBe(true);
  });

  it('runs the 80% lesson in order, pauses majors, then loops both 20% pillars with majors live', () => {
    const { sim, boss } = claimedEncounter(710);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    state.frontalTimer = 10;
    state.cinderOrbsTimer = 10;
    state.forgestormTimer = 10;
    state.anvilTimer = 10;
    boss.hp = Math.floor(boss.maxHp * 0.8);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('teaching_left');
    expect(state.assemblyForgeBeamActiveMask).toBe(1);
    expect([
      state.frontalTimer,
      state.cinderOrbsTimer,
      state.forgestormTimer,
      state.anvilTimer,
    ]).toEqual([10, 10, 10, 10]);
    const majorTimers = () => [
      state.frontalTimer,
      state.cinderOrbsTimer,
      state.forgestormTimer,
      state.anvilTimer,
    ];
    const teachingPausedTimers = majorTimers();

    state.assemblyForgeBeamWarmupRemaining = 0;
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('teaching_gap');
    expect(state.forgeBeamWindowRemaining).toBe(VARKHUL_FORGE_TEACHING_GAP_SECONDS);
    expect(state.assemblyForgeBeamActiveMask).toBe(0);
    expect(majorTimers()).toEqual(teachingPausedTimers);
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('teaching_right');
    expect(state.forgeBeamWindowRemaining).toBe(VARKHUL_FORGE_TEACHING_BEAM_SECONDS);
    expect(state.assemblyForgeBeamActiveMask).toBe(2);
    expect(majorTimers()).toEqual(teachingPausedTimers);
    state.assemblyForgeBeamWarmupRemaining = 0;
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('idle');
    expect(state.assemblyForgeBeamActiveMask).toBe(0);

    state.assemblyTriggered = true;
    state.assemblyPhase = 'done';
    boss.damageFloorHp = undefined;
    boss.hp = Math.floor(boss.maxHp * 0.2);
    const frontalBeforeFinal = state.frontalTimer;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('final_left');
    expect(state.assemblyForgeBeamActiveMask).toBe(1);
    expect(state.frontalTimer).toBeLessThan(frontalBeforeFinal);

    state.assemblyForgeBeamWarmupRemaining = 0;
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('final_gap_left');
    expect(state.assemblyForgeBeamActiveMask).toBe(0);
    const timersAfterFinalLeft = majorTimers();
    expect(timersAfterFinalLeft.every((timer, index) => timer < teachingPausedTimers[index])).toBe(
      true,
    );
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('final_right');
    expect(state.assemblyForgeBeamActiveMask).toBe(2);
    const timersAfterFinalGapLeft = majorTimers();
    expect(
      timersAfterFinalGapLeft.every((timer, index) => timer < timersAfterFinalLeft[index]),
    ).toBe(true);
    state.assemblyForgeBeamWarmupRemaining = 0;
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('final_gap_right');
    expect(state.assemblyForgeBeamActiveMask).toBe(0);
    const timersAfterFinalRight = majorTimers();
    expect(
      timersAfterFinalRight.every((timer, index) => timer < timersAfterFinalGapLeft[index]),
    ).toBe(true);
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgeBeamWindow).toBe('final_left');
    expect(state.assemblyForgeBeamActiveMask).toBe(1);
    expect(majorTimers().every((timer, index) => timer < timersAfterFinalRight[index])).toBe(true);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout').map((event) => event.call),
    ).toEqual(expect.arrayContaining(['leftPillarCharging', 'rightPillarCharging']));
  });

  it('does not trigger the 80%, 50%, or 20% windows just above their thresholds', () => {
    const teaching = claimedEncounter(721);
    updateVarkhulEncounter(teaching.sim.ctx, teaching.boss);
    const teachingState = teaching.boss.varkhul;
    if (!teachingState) throw new Error('Teaching state missing');
    teaching.boss.hp = teaching.boss.maxHp * 0.8001;
    updateVarkhulEncounter(teaching.sim.ctx, teaching.boss);
    expect(teachingState.forgeBeamTeachingTriggered).toBe(false);
    teaching.boss.hp = teaching.boss.maxHp * 0.8;
    updateVarkhulEncounter(teaching.sim.ctx, teaching.boss);
    expect(teachingState.forgeBeamWindow).toBe('teaching_left');

    const intermission = claimedEncounter(722);
    intermission.boss.hp = intermission.boss.maxHp * 0.5001;
    updateVarkhulEncounter(intermission.sim.ctx, intermission.boss);
    expect(intermission.boss.varkhul?.assemblyTriggered).toBe(false);
    intermission.boss.hp = intermission.boss.maxHp * 0.5;
    updateVarkhulEncounter(intermission.sim.ctx, intermission.boss);
    expect(intermission.boss.varkhul?.assemblyPhase).toBe('adds');

    const final = claimedEncounter(723);
    updateVarkhulEncounter(final.sim.ctx, final.boss);
    const finalState = final.boss.varkhul;
    if (!finalState) throw new Error('Final state missing');
    finalState.assemblyTriggered = true;
    finalState.assemblyPhase = 'done';
    final.boss.damageFloorHp = undefined;
    final.boss.hp = final.boss.maxHp * 0.2001;
    updateVarkhulEncounter(final.sim.ctx, final.boss);
    expect(finalState.forgeBeamFinalTriggered).toBe(false);
    final.boss.hp = final.boss.maxHp * 0.2;
    updateVarkhulEncounter(final.sim.ctx, final.boss);
    expect(finalState.forgeBeamWindow).toBe('final_left');
  });

  it('uses the full three-second warmup before a player can block or take exposure damage', () => {
    const { sim, boss } = claimedEncounter(724);
    const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
    if (!instance) throw new Error('Varkhul instance missing');
    const origin = sim.ctx.instanceOriginOf(instance);
    sim.player.pos = sim.ctx.groundPos(
      origin.x + VARKHUL_FORGE_LOCAL_POS.x - 14,
      origin.z + VARKHUL_FORGE_LOCAL_POS.z,
    );
    sim.player.prevPos = { ...sim.player.pos };
    boss.hp = boss.maxHp * 0.8;

    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    expect(state.assemblyForgeBeamWarmupRemaining).toBeCloseTo(
      VARKHUL_FORGE_BEAM_WARMUP_SECONDS - DT,
      5,
    );
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout').map((event) => event.call),
    ).toEqual(expect.arrayContaining(['leftPillarCharging']));
    expect(
      sim.events.some((event) => event.type === 'varkhulCallout' && event.call === 'leftPillar'),
    ).toBe(false);
    for (let tick = 1; tick < VARKHUL_FORGE_BEAM_WARMUP_SECONDS / DT; tick++) {
      expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
      expect(state.assemblyForgeOverheat).toBe(0);
      expect(sim.player.auras.some((aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID)).toBe(
        false,
      );
      updateVarkhulEncounter(sim.ctx, boss);
    }
    expect(state.assemblyForgeBeamWarmupRemaining).toBe(0);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout' && event.call === 'leftPillar'),
    ).toHaveLength(1);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([sim.player.id, null]);
  });

  it('delays the right-pillar ignition and blocker until its full warmup completes', () => {
    const { sim, boss } = claimedEncounter(732);
    const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
    if (!instance) throw new Error('Varkhul instance missing');
    const origin = sim.ctx.instanceOriginOf(instance);
    sim.player.pos = sim.ctx.groundPos(
      origin.x + VARKHUL_FORGE_LOCAL_POS.x + 14,
      origin.z + VARKHUL_FORGE_LOCAL_POS.z,
    );
    sim.player.prevPos = { ...sim.player.pos };
    boss.hp = boss.maxHp * 0.8;

    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    state.assemblyForgeBeamWarmupRemaining = 0;
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    state.forgeBeamWindowRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);

    expect(state.forgeBeamWindow).toBe('teaching_right');
    expect(state.assemblyForgeBeamWarmupRemaining).toBe(VARKHUL_FORGE_BEAM_WARMUP_SECONDS);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
    expect(
      sim.events.filter(
        (event) => event.type === 'varkhulCallout' && event.call === 'rightPillarCharging',
      ),
    ).toHaveLength(1);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout' && event.call === 'rightPillar'),
    ).toHaveLength(0);

    for (let tick = 0; tick < VARKHUL_FORGE_BEAM_WARMUP_SECONDS / DT; tick++) {
      expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
      updateVarkhulEncounter(sim.ctx, boss);
    }
    expect(state.assemblyForgeBeamWarmupRemaining).toBe(0);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout' && event.call === 'rightPillar'),
    ).toHaveLength(1);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([null, sim.player.id]);
  });

  it('delays both-pillar ignition and both blockers until the intermission warmup completes', () => {
    const { sim, boss } = claimedEncounter(733);
    const rightBlocker = addTank(sim, boss, 'BothWarmupRightBlocker');
    const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
    if (!instance) throw new Error('Varkhul instance missing');
    const origin = sim.ctx.instanceOriginOf(instance);
    const forgeX = origin.x + VARKHUL_FORGE_LOCAL_POS.x;
    const forgeZ = origin.z + VARKHUL_FORGE_LOCAL_POS.z;
    sim.player.pos = sim.ctx.groundPos(forgeX - 14, forgeZ);
    sim.player.prevPos = { ...sim.player.pos };
    rightBlocker.pos = sim.ctx.groundPos(forgeX + 14, forgeZ);
    rightBlocker.prevPos = { ...rightBlocker.pos };
    boss.hp = Math.floor(boss.maxHp * 0.5);

    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
    expect(
      sim.events.filter(
        (event) => event.type === 'varkhulCallout' && event.call === 'bothPillarsCharging',
      ),
    ).toHaveLength(2);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout' && event.call === 'bothPillars'),
    ).toHaveLength(0);

    for (let tick = 1; tick < VARKHUL_FORGE_BEAM_WARMUP_SECONDS / DT; tick++) {
      expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
      updateVarkhulEncounter(sim.ctx, boss);
    }
    expect(state.assemblyForgeBeamWarmupRemaining).toBe(0);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([null, null]);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout' && event.call === 'bothPillars'),
    ).toHaveLength(2);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyForgeBeamBlockerIds).toEqual([sim.player.id, rightBlocker.id]);
  });

  it.each([
    { heroic: false, waves: 3, adds: 12, lastSpawnTick: 360 },
    { heroic: true, waves: 4, adds: 20, lastSpawnTick: 520 },
  ])(
    'uses real two-second portals and eight-second $heroic wave cadence without runes or teleports',
    ({ heroic, waves, adds, lastSpawnTick }) => {
      const { sim, boss } = claimedEncounter(heroic ? 711 : 712, heroic);
      const rightBlocker = addTank(sim, boss, 'RightBlocker');
      const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
      if (!instance) throw new Error('Varkhul instance missing');
      const origin = sim.ctx.instanceOriginOf(instance);
      const forge = {
        x: origin.x + VARKHUL_FORGE_LOCAL_POS.x,
        z: origin.z + VARKHUL_FORGE_LOCAL_POS.z,
      };
      sim.player.pos = sim.ctx.groundPos(forge.x - 14, forge.z);
      sim.player.prevPos = { ...sim.player.pos };
      rightBlocker.pos = sim.ctx.groundPos(forge.x + 14, forge.z);
      rightBlocker.prevPos = { ...rightBlocker.pos };
      const positionsBefore = [sim.player, rightBlocker].map((player) => ({ ...player.pos }));
      boss.hp = Math.floor(boss.maxHp * 0.5);

      updateVarkhulEncounter(sim.ctx, boss);
      const state = boss.varkhul;
      if (!state) throw new Error('Varkhul state missing');
      expect(state.assemblyPortalSpawns).toHaveLength(heroic ? 5 : 4);
      expect(state.assemblyAddIds).toEqual([]);
      expect(state.assemblyRemaining).toBeCloseTo(
        (heroic
          ? VARKHUL_FORGE_INTERMISSION_SECONDS_HEROIC
          : VARKHUL_FORGE_INTERMISSION_SECONDS_NORMAL) - DT,
        5,
      );
      expect(sim.activeVarkhulAssemblies[0]).toMatchObject({
        runes: [],
        assignments: [],
        cores: [],
      });
      const portalEvents = () =>
        sim.events.filter(
          (event) =>
            event.type === 'spellfxAt' && event.ability === VARKHUL_FORGE_PORTAL_ABILITY_ID,
        );
      expect(portalEvents()).toHaveLength(4);
      expect(
        new Set(
          portalEvents().map((event) =>
            event.type === 'spellfxAt'
              ? `${(event.x - origin.x).toFixed(2)}:${(event.z - origin.z).toFixed(2)}`
              : '',
          ),
        ),
      ).toEqual(
        new Set(
          VARKHUL_FORGE_PORTAL_LOCAL_POSITIONS.map(
            (portal) => `${portal.x.toFixed(2)}:${portal.z.toFixed(2)}`,
          ),
        ),
      );
      expect(
        portalEvents().every(
          (event) =>
            event.type === 'spellfxAt' && event.duration === VARKHUL_FORGE_PORTAL_TELEGRAPH_SECONDS,
        ),
      ).toBe(true);

      for (let tick = 0; tick < 38; tick++) updateVarkhulEncounter(sim.ctx, boss);
      expect(state.assemblyAddIds).toEqual([]);
      updateVarkhulEncounter(sim.ctx, boss);
      expect(state.assemblyAddIds).toHaveLength(heroic ? 5 : 4);

      for (let totalTick = 41; totalTick <= lastSpawnTick; totalTick++) {
        updateVarkhulEncounter(sim.ctx, boss);
        if (totalTick % 160 === 0) {
          expect(portalEvents()).toHaveLength(4 * (totalTick / 160 + 1));
        }
        if (totalTick >= 200 && (totalTick - 40) % 160 === 0) {
          const spawnedWaves = (totalTick - 40) / 160 + 1;
          expect(state.assemblyAddIds).toHaveLength(spawnedWaves * (heroic ? 5 : 4));
        }
      }
      expect(portalEvents()).toHaveLength(waves * 4);
      expect(state.assemblyAddIds).toHaveLength(adds);
      expect([sim.player.pos, rightBlocker.pos]).toEqual(positionsBefore);
      expect(sim.activeVarkhulAssemblies[0]).toMatchObject({
        runes: [],
        assignments: [],
        cores: [],
      });
    },
  );

  it('waits for future and pending waves even when every add already spawned is dead', () => {
    const { sim, boss } = claimedEncounter(725);
    boss.hp = boss.maxHp * 0.5;
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');

    const spawnPendingAndKill = () => {
      for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
      updateVarkhulEncounter(sim.ctx, boss);
      for (const id of state.assemblyAddIds) {
        const add = sim.entities.get(id);
        if (add) add.dead = true;
      }
    };

    spawnPendingAndKill();
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyPhase).toBe('adds');
    expect(state.assemblyNextWaveIndex).toBe(1);
    expect(state.assemblyPortalSpawns).toEqual([]);

    state.assemblyNextWaveRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    spawnPendingAndKill();
    state.assemblyNextWaveRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyNextWaveIndex).toBe(state.assemblyIntermissionWaves);
    expect(state.assemblyPortalSpawns.length).toBeGreaterThan(0);
    expect(state.assemblyPhase).toBe('adds');

    spawnPendingAndKill();
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyPhase).toBe('stunned');
  });

  it.each([
    { heroic: false, seconds: VARKHUL_FORGE_INTERMISSION_SECONDS_NORMAL },
    { heroic: true, seconds: VARKHUL_FORGE_INTERMISSION_SECONDS_HEROIC },
  ])(
    'times out the full $seconds-second intermission exactly and keeps living adds in combat',
    ({ heroic, seconds }) => {
      const { sim, boss } = claimedEncounter(heroic ? 713 : 714, heroic);
      const rightBlocker = addTank(sim, boss, 'TimeoutRightBlocker');
      const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
      if (!instance) throw new Error('Varkhul instance missing');
      const origin = sim.ctx.instanceOriginOf(instance);
      const forgeX = origin.x + VARKHUL_FORGE_LOCAL_POS.x;
      const forgeZ = origin.z + VARKHUL_FORGE_LOCAL_POS.z;
      sim.player.pos = sim.ctx.groundPos(forgeX - 14, forgeZ);
      sim.player.prevPos = { ...sim.player.pos };
      rightBlocker.pos = sim.ctx.groundPos(forgeX + 14, forgeZ);
      rightBlocker.prevPos = { ...rightBlocker.pos };
      boss.hp = Math.floor(boss.maxHp * 0.5);
      updateVarkhulEncounter(sim.ctx, boss);
      const state = boss.varkhul;
      if (!state) throw new Error('Varkhul state missing');
      for (let tick = 1; tick < seconds / DT - 1; tick++) {
        updateVarkhulEncounter(sim.ctx, boss);
      }
      expect(state.assemblyRemaining).toBeCloseTo(DT, 4);
      expect(state.assemblyForgeMeltdownRemaining).toBe(0);
      const liveAddIds = [...state.assemblyAddIds];
      expect(liveAddIds.length).toBeGreaterThan(0);
      expect(liveAddIds.some((id) => sim.entities.has(id))).toBe(true);

      updateVarkhulEncounter(sim.ctx, boss);
      expect(state.assemblyRemaining).toBe(0);
      expect(state.assemblyForgeMeltdownRemaining).toBe(VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS);
      expect(liveAddIds.every((id) => sim.entities.has(id))).toBe(true);
      expect(liveAddIds.every((id) => boss.summonedIds.includes(id))).toBe(true);
      expect(state.assemblyAddIds).toEqual(liveAddIds);
      expect(state.assemblyPortalSpawns).toEqual([]);
      const retainedWarden = liveAddIds
        .map((id) => sim.entities.get(id))
        .find((add) => add?.templateId === VARKHUL_CRUCIBLE_WARDEN_ID);
      if (!retainedWarden) throw new Error('Meltdown did not retain a Crucible Warden');
      retainedWarden.bigCastTimer = DT;
      sim.tick();
      expect(retainedWarden.inCombat).toBe(true);
      expect(retainedWarden.castingAbility).toBe('crucible_quake');
      for (let tick = 0; tick < VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS / DT; tick++) {
        updateVarkhulEncounter(sim.ctx, boss);
      }
      expect(liveAddIds.every((id) => sim.entities.has(id))).toBe(true);
      expect(state.assemblyPhase).toBe('adds');
      expect(state.assemblyForgeMeltdownRemaining).toBe(0);
      expect(state.assemblyWipeResolved).toBe(true);
      expect(state.assemblyForgeBeamWarmupRemaining).toBeCloseTo(
        VARKHUL_FORGE_BEAM_WARMUP_SECONDS - DT,
        5,
      );
      resetVarkhulEncounter(sim.ctx, boss);
      expect(liveAddIds.every((id) => !sim.entities.has(id))).toBe(true);
    },
  );

  it('telegraphs four portals, spawns twenty Heroic combat adds, and sends them to the top tank', () => {
    const { sim, boss } = claimedEncounter(702, true);
    const topTank = addTank(sim, boss, 'TopTank');
    const deadTank = addTank(sim, boss, 'DeadTank');
    const highThreatDps = addEncounterPlayer(sim, boss, 'HighThreatDps');
    deadTank.dead = true;
    boss.threat.set(sim.player.id, 50);
    boss.threat.set(topTank.id, 100);
    boss.threat.set(deadTank.id, 10_000);
    boss.threat.set(highThreatDps.id, 5_000);
    boss.hp = Math.floor(boss.maxHp * 0.5);

    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    expect(state.assemblyPhase).toBe('adds');
    expect(state.assemblyRemaining).toBeCloseTo(VARKHUL_FORGE_INTERMISSION_SECONDS_HEROIC - DT, 5);
    expect(state.assemblyForgeBeamActiveMask).toBe(3);
    expect(state.assemblyPortalSpawns).toHaveLength(5);
    expect(new Set(state.assemblyPortalSpawns.map((spawn) => spawn.spawnIndex)).size).toBe(5);
    expect(state.assemblyAddIds).toEqual([]);
    expect(
      sim.events.filter((event) => event.type === 'varkhulCallout').map((event) => event.call),
    ).toEqual(expect.arrayContaining(['bothPillarsCharging', 'portalsOpening']));
    for (const player of [sim.player, topTank, deadTank, highThreatDps]) {
      expect(
        sim.events.filter(
          (event) =>
            event.type === 'varkhulCallout' &&
            event.pid === player.id &&
            (event.call === 'bothPillarsCharging' || event.call === 'portalsOpening'),
        ),
      ).toHaveLength(2);
    }
    const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
    if (!instance) throw new Error('Varkhul instance missing');
    expect(boss.pos.z - sim.ctx.instanceOriginOf(instance).z).toBeCloseTo(
      VARKHUL_WORK_LOCAL_POS.z,
      5,
    );
    expect(boss.facing).toBe(VARKHUL_WORK_FACING);

    expect(state.assemblyAddIds).toEqual([]);
    state.assemblyForgeBeamWarmupRemaining = DT;
    for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyAddIds).toHaveLength(5);
    for (const player of [sim.player, topTank, deadTank, highThreatDps]) {
      expect(
        sim.events.some(
          (event) =>
            event.type === 'varkhulCallout' &&
            event.pid === player.id &&
            event.call === 'bothPillars',
        ),
      ).toBe(true);
    }

    for (let wave = 1; wave < 4; wave++) {
      state.assemblyNextWaveRemaining = DT;
      updateVarkhulEncounter(sim.ctx, boss);
      expect(state.assemblyPortalSpawns).toHaveLength(5);
      for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
      updateVarkhulEncounter(sim.ctx, boss);
    }

    const adds = state.assemblyAddIds.map((id) => sim.entities.get(id)).filter(Boolean) as Entity[];
    expect(adds).toHaveLength(20);
    expect(adds.filter((add) => add.templateId === VARKHUL_CRUCIBLE_WARDEN_ID)).toHaveLength(4);
    expect(adds.filter((add) => add.templateId === VARKHUL_EMBER_SENTINEL_ID)).toHaveLength(16);
    expect(adds.some((add) => add.templateId === VARKHUL_CINDER_ARTIFICER_ID)).toBe(false);
    expect(adds.every((add) => add.aggroTargetId === topTank.id)).toBe(true);
    expect(adds.every((add) => (add.threat.get(topTank.id) ?? 0) >= 100)).toBe(true);
    expect(state.assemblyPhase).toBe('adds');

    for (const add of adds) add.dead = true;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyPhase).toBe('stunned');
    expect(state.assemblyPortalSpawns).toEqual([]);
    expect(state.assemblyForgeBeamActiveMask).toBe(0);
    for (const player of [sim.player, topTank, deadTank, highThreatDps]) {
      expect(
        sim.events.some(
          (event) =>
            event.type === 'varkhulCallout' &&
            event.pid === player.id &&
            event.call === 'addsDefeated',
        ),
      ).toBe(true);
    }
  });

  it('ramps one-second soak damage and records the long Heroic exposure reset', () => {
    const { sim, boss } = claimedEncounter(703, true);
    sim.player.damageImmune = false;
    boss.hp = Math.floor(boss.maxHp * 0.79);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    expect(state.assemblyRuneDifficulty).toBe('heroic');
    expect(state.forgeBeamWindow).toBe('teaching_left');
    expect(
      sim.events.some(
        (event) => event.type === 'varkhulCallout' && event.call === 'leftPillarCharging',
      ),
    ).toBe(true);
    const forge = { x: boss.pos.x, z: boss.pos.z + 6 };
    sim.player.pos = { x: forge.x - 14, y: sim.player.pos.y, z: forge.z };
    sim.player.prevPos = { ...sim.player.pos };
    state.assemblyForgeBeamWarmupRemaining = 0;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.assemblyForgeBeamBlockerIds[0]).toBe(sim.player.id);
    state.assemblyForgeBeamDamageTimers[0] = DT;
    const hpBeforeFirst = sim.player.hp;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(hpBeforeFirst - sim.player.hp).toBe(Math.ceil(sim.player.maxHp * 0.08));
    const exposure = sim.player.auras.find(
      (aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID,
    );
    expect(exposure?.stacks).toBe(1);
    expect(exposure?.remaining).toBe(60);

    state.assemblyForgeBeamDamageTimers[0] = DT;
    const hpBeforeSecond = sim.player.hp;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(hpBeforeSecond - sim.player.hp).toBe(Math.ceil(sim.player.maxHp * 0.11));
    expect(exposure?.stacks).toBe(2);
    expect(exposure?.remaining).toBe(60);
    expect(VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS).toBe(1);
  });

  it.each([
    { heroic: false, resetSeconds: 10 },
    { heroic: true, resetSeconds: 60 },
  ])(
    'keeps exposure until the $resetSeconds-second reset and restarts the next soak at stack one',
    ({ heroic, resetSeconds }) => {
      const { sim, boss } = claimedEncounter(heroic ? 715 : 716, heroic);
      boss.hp = Math.floor(boss.maxHp * 0.79);
      updateVarkhulEncounter(sim.ctx, boss);
      const state = boss.varkhul;
      if (!state) throw new Error('Varkhul state missing');
      const instance = sim.instances.find((entry) => entry.mobIds.includes(boss.id));
      if (!instance) throw new Error('Varkhul instance missing');
      const origin = sim.ctx.instanceOriginOf(instance);
      const forgeX = origin.x + VARKHUL_FORGE_LOCAL_POS.x;
      const forgeZ = origin.z + VARKHUL_FORGE_LOCAL_POS.z;
      sim.player.pos = sim.ctx.groundPos(forgeX - 14, forgeZ);
      sim.player.prevPos = { ...sim.player.pos };
      state.assemblyForgeBeamWarmupRemaining = 0;
      state.assemblyForgeBeamBlockerIds[0] = sim.player.id;
      state.assemblyForgeBeamDamageTimers[0] = DT;
      updateVarkhulEncounter(sim.ctx, boss);
      expect(varkhulForgeBeamExposureResetSeconds(state.assemblyRuneDifficulty)).toBe(resetSeconds);
      expect(
        sim.player.auras.find((aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID),
      ).toMatchObject({ stacks: 1, remaining: resetSeconds });

      sim.player.damageImmune = true;
      sim.player.pos = sim.ctx.groundPos(boss.pos.x, boss.pos.z - 2);
      sim.player.prevPos = { ...sim.player.pos };
      for (let tick = 0; tick < resetSeconds / DT - 1; tick++) sim.tick();
      expect(
        sim.player.auras.find((aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID),
      ).toMatchObject({ stacks: 1, remaining: expect.any(Number) });
      sim.tick();
      expect(sim.player.auras.some((aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID)).toBe(
        false,
      );

      state.majorAbility = 'none';
      state.forgeBeamWindow = 'teaching_left';
      state.forgeBeamWindowRemaining = 999;
      state.assemblyForgeBeamActiveMask = 1;
      state.assemblyForgeBeamWarmupRemaining = 0;
      state.assemblyForgeBeamBlockerIds[0] = sim.player.id;
      state.assemblyForgeBeamDamageTimers[0] = DT;
      sim.player.pos = sim.ctx.groundPos(forgeX - 14, forgeZ);
      sim.player.prevPos = { ...sim.player.pos };
      updateVarkhulEncounter(sim.ctx, boss);
      expect(
        sim.player.auras.find((aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID),
      ).toMatchObject({ stacks: 1, remaining: resetSeconds });
    },
  );

  it('cools idle Normal heat, preserves Heroic heat, and announces both danger thresholds once', () => {
    const normal = claimedEncounter(705);
    updateVarkhulEncounter(normal.sim.ctx, normal.boss);
    if (!normal.boss.varkhul) throw new Error('Normal Varkhul state missing');
    normal.boss.varkhul.assemblyForgeOverheat = 0.4;
    updateVarkhulEncounter(normal.sim.ctx, normal.boss);
    expect(normal.boss.varkhul.assemblyForgeOverheat).toBeCloseTo(0.3985, 8);

    const heroic = claimedEncounter(706, true);
    updateVarkhulEncounter(heroic.sim.ctx, heroic.boss);
    if (!heroic.boss.varkhul) throw new Error('Heroic Varkhul state missing');
    heroic.boss.varkhul.assemblyForgeOverheat = 0.4;
    updateVarkhulEncounter(heroic.sim.ctx, heroic.boss);
    expect(heroic.boss.varkhul.assemblyForgeOverheat).toBe(0.4);

    normal.boss.hp = Math.floor(normal.boss.maxHp * 0.79);
    normal.boss.varkhul.assemblyForgeOverheat = 0.748;
    updateVarkhulEncounter(normal.sim.ctx, normal.boss);
    normal.boss.varkhul.assemblyForgeBeamWarmupRemaining = 0;
    updateVarkhulEncounter(normal.sim.ctx, normal.boss);
    normal.boss.varkhul.assemblyForgeOverheat = 0.898;
    updateVarkhulEncounter(normal.sim.ctx, normal.boss);
    updateVarkhulEncounter(normal.sim.ctx, normal.boss);
    const warnings = normal.sim.events
      .filter((event) => event.type === 'varkhulCallout')
      .map((event) => event.call)
      .filter((call) => call === 'heat75' || call === 'heat90');
    expect(warnings).toEqual(['heat75', 'heat90']);
  });

  it('lets a portal Sentinel cross the room, retarget by threat, and obey a taunt', () => {
    const { sim, boss } = claimedEncounter(717);
    boss.hp = Math.floor(boss.maxHp * 0.5);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    state.assemblyForgeBeamWarmupRemaining = 999;
    const sentinels = state.assemblyAddIds
      .map((id) => sim.entities.get(id))
      .filter((add): add is Entity => add?.templateId === VARKHUL_EMBER_SENTINEL_ID);
    const sentinel = sentinels.sort(
      (first, second) =>
        Math.hypot(second.pos.x - sim.player.pos.x, second.pos.z - sim.player.pos.z) -
        Math.hypot(first.pos.x - sim.player.pos.x, first.pos.z - sim.player.pos.z),
    )[0];
    if (!sentinel) throw new Error('Ember Sentinel did not emerge');
    for (const addId of state.assemblyAddIds) {
      const add = sim.entities.get(addId);
      if (add && add.id !== sentinel.id) add.dead = true;
    }
    const startDistance = Math.hypot(
      sentinel.pos.x - sim.player.pos.x,
      sentinel.pos.z - sim.player.pos.z,
    );
    expect(startDistance).toBeGreaterThan(18);
    for (let tick = 0; tick < 180 && !sentinel.dead; tick++) {
      sim.tick();
      expect(sentinel.aiState).not.toBe('evade');
      if (Math.hypot(sentinel.pos.x - sim.player.pos.x, sentinel.pos.z - sim.player.pos.z) < 6) {
        break;
      }
    }
    expect(
      Math.hypot(sentinel.pos.x - sim.player.pos.x, sentinel.pos.z - sim.player.pos.z),
    ).toBeLessThan(6);

    const challenger = addTank(sim, boss, 'SentinelChallenger');
    sentinel.threat.clear();
    sentinel.threat.set(sim.player.id, 10);
    sentinel.threat.set(challenger.id, 10_000);
    sentinel.aggroTargetId = sim.player.id;
    sim.tick();
    expect(sentinel.aggroTargetId).toBe(challenger.id);

    sentinel.forcedTargetId = sim.player.id;
    sentinel.forcedTargetTimer = DT / 2;
    sim.tick();
    expect(sentinel.aggroTargetId).toBe(sim.player.id);
    sim.tick();
    expect(sentinel.forcedTargetId).toBeNull();
    expect(sentinel.aggroTargetId).toBe(challenger.id);
  });

  it('makes each portal Warden pursue, melee, cast Quake, and recast on cadence', () => {
    const { sim, boss } = claimedEncounter(704);
    sim.player.autoAttack = false;
    sim.player.damageImmune = false;
    sim.player.maxHp = 100_000;
    sim.player.hp = sim.player.maxHp;
    boss.hp = Math.floor(boss.maxHp * 0.5);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    const warden = state.assemblyAddIds
      .map((id) => sim.entities.get(id))
      .find((add) => add?.templateId === VARKHUL_CRUCIBLE_WARDEN_ID);
    if (!warden) throw new Error('Crucible Warden did not emerge');
    state.assemblyForgeBeamWarmupRemaining = 999;

    const challenger = addTank(sim, boss, 'WardenChallenger');
    warden.threat.clear();
    warden.threat.set(sim.player.id, 10);
    warden.threat.set(challenger.id, 10_000);
    warden.aggroTargetId = sim.player.id;
    sim.tick();
    expect(warden.aggroTargetId).toBe(challenger.id);
    warden.forcedTargetId = sim.player.id;
    warden.forcedTargetTimer = DT / 2;
    sim.tick();
    expect(warden.aggroTargetId).toBe(sim.player.id);
    sim.tick();
    expect(warden.forcedTargetId).toBeNull();
    expect(warden.aggroTargetId).toBe(challenger.id);
    warden.threat.clear();
    warden.threat.set(sim.player.id, 10_000);
    warden.aggroTargetId = sim.player.id;

    for (const addId of state.assemblyAddIds) {
      const add = sim.entities.get(addId);
      if (add && add.id !== warden.id) add.dead = true;
    }

    sim.player.pos = sim.ctx.groundPos(warden.pos.x + 10, warden.pos.z);
    sim.player.prevPos = { ...sim.player.pos };
    const beforePursuit = Math.hypot(
      warden.pos.x - sim.player.pos.x,
      warden.pos.z - sim.player.pos.z,
    );
    sim.tick();
    expect(
      Math.hypot(warden.pos.x - sim.player.pos.x, warden.pos.z - sim.player.pos.z),
    ).toBeLessThan(beforePursuit);

    sim.player.pos = sim.ctx.groundPos(warden.pos.x + 1, warden.pos.z);
    sim.player.prevPos = { ...sim.player.pos };
    warden.bigCastTimer = DT;
    warden.swingTimer = 0;
    const hpBeforeMelee = sim.player.hp;
    sim.tick();
    expect(sim.player.hp).toBeLessThan(hpBeforeMelee);
    expect(warden.castingAbility).toBe('crucible_quake');
    const firstCastStartedAt = sim.ctx.time;

    sim.player.pos = sim.ctx.groundPos(warden.pos.x + 10, warden.pos.z);
    sim.player.prevPos = { ...sim.player.pos };
    const castRemainingBeforePursuit = warden.castRemaining;
    const distanceBeforeCastPursuit = Math.hypot(
      warden.pos.x - sim.player.pos.x,
      warden.pos.z - sim.player.pos.z,
    );
    sim.tick();
    expect(
      Math.hypot(warden.pos.x - sim.player.pos.x, warden.pos.z - sim.player.pos.z),
    ).toBeLessThan(distanceBeforeCastPursuit);
    expect(warden.castRemaining).toBeLessThan(castRemainingBeforePursuit);
    expect(warden.castingAbility).toBe('crucible_quake');

    sim.player.pos = sim.ctx.groundPos(warden.pos.x + 1, warden.pos.z);
    sim.player.prevPos = { ...sim.player.pos };
    warden.swingTimer = 0;
    const hpBeforeCastingMelee = sim.player.hp;
    sim.tick();
    expect(sim.player.hp).toBeLessThan(hpBeforeCastingMelee);
    expect(warden.castingAbility).toBe('crucible_quake');

    warden.swingTimer = 999;
    const hpBeforeQuake = sim.player.hp;
    for (let tick = 0; tick < 60 && warden.castingAbility === 'crucible_quake'; tick++) {
      sim.tick();
    }
    expect(warden.castingAbility).toBeNull();
    expect(sim.player.hp).toBeLessThan(hpBeforeQuake);
    for (let tick = 0; tick < 240 && warden.castingAbility !== 'crucible_quake'; tick++) {
      sim.tick();
    }
    expect(warden.castingAbility).toBe('crucible_quake');
    expect(sim.ctx.time - firstCastStartedAt).toBeCloseTo(12, 4);
  });

  it('lets Pummel interrupt Quake, applies fire lockout, and preserves its 12-second cadence', () => {
    const { sim, boss } = claimedEncounter(718);
    sim.setPlayerLevel(20);
    boss.hp = Math.floor(boss.maxHp * 0.5);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state missing');
    for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    state.assemblyForgeBeamWarmupRemaining = 999;
    const warden = state.assemblyAddIds
      .map((id) => sim.entities.get(id))
      .find((add) => add?.templateId === VARKHUL_CRUCIBLE_WARDEN_ID);
    if (!warden) throw new Error('Crucible Warden did not emerge');
    for (const addId of state.assemblyAddIds) {
      const add = sim.entities.get(addId);
      if (add && add.id !== warden.id) add.dead = true;
    }
    sim.player.pos = sim.ctx.groundPos(warden.pos.x + 1, warden.pos.z);
    sim.player.prevPos = { ...sim.player.pos };
    warden.swingTimer = 999;
    warden.bigCastTimer = DT;
    sim.tick();
    expect(warden.castingAbility).toBe('crucible_quake');
    const firstCastStartedAt = sim.ctx.time;

    const meta = sim.players.get(sim.playerId);
    const resolved = (
      sim as unknown as { resolvedAbility(id: string, pid: number): unknown }
    ).resolvedAbility('pummel', sim.playerId);
    if (!meta || !resolved) throw new Error('Pummel did not resolve');
    (
      sim.ctx as unknown as {
        runEffects(
          player: Entity,
          playerMeta: typeof meta,
          target: Entity,
          resolved: unknown,
        ): void;
      }
    ).runEffects(sim.player, meta, warden, resolved);
    expect(warden.castingAbility).toBeNull();
    expect(warden.auras).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'lockout', school: 'fire' })]),
    );

    for (let tick = 0; tick < 239; tick++) {
      sim.tick();
      expect(warden.castingAbility).toBeNull();
    }
    sim.tick();
    expect(warden.castingAbility).toBe('crucible_quake');
    expect(sim.ctx.time - firstCastStartedAt).toBeCloseTo(12, 4);
  });

  it('replays portal IDs, targets, Quake events, and rng draws identically for the same seed', () => {
    const run = () => {
      const { sim, boss } = claimedEncounter(719);
      boss.hp = Math.floor(boss.maxHp * 0.5);
      updateVarkhulEncounter(sim.ctx, boss);
      const state = boss.varkhul;
      if (!state) throw new Error('Varkhul state missing');
      for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
      updateVarkhulEncounter(sim.ctx, boss);
      state.assemblyForgeBeamWarmupRemaining = 999;
      const warden = state.assemblyAddIds
        .map((id) => sim.entities.get(id))
        .find((add) => add?.templateId === VARKHUL_CRUCIBLE_WARDEN_ID);
      if (!warden) throw new Error('Crucible Warden did not emerge');
      for (const addId of state.assemblyAddIds) {
        const add = sim.entities.get(addId);
        if (add && add.id !== warden.id) add.dead = true;
      }
      sim.player.pos = sim.ctx.groundPos(warden.pos.x + 1, warden.pos.z);
      sim.player.prevPos = { ...sim.player.pos };
      warden.swingTimer = 999;
      warden.bigCastTimer = DT;
      const draws: number[] = [];
      sim.rng.setObserver((value) => draws.push(value));
      const quakeEvents: unknown[] = [];
      for (let tick = 0; tick < 60; tick++) {
        quakeEvents.push(
          ...sim.tick().filter((event) => event.type === 'spellfx' && event.sourceId === warden.id),
        );
      }
      sim.rng.setObserver(null);
      return {
        draws,
        addIds: [...state.assemblyAddIds],
        targetId: warden.aggroTargetId,
        quakeEvents,
        phase: state.assemblyPhase,
        bigCastTimer: warden.bigCastTimer,
      };
    };

    const first = run();
    const second = run();
    expect(first).toEqual(second);
    expect(first.draws.length).toBeGreaterThan(0);
    expect(first.quakeEvents.length).toBeGreaterThan(0);
  });
});
