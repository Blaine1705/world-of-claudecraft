// Displacement teardown for the profession sessions: every teleport
// path and a /follow tow across a zone line cancel a live gather or fishing
// session through the ONE shared helper
// (src/sim/professions/session_teardown.ts). Direct pos writes deliberately
// do NOT cancel (pinned in gathering_rhythm.test.ts), which is also what
// lets these fixtures place a live session where a path needs it.

import { describe, expect, it } from 'vitest';
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import { DELVES, LAKE } from '../src/sim/data';
import { advanceDelveModule, ejectToDelveDoor, failDelveRun } from '../src/sim/delves/runs';
import { handleDevChat } from '../src/sim/dev_commands';
import { enterDungeon, leaveDungeon } from '../src/sim/instances/dungeons';
import { startFishing } from '../src/sim/professions/fishing';
import { cancelProfessionSessionOnDisplacement } from '../src/sim/professions/session_teardown';
import { Sim } from '../src/sim/sim';
import { type Entity, FISHING_CAST_ID, GATHER_CAST_ID } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const NODE = GATHER_NODES[0]; // ore_eastbrook_1, tier 1

function makeSim(seed = 4242): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: true });
}

function teleportTo(sim: Sim, pid: number, x: number, z: number): void {
  const p = sim.entities.get(pid);
  if (!p) throw new Error(`missing entity ${pid}`);
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

function despawnMobs(sim: Sim): void {
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob') continue;
    e.dead = true;
    e.hp = 0;
    e.aiState = 'dead';
    e.respawnTimer = 9999;
    e.corpseTimer = 9999;
    e.inCombat = false;
  }
}

// Real gather session on the shipped tier-1 node.
function startGatherSession(sim: Sim, pid: number): Entity {
  sim.addItem('copper_mining_pick', 1, pid);
  teleportTo(sim, pid, NODE.pos.x, NODE.pos.z);
  expect(sim.harvestNode(NODE.id, pid)).toBe(true);
  const p = sim.entities.get(pid);
  if (!p) throw new Error('missing entity');
  expect(p.castingAbility).toBe(GATHER_CAST_ID);
  return p;
}

// Real fishing session at the vale lake's south shore.
function startFishingSession(sim: Sim, pid: number): Entity {
  sim.addItem('simple_fishing_pole', 1, pid);
  const pz = LAKE.z - LAKE.radius - 2;
  teleportTo(sim, pid, LAKE.x, pz);
  const p = sim.entities.get(pid);
  if (!p) throw new Error('missing entity');
  p.facing = Math.atan2(0, LAKE.z - pz);
  const meta = sim.players.get(pid);
  if (!meta) throw new Error('missing meta');
  startFishing(sim.ctx, p, meta);
  expect(p.castingAbility).toBe(FISHING_CAST_ID);
  expect(p.fishCastZoneId).toBe('eastbrook_vale');
  return p;
}

// A session placed by direct field assignment (the parity-drive precedent),
// for paths whose precondition is a place with no real water or nodes.
function assignFishingSession(sim: Sim, pid: number): Entity {
  const p = sim.entities.get(pid);
  if (!p) throw new Error('missing entity');
  p.castingAbility = FISHING_CAST_ID;
  p.castTotal = 15;
  p.castRemaining = 15;
  p.fishBiteAtTick = sim.tickCount + 100;
  // An ARMED reel window, so expectSessionEnded's fishReelDeadlineTick check
  // asserts a real clear rather than a field that was already zero.
  p.fishReelDeadlineTick = sim.tickCount + 120;
  p.fishCastZoneId = 'eastbrook_vale';
  return p;
}

function expectSessionEnded(sim: Sim, p: Entity): void {
  expect(p.castingAbility).toBeNull();
  expect(p.gatherCastNodeId).toBe('');
  expect(p.fishBiteAtTick).toBe(0);
  expect(p.fishReelDeadlineTick).toBe(0);
  expect(p.fishCastZoneId).toBe('');
  expect(sim.drainEvents()).toContainEqual(
    expect.objectContaining({ type: 'castStop', success: false }),
  );
}

describe('the shared displacement helper', () => {
  it('cancels a gather or fishing session, and ONLY those', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const p = startGatherSession(sim, pid);
    sim.drainEvents();
    cancelProfessionSessionOnDisplacement(sim.ctx, p);
    expectSessionEnded(sim, p);
    // A spell cast gains NO new cancel path here.
    p.castingAbility = 'fireball';
    p.castRemaining = 2;
    cancelProfessionSessionOnDisplacement(sim.ctx, p);
    expect(p.castingAbility).toBe('fireball');
    p.castingAbility = null;
    p.castRemaining = 0;
    // Mobs are never touched.
    const mob = [...sim.entities.values()].find((e) => e.kind === 'mob');
    if (mob) {
      mob.castingAbility = 'fireball';
      cancelProfessionSessionOnDisplacement(sim.ctx, mob);
      expect(mob.castingAbility).toBe('fireball');
      mob.castingAbility = null;
    }
  });

  it('the gather timer survives the cancel (nothing was spent)', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const p = startGatherSession(sim, pid);
    cancelProfessionSessionOnDisplacement(sim.ctx, p);
    expect(sim.nodeHarvestableByMeFor(NODE.id, pid)).toBe(true);
  });
});

describe('teleports cancel a live session', () => {
  it('dungeon entry cancels a gather cast', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const p = startGatherSession(sim, pid);
    sim.drainEvents();
    expect(enterDungeon(sim.ctx, 'hollow_crypt', pid)).toBe(true);
    expectSessionEnded(sim, p);
  });

  it('dungeon exit cancels a session', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    expect(enterDungeon(sim.ctx, 'hollow_crypt', pid)).toBe(true);
    const p = assignFishingSession(sim, pid);
    sim.drainEvents();
    expect(leaveDungeon(sim.ctx, pid)).toBe(true);
    expectSessionEnded(sim, p);
  });

  it('delve entry cancels a fishing session', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    sim.setPlayerLevel(DELVES.collapsed_reliquary.minLevel, pid);
    const p = startFishingSession(sim, pid);
    // Walking to the door would cancel via move input; the direct placement
    // does not (pinned), so the ENTRY is provably the operative cause.
    const door = DELVES.collapsed_reliquary.doorPos;
    teleportTo(sim, pid, door.x, door.z);
    sim.drainEvents();
    sim.enterDelve('collapsed_reliquary', 'normal', pid);
    expect(sim.delveRunForPlayer(pid)).not.toBeNull();
    expectSessionEnded(sim, p);
  });

  it('delve exit, eject, fail, and module advance each cancel a session', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    sim.setPlayerLevel(DELVES.collapsed_reliquary.minLevel, pid);
    const door = DELVES.collapsed_reliquary.doorPos;
    teleportTo(sim, pid, door.x, door.z);
    sim.enterDelve('collapsed_reliquary', 'normal', pid);
    const run = sim.delveRunForPlayer(pid);
    expect(run).not.toBeNull();
    if (!run) throw new Error('missing run');
    const p = assignFishingSession(sim, pid);
    sim.drainEvents();
    run.exitPortalOpen = true; // the advance gates on the opened portal
    advanceDelveModule(sim.ctx, run);
    expectSessionEnded(sim, p);

    assignFishingSession(sim, pid);
    sim.drainEvents();
    ejectToDelveDoor(sim.ctx, pid, DELVES[run.delveId]);
    expectSessionEnded(sim, p);

    sim.enterDelve('collapsed_reliquary', 'normal', pid);
    const run2 = sim.delveRunForPlayer(pid);
    if (!run2) throw new Error('missing second run');
    assignFishingSession(sim, pid);
    sim.drainEvents();
    failDelveRun(sim.ctx, run2);
    expectSessionEnded(sim, p);

    sim.enterDelve('collapsed_reliquary', 'normal', pid);
    expect(sim.delveRunForPlayer(pid)).not.toBeNull();
    assignFishingSession(sim, pid);
    sim.drainEvents();
    sim.leaveDelve(pid);
    expectSessionEnded(sim, p);
  });

  it('a revive teleport cancels even a LIVE caster session (revivePlayerAt)', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const p = startFishingSession(sim, pid);
    expect(p.dead).toBe(false);
    sim.drainEvents();
    sim.revivePlayerAt(pid, { x: 10, y: 0, z: 10 }, 1);
    expectSessionEnded(sim, p);
  });

  it('/dev tp cancels a session', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const p = startGatherSession(sim, pid);
    sim.drainEvents();
    handleDevChat(sim.ctx, '/dev tp 50 50', pid);
    expectSessionEnded(sim, p);
  });
});

describe('a /follow tow across a zone line cancels the session', () => {
  function setupTow(sim: Sim, followerZ: number) {
    despawnMobs(sim);
    const followerPid = sim.playerId;
    const leaderPid = sim.addPlayer('warrior', 'Leader');
    const follower = startFishingSession(sim, followerPid);
    // Direct placement near the eastbrook/mirefen line at z=180 (a direct
    // pos write never cancels; the pinned zone survives the setup).
    teleportTo(sim, followerPid, 0, followerZ);
    teleportTo(sim, leaderPid, 0, followerZ + 3);
    const leader = sim.entities.get(leaderPid);
    const leaderMeta = sim.players.get(leaderPid);
    if (!leader || !leaderMeta) throw new Error('missing leader');
    leader.facing = 0; // north, +z
    follower.followTargetId = leaderPid;
    return { follower, leader, leaderMeta };
  }

  it('crossing z=180 while towed ends the session', () => {
    const sim = makeSim();
    const { follower, leader, leaderMeta } = setupTow(sim, 176);
    leaderMeta.moveInput.forward = true;
    let crossed = false;
    for (let i = 0; i < 80; i++) {
      sim.tick();
      leader.facing = 0;
      if (follower.pos.z > 180) {
        crossed = true;
        break;
      }
    }
    expect(crossed).toBe(true);
    expect(follower.castingAbility).toBeNull();
    expect(follower.fishCastZoneId).toBe('');
  });

  it('a tow that stays inside the zone does NOT cancel', () => {
    const sim = makeSim();
    const { follower, leader, leaderMeta } = setupTow(sim, 150);
    leaderMeta.moveInput.forward = true;
    for (let i = 0; i < 20; i++) {
      sim.tick();
      leader.facing = 0;
    }
    // Towed several yards north, still in eastbrook: the session lives.
    expect(follower.pos.z).toBeGreaterThan(151);
    expect(follower.pos.z).toBeLessThan(180);
    expect(follower.castingAbility).toBe(FISHING_CAST_ID);
    expect(follower.fishCastZoneId).toBe('eastbrook_vale');
  });
});
