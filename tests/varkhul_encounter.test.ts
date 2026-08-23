import { describe, expect, it } from 'vitest';
import { isPlayerRemovableAura } from '../src/sim/aura_classify';
import {
  clearVarkhulEncounterAuras,
  resetVarkhulEncounter,
  selectVarkhulCinderOrbTargets,
  updateVarkhulEncounter,
  VARKHUL_ANVILS_DECREE_CAST_ID,
  VARKHUL_ANVILS_DECREE_STRIKES,
  VARKHUL_BOSS_ID,
  VARKHUL_CINDER_FIRE_DAMAGE_MAX_HP,
  VARKHUL_CINDER_FIRE_RADIUS,
  VARKHUL_CINDER_FIRE_TICK_SECONDS,
  VARKHUL_CINDER_ORB_DAMAGE_MAX_HP,
  VARKHUL_CINDER_ORB_DURATION,
  VARKHUL_CINDER_ORB_HIT_RADIUS,
  VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET,
  VARKHUL_CINDER_ORB_SPEED,
  VARKHUL_CINDER_ORBS_AURA_ID,
  VARKHUL_CINDER_ORBS_CAST_ID,
  VARKHUL_CINDER_ORBS_MARK_SECONDS,
  VARKHUL_CINDER_ORBS_TARGETS,
  VARKHUL_FORGE_LOCAL_POS,
  VARKHUL_FORGESTORM_CAST_ID,
  VARKHUL_FORGESTORM_DAMAGE_MAX_HP,
  VARKHUL_FORGESTORM_IMPACTS_PER_WAVE,
  VARKHUL_FORGESTORM_WARNING_SECONDS,
  VARKHUL_FORGESTORM_WAVES,
  VARKHUL_FRONTAL_CAST_ID,
  VARKHUL_FRONTAL_DAMAGE_MAX_HP_HEROIC,
  VARKHUL_FRONTAL_DAMAGE_MAX_HP_NORMAL,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_DAMAGE_TAKEN,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_NAME,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS,
  VARKHUL_MAKERS_BRAND_AURA_ID,
  VARKHUL_MAKERS_BRAND_DAMAGE_MAX_HP,
  VARKHUL_MAKERS_BRAND_DURATION,
  VARKHUL_MAKERS_BRAND_EVERY,
  VARKHUL_MAKERS_BRAND_MAX_STACKS,
  VARKHUL_MAKERS_BRAND_PER_STACK,
  VARKHUL_MAKERS_BRAND_TANK_SWAP_STACKS,
  VARKHUL_MASTERPIECE_UNBOUND_AURA_ID,
  VARKHUL_MASTERPIECE_UNBOUND_PULSE_MAX_HP,
  VARKHUL_MASTERPIECE_UNBOUND_PULSE_SECONDS,
  VARKHUL_MASTERPIECE_UNBOUND_SPEED_MULTIPLIER,
  VARKHUL_MASTERS_ASSEMBLY_SECONDS,
  VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID,
  VARKHUL_RED_HOT_METAL_AURA_ID,
  VARKHUL_RED_HOT_METAL_DAMAGE_MAX_HP,
  VARKHUL_RED_HOT_METAL_DURATION,
  VARKHUL_RED_HOT_METAL_HEAL_ABSORB_MAX_HP,
  VARKHUL_RED_HOT_METAL_TICK_SECONDS,
  varkhulForgestormPattern,
} from '../src/sim/encounters/varkhul';
import { IGNIVAR_SECOND_WING_ID } from '../src/sim/ignivar_raid_ids';
import { enterDungeon, leaveDungeon } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type PlayerClass } from '../src/sim/types';
import {
  VARKHUL_ANVIL_METEOR_CAST_ID,
  VARKHUL_ANVIL_METEOR_DAMAGE_MAX_HP,
  VARKHUL_ANVIL_METEOR_RADIUS,
} from '../src/sim/varkhul_anvil_meteors';
import { VARKHUL_WORK_LOCAL_POS } from '../src/sim/varkhul_forge_intermission';

function claimedEncounter(seed = 42): { sim: Sim; boss: Entity } {
  const sim = new Sim({ seed, playerClass: 'warrior', devCommands: true });
  expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, sim.player.id, true)).toBe(true);
  const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
  if (!instance) throw new Error('Inner Crucible did not claim an instance');
  const bossIds = instance.mobIds.filter(
    (id) => sim.entities.get(id)?.templateId === VARKHUL_BOSS_ID,
  );
  expect(bossIds).toHaveLength(1);
  const boss = sim.entities.get(bossIds[0]);
  if (!boss) throw new Error('Inner Crucible did not spawn Varkhul');
  boss.inCombat = true;
  boss.aiState = 'attack';
  boss.aggroTargetId = sim.player.id;
  boss.swingTimer = 999;
  sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z + 2 };
  sim.player.prevPos = { ...sim.player.pos };
  return { sim, boss };
}

function addEncounterPlayer(
  sim: Sim,
  boss: Entity,
  name: string,
  cls: PlayerClass = 'priest',
): Entity {
  const pid = sim.addPlayer(cls, name);
  const player = sim.entities.get(sim.players.get(pid)?.entityId ?? -1);
  if (!player) throw new Error(`${name} did not spawn`);
  player.pos = { x: boss.pos.x + 2, y: boss.pos.y, z: boss.pos.z + 2 };
  player.prevPos = { ...player.pos };
  return player;
}

function isolateMechanics(boss: Entity): NonNullable<Entity['varkhul']> {
  if (!boss.varkhul) throw new Error('Varkhul state was not initialized');
  boss.varkhul.makersBrandTimer = 999;
  boss.varkhul.frontalTimer = 999;
  boss.varkhul.cinderOrbsTimer = 999;
  boss.varkhul.forgestormTimer = 999;
  boss.varkhul.anvilTimer = 999;
  boss.varkhul.interceptBeamTimer = 999;
  boss.swingTimer = Number.POSITIVE_INFINITY;
  return boss.varkhul;
}
function deterministicCinderOrbRun(seed: number) {
  const { sim, boss } = claimedEncounter(seed);
  const players = [
    sim.player,
    addEncounterPlayer(sim, boss, 'Determinism One'),
    addEncounterPlayer(sim, boss, 'Determinism Two'),
    addEncounterPlayer(sim, boss, 'Determinism Three'),
    addEncounterPlayer(sim, boss, 'Determinism Four'),
  ];
  updateVarkhulEncounter(sim.ctx, boss);
  const state = isolateMechanics(boss);
  state.cinderOrbsTimer = DT;
  updateVarkhulEncounter(sim.ctx, boss);
  const targetIds = [...state.cinderOrbsTargetIds];
  const offsets = [
    { x: -12, z: -12 },
    { x: 12, z: -12 },
    { x: 12, z: 12 },
  ];
  for (let index = 0; index < targetIds.length; index++) {
    const target = sim.entities.get(targetIds[index]);
    const offset = offsets[index];
    if (!target || !offset) throw new Error('Determinism target roster is incomplete');
    target.pos = sim.ctx.groundPos(boss.pos.x + offset.x, boss.pos.z + offset.z);
  }
  state.cinderOrbsMarkRemaining = DT;
  updateVarkhulEncounter(sim.ctx, boss);
  const fires = sim.activeVarkhulCinderFires.map((fire) => ({ ...fire }));
  const projectiles = sim.activeVarkhulCinderOrbProjectiles.map((projectile) => ({
    ...projectile,
  }));
  for (const player of players) player.pos = { ...boss.pos };
  for (let frame = 0; frame < VARKHUL_CINDER_ORB_DURATION / DT; frame++) {
    updateVarkhulEncounter(sim.ctx, boss);
  }
  const events = sim.events.flatMap((event) =>
    event.type === 'spellfxAt' && event.ability === VARKHUL_CINDER_ORBS_CAST_ID
      ? [
          {
            type: event.type,
            fx: event.fx,
            x: event.x,
            z: event.z,
            radius: event.radius,
          },
        ]
      : [],
  );
  return {
    targetIds,
    fires,
    projectiles,
    events,
    permanentFires: sim.activeVarkhulCinderFires,
    expiredProjectiles: sim.activeVarkhulCinderOrbProjectiles,
  };
}

describe('Varkhul encounter geometry and selection', () => {
  it('selects three non-tanks in a deterministic rotating order', () => {
    const players = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      dead: false,
    })) as Entity[];
    const tanks = new Set([1, 2]);

    expect(selectVarkhulCinderOrbTargets(players, tanks, 0).map((player) => player.id)).toEqual([
      3, 4, 5,
    ]);
    expect(selectVarkhulCinderOrbTargets(players, tanks, 2).map((player) => player.id)).toEqual([
      5, 6, 3,
    ]);
    expect(VARKHUL_CINDER_ORBS_TARGETS).toBe(3);
  });

  it('replays a full Cinder Orbs sequence identically for the same seed', () => {
    expect(deterministicCinderOrbRun(434)).toEqual(deterministicCinderOrbRun(434));
  });

  it('rotates a deterministic five-impact Forgestorm pattern per wave', () => {
    const origin = { x: 50, z: 75 };
    const first = varkhulForgestormPattern(3, 0, origin);
    const repeat = varkhulForgestormPattern(3, 0, origin);
    const next = varkhulForgestormPattern(3, 1, origin);

    expect(first).toEqual(repeat);
    expect(first).toHaveLength(VARKHUL_FORGESTORM_IMPACTS_PER_WAVE);
    expect(next).not.toEqual(first);
  });
});

describe('Varkhul encounter behavior', () => {
  it('spawns exactly once from the Inner Crucible roster and initializes through the mob tick', () => {
    const { sim, boss } = claimedEncounter(40);

    expect(boss.varkhul).toBeUndefined();
    sim.tick();

    expect(boss.varkhul).toBeDefined();
    expect(boss.inCombat).toBe(true);
    expect(
      sim.instances
        .find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID)
        ?.mobIds.filter((id) => sim.entities.get(id)?.templateId === VARKHUL_BOSS_ID),
    ).toEqual([boss.id]);
  });

  it('pins the player-facing Maker and Masterpiece tuning literally', () => {
    expect(VARKHUL_MAKERS_BRAND_EVERY).toBe(14);
    expect(VARKHUL_MAKERS_BRAND_DAMAGE_MAX_HP).toBe(0.3);
    expect(VARKHUL_MAKERS_BRAND_DURATION).toBe(30);
    expect(VARKHUL_MAKERS_BRAND_MAX_STACKS).toBe(3);
    expect(VARKHUL_MAKERS_BRAND_PER_STACK).toBe(0.35);
    expect(VARKHUL_MAKERS_BRAND_TANK_SWAP_STACKS).toBe(2);
    expect(VARKHUL_CINDER_ORBS_MARK_SECONDS).toBe(4);
    expect(VARKHUL_RED_HOT_METAL_DURATION).toBe(10);
    expect(VARKHUL_RED_HOT_METAL_TICK_SECONDS).toBe(2);
    expect(VARKHUL_RED_HOT_METAL_DAMAGE_MAX_HP).toBe(0.04);
    expect(VARKHUL_RED_HOT_METAL_HEAL_ABSORB_MAX_HP).toBe(0.3);
    expect(VARKHUL_CINDER_FIRE_RADIUS).toBe(3.5);
    expect(VARKHUL_CINDER_FIRE_TICK_SECONDS).toBe(1);
    expect(VARKHUL_CINDER_FIRE_DAMAGE_MAX_HP).toBe(0.04);
    expect(VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET).toBe(6);
    expect(VARKHUL_CINDER_ORB_SPEED).toBe(9);
    expect(VARKHUL_CINDER_ORB_DURATION).toBe(5.5);
    expect(VARKHUL_CINDER_ORB_HIT_RADIUS).toBe(1.1);
    expect(VARKHUL_CINDER_ORB_DAMAGE_MAX_HP).toBe(0.2);
    expect(VARKHUL_FORGESTORM_WAVES).toBe(3);
    expect(VARKHUL_ANVILS_DECREE_STRIKES).toBe(3);
    expect(VARKHUL_MASTERS_ASSEMBLY_SECONDS).toBe(45);
    expect(VARKHUL_MASTERPIECE_UNBOUND_SPEED_MULTIPLIER).toBe(1.25);
    expect(VARKHUL_MASTERPIECE_UNBOUND_PULSE_SECONDS).toBe(3);
    expect(VARKHUL_MASTERPIECE_UNBOUND_PULSE_MAX_HP).toBe(0.05);
  });

  it('stacks source-gated Maker marks and moves the next mark after a taunt swap', () => {
    const { sim, boss } = claimedEncounter();
    boss.swingTimer = Number.POSITIVE_INFINITY;
    const offTank = addEncounterPlayer(sim, boss, 'Off Tank', 'paladin');
    const primaryMaxHp = sim.player.maxHp;
    const primaryBrandDamage = Math.ceil(primaryMaxHp * VARKHUL_MAKERS_BRAND_DAMAGE_MAX_HP);
    sim.player.hp = primaryMaxHp;
    offTank.hp = offTank.maxHp;
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    sim.player.hp = primaryMaxHp;
    offTank.hp = offTank.maxHp;

    state.makersBrandTimer = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    const brandFromBoss = () =>
      sim.player.auras.find(
        (aura) => aura.id === VARKHUL_MAKERS_BRAND_AURA_ID && aura.sourceId === boss.id,
      );
    let brand = brandFromBoss();
    expect(sim.player.hp).toBe(primaryMaxHp - primaryBrandDamage);
    expect(brand).toMatchObject({
      kind: 'vuln_source',
      sourceId: boss.id,
      stacks: 1,
      duration: VARKHUL_MAKERS_BRAND_DURATION,
      encounterOwned: true,
    });
    expect(brand?.value).toBeCloseTo(VARKHUL_MAKERS_BRAND_PER_STACK, 8);

    sim.player.hp = primaryMaxHp;
    state.makersBrandTimer = DT;
    boss.swingTimer = Number.POSITIVE_INFINITY;
    updateVarkhulEncounter(sim.ctx, boss);
    brand = brandFromBoss();
    expect(sim.player.hp).toBe(
      primaryMaxHp - Math.round(primaryBrandDamage * (1 + VARKHUL_MAKERS_BRAND_PER_STACK)),
    );
    expect(brand?.stacks).toBe(VARKHUL_MAKERS_BRAND_TANK_SWAP_STACKS);

    sim.player.auras.push({
      id: VARKHUL_MAKERS_BRAND_AURA_ID,
      name: 'Foreign Brand',
      kind: 'vuln_source',
      remaining: 99,
      duration: 99,
      value: 9,
      stacks: 9,
      sourceId: boss.id + 10_000,
      school: 'fire',
    });
    for (let cast = 0; cast < 2; cast++) {
      sim.player.hp = primaryMaxHp;
      state.makersBrandTimer = DT;
      updateVarkhulEncounter(sim.ctx, boss);
    }
    brand = brandFromBoss();
    expect(brand?.stacks).toBe(3);
    expect(brand?.value).toBeCloseTo(1.05, 8);
    expect(sim.player.auras.find((aura) => aura.sourceId === boss.id + 10_000)).toMatchObject({
      stacks: 9,
      value: 9,
      remaining: 99,
    });

    boss.aggroTargetId = offTank.id;
    boss.forcedTargetId = offTank.id;
    boss.forcedTargetTimer = 3;
    state.makersBrandTimer = DT;
    boss.swingTimer = Number.POSITIVE_INFINITY;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(offTank.auras.find((aura) => aura.id === VARKHUL_MAKERS_BRAND_AURA_ID)?.stacks).toBe(1);
    expect(brand?.stacks).toBe(VARKHUL_MAKERS_BRAND_MAX_STACKS);
  });

  it('marks three non-tanks, keeps fire at their spread positions, and emits radial orbs', () => {
    const { sim, boss } = claimedEncounter(43);
    const players = [
      sim.player,
      addEncounterPlayer(sim, boss, 'Cinder One'),
      addEncounterPlayer(sim, boss, 'Cinder Two'),
      addEncounterPlayer(sim, boss, 'Cinder Three'),
      addEncounterPlayer(sim, boss, 'Cinder Four'),
    ];
    for (const player of players) {
      player.maxHp = 1_000;
      player.hp = 1_000;
    }
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.cinderOrbsTimer = DT;

    updateVarkhulEncounter(sim.ctx, boss);

    const marked = players.filter((player) =>
      player.auras.some((aura) => aura.id === VARKHUL_CINDER_ORBS_AURA_ID),
    );
    expect(marked).toHaveLength(3);
    expect(marked).not.toContain(sim.player);
    expect(boss.castingAbility).toBe(VARKHUL_CINDER_ORBS_CAST_ID);
    expect(state.cinderOrbsMarkRemaining).toBe(VARKHUL_CINDER_ORBS_MARK_SECONDS);
    for (const player of marked) {
      const mark = player.auras.find((aura) => aura.id === VARKHUL_CINDER_ORBS_AURA_ID);
      const metal = player.auras.find((aura) => aura.id === VARKHUL_RED_HOT_METAL_AURA_ID);
      const barrier = player.auras.find((aura) => aura.id === VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID);
      expect(mark).toMatchObject({
        remaining: 4,
        duration: 4,
        encounterOwned: true,
      });
      expect(metal).toMatchObject({
        kind: 'dot',
        value: Math.ceil(player.maxHp * VARKHUL_RED_HOT_METAL_DAMAGE_MAX_HP),
        tickInterval: 2,
        duration: 10,
        encounterOwned: true,
      });
      expect(barrier).toMatchObject({
        kind: 'heal_absorb',
        value: Math.ceil(player.maxHp * VARKHUL_RED_HOT_METAL_HEAL_ABSORB_MAX_HP),
        duration: 10,
        encounterOwned: true,
      });
      expect(mark && isPlayerRemovableAura(mark)).toBe(false);
      expect(metal && isPlayerRemovableAura(metal)).toBe(false);
      expect(barrier && isPlayerRemovableAura(barrier)).toBe(false);
    }

    const firstMarked = marked[0];
    const healer = marked[1];
    const dot = firstMarked.auras.find((aura) => aura.id === VARKHUL_RED_HOT_METAL_AURA_ID);
    const absorb = firstMarked.auras.find(
      (aura) => aura.id === VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID,
    );
    if (!dot || !absorb || !healer) throw new Error('Cinder Orbs test roster is incomplete');
    firstMarked.hp = firstMarked.maxHp;
    dot.tickTimer = DT;
    sim.tick();
    expect(firstMarked.hp).toBe(firstMarked.maxHp - dot.value);
    firstMarked.maxHp = 1_000;
    firstMarked.hp = 500;
    const firstHeal = Math.max(1, Math.floor(absorb.value / 2));
    const remainingAbsorb = absorb.value - firstHeal;
    const hpBehindBarrier = firstMarked.hp;
    sim.ctx.applyHeal(healer, firstMarked, firstHeal, 'Test Heal', null, false);
    expect(firstMarked.hp).toBe(hpBehindBarrier);
    expect(
      firstMarked.auras.find((aura) => aura.id === VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID)?.value,
    ).toBe(remainingAbsorb);
    sim.ctx.applyHeal(healer, firstMarked, remainingAbsorb + 20, 'Test Heal', null, false);
    expect(firstMarked.hp).toBe(hpBehindBarrier + 20);
    expect(firstMarked.auras.some((aura) => aura.id === VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID)).toBe(
      false,
    );
    expect(firstMarked.auras.some((aura) => aura.id === VARKHUL_RED_HOT_METAL_AURA_ID)).toBe(true);

    marked[0].pos = { x: boss.pos.x - 20, y: boss.pos.y, z: boss.pos.z - 20 };
    marked[1].pos = { x: boss.pos.x + 20, y: boss.pos.y, z: boss.pos.z - 20 };
    marked[2].pos = { x: boss.pos.x + 20, y: boss.pos.y, z: boss.pos.z + 20 };
    state.cinderOrbsMarkRemaining = DT * 2;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(sim.activeVarkhulCinderFires).toHaveLength(0);
    expect(sim.activeVarkhulCinderOrbProjectiles).toHaveLength(0);
    updateVarkhulEncounter(sim.ctx, boss);
    expect(sim.activeVarkhulCinderFires).toHaveLength(3);
    expect(sim.activeVarkhulCinderOrbProjectiles).toHaveLength(18);
    expect(state.majorAbility).toBe('none');
    expect(state.cinderFires).toHaveLength(3);
    expect(state.cinderOrbProjectiles).toHaveLength(18);
    expect(
      marked.every(
        (player) => !player.auras.some((aura) => aura.id === VARKHUL_CINDER_ORBS_AURA_ID),
      ),
    ).toBe(true);
    expect(state.cinderFires.map((fire) => fire.pos)).toEqual(marked.map((player) => player.pos));
    for (let targetIndex = 0; targetIndex < marked.length; targetIndex++) {
      const fan = state.cinderOrbProjectiles.slice(
        targetIndex * VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET,
        (targetIndex + 1) * VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET,
      );
      expect(fan).toHaveLength(6);
      expect(fan.every((projectile) => projectile.ownerId === marked[targetIndex].id)).toBe(true);
      expect(fan.every((projectile) => projectile.pos.x === marked[targetIndex].pos.x)).toBe(true);
      expect(fan.every((projectile) => projectile.pos.z === marked[targetIndex].pos.z)).toBe(true);
      for (const projectile of fan) {
        expect(Math.hypot(projectile.dir.x, projectile.dir.z)).toBeCloseTo(1, 6);
      }
    }

    const fire = state.cinderFires[0];
    if (!fire) throw new Error('Cinder fire did not spawn');
    state.cinderOrbProjectiles = [];
    sim.player.pos = { ...fire.pos };
    sim.player.hp = 1_000;
    fire.tickTimer = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(sim.player.hp).toBe(
      1_000 - Math.ceil(sim.player.maxHp * VARKHUL_CINDER_FIRE_DAMAGE_MAX_HP),
    );
  });

  it('keeps the ground fire permanently and continues ticking after twelve seconds', () => {
    const { sim, boss } = claimedEncounter(431);
    sim.player.maxHp = 100_000;
    sim.player.hp = 100_000;
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.cinderFires.push({
      id: `${boss.id}:cinder-fire:persistent`,
      pos: { ...sim.player.pos },
      tickTimer: 1,
    });

    for (let frame = 0; frame < 12 / DT; frame++) {
      updateVarkhulEncounter(sim.ctx, boss);
    }

    expect(sim.player.hp).toBe(52_000);
    expect(state.cinderFires).toHaveLength(1);
  });

  it('damages the exact cinder fire edge but spares dead and outside players', () => {
    const { sim, boss } = claimedEncounter(433);
    const onEdge = addEncounterPlayer(sim, boss, 'Cinder Edge');
    const outside = addEncounterPlayer(sim, boss, 'Cinder Outside');
    const deadInside = addEncounterPlayer(sim, boss, 'Cinder Fallen');
    for (const player of [onEdge, outside, deadInside]) {
      player.maxHp = 1_000;
      player.hp = 1_000;
    }
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    const origin = { ...sim.player.pos };
    onEdge.pos = { ...origin, x: origin.x + VARKHUL_CINDER_FIRE_RADIUS };
    outside.pos = { ...origin, x: origin.x + VARKHUL_CINDER_FIRE_RADIUS + 0.001 };
    deadInside.pos = { ...origin };
    deadInside.dead = true;
    state.cinderFires.push({
      id: `${boss.id}:cinder-fire:boundary`,
      pos: origin,
      tickTimer: DT,
    });

    updateVarkhulEncounter(sim.ctx, boss);

    expect(onEdge.hp).toBe(960);
    expect(outside.hp).toBe(1_000);
    expect(deadInside.hp).toBe(1_000);
  });

  it('moves each orb across the room and damages each player at most once', () => {
    const { sim, boss } = claimedEncounter(435);
    const target = addEncounterPlayer(sim, boss, 'Orb Dodger');
    sim.player.pos = { ...boss.pos, x: boss.pos.x - 20 };
    target.maxHp = 1_000;
    target.hp = 1_000;
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.cinderOrbProjectiles.push({
      id: `${boss.id}:cinder-orbs:collision:0`,
      ownerId: sim.player.id,
      pos: { ...target.pos, x: target.pos.x - VARKHUL_CINDER_ORB_SPEED * DT },
      dir: { x: 1, z: 0 },
      remaining: VARKHUL_CINDER_ORB_DURATION,
      hitPlayerIds: [sim.player.id],
    });

    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.cinderOrbProjectiles[0]?.pos.x).toBeCloseTo(target.pos.x, 6);
    expect(target.hp).toBe(800);
    expect(state.cinderOrbProjectiles[0]?.hitPlayerIds).toContain(target.id);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(target.hp).toBe(800);
  });

  it('waits instead of channeling Cinder Orbs when the tank is alone', () => {
    const { sim, boss } = claimedEncounter(436);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.cinderOrbsTimer = DT;

    updateVarkhulEncounter(sim.ctx, boss);

    expect(state.majorAbility).toBe('none');
    expect(state.cinderOrbsTargetIds).toEqual([]);
    expect(state.cinderOrbsTimer).toBe(2);
    expect(boss.castingAbility).toBeNull();
  });

  it('does not release fire or projectiles for a marked player who dies during the spread', () => {
    const { sim, boss } = claimedEncounter(434);
    const players = [
      sim.player,
      addEncounterPlayer(sim, boss, 'Cinder Living One'),
      addEncounterPlayer(sim, boss, 'Cinder Living Two'),
      addEncounterPlayer(sim, boss, 'Cinder Doomed'),
      addEncounterPlayer(sim, boss, 'Cinder Reserve'),
    ];
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.cinderOrbsTimer = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    const marked = players.filter((player) => state.cinderOrbsTargetIds.includes(player.id));
    expect(marked).toHaveLength(3);
    const doomed = marked[1];
    doomed.dead = true;
    const survivingPositions = marked
      .filter((player) => player !== doomed)
      .map((_player, index) => ({
        x: boss.pos.x + 12 + index * 6,
        y: boss.pos.y,
        z: boss.pos.z + 9,
      }));
    for (let index = 0; index < survivingPositions.length; index++) {
      const survivor = marked.filter((player) => player !== doomed)[index];
      survivor.pos = survivingPositions[index];
    }
    state.cinderOrbsMarkRemaining = DT;

    updateVarkhulEncounter(sim.ctx, boss);

    expect(state.cinderFires).toHaveLength(2);
    expect(state.cinderFires.map((fire) => fire.pos)).toEqual(survivingPositions);
    expect(state.cinderOrbProjectiles).toHaveLength(12);
  });

  it('does not project cinder hazards from a dead Varkhul', () => {
    const { sim, boss } = claimedEncounter(432);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.cinderFires.push({
      id: `${boss.id}:cinder-fire:dead`,
      pos: { ...sim.player.pos },
      tickTimer: 0.5,
    });
    state.cinderOrbProjectiles.push({
      id: `${boss.id}:cinder-orbs:dead:0`,
      ownerId: boss.id,
      pos: { ...sim.player.pos },
      dir: { x: 1, z: 0 },
      remaining: 5,
      hitPlayerIds: [],
    });
    expect(sim.activeVarkhulCinderFires).toHaveLength(1);
    expect(sim.activeVarkhulCinderOrbProjectiles).toHaveLength(1);

    boss.dead = true;

    expect(sim.activeVarkhulCinderFires).toEqual([]);
    expect(sim.activeVarkhulCinderOrbProjectiles).toEqual([]);
  });

  it('publishes five GroundAoE warnings before each Forgestorm impact', () => {
    const { sim, boss } = claimedEncounter(44);
    sim.player.maxHp = 1_000;
    sim.player.hp = 1_000;
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.forgestormTimer = DT;

    updateVarkhulEncounter(sim.ctx, boss);

    const warnings = sim.ctx.groundAoEs.filter(
      (effect) => effect.sourceId === boss.id && effect.abilityId === VARKHUL_FORGESTORM_CAST_ID,
    );
    expect(warnings).toHaveLength(VARKHUL_FORGESTORM_IMPACTS_PER_WAVE);
    expect(sim.activeVarkhulForgestormWarnings).toHaveLength(VARKHUL_FORGESTORM_IMPACTS_PER_WAVE);
    expect(sim.activeVarkhulForgestormWarnings[0]).toMatchObject({
      sourceId: boss.id,
      radius: 4,
      duration: VARKHUL_FORGESTORM_WARNING_SECONDS,
      remaining: VARKHUL_FORGESTORM_WARNING_SECONDS,
    });
    expect(warnings[0].remaining).toBeCloseTo(VARKHUL_FORGESTORM_WARNING_SECONDS + DT * 2, 5);
    sim.player.pos = { ...state.forgestormPoints[0] };
    state.forgestormWarningRemaining = DT;

    updateVarkhulEncounter(sim.ctx, boss);

    expect(sim.player.hp).toBe(1_000 - 1_000 * VARKHUL_FORGESTORM_DAMAGE_MAX_HP);
    expect(state.forgestormWaveIndex).toBe(1);
    expect(
      sim.ctx.groundAoEs.filter(
        (effect) => effect.sourceId === boss.id && effect.abilityId === VARKHUL_FORGESTORM_CAST_ID,
      ),
    ).toHaveLength(VARKHUL_FORGESTORM_IMPACTS_PER_WAVE);

    sim.player.pos = { ...boss.pos };
    state.forgestormWarningRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.forgestormWaveIndex).toBe(2);
    expect(
      sim.ctx.groundAoEs.filter(
        (effect) => effect.sourceId === boss.id && effect.abilityId === VARKHUL_FORGESTORM_CAST_ID,
      ),
    ).toHaveLength(VARKHUL_FORGESTORM_IMPACTS_PER_WAVE);

    state.forgestormWarningRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(state.majorAbility).toBe('none');
    expect(boss.castingAbility).toBeNull();
    expect(
      sim.ctx.groundAoEs.filter(
        (effect) => effect.sourceId === boss.id && effect.abilityId === VARKHUL_FORGESTORM_CAST_ID,
      ),
    ).toHaveLength(0);
  });

  it.each([
    ['normal', [900, 800, 600]],
    ['heroic', [860, 720, 470]],
  ] as const)('scales the three Anvil raid hits on %s', (difficulty, expectedHp) => {
    const { sim, boss } = claimedEncounter(difficulty === 'normal' ? 451 : 452);
    const raider = addEncounterPlayer(sim, boss, `${difficulty} Anvil Raider`);
    const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
    if (!instance) throw new Error('Inner Crucible instance disappeared');
    instance.difficulty = difficulty;
    for (const player of [sim.player, raider]) {
      player.maxHp = 1_000;
      player.hp = 1_000;
      player.pos = { ...boss.pos };
    }
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.anvilTimer = DT;
    updateVarkhulEncounter(sim.ctx, boss);

    const origin = sim.ctx.instanceOriginOf(instance);
    expect(boss.castingAbility).toBe(VARKHUL_ANVILS_DECREE_CAST_ID);
    expect(boss.pos.x).toBeCloseTo(origin.x + VARKHUL_WORK_LOCAL_POS.x, 5);
    expect(boss.pos.z).toBeCloseTo(origin.z + VARKHUL_WORK_LOCAL_POS.z, 5);
    sim.player.pos = { ...boss.pos };
    raider.pos = { ...boss.pos, z: boss.pos.z + 8 };

    for (let strike = 0; strike < expectedHp.length; strike++) {
      state.anvilStrikeRemaining = DT;
      updateVarkhulEncounter(sim.ctx, boss);
      expect(sim.player.hp).toBe(expectedHp[strike]);
      expect(raider.hp).toBe(expectedHp[strike]);
      const impacts = sim.events.filter(
        (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_ANVILS_DECREE_CAST_ID,
      );
      expect(impacts).toHaveLength(strike + 1);
      expect(impacts[strike]).toMatchObject({
        x: origin.x + VARKHUL_FORGE_LOCAL_POS.x,
        z: origin.z + VARKHUL_FORGE_LOCAL_POS.z,
        school: 'fire',
        fx: 'nova',
        sourceId: boss.id,
      });
      expect('radius' in impacts[strike]).toBe(false);
      expect(
        sim.ctx.groundAoEs.filter((effect) => effect.abilityId === VARKHUL_ANVILS_DECREE_CAST_ID),
      ).toEqual([]);
    }
    expect(state.anvilStrikeIndex).toBe(3);
    expect(state.majorAbility).toBe('none');
    expect(boss.castingAbility).toBeNull();
  });

  it.each([
    ['normal', VARKHUL_FRONTAL_DAMAGE_MAX_HP_NORMAL],
    ['heroic', VARKHUL_FRONTAL_DAMAGE_MAX_HP_HEROIC],
  ] as const)(
    'locks the 120-degree frontal facing and deals %s damage only inside it',
    (difficulty, damage) => {
      const { sim, boss } = claimedEncounter(difficulty === 'normal' ? 453 : 454);
      const bait = addEncounterPlayer(sim, boss, `${difficulty} Frontal Bait`);
      const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
      if (!instance) throw new Error('Inner Crucible instance disappeared');
      instance.difficulty = difficulty;
      for (const player of [sim.player, bait]) {
        player.maxHp = 1_000;
        player.hp = 1_000;
      }
      bait.pos = sim.ctx.groundPos(boss.pos.x + 12, boss.pos.z);
      updateVarkhulEncounter(sim.ctx, boss);
      const state = isolateMechanics(boss);
      state.frontalTimer = DT;
      updateVarkhulEncounter(sim.ctx, boss);

      expect(boss.castingAbility).toBe(VARKHUL_FRONTAL_CAST_ID);
      expect(state.frontalFacing).toBeCloseTo(Math.PI / 2, 5);
      sim.player.pos = sim.ctx.groundPos(boss.pos.x + 10, boss.pos.z);
      bait.pos = sim.ctx.groundPos(boss.pos.x, boss.pos.z + 10);
      state.frontalCastRemaining = DT;
      updateVarkhulEncounter(sim.ctx, boss);

      expect(sim.player.hp).toBe(1_000 - 1_000 * damage);
      expect(bait.hp).toBe(1_000);
      expect(boss.castingAbility).toBeNull();
    },
  );

  it('schedules three dodgeable Heroic meteors after a hammer impact', () => {
    const { sim, boss } = claimedEncounter(455);
    const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
    if (!instance) throw new Error('Inner Crucible instance disappeared');
    instance.difficulty = 'heroic';
    sim.player.maxHp = 1_000;
    sim.player.hp = 1_000;
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.anvilTimer = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    state.anvilStrikeRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);

    expect(sim.activeVarkhulAnvilMeteors).toHaveLength(3);
    expect(
      sim.activeVarkhulAnvilMeteors.every(
        (warning) => warning.radius === VARKHUL_ANVIL_METEOR_RADIUS,
      ),
    ).toBe(true);
    const meteorBatch = state.anvilMeteorBatches[0];
    if (!meteorBatch) throw new Error('Heroic meteor batch was not scheduled');
    sim.player.pos = { ...meteorBatch.points[0] };
    const hpBeforeMeteor = sim.player.hp;
    meteorBatch.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);

    expect(sim.player.hp).toBe(hpBeforeMeteor - 1_000 * VARKHUL_ANVIL_METEOR_DAMAGE_MAX_HP);
    expect(
      sim.events.filter(
        (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_ANVIL_METEOR_CAST_ID,
      ),
    ).toHaveLength(3);
  });

  it('keeps all nine Heroic meteor impacts when enraged hammer warnings overlap', () => {
    const { sim, boss } = claimedEncounter(458);
    const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
    if (!instance) throw new Error('Inner Crucible instance disappeared');
    instance.difficulty = 'heroic';
    sim.player.profilerInvulnerable = true;
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.assemblyTriggered = true;
    state.masterpieceTriggered = true;
    state.anvilTimer = DT;
    let maximumWarnings = 0;
    for (let tick = 0; tick < 240; tick++) {
      updateVarkhulEncounter(sim.ctx, boss);
      maximumWarnings = Math.max(maximumWarnings, sim.activeVarkhulAnvilMeteors.length);
    }

    expect(maximumWarnings).toBeGreaterThanOrEqual(6);
    expect(
      sim.events.filter(
        (event) => event.type === 'spellfxAt' && event.ability === VARKHUL_ANVIL_METEOR_CAST_ID,
      ),
    ).toHaveLength(9);
  });

  it('does not schedule hammer meteors in Normal', () => {
    const { sim, boss } = claimedEncounter(459);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.anvilTimer = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    state.anvilStrikeRemaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);

    expect(state.anvilMeteorBatches).toEqual([]);
    expect(sim.activeVarkhulAnvilMeteors).toEqual([]);
  });
  it('makes the Assembly threshold mandatory and immune to exact-copy and dev damage', () => {
    const { sim, boss } = claimedEncounter(462);
    updateVarkhulEncounter(sim.ctx, boss);
    isolateMechanics(boss);
    const floor = Math.ceil(boss.maxHp * 0.5);
    sim.ctx.dealDamage(
      sim.player,
      boss,
      boss.maxHp * 10,
      false,
      'shadow',
      'Threshold Burst',
      'hit',
    );
    sim.ctx.dealDamage(
      sim.player,
      boss,
      boss.maxHp * 10,
      false,
      'shadow',
      'Same Tick Burst',
      'hit',
    );
    expect(boss.hp).toBe(floor);
    expect(boss.dead).toBe(false);

    updateVarkhulEncounter(sim.ctx, boss);
    expect(boss.damageImmune).toBe(true);
    const hpDuringAssembly = boss.hp;
    sim.ctx.dealDamage(
      sim.player,
      boss,
      500,
      false,
      'shadow',
      'Ruinous Copy',
      'hit',
      false,
      undefined,
      true,
      false,
      false,
      null,
      false,
      undefined,
      true,
    );
    sim.player.oneShot = true;
    sim.ctx.dealDamage(sim.player, boss, 1, false, 'physical', 'Dev Smite', 'hit');
    expect(boss.hp).toBe(hpDuringAssembly);
  });
  it('accelerates non-tank mechanics at 20% and wipes when Masterpiece expires', () => {
    const { sim, boss } = claimedEncounter(47);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    state.assemblyTriggered = true;
    boss.hp = Math.floor(boss.maxHp * 0.2);
    state.cinderOrbsTimer = 10;
    state.forgestormTimer = 10;
    state.anvilTimer = 10;
    state.makersBrandTimer = 10;

    updateVarkhulEncounter(sim.ctx, boss);

    expect(boss.auras.some((aura) => aura.id === VARKHUL_MASTERPIECE_UNBOUND_AURA_ID)).toBe(true);
    expect(state.cinderOrbsTimer).toBeCloseTo(10 - DT * 1.25, 5);
    expect(state.forgestormTimer).toBeCloseTo(10 - DT * 1.25, 5);
    expect(state.anvilTimer).toBeCloseTo(10 - DT * 1.25, 5);
    expect(state.makersBrandTimer).toBeCloseTo(10 - DT, 5);

    state.masterpiecePulseTimer = DT;
    sim.player.hp = sim.player.maxHp;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(sim.player.hp).toBe(
      sim.player.maxHp - Math.ceil(sim.player.maxHp * VARKHUL_MASTERPIECE_UNBOUND_PULSE_MAX_HP),
    );
    state.masterpieceRemaining = DT;
    sim.player.hp = sim.player.maxHp;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(sim.player.dead).toBe(true);
  });

  it('cleans in-claim auras, warnings, casts, and enrage on reset', () => {
    const { sim, boss } = claimedEncounter(48);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = isolateMechanics(boss);
    sim.player.auras.push({
      id: VARKHUL_MAKERS_BRAND_AURA_ID,
      name: "Maker's Brand",
      kind: 'vuln_source',
      remaining: 30,
      duration: 30,
      value: 0.35,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    state.forgestormTimer = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(sim.ctx.groundAoEs.some((effect) => effect.sourceId === boss.id)).toBe(true);

    resetVarkhulEncounter(sim.ctx, boss);

    expect(boss.varkhul).toBeUndefined();
    expect(boss.castingAbility).toBeNull();
    expect(boss.enraged).toBe(false);
    expect(sim.player.auras.some((aura) => aura.sourceId === boss.id)).toBe(false);
    expect(sim.ctx.groundAoEs.some((effect) => effect.sourceId === boss.id)).toBe(false);
  });

  it('despawns portal-wave adds and clears boss-sourced auras from displaced players on reset', () => {
    const { sim, boss } = claimedEncounter(49);
    const displaced = addEncounterPlayer(sim, boss, 'Displaced Raider');
    updateVarkhulEncounter(sim.ctx, boss);
    isolateMechanics(boss);
    boss.hp = Math.floor(boss.maxHp * 0.5);
    updateVarkhulEncounter(sim.ctx, boss);
    const state = boss.varkhul;
    if (!state) throw new Error('Varkhul state disappeared');
    for (const pending of state.assemblyPortalSpawns) pending.remaining = DT;
    updateVarkhulEncounter(sim.ctx, boss);
    const addIds = [...state.assemblyAddIds];
    expect(addIds).toHaveLength(4);
    displaced.auras.push({
      id: VARKHUL_CINDER_ORBS_AURA_ID,
      name: VARKHUL_CINDER_ORBS_CAST_ID,
      kind: 'vulnerability',
      remaining: 4,
      duration: 4,
      value: 0,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    displaced.pos = sim.ctx.groundPos(0, 0);
    displaced.prevPos = { ...displaced.pos };

    resetVarkhulEncounter(sim.ctx, boss);

    expect(addIds.every((id) => !sim.entities.has(id))).toBe(true);
    expect(displaced.auras.some((aura) => aura.sourceId === boss.id)).toBe(false);
  });

  it('clears both Varkhul encounter auras when a player leaves the Inner Crucible', () => {
    const { sim, boss } = claimedEncounter(50);
    sim.player.auras.push(
      {
        id: VARKHUL_MAKERS_BRAND_AURA_ID,
        name: "Maker's Brand",
        kind: 'vuln_source',
        remaining: 30,
        duration: 30,
        value: 0.35,
        sourceId: boss.id,
        school: 'fire',
        encounterOwned: true,
      },
      {
        id: VARKHUL_CINDER_ORBS_AURA_ID,
        name: VARKHUL_CINDER_ORBS_CAST_ID,
        kind: 'vulnerability',
        remaining: 4,
        duration: 4,
        value: 0,
        sourceId: boss.id,
        school: 'fire',
        encounterOwned: true,
      },
      {
        id: VARKHUL_RED_HOT_METAL_AURA_ID,
        name: 'Red-hot Metal',
        kind: 'dot',
        remaining: 10,
        duration: 10,
        value: 40,
        sourceId: boss.id,
        school: 'fire',
        encounterOwned: true,
      },
      {
        id: VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID,
        name: 'Red-hot Metal Barrier',
        kind: 'heal_absorb',
        remaining: 10,
        duration: 10,
        value: 300,
        sourceId: boss.id,
        school: 'fire',
        encounterOwned: true,
      },
      {
        id: VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID,
        name: VARKHUL_INTERCEPT_BEAM_DEBUFF_NAME,
        kind: 'vuln_source',
        remaining: VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS,
        duration: VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS,
        value: VARKHUL_INTERCEPT_BEAM_DEBUFF_DAMAGE_TAKEN,
        sourceId: boss.id,
        school: 'fire',
        encounterOwned: true,
      },
    );

    expect(leaveDungeon(sim.ctx, sim.player.id)).toBe(true);

    expect(
      sim.player.auras.some(
        (aura) =>
          aura.id === VARKHUL_MAKERS_BRAND_AURA_ID ||
          aura.id === VARKHUL_CINDER_ORBS_AURA_ID ||
          aura.id === VARKHUL_RED_HOT_METAL_AURA_ID ||
          aura.id === VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID ||
          aura.id === VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID,
      ),
    ).toBe(false);
  });
  it('can clear one retired boss source without touching another source', () => {
    const { sim, boss } = claimedEncounter(51);
    const otherSourceId = boss.id + 10_000;
    for (const sourceId of [boss.id, otherSourceId]) {
      sim.player.auras.push({
        id: VARKHUL_MAKERS_BRAND_AURA_ID,
        name: "Maker's Brand",
        kind: 'vuln_source',
        remaining: 30,
        duration: 30,
        value: 0.35,
        sourceId,
        school: 'fire',
        encounterOwned: true,
      });
    }

    clearVarkhulEncounterAuras(sim.player, boss.id);

    expect(sim.player.auras.filter((aura) => aura.id === VARKHUL_MAKERS_BRAND_AURA_ID)).toEqual([
      expect.objectContaining({ sourceId: otherSourceId }),
    ]);
  });
});
