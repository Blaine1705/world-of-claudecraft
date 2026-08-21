import { describe, expect, it } from 'vitest';
import { updateVarkhulEncounter, VARKHUL_FORGE_LOCAL_POS } from '../src/sim/encounters/varkhul';
import { IGNIVAR_SECOND_WING_ID, VARKHUL_BOSS_ID } from '../src/sim/ignivar_raid_ids';
import { Sim } from '../src/sim/sim';
import {
  varkhulAssemblyAnvilTarget,
  varkhulAssemblyAnvilTargetAngle,
  varkhulAssemblyHammerControlPoints,
  varkhulAssemblyLinkPadAtSlot,
} from '../src/sim/varkhul_assembly';
import { positionVarkhulLinkPracticeBots } from '../src/sim/varkhul_dev_raid';

function devSim(devCommands = true): Sim {
  const sim = new Sim({ seed: 6112, playerClass: 'warrior', autoEquip: true, devCommands });
  sim.setPlayerLevel(20);
  return sim;
}

function raidBots(sim: Sim) {
  return [...sim.players.values()]
    .filter((meta) => meta.isDevBot && /^IgnivarG[1-3]Bot[1-3]$/.test(meta.name))
    .sort((first, second) => first.entityId - second.entityId);
}

describe('/dev varkhulraid', () => {
  it('forms a ten-player raid and spreads nine anchored bots around the Inner Crucible', () => {
    const sim = devSim();
    sim.chat('/dev dungeon ignivar_inner_crucible normal');

    sim.chat('/dev varkhulraid normal');

    expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_SECOND_WING_ID);
    expect(
      sim.instances.find(
        (candidate) =>
          candidate.dungeonId === IGNIVAR_SECOND_WING_ID &&
          candidate.partyKey === sim.ctx.instanceKeyFor(sim.player.id),
      )?.difficulty,
    ).toBe('normal');
    const party = sim.partyOf(sim.player.id);
    expect(party).toMatchObject({ raid: true, leader: sim.player.id });
    expect(party?.members).toHaveLength(10);
    const bots = raidBots(sim);
    expect(bots).toHaveLength(9);
    const positions = bots.map((meta) => {
      const bot = sim.entities.get(meta.entityId);
      if (!bot) throw new Error(`Missing Varkhul practice bot ${meta.name}`);
      expect(meta.devAnchored).toBe(true);
      expect(bot.profilerInvulnerable).toBe(true);
      expect(bot.autoAttack).toBe(false);
      expect(sim.instanceInfoAt(bot.pos)?.dungeonId).toBe(IGNIVAR_SECOND_WING_ID);
      return `${bot.pos.x.toFixed(2)}:${bot.pos.z.toFixed(2)}`;
    });
    expect(new Set(positions).size).toBe(9);
    const xs = bots.map((meta) => sim.entities.get(meta.entityId)?.pos.x ?? 0);
    const zs = bots.map((meta) => sim.entities.get(meta.entityId)?.pos.z ?? 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(48);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThanOrEqual(46);
  });

  it('can create the practice raid directly on Heroic and reuses it on reset', () => {
    const sim = devSim();
    sim.chat('/dev varkhulraid heroic');
    const before = raidBots(sim).map((meta) => meta.entityId);
    const instance = sim.instances.find(
      (candidate) =>
        candidate.dungeonId === IGNIVAR_SECOND_WING_ID &&
        candidate.partyKey === sim.ctx.instanceKeyFor(sim.player.id),
    );
    expect(instance?.difficulty).toBe('heroic');

    const stagedPositions = before.map((botId, index) => {
      const bot = sim.entities.get(botId);
      if (!bot) throw new Error('Varkhul practice bot did not spawn');
      const staged = { ...bot.pos };
      bot.pos.x += 17 + index;
      bot.pos.z += 19 + index;
      return staged;
    });
    sim.chat('/dev varkhulraid');

    expect(raidBots(sim).map((meta) => meta.entityId)).toEqual(before);
    const resetPositions = before.map((botId, index) => {
      const bot = sim.entities.get(botId);
      if (!bot) throw new Error('Varkhul practice bot disappeared on reset');
      expect(bot.pos).toEqual(stagedPositions[index]);
      expect(sim.instanceInfoAt(bot.pos)?.dungeonId).toBe(IGNIVAR_SECOND_WING_ID);
      return `${bot.pos.x.toFixed(2)}:${bot.pos.z.toFixed(2)}`;
    });
    expect(new Set(resetPositions).size).toBe(9);
    expect(
      sim.instances.find(
        (candidate) =>
          candidate.dungeonId === IGNIVAR_SECOND_WING_ID &&
          candidate.partyKey === sim.ctx.instanceKeyFor(sim.player.id),
      )?.difficulty,
    ).toBe('heroic');
    for (const meta of raidBots(sim)) {
      const bot = sim.entities.get(meta.entityId);
      expect(meta.devAnchored).toBe(true);
      expect(bot).toMatchObject({
        dead: false,
        ghost: false,
        profilerInvulnerable: true,
        autoAttack: false,
      });
    }

    const firstBot = sim.entities.get(before[0]);
    if (!firstBot) throw new Error('Varkhul practice bot disappeared before death reset');
    firstBot.profilerInvulnerable = false;
    sim.ctx.handleDeath(firstBot, null);
    sim.releaseSpirit(firstBot.id);
    expect(firstBot).toMatchObject({ dead: true, ghost: true });
    expect(firstBot.corpseInstanceId).not.toBeNull();

    sim.chat('/dev varkhulraid normal');

    expect(raidBots(sim).map((meta) => meta.entityId)).toEqual(before);
    expect(firstBot).toMatchObject({
      dead: false,
      ghost: false,
      corpsePos: null,
      corpseInstanceId: null,
      profilerInvulnerable: true,
      autoAttack: false,
    });
    expect(
      sim.instances.find(
        (candidate) =>
          candidate.dungeonId === IGNIVAR_SECOND_WING_ID &&
          candidate.partyKey === sim.ctx.instanceKeyFor(sim.player.id),
      )?.difficulty,
    ).toBe('normal');
  });

  it('drives the missing control role immediately and brakes when the fire arm aligns', () => {
    const sim = devSim();
    sim.chat('/dev varkhulraid normal');
    const boss = [...sim.entities.values()].find((entity) => entity.templateId === VARKHUL_BOSS_ID);
    const bot = sim.entities.get(raidBots(sim)[0]?.entityId ?? -1);
    if (!boss || !bot) throw new Error('Varkhul practice room is incomplete');
    const state = {
      assemblyLinkAssignments: [
        { playerId: sim.player.id, symbol: 0, role: 'anvil' as const, locked: false },
        { playerId: bot.id, symbol: 0, role: 'hammer' as const, locked: false },
      ],
      assemblyLinkPadSlots: [0, 1, 2, 3, 4],
      assemblyLinkArmAngles: [varkhulAssemblyAnvilTargetAngle(0, 0) + Math.PI / 2, 0, 0, 0, 0],
      assemblyLinkRound: 0,
    };

    positionVarkhulLinkPracticeBots(sim.ctx, boss.pos, state);
    const pad = varkhulAssemblyLinkPadAtSlot(boss.pos, 0, 0);
    const counterclockwise = varkhulAssemblyHammerControlPoints(boss.pos, pad).counterclockwise;
    expect(bot.pos).toMatchObject(counterclockwise);

    state.assemblyLinkArmAngles[0] = varkhulAssemblyAnvilTargetAngle(0, 0);
    positionVarkhulLinkPracticeBots(sim.ctx, boss.pos, state);
    const brake = varkhulAssemblyHammerControlPoints(boss.pos, pad).brake;
    expect(bot.pos).toMatchObject(brake);

    const reversedState = {
      assemblyLinkAssignments: [
        { playerId: sim.player.id, symbol: 3, role: 'hammer' as const, locked: false },
        { playerId: bot.id, symbol: 3, role: 'anvil' as const, locked: false },
      ],
      assemblyLinkPadSlots: [0, 1, 2, 3, 4],
      assemblyLinkArmAngles: [0, 0, 0, varkhulAssemblyAnvilTargetAngle(3, 0), 0],
      assemblyLinkRound: 0,
    };
    const reversedPad = varkhulAssemblyLinkPadAtSlot(boss.pos, 3, 0);
    positionVarkhulLinkPracticeBots(sim.ctx, boss.pos, reversedState);
    expect(bot.pos).toMatchObject(varkhulAssemblyAnvilTarget(reversedPad, 3, 0));

    const instance = sim.instances.find((entry) => entry.dungeonId === IGNIVAR_SECOND_WING_ID);
    if (!instance) throw new Error('Inner Crucible instance disappeared');
    const origin = sim.ctx.instanceOriginOf(instance);
    boss.pos = sim.ctx.groundPos(
      origin.x + VARKHUL_FORGE_LOCAL_POS.x,
      origin.z + VARKHUL_FORGE_LOCAL_POS.z,
    );
    boss.prevPos = { ...boss.pos };
    const authoritativePad = varkhulAssemblyLinkPadAtSlot(boss.pos, 0, 0);
    sim.player.pos = sim.ctx.groundPos(authoritativePad.x, authoritativePad.z);
    bot.pos = { ...boss.pos };
    updateVarkhulEncounter(sim.ctx, boss);
    if (!boss.varkhul) throw new Error('Varkhul state did not initialize');
    boss.varkhul.makersBrandTimer = 999;
    boss.varkhul.frontalTimer = 999;
    boss.varkhul.cinderOrbsTimer = 999;
    boss.varkhul.forgestormTimer = 999;
    boss.varkhul.anvilTimer = 999;
    boss.varkhul.assemblyTriggered = true;
    boss.varkhul.assemblyPhase = 'links';
    boss.varkhul.assemblyRemaining = 45;
    boss.varkhul.assemblyWipeResolved = false;
    boss.varkhul.assemblyLinkAssignments = state.assemblyLinkAssignments;
    boss.varkhul.assemblyLinkPadSlots = state.assemblyLinkPadSlots;
    boss.varkhul.assemblyLinkPadProgress = [0, 0, 0, 0, 0];
    boss.varkhul.assemblyLinkArmAngles = [...state.assemblyLinkArmAngles];
    boss.varkhul.assemblyLinkHammerControls = ['off', 'off', 'off', 'off', 'off'];
    boss.varkhul.assemblyLinkAnvilReady = [false, false, false, false, false];
    boss.varkhul.assemblyLinkHammerReady = [false, false, false, false, false];
    boss.varkhul.assemblyLinkFireballTimer = 999;
    boss.varkhul.assemblyLinkRound = 0;
    boss.varkhul.assemblyLinkRounds = 1;
    boss.varkhul.assemblyLinkRemaining = 25;
    updateVarkhulEncounter(sim.ctx, boss);
    expect(bot.pos).toMatchObject(
      varkhulAssemblyHammerControlPoints(boss.pos, authoritativePad).brake,
    );
  });

  it('is inert when development commands are disabled', () => {
    const sim = devSim(false);
    const before = { ...sim.player.pos };
    const beforeDifficulty = sim.players.get(sim.player.id)?.dungeonDifficulty;
    const beforeInstances = sim.instances.map((instance) => ({
      dungeonId: instance.dungeonId,
      difficulty: instance.difficulty,
      partyKey: instance.partyKey,
    }));
    sim.chat('/dev varkhulraid');
    expect(sim.player.pos).toEqual(before);
    expect(sim.players.get(sim.player.id)?.dungeonDifficulty).toBe(beforeDifficulty);
    expect(sim.partyOf(sim.player.id)).toBeNull();
    expect(
      sim.instances.map((instance) => ({
        dungeonId: instance.dungeonId,
        difficulty: instance.difficulty,
        partyKey: instance.partyKey,
      })),
    ).toEqual(beforeInstances);
    expect(raidBots(sim)).toHaveLength(0);
  });
});
