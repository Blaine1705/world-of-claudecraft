import { describe, expect, it } from 'vitest';

import { abilityVfxSpecFor } from '../src/render/ability_vfx/encounter_specs';
import { DUNGEONS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  IGNIVAR_CRUCIBLE_WARDEN_ID,
  IGNIVAR_EMBER_SENTINEL_ID,
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_MOLTEN_ASSEMBLY_ID,
  IGNIVAR_SECOND_WING_ID,
} from '../src/sim/ignivar_raid_ids';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { SCRIPTED_INTERRUPTIBLE_CHANNELS } from '../src/sim/mob/healer_channel';
import {
  IGNIVAR_CINDER_LANCE_CAST_ID,
  IGNIVAR_CINDER_LANCE_CAST_SECONDS,
  IGNIVAR_CINDER_LANCE_DAMAGE_MAX_HP,
  IGNIVAR_CINDER_LANCE_RADIUS,
  IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
  IGNIVAR_CRUCIBLE_STOMP_DAMAGE_MAX_HP,
  IGNIVAR_CRUCIBLE_STOMP_RADIUS,
  IGNIVAR_CRUCIBLE_STOMP_REPEAT_SECONDS,
  updateIgnivarTrashAutomaton,
} from '../src/sim/mob/ignivar_trash_automata';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';

function claimedRoom(
  dungeonId: string,
  difficulty: 'normal' | 'heroic' = 'normal',
): { sim: Sim; mobs: Entity[] } {
  const sim = new Sim({ seed: 8124, playerClass: 'warrior', devCommands: true });
  sim.setDungeonDifficulty(difficulty);
  expect(enterDungeon(sim.ctx, dungeonId, sim.player.id, true)).toBe(true);
  const instance = sim.instances.find(
    (candidate) => candidate.dungeonId === dungeonId && candidate.partyKey !== null,
  );
  if (!instance) throw new Error(`Missing claimed room ${dungeonId}`);
  const mobs = instance.mobIds
    .map((id) => sim.entities.get(id))
    .filter((mob): mob is Entity => mob !== undefined);
  return { sim, mobs };
}

function engage(mob: Entity, target: Entity): void {
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = target.id;
  target.pos = { x: mob.pos.x + 8, y: mob.pos.y, z: mob.pos.z };
  target.prevPos = { ...target.pos };
}

describe('Ignivar trash automata', () => {
  it('promotes only the placed trash Warden into an enlarged control-immune miniboss', () => {
    const template = MOBS[IGNIVAR_CRUCIBLE_WARDEN_ID];
    const ordinary = createMob(1, template, 20, { x: 0, y: 0, z: 0 });
    const { mobs } = claimedRoom(IGNIVAR_FORGE_APPROACH_ID);
    const miniboss = mobs.find((mob) => mob.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID);
    if (!miniboss) throw new Error('Approach Warden miniboss missing');

    expect(template).toMatchObject({
      elite: true,
      hpBase: 350,
      hpPerLevel: 55,
      scale: 1.7,
    });
    expect(template.boss).toBeUndefined();
    expect(ordinary).toMatchObject({ maxHp: 3208, scale: 1.7 });
    expect(ordinary.ccImmune).toBeUndefined();
    expect(ordinary.slowImmune).toBeUndefined();
    expect(miniboss).toMatchObject({
      maxHp: 7539,
      hp: 7539,
      scale: 2.75,
      ccImmune: true,
      slowImmune: true,
    });
  });

  it.each([
    [IGNIVAR_FORGE_APPROACH_ID, 'heroic', 1, 7539, 20],
    [IGNIVAR_MOLTEN_ASSEMBLY_ID, 'normal', 2, 7539, 20],
    [IGNIVAR_MOLTEN_ASSEMBLY_ID, 'heroic', 2, 9426, 22],
  ] as const)(
    'applies the exact miniboss promotion to every Warden in %s on %s',
    (roomId, difficulty, wardenCount, maxHp, level) => {
      const { mobs } = claimedRoom(roomId, difficulty);
      const wardens = mobs.filter((mob) => mob.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID);

      expect(wardens).toHaveLength(wardenCount);
      for (const warden of wardens) {
        expect(warden).toMatchObject({
          level,
          maxHp,
          hp: maxHp,
          scale: 2.75,
          ccImmune: true,
          slowImmune: true,
        });
      }
    },
  );

  it.each([
    [IGNIVAR_FORGE_APPROACH_ID, 1, 12, 2, 36],
    [IGNIVAR_MOLTEN_ASSEMBLY_ID, 2, 12, 2, 54],
  ] as const)(
    'places the Warden minibosses only in the final pack of %s',
    (roomId, wardenCount, sentinelCount, finalSentinelCount, finalStartZ) => {
      const spawns = DUNGEONS[roomId].spawns;
      const wardens = spawns.filter((spawn) => spawn.mobId === IGNIVAR_CRUCIBLE_WARDEN_ID);
      const sentinels = spawns.filter((spawn) => spawn.mobId === IGNIVAR_EMBER_SENTINEL_ID);
      const finalSentinels = sentinels.filter((spawn) => spawn.z >= finalStartZ);
      const promoted = spawns.filter((spawn) => spawn.miniboss !== undefined);

      expect(wardens).toHaveLength(wardenCount);
      expect(wardens.every((spawn) => spawn.z >= finalStartZ)).toBe(true);
      expect(wardens.every((spawn) => spawn.miniboss !== undefined)).toBe(true);
      expect(promoted).toHaveLength(wardenCount);
      expect(promoted.every((spawn) => spawn.mobId === IGNIVAR_CRUCIBLE_WARDEN_ID)).toBe(true);
      expect(sentinels).toHaveLength(sentinelCount);
      expect(finalSentinels).toHaveLength(finalSentinelCount);
      expect(
        spawns
          .filter((spawn) => spawn.z < finalStartZ)
          .every((spawn) => spawn.mobId === IGNIVAR_EMBER_SENTINEL_ID),
      ).toBe(true);
    },
  );

  it.each([
    [IGNIVAR_FORGE_APPROACH_ID, [2, 2, 2, 2, 2, 3]],
    [IGNIVAR_MOLTEN_ASSEMBLY_ID, [2, 2, 2, 2, 2, 4]],
  ] as const)(
    'pulls the expanded %s roster as six authoritative packs through normal proximity aggro',
    (roomId, expectedSizes) => {
      const spawns = DUNGEONS[roomId].spawns;
      const packIds = [...new Set(spawns.map((spawn) => spawn.packId))];
      expect(packIds).toHaveLength(6);
      expect(packIds).not.toContain(undefined);
      expect(
        packIds
          .map((packId) => spawns.filter((spawn) => spawn.packId === packId).length)
          .sort((a, b) => a - b),
      ).toEqual([...expectedSizes]);

      for (const packId of packIds) {
        const { sim, mobs } = claimedRoom(roomId);
        const packIndexes = spawns
          .map((spawn, index) => (spawn.packId === packId ? index : -1))
          .filter((index) => index >= 0);
        const trigger = mobs[packIndexes[0]];
        // A level-one fixture would be killed by a real raid pack before the
        // post-tick assertion, which would correctly reset late-updating mobs.
        // Keep it alive so this test observes the pack contract, not tuning.
        sim.player.maxHp = 1_000_000_000;
        sim.player.hp = sim.player.maxHp;
        sim.player.pos = sim.ctx.groundPos(trigger.pos.x, trigger.pos.z - 3);
        sim.player.prevPos = { ...sim.player.pos };
        sim.rebucket(sim.player);

        sim.tick();

        for (let index = 0; index < mobs.length; index++) {
          const member = packIndexes.includes(index);
          const mob = mobs[index];
          expect(mob.inCombat, `${roomId}:${String(packId)} spawn ${index}`).toBe(member);
          if (member) {
            expect(['chase', 'attack']).toContain(mob.aiState);
            expect(mob.aggroTargetId).toBe(sim.player.id);
            expect(mob.threat.get(sim.player.id)).toBeGreaterThan(0);
          } else {
            expect(mob.aiState).toBe('idle');
            expect(mob.aggroTargetId).toBeNull();
            expect(mob.threat.size).toBe(0);
          }
        }
      }
    },
  );

  it('isolates identical authored pack labels across rooms and simultaneous raid claims', () => {
    const sim = new Sim({ seed: 8124, playerClass: 'warrior', devCommands: true });
    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, sim.player.id, true)).toBe(true);
    const primaryClaim = sim.instances.find(
      (instance) => instance.dungeonId === IGNIVAR_FORGE_APPROACH_ID && instance.partyKey !== null,
    );
    if (!primaryClaim) throw new Error('Primary Approach claim missing');

    const siblingPid = sim.addPlayer('warrior', 'Sibling Claim');
    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, siblingPid, true)).toBe(true);
    const siblingClaim = sim.instances.find(
      (instance) =>
        instance.dungeonId === IGNIVAR_FORGE_APPROACH_ID &&
        instance.partyKey !== null &&
        instance !== primaryClaim,
    );
    if (!siblingClaim) throw new Error('Sibling Approach claim missing');

    const assemblyPid = sim.addPlayer('warrior', 'Assembly Claim');
    expect(enterDungeon(sim.ctx, IGNIVAR_MOLTEN_ASSEMBLY_ID, assemblyPid, true)).toBe(true);
    const assemblyClaim = sim.instances.find(
      (instance) => instance.dungeonId === IGNIVAR_MOLTEN_ASSEMBLY_ID && instance.partyKey !== null,
    );
    if (!assemblyClaim) throw new Error('Assembly isolation claim missing');

    const mobsIn = (ids: readonly number[]): Entity[] =>
      ids.map((id) => sim.entities.get(id)).filter((mob): mob is Entity => mob !== undefined);
    const primaryMobs = mobsIn(primaryClaim.mobIds);
    const primaryPack = primaryMobs.filter((mob) => mob.dungeonPackId?.endsWith(':west_lower'));
    if (primaryPack.length === 0) throw new Error('Primary west-lower pack missing');
    expect(siblingClaim.slot).not.toBe(primaryClaim.slot);
    expect(assemblyClaim.slot).toBe(primaryClaim.slot);
    sim.player.maxHp = 1_000_000_000;
    sim.player.hp = sim.player.maxHp;
    sim.player.pos = sim.ctx.groundPos(primaryPack[0].pos.x, primaryPack[0].pos.z - 3);
    sim.player.prevPos = { ...sim.player.pos };
    sim.rebucket(sim.player);

    sim.tick();

    for (const mob of primaryPack) {
      expect(mob.inCombat).toBe(true);
      expect(['chase', 'attack']).toContain(mob.aiState);
      expect(mob.aggroTargetId).toBe(sim.player.id);
      expect(mob.threat.get(sim.player.id)).toBeGreaterThan(0);
    }
    const outsiders = [
      ...primaryMobs.filter((mob) => !primaryPack.includes(mob)),
      ...mobsIn(siblingClaim.mobIds),
      ...mobsIn(assemblyClaim.mobIds),
    ];
    for (const mob of outsiders) {
      expect(mob.inCombat).toBe(false);
      expect(mob.aiState).toBe('idle');
      expect(mob.aggroTargetId).toBeNull();
      expect(mob.threat.size).toBe(0);
    }
  });

  it.each([IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_MOLTEN_ASSEMBLY_ID])(
    'keeps %s claim RNG draw order stable across difficulty and same-seed replay',
    (roomId) => {
      const claimDraws = (difficulty: 'normal' | 'heroic'): number[] => {
        const sim = new Sim({ seed: 8124, playerClass: 'warrior', devCommands: true });
        sim.setDungeonDifficulty(difficulty);
        const draws: number[] = [];
        sim.rng.setObserver((value) => draws.push(value));
        try {
          expect(enterDungeon(sim.ctx, roomId, sim.player.id, true)).toBe(true);
        } finally {
          sim.rng.setObserver(null);
        }
        return draws;
      };

      const normal = claimDraws('normal');
      expect(normal).toHaveLength(DUNGEONS[roomId].spawns.length);
      expect(claimDraws('normal')).toEqual(normal);
      expect(claimDraws('heroic')).toEqual(normal);
    },
  );

  it.each([IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_MOLTEN_ASSEMBLY_ID])(
    'drives the Sentinel Cinder Lance through normal ticks in %s and resolves at its warning',
    (roomId) => {
      const { sim, mobs } = claimedRoom(roomId);
      const sentinel = mobs.find((mob) => mob.templateId === IGNIVAR_EMBER_SENTINEL_ID);
      if (!sentinel) throw new Error('Ember Sentinel missing');
      for (const mob of mobs) {
        if (mob !== sentinel) mob.dead = true;
      }
      engage(sentinel, sim.player);
      sentinel.swingTimer = 999;
      const warningPoint = sim.ctx.groundPos(sentinel.pos.x + 6, sentinel.pos.z);
      sim.player.pos = { ...warningPoint };
      sim.player.prevPos = { ...warningPoint };
      const bystanderId = sim.addPlayer('priest', 'Warning Bystander');
      const bystander = sim.entities.get(sim.players.get(bystanderId)?.entityId ?? -1);
      if (!bystander) throw new Error('Warning bystander missing');
      bystander.pos = { ...warningPoint };
      bystander.prevPos = { ...warningPoint };
      sentinel.ignivarTrashSpellTimer = DT;
      const targetHealthBefore = sim.player.hp;
      const bystanderHealthBefore = bystander.hp;

      const startEvents = sim.tick();
      expect(sentinel.castingAbility).toBe(IGNIVAR_CINDER_LANCE_CAST_ID);
      expect(sentinel.castTargetId).toBe(sim.player.id);
      expect(sentinel.castAim).toEqual(warningPoint);
      const warning = sim.activeIgnivarMeteors.find((candidate) =>
        candidate.id.startsWith(`ignivar-trash:${sentinel.id}:`),
      );
      expect(warning).toMatchObject({
        x: warningPoint.x,
        z: warningPoint.z,
        radius: IGNIVAR_CINDER_LANCE_RADIUS,
        duration: IGNIVAR_CINDER_LANCE_CAST_SECONDS,
      });
      expect(startEvents).toContainEqual(
        expect.objectContaining({
          type: 'spellfxAt',
          ability: IGNIVAR_CINDER_LANCE_CAST_ID,
          x: warningPoint.x,
          z: warningPoint.z,
          radius: IGNIVAR_CINDER_LANCE_RADIUS,
          persistentId: warning?.id,
        }),
      );
      expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[IGNIVAR_CINDER_LANCE_CAST_ID]).toEqual({
        school: 'fire',
      });
      expect(abilityVfxSpecFor(IGNIVAR_CINDER_LANCE_CAST_ID)).toMatchObject({ p: 'fire' });

      sim.player.pos = sim.ctx.groundPos(
        warningPoint.x + IGNIVAR_CINDER_LANCE_RADIUS + 2,
        warningPoint.z,
      );
      sim.player.prevPos = { ...sim.player.pos };
      for (let tick = 0; tick < Math.ceil(IGNIVAR_CINDER_LANCE_CAST_SECONDS / DT); tick++) {
        sim.tick();
      }

      expect(sentinel.castingAbility).toBeNull();
      expect(
        sim.activeIgnivarMeteors.some((candidate) =>
          candidate.id.startsWith(`ignivar-trash:${sentinel.id}:`),
        ),
      ).toBe(false);
      expect(sim.player.hp).toBe(targetHealthBefore);
      expect(bystanderHealthBefore - bystander.hp).toBe(
        Math.ceil(
          bystander.maxHp * IGNIVAR_CINDER_LANCE_DAMAGE_MAX_HP * (sentinel.mechanicDamageMult ?? 1),
        ),
      );
    },
  );

  it.each([IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_MOLTEN_ASSEMBLY_ID])(
    'makes the Warden instantly stomp nearby players without ever starting a cast in %s',
    (roomId) => {
      const { sim, mobs } = claimedRoom(roomId);
      const warden = mobs.find((mob) => mob.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID);
      if (!warden) throw new Error('Trash Warden missing');
      for (const mob of mobs) {
        if (mob !== warden) mob.dead = true;
      }
      engage(warden, sim.player);
      warden.swingTimer = 999;
      warden.moveSpeed = 0;
      sim.player.pos = sim.ctx.groundPos(warden.pos.x + 12, warden.pos.z);
      sim.player.prevPos = { ...sim.player.pos };
      const edgePid = sim.addPlayer('mage', 'Edge Stomp');
      const edge = sim.entities.get(sim.players.get(edgePid)?.entityId ?? -1);
      const outsidePid = sim.addPlayer('priest', 'Outside Stomp');
      const outside = sim.entities.get(sim.players.get(outsidePid)?.entityId ?? -1);
      if (!edge || !outside) throw new Error('Stomp boundary players missing');
      edge.pos = sim.ctx.groundPos(warden.pos.x - 12, warden.pos.z);
      edge.prevPos = { ...edge.pos };
      outside.pos = sim.ctx.groundPos(warden.pos.x + 13, warden.pos.z);
      outside.prevPos = { ...outside.pos };
      warden.ignivarTrashSpellTimer = DT;

      const heldEvents = sim.tick();
      expect(
        heldEvents.some(
          (event) => 'ability' in event && event.ability === IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
        ),
      ).toBe(false);
      expect(warden.ignivarTrashSpellTimer).toBe(0);
      expect(warden.castingAbility).toBeNull();

      sim.player.pos = sim.ctx.groundPos(warden.pos.x + 2, warden.pos.z);
      sim.player.prevPos = { ...sim.player.pos };
      edge.pos = sim.ctx.groundPos(warden.pos.x - 9, warden.pos.z);
      edge.prevPos = { ...edge.pos };
      const healthBefore = sim.player.hp;
      const edgeHealthBefore = edge.hp;
      const outsideHealthBefore = outside.hp;

      const events = sim.tick();
      expect(warden.castingAbility).toBeNull();
      expect(warden.castTotal).toBe(0);
      expect(warden.castRemaining).toBe(0);
      expect(healthBefore - sim.player.hp).toBe(
        Math.ceil(sim.player.maxHp * 0.18 * (warden.mechanicDamageMult ?? 1)),
      );
      expect(edgeHealthBefore - edge.hp).toBe(
        Math.ceil(edge.maxHp * 0.18 * (warden.mechanicDamageMult ?? 1)),
      );
      expect(outside.hp).toBe(outsideHealthBefore);
      expect(warden.ignivarTrashSpellTimer).toBe(12);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'spellfx',
            sourceId: warden.id,
            fx: 'windup',
            ability: IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
          }),
          expect.objectContaining({
            type: 'spellfxAt',
            sourceId: warden.id,
            fx: 'nova',
            radius: 9,
            ability: IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
          }),
        ]),
      );
      expect(abilityVfxSpecFor(IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID)).toMatchObject({
        p: 'fire',
        a: 'burst',
      });

      // The reusable template still declares Crucible Quake for Varkhul's
      // ordinary adds. This placement-local driver must suppress that hardcast
      // even after its full twelve-second cadence would otherwise have elapsed.
      sim.player.devGod = true;
      warden.ignivarTrashSpellTimer = 999;
      for (let tick = 0; tick < Math.ceil(13 / DT); tick++) {
        sim.tick();
        expect(warden.castingAbility).toBeNull();
      }
    },
  );

  it('waits six seconds for the first Stomp and twelve full seconds between repeats', () => {
    expect(IGNIVAR_CRUCIBLE_STOMP_RADIUS).toBe(9);
    expect(IGNIVAR_CRUCIBLE_STOMP_DAMAGE_MAX_HP).toBe(0.18);
    expect(IGNIVAR_CRUCIBLE_STOMP_REPEAT_SECONDS).toBe(12);

    const { sim, mobs } = claimedRoom(IGNIVAR_FORGE_APPROACH_ID);
    const warden = mobs.find((mob) => mob.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID);
    if (!warden) throw new Error('Approach Stomp cadence Warden missing');
    for (const mob of mobs) {
      if (mob !== warden) mob.dead = true;
    }
    engage(warden, sim.player);
    warden.swingTimer = 999;
    warden.moveSpeed = 0;
    sim.player.pos = sim.ctx.groundPos(warden.pos.x + 2, warden.pos.z);
    sim.player.prevPos = { ...sim.player.pos };

    const stompFired = (events: ReturnType<Sim['tick']>) =>
      events.some(
        (event) => 'ability' in event && event.ability === IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
      );
    const firstCadenceTicks = Math.round(6 / DT);
    for (let tick = 1; tick < firstCadenceTicks; tick++) {
      expect(stompFired(sim.tick())).toBe(false);
    }
    expect(stompFired(sim.tick())).toBe(true);

    const repeatCadenceTicks = Math.round(12 / DT);
    for (let tick = 1; tick < repeatCadenceTicks; tick++) {
      expect(stompFired(sim.tick())).toBe(false);
    }
    expect(stompFired(sim.tick())).toBe(true);
    expect(warden.castingAbility).toBeNull();
  });

  it('cancels Cinder Lance through a real Pummel and retries instead of dealing damage', () => {
    const { sim, mobs } = claimedRoom(IGNIVAR_FORGE_APPROACH_ID);
    const sentinel = mobs.find((mob) => mob.templateId === IGNIVAR_EMBER_SENTINEL_ID);
    if (!sentinel) throw new Error('Ember Sentinel missing');
    for (const mob of mobs) {
      if (mob !== sentinel) mob.dead = true;
    }
    sim.setPlayerLevel(20);
    engage(sentinel, sim.player);
    sentinel.swingTimer = 999;
    sentinel.ignivarTrashSpellTimer = DT;
    const healthBefore = sim.player.hp;
    sim.tick();
    expect(sentinel.castingAbility).toBe(IGNIVAR_CINDER_LANCE_CAST_ID);

    const meta = sim.players.get(sim.playerId);
    const pummel = (
      sim as unknown as { resolvedAbility(id: string, pid: number): unknown }
    ).resolvedAbility('pummel', sim.playerId);
    if (!meta) throw new Error('Player metadata missing');
    (
      sim.ctx as unknown as {
        runEffects(p: Entity, meta: unknown, target: Entity, res: unknown): void;
      }
    ).runEffects(sim.player, meta, sentinel, pummel);

    expect(sentinel.castingAbility).toBeNull();
    expect(sentinel.auras.some((aura) => aura.kind === 'lockout' && aura.school === 'fire')).toBe(
      true,
    );
    sim.tick();
    expect(sentinel.ignivarTrashSpellTimer).toBeCloseTo(5);
    for (let tick = 0; tick < Math.ceil(IGNIVAR_CINDER_LANCE_CAST_SECONDS / DT); tick++) sim.tick();
    expect(sim.player.hp).toBe(healthBefore);
  });

  it.each([IGNIVAR_EMBER_SENTINEL_ID, IGNIVAR_CRUCIBLE_WARDEN_ID])(
    'does not enable the trash-only spell for %s in the Varkhul encounter',
    (templateId) => {
      const { sim } = claimedRoom(IGNIVAR_SECOND_WING_ID);
      const instance = sim.instances.find(
        (candidate) =>
          candidate.dungeonId === IGNIVAR_SECOND_WING_ID && candidate.partyKey !== null,
      );
      if (!instance) throw new Error('Inner Crucible missing');
      const template = MOBS[templateId];
      const automaton = createMob(
        sim.nextId++,
        template,
        template.maxLevel,
        sim.ctx.groundPos(sim.player.pos.x + 4, sim.player.pos.z),
      );
      sim.ctx.addEntity(automaton);
      instance.mobIds.push(automaton.id);
      engage(automaton, sim.player);
      automaton.ignivarTrashSpellTimer = DT;

      expect(updateIgnivarTrashAutomaton(sim.ctx, automaton)).toBe(false);
      expect(automaton.castingAbility).toBeNull();
    },
  );
});
