// The Mirefen muster's drill yard and quest chain (src/sim/muster_effigy.ts,
// src/sim/muster_drill.ts, content/mirefen_muster_quests.ts, quests/weekly_quest_lock.ts).
//
// What is pinned, each decisively:
//   - the chain: Fenwick -> the Commander (a quest NPC raised with the army at his post) ->
//     the pike drill -> the weekly, each gated on the one before;
//   - the drill's three steps credit (rack, lantern, blows in the window);
//   - the effigy is PER PLAYER: one player's thrust opens their own window only;
//   - the plank hide turns away Barrowhide's share, and a window lets the owner's blows
//     through in full, then closes after Balgath's own blind length;
//   - the drillmaster's mallet kicks a couched beam through the slam shockwave path;
//   - the weekly locks until the weekly reset, and the trophy drops only for its carriers.
import { describe, expect, it } from 'vitest';
import {
  MUSTER_CAMPS,
  MUSTER_COMMAND_KEEP_OUT,
  MUSTER_COMMANDER_NPC_ID,
  MUSTER_DRILL_POST,
  MUSTER_EFFIGY_CLEAR_RADIUS,
  MUSTER_EFFIGY_POST,
  MUSTER_RACK,
} from '../src/sim/content/mirefen_muster';
import {
  BARROWHIDE_SLAB_ITEM_ID,
  MUSTER_DRILL_WINDOW_HITS,
  MUSTER_PIKE_DRILL_QUEST_ID,
  MUSTER_SUMMONS_QUEST_ID,
  MUSTER_TROPHY_QUEST_ID,
} from '../src/sim/content/mirefen_muster_quests';
import { BUILTIN_WORLD, MOBS, NPCS, QUESTS } from '../src/sim/data';
import { drainDelayedEvents } from '../src/sim/entity_roster';
import { LANCE_FIXED_DAMAGE } from '../src/sim/lance_balance_core';
import { LANCE_SHOCK_KICK } from '../src/sim/lance_trial';
import type { MusterArmyState } from '../src/sim/mirefen_muster';
import {
  MUSTER_EFFIGY_COLLIDER_RADIUS,
  musterCampColliders,
  musterEffigyCollider,
} from '../src/sim/muster_camp_colliders';
import { musterFootprintDistance } from '../src/sim/muster_camp_layout';
import { musterCampPlan } from '../src/sim/muster_camp_plan';
import {
  MUSTER_DRILL_POUND_EVERY,
  musterDrillStake,
  poundMusterDrill,
} from '../src/sim/muster_drill';
import {
  EFFIGY_OPENED_AURA_ID,
  EFFIGY_WARD_AURA_ID,
  EFFIGY_WINDOW_SECONDS,
} from '../src/sim/muster_effigy';
import { EFFIGY_WARD_REDUCTION } from '../src/sim/muster_effigy_core';
import { MUSTER_SHARDPIKE_ID } from '../src/sim/muster_pike';
import { advancePendingProjectiles } from '../src/sim/projectile_travel';
import { weeklyQuestLockoutId } from '../src/sim/quests/weekly_quest_lock';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { DT, dist2d, type Entity, MELEE_RANGE, type WorldContent } from '../src/sim/types';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_BOSSES } from '../src/sim/world_boss';
import { WORLD_SEED } from '../src/sim/world_seed';

const BALGATH = 'balgath_cyclops';
const lair = (() => {
  const row = WORLD_BOSSES.find((b) => b.templateId === BALGATH);
  if (!row) throw new Error('balgath_cyclops is not in WORLD_BOSSES');
  return row.pos;
})();
const TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: { warden_fenwick: NPCS.warden_fenwick },
  groundObjects: [],
};

interface Internals {
  musterArmy: MusterArmyState;
  ctx: SimContext;
  spawnDevBoss(t: string, x: number, z: number): number;
}
const inner = (sim: Sim) => sim as unknown as Internals;

const place = (sim: Sim, e: Entity, x: number, z: number) => {
  e.pos = { x, y: terrainHeight(x, z, sim.cfg.seed), z };
  e.prevPos = { ...e.pos };
  e.onGround = true;
};

/** A world with Balgath and his muster raised; the player a warrior at the drill lane. */
function drillYard() {
  const sim = new Sim({ seed: 11, playerClass: 'warrior', autoEquip: true, world: TEST_WORLD });
  sim.setPlayerLevel(10);
  inner(sim).spawnDevBoss(BALGATH, lair.x, lair.z);
  for (let i = 0; i < 25 && inner(sim).musterArmy.soldierIds.length === 0; i++) sim.tick();
  const army = inner(sim).musterArmy;
  const ctx = inner(sim).ctx;
  const effigy = sim.entities.get(army.effigyId ?? -1);
  if (!effigy) throw new Error('no effigy raised');
  const lane = (e: Entity, side = 0) => {
    place(sim, e, MUSTER_EFFIGY_POST.x + 7, MUSTER_EFFIGY_POST.z + side);
    e.facing = -Math.PI / 2;
  };
  lane(sim.player);
  const meta = (pid = sim.playerId) => {
    const m = sim.players.get(pid);
    if (!m) throw new Error('no meta');
    return m;
  };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.time += DT;
      advancePendingProjectiles(ctx);
      drainDelayedEvents(ctx);
    }
  };
  /** Pike in hand, couched and set, then the thrust flies home. */
  const thrust = (pid = sim.playerId) => {
    sim.lanceBrace(pid);
    const m = meta(pid);
    if (!m.lance) throw new Error('brace failed');
    m.lance.phase = 'steadied';
    sim.lanceThrust(pid);
    step(30);
  };
  const takePike = (pid = sim.playerId) => {
    const p = sim.entities.get(pid) as Entity;
    const at = { x: p.pos.x, z: p.pos.z, facing: p.facing };
    place(sim, p, MUSTER_RACK.x + 1.5, MUSTER_RACK.z - 1.5);
    p.targetId = army.rackId;
    sim.interact(pid);
    place(sim, p, at.x, at.z);
    p.facing = at.facing;
  };
  return { sim, army, ctx, effigy, meta, step, thrust, takePike, lane };
}

describe('the drill yard is placed with care', () => {
  it('stands on dry ground inside the command camp keep-out, clear of every camp piece', () => {
    const y = terrainHeight(MUSTER_EFFIGY_POST.x, MUSTER_EFFIGY_POST.z, WORLD_SEED);
    expect(y).toBeGreaterThan(WATER_LEVEL + 1.5);
    const d = Math.hypot(
      MUSTER_EFFIGY_POST.x - MUSTER_COMMAND_KEEP_OUT.x,
      MUSTER_EFFIGY_POST.z - MUSTER_COMMAND_KEEP_OUT.z,
    );
    expect(d + 7 + MUSTER_EFFIGY_CLEAR_RADIUS).toBeLessThan(MUSTER_COMMAND_KEEP_OUT.radius);
    for (const p of musterCampPlan(WORLD_SEED)) {
      const d = musterFootprintDistance(
        p.key,
        p.x,
        p.z,
        p.rot,
        MUSTER_EFFIGY_POST.x,
        MUSTER_EFFIGY_POST.z,
      );
      expect(d, p.key).toBeGreaterThanOrEqual(MUSTER_EFFIGY_CLEAR_RADIUS);
    }
    const command = MUSTER_CAMPS.find((c) => c.id === 'command');
    expect(command?.soldiers.some((s) => s.templateId === 'muster_drillmaster')).toBe(true);
    expect(
      dist2d(
        { x: MUSTER_DRILL_POST.x, y: 0, z: MUSTER_DRILL_POST.z },
        { ...MUSTER_EFFIGY_POST, y: 0 },
      ),
    ).toBeLessThan(6);
  });
});

describe('the effigy is solid', () => {
  it('stands a post at its legs that a player bumps into, still inside melee reach', () => {
    const c = musterEffigyCollider(WORLD_SEED);
    expect(musterCampColliders(WORLD_SEED)).toContainEqual(c);
    expect(Math.hypot(c.x - MUSTER_EFFIGY_POST.x, c.z - MUSTER_EFFIGY_POST.z)).toBeLessThan(1);
    expect(c.r).toBe(MUSTER_EFFIGY_COLLIDER_RADIUS);
    expect(c.r + 1).toBeLessThan(MELEE_RANGE);
  });
});

describe('the muster quest chain', () => {
  it('Fenwick sends you up, the Commander briefs you, and each quest opens the next', () => {
    const { sim, army } = drillYard();
    const commander = sim.entities.get(army.commanderId ?? -1);
    expect(commander?.kind).toBe('npc');
    expect(commander?.templateId).toBe(MUSTER_COMMANDER_NPC_ID);
    expect(NPCS[MUSTER_COMMANDER_NPC_ID]?.questIds).toEqual([
      MUSTER_SUMMONS_QUEST_ID,
      MUSTER_PIKE_DRILL_QUEST_ID,
      MUSTER_TROPHY_QUEST_ID,
    ]);
    expect(NPCS.warden_fenwick.questIds).toContain(MUSTER_SUMMONS_QUEST_ID);
    expect(QUESTS[MUSTER_PIKE_DRILL_QUEST_ID].requiresQuest).toBe(MUSTER_SUMMONS_QUEST_ID);
    expect(QUESTS[MUSTER_TROPHY_QUEST_ID].requiresQuest).toBe(MUSTER_PIKE_DRILL_QUEST_ID);
    expect(sim.questState(MUSTER_SUMMONS_QUEST_ID)).toBe('available');
    expect(sim.questState(MUSTER_PIKE_DRILL_QUEST_ID)).toBe('unavailable');
    const fenwick = [...sim.entities.values()].find((e) => e.templateId === 'warden_fenwick');
    if (!fenwick) throw new Error('no Fenwick');
    place(sim, sim.player, fenwick.pos.x + 1, fenwick.pos.z);
    sim.acceptQuest(MUSTER_SUMMONS_QUEST_ID);
    expect(sim.questState(MUSTER_SUMMONS_QUEST_ID)).toBe('active');
    // Report in: walk to the Commander and speak to him.
    if (!commander) throw new Error('no commander');
    place(sim, sim.player, commander.pos.x + 1, commander.pos.z);
    sim.talkToNpc(commander.id);
    expect(sim.questState(MUSTER_SUMMONS_QUEST_ID)).toBe('ready');
    sim.turnInQuest(MUSTER_SUMMONS_QUEST_ID);
    expect(sim.questState(MUSTER_SUMMONS_QUEST_ID)).toBe('done');
    expect(sim.questState(MUSTER_PIKE_DRILL_QUEST_ID)).toBe('available');
    expect(sim.questState(MUSTER_TROPHY_QUEST_ID)).toBe('unavailable');
  });

  it('the drill credits the rack, the lantern and the blows in the window, then opens the weekly', () => {
    const h = drillYard();
    const m = h.meta();
    m.questsDone.add(MUSTER_SUMMONS_QUEST_ID);
    m.questLog.set(MUSTER_PIKE_DRILL_QUEST_ID, {
      questId: MUSTER_PIKE_DRILL_QUEST_ID,
      counts: [0, 0, 0],
      state: 'active',
    });
    const before = m.equipment.mainhand;
    h.takePike();
    expect(m.equipment.mainhand).toBe(MUSTER_SHARDPIKE_ID);
    expect(m.questLog.get(MUSTER_PIKE_DRILL_QUEST_ID)?.counts).toEqual([1, 0, 0]);
    h.thrust();
    expect(m.questLog.get(MUSTER_PIKE_DRILL_QUEST_ID)?.counts).toEqual([1, 1, 0]);
    // The lent pike went back to the rack and the player's own weapon is in hand.
    expect(m.equipment.mainhand).toBe(before);
    expect(h.sim.countItem(MUSTER_SHARDPIKE_ID)).toBe(0);
    for (let i = 0; i < MUSTER_DRILL_WINDOW_HITS; i++) {
      h.sim.dealDamage(h.sim.player, h.effigy, 40, false, 'physical', 'Strike', 'hit');
    }
    const qp = m.questLog.get(MUSTER_PIKE_DRILL_QUEST_ID);
    expect(qp?.counts).toEqual([1, 1, MUSTER_DRILL_WINDOW_HITS]);
    expect(qp?.state).toBe('ready');
  });
});

describe('the Straw Foreman', () => {
  it('wears a plank hide that turns away what Barrowhide does', () => {
    const { effigy } = drillYard();
    expect(MOBS.muster_effigy.dummy).toBe(true);
    expect(EFFIGY_WARD_REDUCTION).toBe(MOBS[BALGATH].eyeWard?.reduction);
    expect(EFFIGY_WINDOW_SECONDS).toBe(MOBS[BALGATH].eyeWard?.blindSeconds);
    const ward = effigy.auras.find((a) => a.id === EFFIGY_WARD_AURA_ID);
    expect(ward?.kind).toBe('buff_dr');
    expect(ward?.value).toBe(EFFIGY_WARD_REDUCTION);
  });

  it('a thrust puts the lantern out and the window lets the blows through, then it closes', () => {
    const h = drillYard();
    const hit = () => {
      const hp = h.effigy.hp;
      h.sim.dealDamage(h.sim.player, h.effigy, 100, false, 'physical', 'Strike', 'hit');
      return hp - h.effigy.hp;
    };
    const shielded = hit();
    expect(shielded).toBe(Math.round(100 * (1 - EFFIGY_WARD_REDUCTION)));
    h.takePike();
    const hp = h.effigy.hp;
    h.thrust();
    // The thrust itself lands in full, like the real eye.
    expect(hp - h.effigy.hp).toBe(LANCE_FIXED_DAMAGE);
    expect(h.sim.player.auras.some((a) => a.id === EFFIGY_OPENED_AURA_ID)).toBe(true);
    expect(hit()).toBe(100);
    h.step(Math.ceil(EFFIGY_WINDOW_SECONDS / DT) + 2);
    h.sim.tick(); // the muster pass closes the window and takes the timer aura
    expect(h.sim.player.auras.some((a) => a.id === EFFIGY_OPENED_AURA_ID)).toBe(false);
    expect(hit()).toBe(shielded);
  });

  it("is per player: one thrust opens only its thruster's window", () => {
    const h = drillYard();
    const other = h.sim.addPlayer('warrior', 'Second');
    const otherE = h.sim.entities.get(other) as Entity;
    h.lane(otherE, 2);
    h.takePike();
    h.thrust();
    expect(otherE.auras.some((a) => a.id === EFFIGY_OPENED_AURA_ID)).toBe(false);
    const hp = h.effigy.hp;
    h.sim.dealDamage(otherE, h.effigy, 100, false, 'physical', 'Strike', 'hit');
    expect(hp - h.effigy.hp).toBe(Math.round(100 * (1 - EFFIGY_WARD_REDUCTION)));
    // And the second player's own thrust still finds a lit lantern.
    h.takePike(other);
    h.thrust(other);
    expect(otherE.auras.some((a) => a.id === EFFIGY_OPENED_AURA_ID)).toBe(true);
  });
});

describe("the drillmaster's mallet", () => {
  it('kicks a couched beam through the slam shockwave, harder the nearer the stake', () => {
    const h = drillYard();
    h.takePike();
    h.sim.lanceBrace();
    const m = h.meta();
    if (!m.lance) throw new Error('brace failed');
    const v0 = m.lance.beam.velocity;
    poundMusterDrill(h.ctx, h.army);
    // Nothing until the mallet meets the stake.
    expect(m.lance.beam.velocity).toBe(v0);
    h.step(20);
    const kick = (m.lance?.beam.velocity ?? v0) - v0;
    expect(Math.abs(kick)).toBeGreaterThan(0.1);
    expect(Math.abs(kick)).toBeLessThanOrEqual(LANCE_SHOCK_KICK);
    // The stake is on the trainee's left (facing the effigy), so the shove goes right.
    const stake = musterDrillStake();
    const bearing = Math.atan2(stake.x - h.sim.player.pos.x, stake.z - h.sim.player.pos.z);
    expect(Math.sign(kick)).toBe(Math.sin(bearing - h.sim.player.facing) >= 0 ? 1 : -1);
  });

  it('pounds on a beat only while someone trains with a pike', () => {
    const h = drillYard();
    const windups = () =>
      h.sim.tick().filter((ev) => ev.type === 'spellfx' && ev.ability === 'muster_mallet_pound')
        .length;
    let idle = 0;
    for (let i = 0; i < 200; i++) idle += windups();
    expect(idle).toBe(0);
    h.takePike();
    let busy = 0;
    const ticks = Math.round((MUSTER_DRILL_POUND_EVERY * 3) / DT);
    for (let i = 0; i < ticks; i++) busy += windups();
    expect(busy).toBeGreaterThanOrEqual(2);
    expect(busy).toBeLessThanOrEqual(4);
  });
});

describe('the weekly trophy', () => {
  it('locks until the weekly reset and drops only for the players carrying it', () => {
    const h = drillYard();
    const m = h.meta();
    m.questsDone.add(MUSTER_SUMMONS_QUEST_ID);
    m.questsDone.add(MUSTER_PIKE_DRILL_QUEST_ID);
    expect(h.sim.questState(MUSTER_TROPHY_QUEST_ID)).toBe('available');
    const commander = h.sim.entities.get(h.army.commanderId ?? -1) as Entity;
    place(h.sim, h.sim.player, commander.pos.x + 1, commander.pos.z);
    h.sim.acceptQuest(MUSTER_TROPHY_QUEST_ID);
    expect(h.sim.questState(MUSTER_TROPHY_QUEST_ID)).toBe('active');
    // A Balgath kill leaves a slab for the carrier only.
    const boss = [...h.sim.entities.values()].find((e) => e.templateId === BALGATH) as Entity;
    const other = h.sim.addPlayer('warrior', 'Second');
    boss.bossDamagers.add(h.sim.playerId);
    boss.bossDamagers.add(other);
    boss.hp = 1;
    h.sim.dealDamage(h.sim.player, boss, 10, false, 'physical', 'Strike', 'hit');
    expect(boss.dead).toBe(true);
    const slab = boss.loot?.items.find((s) => s.itemId === BARROWHIDE_SLAB_ITEM_ID);
    expect(slab?.personalFor).toEqual([h.sim.playerId]);
    h.sim.addItem(BARROWHIDE_SLAB_ITEM_ID, 1);
    expect(h.sim.questState(MUSTER_TROPHY_QUEST_ID)).toBe('ready');
    h.sim.turnInQuest(MUSTER_TROPHY_QUEST_ID);
    expect(h.sim.countItem(BARROWHIDE_SLAB_ITEM_ID)).toBe(0);
    // Done for the week: unavailable until the weekly reset instant.
    const until = m.raidLockouts.get(weeklyQuestLockoutId(MUSTER_TROPHY_QUEST_ID));
    expect(until).toBeGreaterThan(h.ctx.lockoutNowMs());
    expect(h.sim.questState(MUSTER_TROPHY_QUEST_ID)).toBe('unavailable');
    expect(h.sim.craftingIdentity?.cadenceBlockedQuests).toContain(MUSTER_TROPHY_QUEST_ID);
    // The reset passes: the Commander offers it again.
    m.raidLockouts.set(weeklyQuestLockoutId(MUSTER_TROPHY_QUEST_ID), h.ctx.lockoutNowMs() - 1);
    expect(h.sim.questState(MUSTER_TROPHY_QUEST_ID)).toBe('available');
  });
});
