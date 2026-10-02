// The Stormbrass Foundry's quest chain (src/sim/content/stormbrass_foundry_quests.ts):
// the Lift Warden at the lift station under a reserved id, the three dungeon
// quests open together at level 19 and credit through the real fight (the
// Hauler and Tock as kills, the Draft Record the Prime Draft leaves in its
// chest as an interact object), and the raid hand-off gated with the
// Crucible's own development flag.

import { describe, expect, it } from 'vitest';
import {
  LIFT_WARDEN_ENTITY_ID,
  LIFT_WARDEN_NPC_ID,
  LIFT_WARDEN_POS,
  STORMBRASS_FOUNDRY_QUEST_IDS as Q,
} from '../src/sim/content/stormbrass_foundry_quests';
import { DUNGEONS, QUESTS } from '../src/sim/data';
import {
  DRAFT_RECORD_ITEM,
  GANTRY_HAULER_ID,
  PRIME_DRAFT_ID,
  TOCK_ID,
} from '../src/sim/encounters/stormbrass_foundry';
import { IGNIVAR_FORGE_APPROACH_ID } from '../src/sim/ignivar_raid_ids';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { boss, engage, fight, put, run } from './helpers/foundry_fight';

/** Take a quest as the giver would hand it (the giver stands at the lift
 *  station, outside the foundry the tests fight in). */
function take(sim: Sim, pid: number, questId: string): void {
  questLogOf(sim, pid).set(questId, {
    questId,
    counts: QUESTS[questId].objectives.map(() => 0),
    state: 'active',
  });
}

function questLogOf(sim: Sim, pid: number) {
  const meta = sim.players.get(pid);
  if (!meta) throw new Error('no meta');
  return meta.questLog;
}

describe('the Lift Warden', () => {
  it('stands at the lift station under its reserved id, offering the chain', () => {
    const sim = new Sim({ seed: 3, playerClass: 'warrior' });
    const npc = sim.entities.get(LIFT_WARDEN_ENTITY_ID);
    expect(npc?.templateId).toBe(LIFT_WARDEN_NPC_ID);
    expect(
      Math.hypot(
        (npc as Entity).pos.x - LIFT_WARDEN_POS.x,
        (npc as Entity).pos.z - LIFT_WARDEN_POS.z,
      ),
    ).toBeLessThan(0.01);
    expect(npc?.questIds).toEqual([
      Q.stormLine,
      Q.stopTheLine,
      Q.firstDraft,
      'q_sf_free_the_workers',
      Q.forgefathersIsle,
    ]);
  });

  it('opens the three dungeon quests together at level 19, never below', () => {
    const sim = new Sim({ seed: 3, playerClass: 'warrior' });
    sim.setPlayerLevel(18);
    for (const id of [Q.stormLine, Q.stopTheLine, Q.firstDraft])
      expect(sim.questState(id), id).toBe('unavailable');
    sim.setPlayerLevel(19);
    for (const id of [Q.stormLine, Q.stopTheLine, Q.firstDraft])
      expect(sim.questState(id), id).toBe('available');
  });

  it("gates To the Forgefather's Isle with the Crucible's development flag", () => {
    const quest = QUESTS[Q.forgefathersIsle];
    expect(quest.gatedWithDungeon).toBe(IGNIVAR_FORGE_APPROACH_ID);
    expect(quest.turnInNpcId).toBe('archivist_maelin_emberward');
    const sim = new Sim({ seed: 3, playerClass: 'warrior' });
    sim.setPlayerLevel(20);
    const meta = sim.players.get(sim.player.id);
    meta?.questsDone.add(Q.firstDraft);
    const room = DUNGEONS[IGNIVAR_FORGE_APPROACH_ID];
    expect(room.guideVisible).toBe(false);
    expect(sim.questState(Q.forgefathersIsle)).toBe('unavailable');
    // The day the raid ships (its rooms public), the hand-off opens by itself.
    room.guideVisible = undefined;
    try {
      expect(sim.questState(Q.forgefathersIsle)).toBe('available');
    } finally {
      room.guideVisible = false;
    }
  });
});

describe('the chain credits through the real foundry', () => {
  it('the Hauler and Tock credit their kill quests', () => {
    const f = fight();
    const pid = f.tank.id;
    for (const id of [Q.stormLine, Q.stopTheLine]) take(f.sim, pid, id);
    for (const templateId of [GANTRY_HAULER_ID, TOCK_ID]) {
      const mob = [...f.sim.ctx.entities.values()].find(
        (e) => e.templateId === templateId && e.kind === 'mob',
      );
      if (!mob) throw new Error(templateId);
      mob.dead = false;
      mob.hp = 1;
      f.sim.ctx.handleDeath(mob, f.tank);
    }
    expect(questLogOf(f.sim, pid).get(Q.stormLine)?.state).toBe('ready');
    expect(questLogOf(f.sim, pid).get(Q.stopTheLine)?.state).toBe('ready');
  });

  it('the Prime Draft leaves the Draft Record, and reading it completes The First Draft', () => {
    const f = fight();
    const pid = f.tank.id;
    take(f.sim, pid, Q.firstDraft);
    const b = boss(f, PRIME_DRAFT_ID);
    put(f, b, 0, 213);
    put(f, f.tank, 0, 210);
    engage(f, b);
    run(f, 3.2);
    f.sim.ctx.handleDeath(b, f.tank);
    run(f, 0.1);
    const record = [...f.sim.ctx.entities.values()].find(
      (e) => e.kind === 'object' && e.objectItemId === DRAFT_RECORD_ITEM,
    );
    if (!record) throw new Error('no record');
    f.tank.pos = { ...record.pos };
    f.tank.prevPos = { ...record.pos };
    f.sim.pickUpObject(record.id, pid);
    expect(questLogOf(f.sim, pid).get(Q.firstDraft)?.state).toBe('ready');
    // A mage without the quest is refused, the record stays for the others.
    const mage = f.others[0];
    mage.pos = { ...record.pos };
    expect(f.sim.pickUpObject(record.id, mage.id)).toBe(false);
    expect(f.sim.ctx.entities.has(record.id)).toBe(true);
  });
});
