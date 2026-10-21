import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { WORLD_QUESTS, WORLD_QUESTS_BY_ID } from '../src/sim/content/world_quests';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import type { Entity } from '../src/sim/types';
import { inGardenMaze } from '../src/sim/world';
import {
  WORLD_QUEST_CHAMPION_TUNING as TUNING,
  worldQuestChampionSite,
  worldQuestChampionState,
  worldQuestOffersChampion,
} from '../src/sim/world_quest_champion';
import { WORLD_SEED } from '../src/sim/world_seed';

const QUEST_ID = 'wq_evergarden_watch';

function armed(): Sim {
  const sim = new Sim({ seed: 31, playerClass: 'warrior', devCommands: true });
  sim.chat('/dev wq evergarden');
  sim.tick();
  // Stand at the champion's site (inside the area) so the purse's credit
  // range reaches the champion when it falls.
  const site = worldQuestChampionSite(WORLD_QUESTS_BY_ID[QUEST_ID]);
  sim.player.pos = sim.groundPos(site.x, site.z);
  sim.player.prevPos = { ...sim.player.pos };
  sim.tick();
  return sim;
}

function killTargets(sim: Sim, count: number): void {
  const quest = WORLD_QUESTS_BY_ID[QUEST_ID];
  const objective = quest.objective;
  if (objective.type !== 'kill') throw new Error('expected a kill quest');
  const targets = [...sim.entities.values()].filter(
    (e) => e.kind === 'mob' && !e.dead && e.templateId === objective.targetMobId,
  );
  for (const mob of targets.slice(0, count)) {
    mob.pos = sim.groundPos(quest.area.x + 2, quest.area.z);
    sim.player.targetId = mob.id;
    sim.chat('/dev killtarget');
    sim.tick();
  }
}

function champion(sim: Sim): Entity | undefined {
  const state = worldQuestChampionState(sim.ctx, QUEST_ID);
  return state ? sim.entities.get(state.mobId) : undefined;
}

describe('the world quest champion encore', () => {
  it('offers an encore only to the plain objective families', () => {
    expect(worldQuestOffersChampion(WORLD_QUESTS_BY_ID[QUEST_ID])).toBe(true);
    expect(worldQuestOffersChampion(WORLD_QUESTS_BY_ID.wq_eastbrook_bandits)).toBe(true);
    expect(worldQuestOffersChampion(WORLD_QUESTS_BY_ID.wq_galecrest_wisps)).toBe(false);
    expect(worldQuestOffersChampion(WORLD_QUESTS_BY_ID.wq_eastbrook_shadow)).toBe(false);
  });

  it('rises at an open spot inside every offering quest area, never in the hedge maze', () => {
    for (const quest of WORLD_QUESTS) {
      if (!worldQuestOffersChampion(quest)) continue;
      const site = worldQuestChampionSite(quest);
      expect(TUNING.offsetYards).toBe(8);
      if (!quest.championAt) {
        expect(site, quest.id).toEqual({
          x: quest.area.x + TUNING.offsetYards,
          z: quest.area.z + TUNING.offsetYards,
        });
      }
      expect(
        Math.hypot(site.x - quest.area.x, site.z - quest.area.z),
        quest.id,
      ).toBeLessThanOrEqual(quest.area.radius);
      expect(inGardenMaze(site.x, site.z), quest.id).toBe(false);
      expect(isBlocked(WORLD_SEED, site.x, site.z, 1.5), quest.id).toBe(false);
    }
  });

  it('raises a promoted champion at completion and pays every participant when it falls', () => {
    const sim = armed();
    const meta = sim.meta(sim.playerId)!;
    const quest = WORLD_QUESTS_BY_ID[QUEST_ID];
    killTargets(sim, quest.count);
    expect(meta.worldQuestLog.get(QUEST_ID)?.state).toBe('completed');
    const mob = champion(sim);
    expect(mob).toBeDefined();
    if (!mob || quest.objective.type !== 'kill') throw new Error('champion fixture');
    expect(mob.templateId).toBe(quest.objective.targetMobId);
    expect(mob.level).toBeGreaterThanOrEqual(quest.minLevel + TUNING.levelAboveQuest);
    expect(mob.scale).toBe(TUNING.scale);
    expect(mob.summonedAdd).toBe(true);
    expect(mob.runScoped).toBe(true);
    const site = worldQuestChampionSite(quest);
    expect(Math.hypot(mob.pos.x - site.x, mob.pos.z - site.z)).toBeLessThan(1);
    expect(mob.hostile).toBe(true);
    // A second completion while it lives never stacks a second champion.
    const before = sim.entities.size;
    meta.worldQuestLog.get(QUEST_ID)!.state = 'active';
    meta.worldQuestLog.get(QUEST_ID)!.count = quest.count - 1;
    killTargets(sim, 1);
    expect(sim.entities.size).toBe(before);
    // Two participants (the player and a pretend second player's pet owner) both get paid.
    const copperBefore = meta.copper;
    addThreat(mob, sim.playerId, 10);
    sim.player.targetId = mob.id;
    sim.chat('/dev killtarget');
    sim.tick();
    sim.tick();
    expect(meta.copper - copperBefore).toBe(
      Math.round(TUNING.purse.base + TUNING.purse.perLevel * sim.player.level),
    );
    expect(worldQuestChampionState(sim.ctx, QUEST_ID)?.paid).toBe(true);
    // Paid once: more ticks never pay again.
    sim.tick();
    expect(meta.copper - copperBefore).toBe(
      Math.round(TUNING.purse.base + TUNING.purse.perLevel * sim.player.level),
    );
  });

  it('banners the completer anywhere in the ring and bystanders near the site only', () => {
    const sim = armed();
    const quest = WORLD_QUESTS_BY_ID[QUEST_ID];
    const site = worldQuestChampionSite(quest);
    // The completer finishes at the far side of the wide ring, beyond alert
    // range of the site; one bystander waits by the site, one far off it.
    const far = sim.groundPos(quest.area.x - 40, quest.area.z - 40);
    expect(Math.hypot(far.x - site.x, far.z - site.z)).toBeGreaterThan(TUNING.alertYards);
    sim.player.pos = far;
    sim.player.prevPos = { ...far };
    const near = sim.addPlayer('warrior', 'Nearby');
    const away = sim.addPlayer('warrior', 'Faraway');
    sim.entities.get(near)!.pos = sim.groundPos(site.x + 10, site.z);
    sim.entities.get(away)!.pos = sim.groundPos(far.x, far.z - 20);
    sim.tick();
    const seen: number[] = [];
    const objective = quest.objective;
    if (objective.type !== 'kill') throw new Error('expected a kill quest');
    const targets = [...sim.entities.values()].filter(
      (e) => e.kind === 'mob' && !e.dead && e.templateId === objective.targetMobId,
    );
    for (const mob of targets.slice(0, quest.count)) {
      mob.pos = sim.groundPos(far.x + 2, far.z);
      sim.player.targetId = mob.id;
      sim.chat('/dev killtarget');
      for (const ev of sim.tick()) {
        if (ev.type === 'worldQuestBanner' && ev.banner === 'championRises')
          seen.push(ev.pid ?? -1);
      }
    }
    expect(champion(sim)).toBeDefined();
    expect(seen.sort((a, b) => a - b)).toEqual([sim.playerId, near].sort((a, b) => a - b));
  });

  it('pays no purse to a participant beyond credit range of the fallen champion', () => {
    const sim = armed();
    const meta = sim.meta(sim.playerId)!;
    killTargets(sim, WORLD_QUESTS_BY_ID[QUEST_ID].count);
    const mob = champion(sim)!;
    expect(mob).toBeDefined();
    addThreat(mob, sim.playerId, 10);
    sim.player.targetId = mob.id;
    sim.player.pos = sim.groundPos(mob.pos.x + TUNING.creditYards + 1, mob.pos.z);
    sim.player.prevPos = { ...sim.player.pos };
    const copperBefore = meta.copper;
    sim.chat('/dev killtarget');
    sim.tick();
    sim.tick();
    expect(mob.dead).toBe(true);
    expect(worldQuestChampionState(sim.ctx, QUEST_ID)?.paid).toBe(true);
    expect(meta.copper).toBe(copperBefore);
  });

  it('fades an unclaimed champion after its lifetime', () => {
    const sim = armed();
    const quest = WORLD_QUESTS_BY_ID[QUEST_ID];
    killTargets(sim, quest.count);
    const mob = champion(sim)!;
    expect(mob).toBeDefined();
    const state = worldQuestChampionState(sim.ctx, QUEST_ID)!;
    // Everyone has left the site when the lifetime runs out.
    sim.player.pos = sim.groundPos(quest.area.x + 400, quest.area.z + 400);
    sim.player.prevPos = { ...sim.player.pos };
    state.expiresAt = sim.time - 1;
    sim.tick();
    expect(sim.entities.has(mob.id)).toBe(false);
    expect(worldQuestChampionState(sim.ctx, QUEST_ID)).toBeUndefined();
  });
});
