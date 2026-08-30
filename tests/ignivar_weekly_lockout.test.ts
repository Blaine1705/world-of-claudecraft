// The Ignivar raid's weekly lockout: one lock each for normal and heroic per
// room, expiring on the WEEKLY reset boundary (the host injects Tuesday at the
// realm's daily-reset hour; hostless runs take a flat 7-day week). Driven
// through a real Sim's ctx settle hub and the real enterDungeon door, the
// deeds_sites_pin harness idiom.
import { describe, expect, it } from 'vitest';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_MOLTEN_ASSEMBLY_ID,
  IGNIVAR_RAID_ARENA_ID,
  IGNIVAR_SECOND_WING_ID,
  VARKHUL_BOSS_ID,
} from '../src/sim/ignivar_raid_ids';
import {
  enterDungeon,
  heroicLockoutId,
  INSTANCE_CLEARED_EMPTY_TIMEOUT,
  leaveDungeon,
  updateInstances,
} from '../src/sim/instances/dungeons';
import { type InstanceSlot, type PlayerMeta, Sim } from '../src/sim/sim';
import { type DungeonDifficulty, type Entity, IGNIVAR_BOSS_ID, type Vec3 } from '../src/sim/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function makeSim(seed = 42, weeklyRaidResetMs?: (nowMs: number) => number): Sim {
  return new Sim({
    seed,
    playerClass: 'warrior',
    autoEquip: false,
    devCommands: true,
    weeklyRaidResetMs,
  });
}

function addMeta(sim: Sim, name: string): PlayerMeta {
  const pid = sim.addPlayer('warrior', name);
  return sim.players.get(pid)!;
}

function entityOf(sim: Sim, meta: PlayerMeta): Entity {
  return sim.entities.get(meta.entityId)!;
}

function spawnMob(sim: Sim, templateId: string, pos: Vec3, level = 30): Entity {
  const e = createMob(sim.ctx.nextId++, MOBS[templateId], level, pos);
  sim.addEntity(e);
  return e;
}

function encounterInstance(
  sim: Sim,
  templateId: string,
  dungeonId: string,
  difficulty: DungeonDifficulty,
  names: string[],
): { boss: Entity; inst: InstanceSlot; recipients: PlayerMeta[] } {
  const origin = instanceOrigin(DUNGEONS[dungeonId].index, 0);
  const boss = spawnMob(sim, templateId, { x: origin.x, y: 0, z: origin.z });
  const inst: InstanceSlot = {
    dungeonId,
    difficulty,
    slot: 0,
    partyKey: 'party:lockout-test',
    mobIds: [boss.id],
    raidBossWelcomeKeys: new Set(),
    npcIds: [],
    objectIds: [],
    exitId: null,
    bossExitId: null,
    emptyFor: 0,
    resetAvailableAt: 0,
    clearedBy: new Set(),
    enteredBy: new Set(),
    combatExitMemory: new Map(),
  };
  sim.ctx.instances.push(inst);
  const recipients = names.map((name) => {
    const meta = addMeta(sim, name);
    entityOf(sim, meta).pos = { x: origin.x, y: 0, z: origin.z };
    inst.enteredBy.add(meta.entityId);
    return meta;
  });
  return { boss, inst, recipients };
}

describe('normal-difficulty weekly lockout on the raid rooms', () => {
  it('a normal Ignivar kill locks every participant under the plain room id for a week', () => {
    const sim = makeSim();
    const { boss, inst, recipients } = encounterInstance(
      sim,
      'ignivar_herald_of_the_last_flame',
      'ignivar_raid_arena',
      'normal',
      ['Tank', 'Healer'],
    );
    const nowMs = Math.floor(sim.time * 1000);
    sim.ctx.awardHeroicMarks(boss, recipients);
    for (const meta of recipients) {
      expect(meta.raidLockouts.get('ignivar_raid_arena')).toBe(nowMs + WEEK_MS);
      // The heroic key stays free: normal and heroic lock independently.
      expect(meta.raidLockouts.has(heroicLockoutId('ignivar_raid_arena'))).toBe(false);
      // The cleared-run door exception can recognize this kill's own claim.
      expect(inst.clearedBy.has(meta.entityId)).toBe(true);
    }
  });

  it('a normal kill in a NON-raid dungeon locks nothing (the control)', () => {
    const sim = makeSim();
    const { boss, recipients } = encounterInstance(sim, 'morthen', 'hollow_crypt', 'normal', [
      'Tank',
    ]);
    sim.ctx.awardHeroicMarks(boss, recipients);
    expect(recipients[0].raidLockouts.size).toBe(0);
  });

  it('the host-injected weekly boundary wins over the flat fallback', () => {
    const untilMs = 1_777_000_000_000;
    const sim = makeSim(42, () => untilMs);
    const { boss, recipients } = encounterInstance(
      sim,
      'varkhul_forgefather_of_the_last_flame',
      'ignivar_inner_crucible',
      'normal',
      ['Tank'],
    );
    sim.ctx.awardHeroicMarks(boss, recipients);
    expect(recipients[0].raidLockouts.get('ignivar_inner_crucible')).toBe(untilMs);
  });
});

describe('heroic raid kills take the weekly boundary; ordinary heroics stay daily', () => {
  it('a heroic Varkhul kill locks the heroic key for a WEEK, not a day', () => {
    const sim = makeSim();
    const { boss, recipients } = encounterInstance(
      sim,
      'varkhul_forgefather_of_the_last_flame',
      'ignivar_inner_crucible',
      'heroic',
      ['Tank'],
    );
    const nowMs = Math.floor(sim.time * 1000);
    sim.ctx.awardHeroicMarks(boss, recipients);
    expect(recipients[0].raidLockouts.get(heroicLockoutId('ignivar_inner_crucible'))).toBe(
      nowMs + WEEK_MS,
    );
    // Normal stays free: one lock each per difficulty.
    expect(recipients[0].raidLockouts.has('ignivar_inner_crucible')).toBe(false);
  });

  it('a heroic kill in an ordinary dungeon keeps the DAILY boundary (the control)', () => {
    const sim = makeSim();
    const { boss, recipients } = encounterInstance(sim, 'morthen', 'hollow_crypt', 'heroic', [
      'Tank',
    ]);
    const nowMs = Math.floor(sim.time * 1000);
    sim.ctx.awardHeroicMarks(boss, recipients);
    expect(recipients[0].raidLockouts.get(heroicLockoutId('hollow_crypt'))).toBe(nowMs + DAY_MS);
  });
});

// A raid-group leader with a full group, the nythraxis entry recipe: the raid
// door requires a converted raid group before any lock check is reachable.
function raidLeader(sim: Sim): PlayerMeta {
  const lead = addMeta(sim, 'Lead');
  for (let i = 0; i < 4; i += 1) {
    const pid = sim.addPlayer('mage', `M${i}`);
    sim.partyInvite(pid, lead.entityId);
    sim.partyAccept(pid);
  }
  sim.convertPartyToRaid(lead.entityId);
  return lead;
}

describe('the door: a locked player cannot mint a fresh raid claim', () => {
  it('a normal lock bars fresh normal entry with the lockout error, heroic entry stays open', () => {
    const sim = makeSim();
    const lead = raidLeader(sim);
    const nowMs = Math.floor(sim.time * 1000);
    lead.raidLockouts.set('ignivar_raid_arena', nowMs + WEEK_MS);
    const errors: string[] = [];
    const restore = sim.ctx.error;
    sim.ctx.error = (pid: number, text: string) => {
      errors.push(text);
      restore(pid, text);
    };
    expect(enterDungeon(sim.ctx, 'ignivar_raid_arena', lead.entityId, true)).toBe(false);
    expect(errors.some((text) => text === 'You are locked to Crucible of the Last Spring.')).toBe(
      true,
    );
    sim.ctx.error = restore;
    // The heroic difficulty is a separate weekly lock: still enterable.
    sim.setDungeonDifficulty('heroic', lead.entityId);
    expect(enterDungeon(sim.ctx, 'ignivar_raid_arena', lead.entityId, true)).toBe(true);
  });

  it('an expired lock clears at the door and entry proceeds', () => {
    const sim = makeSim();
    const lead = raidLeader(sim);
    lead.raidLockouts.set('ignivar_raid_arena', Math.floor(sim.time * 1000) - 1);
    expect(enterDungeon(sim.ctx, 'ignivar_raid_arena', lead.entityId, true)).toBe(true);
    expect(lead.raidLockouts.has('ignivar_raid_arena')).toBe(false);
  });
});

// The cleared-claim door exception (the heroic five-man idiom applied to the
// weekly raid rooms): the kill deliberately records clearedBy so this run's
// own participants can walk back into their exact still-live claim for loot
// and corpse runs, while the boss-alive, non-participant, and expired-claim
// guards keep every other locked entrant out.
const ARENA_LOCKED_ERROR = 'You are locked to Crucible of the Last Spring.';

function raidWithAlly(sim: Sim): { lead: PlayerMeta; ally: PlayerMeta } {
  const lead = addMeta(sim, 'Lead');
  const ally = addMeta(sim, 'Ally');
  sim.partyInvite(ally.entityId, lead.entityId);
  sim.partyAccept(ally.entityId);
  for (let i = 0; i < 3; i += 1) {
    const pid = sim.addPlayer('mage', `M${i}`);
    sim.partyInvite(pid, lead.entityId);
    sim.partyAccept(pid);
  }
  sim.convertPartyToRaid(lead.entityId);
  if (sim.ctx.partyOf(ally.entityId)?.raid !== true) throw new Error('test raid did not form');
  return { lead, ally };
}

function liveClaim(sim: Sim, dungeonId: string): InstanceSlot {
  const claim = sim.instances.find(
    (inst) => inst.dungeonId === dungeonId && inst.partyKey !== null,
  );
  if (!claim) throw new Error(`no live claim for ${dungeonId}`);
  return claim;
}

function bossIn(sim: Sim, claim: InstanceSlot, templateId: string): Entity {
  const boss = claim.mobIds
    .map((id) => sim.entities.get(id))
    .find((mob): mob is Entity => mob !== undefined && mob.templateId === templateId);
  if (!boss) throw new Error(`no ${templateId} in ${claim.dungeonId}`);
  return boss;
}

// Walk the real doors: the overworld approach first, then the requested deeper
// rooms via the dev arm (the raid LOCKOUT itself is never dev-bypassed).
function claimRooms(
  sim: Sim,
  lead: PlayerMeta,
  difficulty: DungeonDifficulty,
  deeperRooms: string[],
): void {
  if (difficulty === 'heroic') sim.setDungeonDifficulty('heroic', lead.entityId);
  if (!enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, lead.entityId)) {
    throw new Error('approach entry failed');
  }
  for (const roomId of deeperRooms) {
    if (!enterDungeon(sim.ctx, roomId, lead.entityId, true)) {
      throw new Error(`${roomId} entry failed`);
    }
  }
}

function killBoss(sim: Sim, killer: PlayerMeta, boss: Entity): void {
  sim.ctx.dealDamage(entityOf(sim, killer), boss, boss.hp + 100, false, 'physical', null, 'hit');
  if (!boss.dead) throw new Error(`${boss.templateId} survived the settle kill`);
}

function drainedErrors(sim: Sim): string[] {
  return (sim.drainEvents() as { type: string; text?: string }[])
    .filter((event) => event.type === 'error')
    .map((event) => event.text ?? '');
}

describe('the cleared-claim door: participants return to their exact live weekly claim', () => {
  it('admits a normal participant back into the cleared live arena claim', () => {
    const sim = makeSim();
    const { lead } = raidWithAlly(sim);
    claimRooms(sim, lead, 'normal', [IGNIVAR_RAID_ARENA_ID]);
    const inst = liveClaim(sim, IGNIVAR_RAID_ARENA_ID);
    const exitId = inst.exitId;
    killBoss(sim, lead, bossIn(sim, inst, IGNIVAR_BOSS_ID));
    expect(lead.raidLockouts.has(IGNIVAR_RAID_ARENA_ID)).toBe(true);
    expect(inst.clearedBy.has(lead.entityId)).toBe(true);
    expect(leaveDungeon(sim.ctx, lead.entityId)).toBe(true);
    sim.drainEvents();

    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, lead.entityId)).toBe(true);

    expect(drainedErrors(sim)).toEqual([]);
    const leadEntity = entityOf(sim, lead);
    expect(sim.instanceInfoAt(leadEntity.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);
    expect(
      liveClaim(sim, IGNIVAR_RAID_ARENA_ID).exitId,
      'the same exact claim, no fresh mint',
    ).toBe(exitId);
  });

  it('admits a heroic participant back into the cleared live arena claim', () => {
    const sim = makeSim();
    const { lead } = raidWithAlly(sim);
    claimRooms(sim, lead, 'heroic', [IGNIVAR_RAID_ARENA_ID]);
    const inst = liveClaim(sim, IGNIVAR_RAID_ARENA_ID);
    expect(inst.difficulty).toBe('heroic');
    const exitId = inst.exitId;
    killBoss(sim, lead, bossIn(sim, inst, IGNIVAR_BOSS_ID));
    expect(lead.raidLockouts.has(heroicLockoutId(IGNIVAR_RAID_ARENA_ID))).toBe(true);
    expect(inst.clearedBy.has(lead.entityId)).toBe(true);
    expect(leaveDungeon(sim.ctx, lead.entityId)).toBe(true);
    sim.drainEvents();

    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, lead.entityId)).toBe(true);

    expect(drainedErrors(sim)).toEqual([]);
    const leadEntity = entityOf(sim, lead);
    expect(sim.instanceInfoAt(leadEntity.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);
    expect(liveClaim(sim, IGNIVAR_RAID_ARENA_ID).exitId).toBe(exitId);
  });

  it('admits a heroic participant back into the cleared live Varkhul claim', () => {
    const sim = makeSim();
    const { lead } = raidWithAlly(sim);
    claimRooms(sim, lead, 'heroic', [
      IGNIVAR_RAID_ARENA_ID,
      IGNIVAR_MOLTEN_ASSEMBLY_ID,
      IGNIVAR_SECOND_WING_ID,
    ]);
    const inst = liveClaim(sim, IGNIVAR_SECOND_WING_ID);
    expect(inst.difficulty).toBe('heroic');
    const varkhul = bossIn(sim, inst, VARKHUL_BOSS_ID);
    // The Grand Forge Assembly threshold pins hp at 50% until the intermission
    // completes; clear the spawn-stamped floor so the settle kill can land.
    varkhul.damageFloorHp = undefined;
    killBoss(sim, lead, varkhul);
    expect(lead.raidLockouts.has(heroicLockoutId(IGNIVAR_SECOND_WING_ID))).toBe(true);
    expect(inst.clearedBy.has(lead.entityId)).toBe(true);
    expect(leaveDungeon(sim.ctx, lead.entityId)).toBe(true);
    sim.drainEvents();

    // The approach door's checkpoint redirect resolves to the deepest claimed
    // room, so the weekly lock check lands on the cleared Varkhul claim.
    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, lead.entityId)).toBe(true);

    expect(drainedErrors(sim)).toEqual([]);
    const leadEntity = entityOf(sim, lead);
    expect(sim.instanceInfoAt(leadEntity.pos)?.dungeonId).toBe(IGNIVAR_SECOND_WING_ID);
  });

  it('corpse-runs a dead participant back in and resurrects them at the claim entrance', () => {
    const sim = makeSim();
    const { lead, ally } = raidWithAlly(sim);
    claimRooms(sim, lead, 'normal', [IGNIVAR_RAID_ARENA_ID]);
    const inst = liveClaim(sim, IGNIVAR_RAID_ARENA_ID);
    // The ally walks the real approach door and rides the checkpoint redirect
    // into the claimed arena, then falls to the boss before the kill lands.
    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, ally.entityId)).toBe(true);
    const allyEntity = entityOf(sim, ally);
    expect(sim.instanceInfoAt(allyEntity.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);
    const boss = bossIn(sim, inst, IGNIVAR_BOSS_ID);
    sim.ctx.handleDeath(allyEntity, boss);
    expect(allyEntity.dead).toBe(true);
    killBoss(sim, lead, boss);
    expect(inst.clearedBy.has(ally.entityId)).toBe(true);
    expect(ally.raidLockouts.has(IGNIVAR_RAID_ARENA_ID)).toBe(true);
    sim.releaseSpirit(ally.entityId);
    expect(allyEntity.ghost).toBe(true);
    expect(sim.instanceInfoAt(allyEntity.pos)).toBeNull();
    sim.drainEvents();

    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, ally.entityId)).toBe(true);

    expect(drainedErrors(sim)).toEqual([]);
    expect(allyEntity.dead, 'instance re-entry is the corpse run: the ghost resurrects').toBe(
      false,
    );
    expect(allyEntity.ghost).toBe(false);
    expect(sim.instanceInfoAt(allyEntity.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);
  });

  it('keeps a member locked by an EARLIER run out of the cleared claim they took no part in', () => {
    const sim = makeSim();
    const { lead, ally } = raidWithAlly(sim);
    // The ally's lock predates this claim's kill, so settlement never adds
    // them to clearedBy: the door exception must not open for them.
    ally.raidLockouts.set(IGNIVAR_RAID_ARENA_ID, Math.floor(sim.time * 1000) + WEEK_MS);
    claimRooms(sim, lead, 'normal', [IGNIVAR_RAID_ARENA_ID]);
    const inst = liveClaim(sim, IGNIVAR_RAID_ARENA_ID);
    killBoss(sim, lead, bossIn(sim, inst, IGNIVAR_BOSS_ID));
    expect(inst.clearedBy.has(lead.entityId)).toBe(true);
    expect(inst.clearedBy.has(ally.entityId)).toBe(false);
    sim.drainEvents();

    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, ally.entityId)).toBe(false);

    expect(drainedErrors(sim)).toContain(ARENA_LOCKED_ERROR);
    expect(sim.instanceInfoAt(entityOf(sim, ally).pos)).toBeNull();
  });

  it('keeps a locked member out of a fresh live claim whose boss is still alive', () => {
    const sim = makeSim();
    const { lead, ally } = raidWithAlly(sim);
    ally.raidLockouts.set(IGNIVAR_RAID_ARENA_ID, Math.floor(sim.time * 1000) + WEEK_MS);
    claimRooms(sim, lead, 'normal', [IGNIVAR_RAID_ARENA_ID]);
    expect(bossIn(sim, liveClaim(sim, IGNIVAR_RAID_ARENA_ID), IGNIVAR_BOSS_ID).dead).toBe(false);
    sim.drainEvents();

    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, ally.entityId)).toBe(false);

    expect(drainedErrors(sim)).toContain(ARENA_LOCKED_ERROR);
    expect(sim.instanceInfoAt(entityOf(sim, ally).pos)).toBeNull();
  });

  it('a freed (expired) cleared claim admits nobody: the lockout bars a fresh claim again', () => {
    const sim = makeSim();
    const { lead } = raidWithAlly(sim);
    claimRooms(sim, lead, 'normal', [IGNIVAR_RAID_ARENA_ID]);
    const inst = liveClaim(sim, IGNIVAR_RAID_ARENA_ID);
    killBoss(sim, lead, bossIn(sim, inst, IGNIVAR_BOSS_ID));
    expect(inst.clearedBy.has(lead.entityId)).toBe(true);
    expect(leaveDungeon(sim.ctx, lead.entityId)).toBe(true);
    // The reaper frees the empty cleared claim once the extended grace lapses.
    for (let second = 0; second <= INSTANCE_CLEARED_EMPTY_TIMEOUT; second += 1) {
      updateInstances(sim.ctx);
    }
    expect(sim.instances.every((slot) => slot.partyKey === null)).toBe(true);
    sim.drainEvents();

    expect(enterDungeon(sim.ctx, IGNIVAR_RAID_ARENA_ID, lead.entityId, true)).toBe(false);

    expect(drainedErrors(sim)).toContain(ARENA_LOCKED_ERROR);
    expect(sim.instances.every((slot) => slot.partyKey === null)).toBe(true);
  });
});
