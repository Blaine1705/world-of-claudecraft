import { describe, expect, it } from 'vitest';
import { dealDamage } from '../src/sim/combat/damage';
import { COMBAT_QUEST_SITES } from '../src/sim/content/world_quest_combat';
import { BUILTIN_WORLD, NPCS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity, WorldQuestCombatId } from '../src/sim/types';
import { onCombatQuestKill, updateCombatQuestSapper } from '../src/sim/world_quest_combat';
import { savedWorldQuestState } from '../src/sim/world_quest_state';
import { updateWorldQuests } from '../src/sim/world_quests';
import { WORLD_SEED } from '../src/sim/world_seed';

function context(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}
function setup(id: WorldQuestCombatId, inCombat = false) {
  const site = COMBAT_QUEST_SITES.find((s) => s.encounterId === id)!;
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    devCommands: true,
    world: {
      ...BUILTIN_WORLD,
      camps: [],
      groundObjects: [],
      npcs: Object.fromEntries(COMBAT_QUEST_SITES.map((s) => [s.npcId, NPCS[s.npcId]])),
    },
  });
  sim.resetDay = '2026-09-08';
  sim.chat(`/dev wqcombat ${id}`);
  const meta = sim.meta(sim.playerId)!;
  sim.player.inCombat = inCombat;
  sim.startWorldQuest(site.npcEntityId);
  expect(meta.combatWorldQuestRuns.has(site.questId)).toBe(true);
  return { sim, meta, site, run: meta.combatWorldQuestRuns.get(site.questId)! };
}
function update(sim: Sim, seconds = 0.05) {
  (sim as unknown as { time: number }).time += seconds;
  updateWorldQuests(context(sim), sim.meta(sim.playerId)!, sim.player);
}
function kill(sim: Sim, id: number) {
  const mob = sim.entities.get(id)!;
  dealDamage(context(sim), sim.player, mob, 999999, false, 'physical', 'Test Strike', 'hit');
}

describe('combat world quest encounters', () => {
  it('shares one warband encounter when a second player starts the same world quest', () => {
    const { sim, meta, site, run } = setup('warband');
    const ownerCopper = meta.copper;
    const ownerCompletions = meta.counters.questsCompleted;
    const secondPid = sim.addPlayer('mage', 'Second');
    const second = sim.entities.get(secondPid)!;
    const secondMeta = sim.meta(secondPid)!;
    secondMeta.devWorldQuestCycle = meta.devWorldQuestCycle;
    sim.setPlayerLevel(site.minLevel, secondPid);
    second.pos = sim.groundPos(site.start.x + 2, site.start.z);
    second.prevPos = { ...second.pos };
    updateWorldQuests(context(sim), secondMeta, second);
    const secondCopper = secondMeta.copper;
    const secondCompletions = secondMeta.counters.questsCompleted;

    sim.startWorldQuest(site.npcEntityId, secondPid);

    expect(secondMeta.combatWorldQuestRuns.get(site.questId)).toBe(run);
    expect(
      [...sim.entities.values()].filter((entity) => entity.worldQuestCombatOwnerId !== undefined),
    ).toHaveLength(4);
    const leader = run.members.find((member) => member.role === 'leader')!;
    sim.player.dead = true;
    dealDamage(
      context(sim),
      second,
      sim.entities.get(leader.id)!,
      999999,
      false,
      'physical',
      'Test Strike',
      'hit',
    );
    expect(leader.defeated).toBe(true);
    sim.player.dead = false;

    for (const member of run.members.filter((candidate) => !candidate.defeated)) {
      dealDamage(
        context(sim),
        second,
        sim.entities.get(member.id)!,
        999999,
        false,
        'physical',
        'Test Strike',
        'hit',
      );
    }
    updateWorldQuests(context(sim), meta, sim.player);
    const boss = run.members.find((member) => member.role === 'boss')!;
    dealDamage(
      context(sim),
      second,
      sim.entities.get(boss.id)!,
      999999,
      false,
      'physical',
      'Test Strike',
      'hit',
    );
    updateWorldQuests(context(sim), meta, sim.player);
    updateWorldQuests(context(sim), secondMeta, second);
    expect(meta.worldQuestLog.get(site.questId)?.state).toBe('completed');
    expect(secondMeta.worldQuestLog.get(site.questId)?.state).toBe('completed');
    const reward = 2500 + sim.player.level * 175;
    expect(meta.copper).toBe(ownerCopper + reward);
    expect(secondMeta.copper).toBe(secondCopper + reward);
    expect(meta.deedsEarned.has(site.deedId)).toBe(true);
    expect(secondMeta.deedsEarned.has(site.deedId)).toBe(true);
    expect(meta.counters.questsCompleted).toBe(ownerCompletions + 1);
    expect(secondMeta.counters.questsCompleted).toBe(secondCompletions + 1);
    updateWorldQuests(context(sim), meta, sim.player);
    updateWorldQuests(context(sim), secondMeta, second);
    expect(meta.copper).toBe(ownerCopper + reward);
    expect(secondMeta.copper).toBe(secondCopper + reward);
  });

  it('keeps a shared warband alive when its original owner disconnects', () => {
    const { sim, meta, site, run } = setup('warband');
    const secondPid = sim.addPlayer('mage', 'Second');
    const second = sim.entities.get(secondPid)!;
    const secondMeta = sim.meta(secondPid)!;
    secondMeta.devWorldQuestCycle = meta.devWorldQuestCycle;
    sim.setPlayerLevel(site.minLevel, secondPid);
    second.pos = sim.groundPos(site.start.x + 2, site.start.z);
    second.prevPos = { ...second.pos };
    updateWorldQuests(context(sim), secondMeta, second);
    sim.startWorldQuest(site.npcEntityId, secondPid);
    const ids = run.members.map((member) => member.id);

    sim.removePlayer(sim.playerId);

    expect(sim.players.has(meta.entityId)).toBe(false);
    expect(secondMeta.combatWorldQuestRuns.get(site.questId)).toBe(run);
    expect(run.ownerId).toBe(secondPid);
    expect(ids.every((id) => sim.entities.get(id)?.worldQuestCombatOwnerId === secondPid)).toBe(
      true,
    );
  });

  it('transfers a shared warband through the real death update and lets the survivor finish', () => {
    const { sim, meta, site, run } = setup('warband');
    const secondPid = sim.addPlayer('mage', 'Second');
    const second = sim.entities.get(secondPid)!;
    const secondMeta = sim.meta(secondPid)!;
    secondMeta.devWorldQuestCycle = meta.devWorldQuestCycle;
    sim.setPlayerLevel(site.minLevel, secondPid);
    second.pos = sim.groundPos(site.start.x + 2, site.start.z);
    second.prevPos = { ...second.pos };
    updateWorldQuests(context(sim), secondMeta, second);
    sim.startWorldQuest(site.npcEntityId, secondPid);
    const ids = run.members.map((member) => member.id);

    sim.player.dead = true;
    updateWorldQuests(context(sim), meta, sim.player);

    expect(meta.combatWorldQuestRuns.has(site.questId)).toBe(false);
    expect(meta.worldQuestLog.get(site.questId)?.combat?.phase).toBe('failed');
    expect(secondMeta.combatWorldQuestRuns.get(site.questId)).toBe(run);
    expect(run.ownerId).toBe(secondPid);
    expect(ids.every((id) => sim.entities.get(id)?.worldQuestCombatOwnerId === secondPid)).toBe(
      true,
    );

    for (const member of run.members.filter((candidate) => candidate.role === 'leader')) {
      dealDamage(
        context(sim),
        second,
        sim.entities.get(member.id)!,
        999999,
        false,
        'physical',
        'Test Strike',
        'hit',
      );
    }
    updateWorldQuests(context(sim), secondMeta, second);
    const boss = run.members.find((member) => member.role === 'boss')!;
    dealDamage(
      context(sim),
      second,
      sim.entities.get(boss.id)!,
      999999,
      false,
      'physical',
      'Test Strike',
      'hit',
    );
    updateWorldQuests(context(sim), secondMeta, second);
    expect(secondMeta.worldQuestLog.get(site.questId)?.state).toBe('completed');
  });

  it.each(['beast_hunt', 'break_command'])('rejects the deleted /dev wqcombat %s command', (id) => {
    const { sim } = setup('warband');
    sim.drainEvents();
    sim.chat(`/dev wqcombat ${id}`);
    expect(
      sim
        .drainEvents()
        .some((event) => event.type === 'error' && event.text.startsWith('Dev commands:')),
    ).toBe(true);
  });
  it('waits for the ogre assault and recovery before releasing defense sappers', () => {
    const { sim, run } = setup('hold_highwatch');
    update(sim, 4);
    expect(run.members.filter((m) => m.role === 'sapper')).toHaveLength(0);
    for (const member of run.members) kill(sim, member.id);
    update(sim);
    update(sim, 6);
    expect(run.members.filter((m) => m.role === 'sapper')).toHaveLength(0);
    update(sim, 1);
    const sappers = run.members.filter((m) => m.role === 'sapper');
    expect(sappers).toHaveLength(2);
    expect(sappers.every((m) => sim.entities.get(m.id)!.moveSpeed === 3.5)).toBe(true);
    expect(run.wave).toBe(1);
  });
  it('allows starting normal combat objectives while nearby wildlife has the player in combat', () => {
    const { sim, meta, site } = setup('warband', true);
    expect(sim.player.inCombat).toBe(true);
    expect(meta.combatWorldQuestRuns.get(site.questId)?.members).toHaveLength(4);
  });
  it('publishes the actionable role of every warband target', () => {
    const { sim, run } = setup('warband');
    for (const member of run.members) {
      expect(sim.entities.get(member.id)?.worldQuestCombatRole).toBe(member.role);
    }
  });
  it('moves sappers through real ticks to the defense post without teleporting them', () => {
    const { sim, run } = setup('hold_highwatch');
    sim.player.maxHp = sim.player.hp = 100000;
    update(sim, 4);
    for (const member of run.members) kill(sim, member.id);
    for (let i = 0; i < 30 * 20; i++) sim.tick();
    expect(run.integrity).toBe(50);
    expect(run.members.filter((m) => m.role === 'sapper' && m.defeated)).toHaveLength(2);
  });
  it('requires all three lieutenants in any order, then pays once for the exact final boss', () => {
    const { sim, meta, site, run } = setup('warband');
    const before = meta.copper;
    const xp = meta.xp;
    const leaders = run.members.filter((m) => m.role === 'leader');
    for (const member of [leaders[2], leaders[0]]) {
      kill(sim, member.id);
      update(sim);
    }
    expect(run.members.some((m) => m.role === 'boss')).toBe(false);
    expect(meta.copper).toBe(before);
    expect(meta.xp).toBe(xp);
    kill(sim, leaders[1].id);
    update(sim);
    const boss = run.members.find((m) => m.role === 'boss')!;
    expect(boss).toBeDefined();
    kill(sim, boss.id);
    update(sim);
    expect(meta.worldQuestLog.get(site.questId)?.state).toBe('completed');
    expect(meta.copper).toBe(before + 2500 + sim.player.level * 175);
    expect(meta.deedsEarned.has(site.deedId)).toBe(true);
    expect(meta.combatWorldQuestRuns.size).toBe(0);
    expect([...sim.entities.values()].some((e) => e.worldQuestCombatOwnerId === sim.playerId)).toBe(
      false,
    );
    const paid = meta.copper;
    sim.player.inCombat = false;
    sim.startWorldQuest(site.npcEntityId);
    update(sim);
    expect(meta.copper).toBe(paid);
    expect(meta.combatWorldQuestRuns.size).toBe(0);
  });

  it.each([0, 1])(
    'lets captain %s die first while living priest support heals only its own force',
    (firstGroup) => {
      const { sim, run } = setup('restless_company');
      sim.player.hp = sim.player.maxHp = 100000;
      update(sim, 4);
      for (const member of run.members) kill(sim, member.id);
      update(sim);
      update(sim, 8);
      const captains = run.members.filter((m) => m.role === 'captain');
      const priest = sim.entities.get(captains[0].id)!;
      const warrior = sim.entities.get(captains[1].id)!;
      warrior.pos = { ...priest.pos };
      warrior.hp -= 200;
      priest.mendTimer = 0;
      context(sim).grid.update(warrior);
      const woundedHp = warrior.hp;
      sim.tick();
      expect(warrior.hp).toBeGreaterThan(woundedHp);
      kill(sim, captains[firstGroup].id);
      update(sim);
      expect(run.wave).toBe(2);
      expect(run.members.some((m) => m.role === 'boss')).toBe(false);
      for (const member of run.members.filter((m) => !m.defeated)) kill(sim, member.id);
      update(sim);
      update(sim, 8);
      expect(run.wave).toBe(3);
    },
  );

  it.each(['restless_company', 'hold_highwatch'] as const)(
    'clears all three %s waves before the final boss',
    (id) => {
      const { sim, meta, site, run } = setup(id);
      for (let wave = 1; wave <= 3; wave++) {
        update(sim, 8);
        expect(run.wave).toBe(wave);
        const current = run.members.filter((m) => !m.defeated);
        if (id === 'restless_company' && wave === 2)
          expect(current.filter((m) => m.role === 'captain')).toHaveLength(2);
        for (const member of current.reverse()) kill(sim, member.id);
        update(sim);
        if (id === 'hold_highwatch') {
          update(sim, 8);
          expect(run.wave).toBe(wave);
          const sappers = run.members.filter((m) => !m.defeated);
          expect(sappers.map((m) => m.role)).toEqual(['sapper', 'sapper']);
          for (const member of sappers) kill(sim, member.id);
          update(sim);
        }
        if (wave < 3) expect(run.members.some((m) => m.role === 'boss')).toBe(false);
      }
      const boss = run.members.find((m) => m.role === 'boss')!;
      expect(boss).toBeDefined();
      kill(sim, boss.id);
      update(sim);
      expect(meta.worldQuestLog.get(site.questId)?.state).toBe('completed');
    },
  );

  it('sappers respect roots and destroy the defenses if four reach the post', () => {
    const { sim, meta, site, run } = setup('hold_highwatch');
    update(sim, 4);
    for (const member of run.members) kill(sim, member.id);
    update(sim);
    update(sim, 8);
    const sapper = sim.entities.get(run.members.find((m) => m.role === 'sapper')!.id)!;
    const pos = { ...sapper.pos };
    sapper.auras.push({
      id: 'test_root',
      name: 'Root',
      kind: 'root',
      value: 1,
      remaining: 5,
      duration: 5,
      sourceId: sim.playerId,
      school: 'nature',
    });
    updateCombatQuestSapper(context(sim), sapper);
    expect(sapper.pos).toEqual(pos);
    sapper.auras = [];
    for (let wave = 0; wave < 2; wave++) {
      for (const member of run.members.filter((m) => !m.defeated)) {
        if (member.role === 'sapper') {
          const mob = sim.entities.get(member.id)!;
          mob.pos = sim.groundPos(site.start.x, site.start.z);
          updateCombatQuestSapper(context(sim), mob);
        } else kill(sim, member.id);
      }
      update(sim);
      if (wave === 0) {
        update(sim, 8);
        for (const member of run.members.filter((m) => !m.defeated)) kill(sim, member.id);
        update(sim);
        update(sim, 8);
      }
    }
    expect(meta.worldQuestLog.get(site.questId)?.combat?.phase).toBe('failed');
    expect(meta.worldQuestLog.get(site.questId)?.state).toBe('active');
    expect(meta.combatWorldQuestRuns.size).toBe(0);
  });

  it.each(['death', 'leave', 'rotation', 'disconnect', 'evade'] as const)(
    'cleans every summoned enemy after %s',
    (reason) => {
      const { sim, meta, site, run } = setup('warband');
      const ids = run.members.map((m) => m.id);
      if (reason === 'disconnect') sim.removePlayer(sim.playerId);
      else {
        if (reason === 'death') sim.player.dead = true;
        if (reason === 'leave') sim.player.pos = sim.groundPos(0, 0);
        if (reason === 'rotation') meta.devWorldQuestCycle = 'wq3_0';
        if (reason === 'evade') sim.entities.get(ids[0])!.aiState = 'evade';
        update(sim);
      }
      expect(ids.every((id) => !sim.entities.has(id))).toBe(true);
      expect(meta.combatWorldQuestRuns.has(site.questId)).toBe(false);
    },
  );

  it('never persists session entity ids or readout, and rejects non-member credit', () => {
    const { sim, meta, site, run } = setup('warband');
    const other = sim.addPlayer('mage', 'Other');
    const mob = {
      ...sim.entities.get(run.members[0].id)!,
      id: -1,
      dead: true,
    } as Entity;
    onCombatQuestKill(context(sim), mob, sim.meta(other)!);
    expect(run.members[0].defeated).toBe(false);
    const saved = savedWorldQuestState(meta);
    expect(JSON.stringify(saved)).not.toContain('members');
    expect(JSON.stringify(saved)).not.toContain('combat');
    expect(meta.worldQuestLog.get(site.questId)?.count).toBe(0);
  });
});
