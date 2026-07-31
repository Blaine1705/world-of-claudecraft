// Direct unit tests for the rift half of issue #2653 (src/sim/rift/runs.ts):
// a mid-combat beacon/exit walk-out is remembered for a short window so a party
// cannot chain exits into a free, instant, unengaged combat reset. Unlike the
// dungeon door (instances/dungeons.ts, see tests/dungeons.test.ts), leaveRift
// never explicitly scrubs threat (the issue's own finding), so these tests
// simulate the passive reset (the mob's hate table going idle once it gives up
// chasing a target that teleported to the overworld) directly rather than
// reproducing its exact tick timing, which is unrelated pre-existing behavior.

import { describe, expect, it } from 'vitest';
import { isRiftPos } from '../src/sim/data';
import { COMBAT_EXIT_MEMORY_SECONDS } from '../src/sim/instance_exit_memory';
import { resetEvadingMob } from '../src/sim/mob/locomotion';
import { descendRift } from '../src/sim/rift/runs';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const SEED = 9001;

type AnySim = Sim & Record<string, any>;
type AnyEntity = Entity & Record<string, any>;

function makeSim(seed = 12321): AnySim {
  return new Sim({ seed, playerClass: 'warrior', noPlayer: true }) as AnySim;
}

function teleport(sim: AnySim, e: AnyEntity, x: number, z: number): void {
  e.pos = { x, y: e.pos.y, z };
  e.prevPos = { ...e.pos };
  sim.rebucket(e);
}

// Model the mob's hate table having gone idle by the time the player returns
// (whatever passive mechanism did it: the mob giving up and leashing home once
// its target teleported out of the run). This is pre-existing rift behavior,
// unrelated to the combat-exit memory fix under test here, so it is asserted
// directly rather than re-derived through however many real ticks it takes.
function simulateNaturalReset(mob: AnyEntity): void {
  mob.threat.clear();
  mob.aggroTargetId = null;
  mob.aiState = 'idle';
  mob.inCombat = false;
}

describe('rift combat-exit memory (issue #2653, no free combat reset)', () => {
  it('re-entering the same run within the memory window resumes the fight', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Fickle');
    const p = sim.entities.get(pid) as AnyEntity;
    sim.enterRift(SEED, 20, pid);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;
    expect(inst.mobIds.length).toBeGreaterThan(0);

    const mob = sim.entities.get(inst.mobIds[0]) as AnyEntity;
    teleport(sim, p, mob.pos.x + 2, mob.pos.z);
    p.maxHp = p.hp = 1_000_000;
    sim.dealDamage(p, mob, 25, false, 'physical', 'Strike', 'hit', true);
    expect(mob.inCombat).toBe(true);
    const priorThreat = mob.threat.get(pid);
    expect(priorThreat).toBeGreaterThan(0);

    sim.leaveRift(pid);
    expect(isRiftPos(p.pos.x)).toBe(false);
    expect(inst.combatExitMemory.get(pid)?.mobThreat).toEqual([[mob.id, priorThreat, 0]]);

    // The run's mob gives up on the departed player and settles before anyone
    // returns: a genuinely fresh, unengaged pack is what a walk-in would meet
    // WITHOUT the memory fix.
    simulateNaturalReset(mob);

    sim.time += 5;
    sim.enterRift(SEED, 20, pid);

    expect(sim.riftInstances.find((i: any) => i.partyKey !== null)!).toBe(inst); // same live run
    expect(mob.threat.get(pid)).toBe(priorThreat); // resumed, not a fresh pull
    expect(mob.aggroTargetId).toBe(pid);
    expect(mob.aiState).toBe('chase');
    expect(mob.inCombat).toBe(true);
    expect(inst.combatExitMemory.size).toBe(0); // consumed, not left dangling
  });

  it('waiting past the memory window earns a genuine reset, not a resumed fight', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Patient');
    const p = sim.entities.get(pid) as AnyEntity;
    sim.enterRift(SEED, 20, pid);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;
    const mob = sim.entities.get(inst.mobIds[0]) as AnyEntity;
    teleport(sim, p, mob.pos.x + 2, mob.pos.z);
    p.maxHp = p.hp = 1_000_000;
    sim.dealDamage(p, mob, 25, false, 'physical', 'Strike', 'hit', true);
    expect(mob.threat.get(pid)).toBeGreaterThan(0);

    sim.leaveRift(pid);
    simulateNaturalReset(mob);

    sim.time += COMBAT_EXIT_MEMORY_SECONDS + 1;
    sim.enterRift(SEED, 20, pid);

    expect(mob.threat.has(pid)).toBe(false); // no restore: a real fresh pull
    expect(mob.aggroTargetId).toBeNull();
    expect(mob.aiState).toBe('idle');
  });

  it('an out-of-combat beacon walk-out leaves no combat-exit memory (mob never aggroed)', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Casual');
    sim.enterRift(SEED, 20, pid);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;
    expect(inst.combatExitMemory.size).toBe(0);

    sim.leaveRift(pid);

    expect(inst.combatExitMemory.size).toBe(0);
  });

  it('a full party chaining exits and returning within the window resumes the SAME hate split, not a fresh pull', () => {
    const sim = makeSim();
    const a = sim.addPlayer('warrior', 'Left1');
    const b = sim.addPlayer('mage', 'Left2');
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    sim.enterRift(SEED, 20, a);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;
    sim.enterRift(SEED, 20, b);
    const ea = sim.entities.get(a) as AnyEntity;
    const eb = sim.entities.get(b) as AnyEntity;

    const mob = sim.entities.get(inst.mobIds[0]) as AnyEntity;
    teleport(sim, ea, mob.pos.x + 2, mob.pos.z);
    teleport(sim, eb, mob.pos.x - 2, mob.pos.z);
    ea.maxHp = ea.hp = 1_000_000;
    eb.maxHp = eb.hp = 1_000_000;
    sim.dealDamage(ea, mob, 100, false, 'physical', 'Strike', 'hit', true);
    sim.dealDamage(eb, mob, 10, false, 'fire', 'Bolt', 'hit', true);
    expect(mob.aggroTargetId).toBe(a);
    const threatA = mob.threat.get(a);
    const threatB = mob.threat.get(b);

    // Chained exits: both leave, and the run settles out of combat entirely.
    sim.leaveRift(a);
    sim.leaveRift(b);
    simulateNaturalReset(mob);

    sim.time += 5;
    sim.enterRift(SEED, 20, a);
    sim.enterRift(SEED, 20, b);

    expect(mob.threat.get(a)).toBe(threatA);
    expect(mob.threat.get(b)).toBe(threatB);
    expect(mob.aggroTargetId).toBe(a); // still the higher-threat attacker
    expect(mob.inCombat).toBe(true);
  });

  it('the race clock keeps advancing across the whole retreat-and-return (cannot be paused for free)', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Racer');
    const p = sim.entities.get(pid) as AnyEntity;
    sim.enterRift(SEED, 20, pid);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;
    const startedAt = inst.startedAt;
    const mob = sim.entities.get(inst.mobIds[0]) as AnyEntity;
    teleport(sim, p, mob.pos.x + 2, mob.pos.z);
    p.maxHp = p.hp = 1_000_000;
    sim.dealDamage(p, mob, 25, false, 'physical', 'Strike', 'hit', true);

    sim.leaveRift(pid);
    simulateNaturalReset(mob);
    sim.time += 5;
    sim.enterRift(SEED, 20, pid);

    // The exit-memory fix never touches the run clock: retreating and coming
    // back costs real race time, exactly like before.
    expect(inst.startedAt).toBe(startedAt);
  });

  it('a dead player is still blocked by the in-combat re-entry gate even with a live combat-exit memory record', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ghosty');
    const p = sim.entities.get(pid) as AnyEntity;
    sim.enterRift(SEED, 20, pid);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;
    const mob = sim.entities.get(inst.mobIds[0]) as AnyEntity;
    teleport(sim, p, mob.pos.x + 2, mob.pos.z);
    p.maxHp = p.hp = 1_000_000;
    sim.dealDamage(p, mob, 25, false, 'physical', 'Strike', 'hit', true);
    expect(mob.inCombat).toBe(true);

    sim.leaveRift(pid);
    expect(inst.combatExitMemory.has(pid)).toBe(true); // a live memory record exists

    // The mob never stopped fighting (leaveRift only relocates the leaver, not
    // the mob), so the existing anti-zerg death rule must still bar a ghost.
    p.hp = 0;
    p.dead = true;
    p.ghost = true;
    p.pos = { x: inst.returnPos.x, y: 0, z: inst.returnPos.z };
    p.prevPos = { ...p.pos };
    sim.drainEvents();
    sim.enterRift(SEED, 20, pid);

    expect(isRiftPos(p.pos.x), 'the existing in-combat ghost gate still bars entry').toBe(false);
    expect(inst.combatExitMemory.has(pid), 'the blocked attempt never consumed the memory').toBe(
      true,
    );
  });

  it('does not resume a snapshot onto a mob that has fully evade-reset and been freshly re-pulled since', () => {
    const sim = makeSim();
    const a = sim.addPlayer('warrior', 'Wanderer');
    const b = sim.addPlayer('warrior', 'Tank');
    sim.enterRift(SEED, 20, a);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;
    const mob = sim.entities.get(inst.mobIds[0]) as AnyEntity;
    const ea = sim.entities.get(a) as AnyEntity;
    teleport(sim, ea, mob.pos.x + 2, mob.pos.z);
    ea.maxHp = ea.hp = 1_000_000;
    sim.dealDamage(ea, mob, 100, false, 'physical', 'Strike', 'hit', true);
    expect(mob.threat.get(a)).toBeGreaterThan(0);

    sim.leaveRift(a);
    expect(inst.combatExitMemory.size).toBe(1);

    // The pack fully evades home (a real evade-home reset, not the hand-rolled
    // simulateNaturalReset above) before A returns: this is a genuinely
    // DIFFERENT pull now.
    resetEvadingMob(sim.ctx, mob);
    expect(mob.inCombat).toBe(false);

    // The tank joins and re-pulls the same mob fresh, at a much lower threat
    // than A's stale snapshot.
    sim.enterRift(SEED, 20, b);
    const eb = sim.entities.get(b) as AnyEntity;
    teleport(sim, eb, mob.pos.x + 2, mob.pos.z);
    eb.maxHp = eb.hp = 1_000_000;
    sim.dealDamage(eb, mob, 25, false, 'physical', 'Strike', 'hit', true);
    const freshThreat = mob.threat.get(b);
    expect(freshThreat).toBeGreaterThan(0);
    expect(mob.aggroTargetId).toBe(b);

    // A walks back in inside the original memory window: the stale, much
    // higher snapshot must NOT be grafted onto this new pull and rip the
    // tank's aggro.
    sim.time += 5;
    sim.enterRift(SEED, 20, a);

    expect(mob.threat.has(a)).toBe(false);
    expect(mob.threat.get(b)).toBe(freshThreat);
    expect(mob.aggroTargetId).toBe(b);
  });

  it('descending a floor clears any dangling combat-exit memory from the cleared floor', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Descender');
    sim.enterRift(SEED, 20, pid);
    const inst = sim.riftInstances.find((i: any) => i.partyKey !== null)!;

    // A dangling record left behind by some other party member (e.g. one who
    // exited mid-combat and never returned before the floor was cleared and
    // descended) must not survive the floor teardown, or a lucky reissued id
    // on the next floor could resolve a lookup against it.
    inst.combatExitMemory.set(999, {
      expiresAt: sim.time + COMBAT_EXIT_MEMORY_SECONDS,
      mobThreat: [[inst.mobIds[0], 500, 0]],
    });
    expect(inst.combatExitMemory.size).toBe(1);

    inst.descentOpen = true;
    inst.floorIndex = 0;
    descendRift(sim.ctx, pid);

    expect(inst.combatExitMemory.size).toBe(0);
  });
});
