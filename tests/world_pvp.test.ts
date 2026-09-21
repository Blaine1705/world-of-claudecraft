// World PvP (the /pvp flag, src/sim/pvp/world_pvp.ts): the flag lifecycle
// (raise, the 5-minute disarm and its in-combat deferral, the toggle cooldown,
// the realm kill switch, the /pvp chat arms), the hostility arm in isHostileTo
// (mutual flag, party and guild exemptions, the jail and instanced-PvP arms,
// the #96 griefing invariant for everyone unflagged), the kill resolution (the
// gold stake and the honor pool split across the killing blow, the damagers
// and their healers; the grey rule; the persisted per-victim diminishing
// returns; the paid-death guard), the healer auto-flag, the books sweep, the
// persistence round trip, and the determinism guarantees.
import { describe, expect, it } from 'vitest';
import { applyHeal } from '../src/sim/combat/heal';
import { BUILTIN_WORLD } from '../src/sim/data';
import {
  WORLD_PVP_ASSIST_WINDOW,
  WORLD_PVP_DISARM_SECONDS,
  WORLD_PVP_KILL_HONOR,
  WORLD_PVP_MIN_LEVEL,
  WORLD_PVP_STAKE_CAP_COPPER,
} from '../src/sim/pvp';
import {
  WORLD_PVP_TOGGLE_COOLDOWN,
  worldPvpDefeatLine,
  worldPvpKillLine,
  worldPvpOnPlayerDamaged,
  worldPvpOnPlayerDeath,
} from '../src/sim/pvp/world_pvp';
import { Sim } from '../src/sim/sim';
import type { Entity, SimConfig, SimEvent, WorldContent } from '../src/sim/types';
import { DT } from '../src/sim/types';

// Two-or-more-player fights need no ambient world: strip the camps, NPCs and
// ground objects (the pvp_safety.test.ts precedent) so a minute of sim time is
// cheap, while every terrain field stays BUILTIN_WORLD's.
const ARENA_FREE_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

const DAY_ONE = '2026-07-08';
const DAY_TWO = '2026-07-09';

function world(extra: Partial<SimConfig> = {}): Sim {
  const sim = new Sim({
    seed: 7,
    playerClass: 'warrior',
    noPlayer: true,
    world: ARENA_FREE_WORLD,
    ...extra,
  });
  sim.resetDay = DAY_ONE;
  return sim;
}

function addFighter(sim: Sim, name: string, level = 20, characterId?: number): number {
  const pid = sim.addPlayer('warrior', name, { autoEquip: true, characterId });
  sim.setPlayerLevel(level, pid);
  const e = sim.entities.get(pid)!;
  e.hp = e.maxHp;
  return pid;
}

function ent(sim: Sim, pid: number): Entity {
  return sim.entities.get(pid)!;
}

function standTogether(sim: Sim, pids: number[]): void {
  const anchor = ent(sim, pids[0]);
  pids.slice(1).forEach((pid, i) => {
    const e = ent(sim, pid);
    e.pos = { ...anchor.pos, x: anchor.pos.x + 2 * (i + 1) };
    e.prevPos = { ...e.pos };
  });
}

function logLines(sim: Sim, pid: number): string[] {
  return sim.events
    .filter((ev): ev is Extract<SimEvent, { type: 'log' }> => ev.type === 'log' && ev.pid === pid)
    .map((ev) => ev.text);
}

function errorLines(sim: Sim, pid: number): string[] {
  return sim.events
    .filter(
      (ev): ev is Extract<SimEvent, { type: 'error' }> => ev.type === 'error' && ev.pid === pid,
    )
    .map((ev) => ev.text);
}

function honorEvents(sim: Sim, pid: number) {
  return sim.events.filter(
    (ev): ev is Extract<SimEvent, { type: 'honor' }> => ev.type === 'honor' && ev.pid === pid,
  );
}

function tickSeconds(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.tick();
}

/** Tick, collecting one player's log lines from every tick's event window
 *  (tick() RETURNS the window's events and clears the queue). */
function tickCollecting(sim: Sim, seconds: number, pid: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    for (const ev of sim.tick()) {
      if (ev.type === 'log' && ev.pid === pid) seen.push(ev.text);
    }
  }
  return seen;
}

/** Jump the sim clock without paying for the ticks (the toggle cooldown, the
 *  assist window); one tick follows so the clocks settle. */
function advanceClock(sim: Sim, seconds: number): void {
  (sim as unknown as { time: number }).time += seconds;
  sim.tick();
}

/** Past the toggle cooldown, so back-to-back flag changes are accepted. */
function cool(sim: Sim): void {
  advanceClock(sim, WORLD_PVP_TOGGLE_COOLDOWN + 1);
}

function flag(sim: Sim, pid: number, on = true): void {
  cool(sim);
  sim.setWorldPvpFlag(on, pid);
}

/** A lethal hit through the real damage hub (the same path every cast ends in). */
function slay(sim: Sim, killerPid: number, victimPid: number): void {
  const killer = ent(sim, killerPid);
  const victim = ent(sim, victimPid);
  sim.ctx.dealDamage(killer, victim, victim.hp + 1_000, false, 'physical', 'Mortal Strike', 'hit');
}

function hit(sim: Sim, attackerPid: number, victimPid: number, amount = 5): void {
  sim.ctx.dealDamage(
    ent(sim, attackerPid),
    ent(sim, victimPid),
    amount,
    false,
    'physical',
    'Slam',
    'hit',
  );
}

function heal(sim: Sim, healerPid: number, targetPid: number): void {
  const target = ent(sim, targetPid);
  target.hp = Math.max(1, target.hp - 50);
  applyHeal(sim.ctx, ent(sim, healerPid), target, 40, 'Flash Heal', null, false, false);
}

function revive(sim: Sim, pid: number): void {
  const e = ent(sim, pid);
  e.dead = false;
  e.hp = e.maxHp;
}

describe('the tuning literals the copy and the docs quote', () => {
  it('pins the level gate, the assist window, the disarm, the cooldown, the pool and the cap', () => {
    expect(WORLD_PVP_MIN_LEVEL).toBe(10);
    expect(WORLD_PVP_ASSIST_WINDOW).toBe(10);
    expect(WORLD_PVP_DISARM_SECONDS).toBe(300);
    expect(WORLD_PVP_TOGGLE_COOLDOWN).toBe(2);
    expect(WORLD_PVP_KILL_HONOR).toBe(10);
    expect(WORLD_PVP_STAKE_CAP_COPPER).toBe(50_000);
  });
});

describe('the /pvp flag lifecycle', () => {
  it('raises the flag through the command and mirrors it onto the entity', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    expect(sim.worldPvpInfoFor(a)).toEqual({
      flagged: false,
      disarmRemaining: null,
      kills: 0,
      deaths: 0,
      levelLocked: false,
    });
    sim.setWorldPvpFlag(true, a);
    expect(ent(sim, a).pvpFlag).toBe(true);
    expect(sim.meta(a)!.worldPvp).toMatchObject({
      flagged: true,
      disarmAt: null,
      kills: 0,
      deaths: 0,
    });
    expect(logLines(sim, a)).toContain('World PvP enabled: other flagged players can attack you.');
    expect(sim.worldPvpInfoFor(a)!.flagged).toBe(true);
  });

  it('refuses below the minimum level and leaves no record behind', () => {
    const sim = world();
    const a = addFighter(sim, 'Novice', 9);
    expect(sim.worldPvpInfoFor(a)!.levelLocked).toBe(true);
    sim.setWorldPvpFlag(true, a);
    expect(ent(sim, a).pvpFlag).toBeUndefined();
    expect(sim.meta(a)!.worldPvp).toBeUndefined();
    expect(errorLines(sim, a)).toContain('You must be at least level 10 to enable World PvP.');
  });

  it('refuses on a realm whose kill switch is set, and loads a saved flag down', () => {
    const open = world();
    const seed = addFighter(open, 'Seed', 20, 77);
    open.setWorldPvpFlag(true, seed);
    const saved = open.serializeCharacter(seed)!;
    const closed = world({ worldPvpDisabled: true });
    const a = addFighter(closed, 'Aleph');
    closed.setWorldPvpFlag(true, a);
    expect(ent(closed, a).pvpFlag).toBeUndefined();
    expect(errorLines(closed, a)).toContain('World PvP is disabled on this realm.');
    const loaded = closed.addPlayer('warrior', 'Seed', { state: saved, characterId: 77 });
    expect(ent(closed, loaded).pvpFlag).toBeFalsy();
    expect(closed.worldPvpInfoFor(loaded)!.flagged).toBe(false);
  });

  it('lowering starts the countdown, the flag stays up until it runs out', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    flag(sim, a);
    flag(sim, a, false);
    expect(ent(sim, a).pvpFlag).toBe(true);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(300);
    expect(logLines(sim, a)).toContain('World PvP will be disabled in 5 minutes.');
    tickSeconds(sim, WORLD_PVP_DISARM_SECONDS - 1);
    expect(ent(sim, a).pvpFlag).toBe(true);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(1);
    const seen = tickCollecting(sim, 2, a);
    expect(ent(sim, a).pvpFlag).toBe(false);
    expect(sim.worldPvpInfoFor(a)!).toMatchObject({ flagged: false, disarmRemaining: null });
    expect(seen).toContain('World PvP disabled.');
  });

  it('reports the countdown in whole seconds so the self wire elides it between seconds', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    flag(sim, a);
    flag(sim, a, false);
    for (let i = 0; i < 7; i++) {
      sim.tick();
      expect(Number.isInteger(sim.worldPvpInfoFor(a)!.disarmRemaining)).toBe(true);
    }
  });

  it('a running countdown is deferred while the player is in combat', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    flag(sim, a);
    flag(sim, a, false);
    tickSeconds(sim, WORLD_PVP_DISARM_SECONDS - 1);
    // A fight is on as the clock runs out (the engaged pass keeps inCombat up
    // for 5 s after the last blow): the flag must not fall mid-swing.
    for (let i = 0; i < 20 * 3; i++) {
      ent(sim, a).combatTimer = 0;
      sim.tick();
    }
    expect(ent(sim, a).inCombat).toBe(true);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(0);
    expect(ent(sim, a).pvpFlag).toBe(true);
    // The fight ends: the deferred drop lands on the next tick.
    ent(sim, a).combatTimer = 60;
    sim.tick();
    expect(ent(sim, a).inCombat).toBe(false);
    expect(ent(sim, a).pvpFlag).toBe(false);
  });

  it('raising again during the countdown cancels it; the toggle reads a countdown as off', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    flag(sim, a);
    flag(sim, a, false);
    flag(sim, a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeNull();
    expect(logLines(sim, a)).toContain('World PvP stays enabled.');
    tickSeconds(sim, WORLD_PVP_DISARM_SECONDS + 5);
    expect(ent(sim, a).pvpFlag).toBe(true);
    // Bare /pvp: armed -> starts the countdown; during the countdown -> re-arms.
    cool(sim);
    sim.chat('/pvp', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(300);
    cool(sim);
    sim.chat('/pvp', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeNull();
    expect(ent(sim, a).pvpFlag).toBe(true);
  });

  it('holds a cooldown between accepted changes, so the flag cannot be flapped', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(false, a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeNull();
    expect(errorLines(sim, a)).toContain('World PvP: wait a moment before switching again.');
    cool(sim);
    sim.setWorldPvpFlag(false, a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(300);
  });

  it('answers every no-op with its own error line', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    sim.setWorldPvpFlag(false, a);
    expect(errorLines(sim, a)).toContain('World PvP is already disabled.');
    flag(sim, a);
    flag(sim, a);
    expect(errorLines(sim, a)).toContain('World PvP is already enabled.');
    flag(sim, a, false);
    flag(sim, a, false);
    expect(errorLines(sim, a)).toContain('World PvP is already switching off.');
  });

  it('/pvp on|enable, /pvp off|disable, a bad argument and an extra word route through chat', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    cool(sim);
    sim.chat('/pvp enable', a);
    expect(ent(sim, a).pvpFlag).toBe(true);
    cool(sim);
    sim.chat('/pvp OFF', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(300);
    cool(sim);
    sim.chat('/pvp on', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeNull();
    cool(sim);
    sim.chat('/pvp disable', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(300);
    sim.chat('/pvp maybe', a);
    expect(errorLines(sim, a)).toContain('Usage: /pvp, /pvp on, or /pvp off.');
    sim.chat('/pvp on extra', a);
    expect(errorLines(sim, a).some((line) => line.startsWith('Unknown command: /pvp'))).toBe(true);
    // /arena and /rating keep the arena readout; /pvp no longer aliases it.
    sim.chat('/arena', a);
    expect(errorLines(sim, a).some((line) => line.startsWith('Arena: 1v1 Rating'))).toBe(true);
  });
});

describe('hostility: the world arm of isHostileTo', () => {
  it('two flagged strangers can target and auto-attack each other; unflagged pairs cannot (#96)', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    const b = addFighter(sim, 'Bet');
    standTogether(sim, [a, b]);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(false);
    flag(sim, a);
    // One-sided: a flagged player is NOT hostile to an unflagged one, either way.
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(false);
    expect(sim.isHostileTo(ent(sim, b), ent(sim, a))).toBe(false);
    flag(sim, b);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(true);
    expect(sim.isHostileTo(ent(sim, b), ent(sim, a))).toBe(true);
    // The real attack path: an auto-attack lands only once both are flagged.
    const startHp = ent(sim, b).hp;
    ent(sim, a).facing = Math.atan2(
      ent(sim, b).pos.x - ent(sim, a).pos.x,
      ent(sim, b).pos.z - ent(sim, a).pos.z,
    );
    sim.targetEntity(b, a);
    sim.startAutoAttack(a);
    tickSeconds(sim, 6);
    expect(ent(sim, b).hp).toBeLessThan(startHp);
  });

  it('an unflagged player cannot be hit by a flagged one through the swing loop', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    const b = addFighter(sim, 'Bet');
    standTogether(sim, [a, b]);
    flag(sim, a);
    const startHp = ent(sim, b).hp;
    sim.targetEntity(b, a);
    sim.startAutoAttack(a);
    tickSeconds(sim, 6);
    expect(ent(sim, b).hp).toBe(startHp);
  });

  it('party mates and guildmates are exempt both ways even when both are flagged', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    const b = addFighter(sim, 'Bet');
    const c = addFighter(sim, 'Gimel');
    for (const pid of [a, b, c]) flag(sim, pid);
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    expect(sim.partyOf(a)?.members).toContain(b);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(false);
    expect(sim.isHostileTo(ent(sim, b), ent(sim, a))).toBe(false);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, c))).toBe(true);
    sim.setPlayerGuild(a, 'Ravens');
    sim.setPlayerGuild(c, 'Ravens');
    expect(sim.isHostileTo(ent(sim, a), ent(sim, c))).toBe(false);
    expect(sim.isHostileTo(ent(sim, c), ent(sim, a))).toBe(false);
  });

  it('the jail brawl and a live battleground or arena keep the world arm off', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    const b = addFighter(sim, 'Bet');
    flag(sim, a);
    flag(sim, b);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(true);
    ent(sim, b).jailed = true;
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(false);
    expect(sim.isHostileTo(ent(sim, b), ent(sim, a))).toBe(false);
    ent(sim, b).jailed = false;
    // A live match on EITHER side suppresses the world arm (that mode's rules win).
    sim.bgMatches.set(a, { state: 'active' } as never);
    expect(sim.isHostileTo(ent(sim, b), ent(sim, a))).toBe(false);
    sim.bgMatches.delete(a);
    sim.arenaMatches.set(b, { state: 'active' } as never);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(false);
    sim.arenaMatches.delete(b);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(true);
  });

  it('an unflagged bystander is hostile to nobody and nobody is hostile to them', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    const b = addFighter(sim, 'Bet');
    const c = addFighter(sim, 'Gimel');
    flag(sim, a);
    flag(sim, b);
    expect(sim.isHostileTo(ent(sim, c), ent(sim, a))).toBe(false);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, c))).toBe(false);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(true);
  });
});

describe('kill resolution: the stake and the honor pool', () => {
  function duel(): { sim: Sim; a: number; b: number } {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1001);
    const b = addFighter(sim, 'Bet', 20, 1002);
    standTogether(sim, [a, b]);
    flag(sim, a);
    flag(sim, b);
    sim.events = [];
    return { sim, a, b };
  }

  it('a clean 1v1 moves 10% of the purse and the whole honor pool to the killer', () => {
    const { sim, a, b } = duel();
    sim.meta(b)!.copper = 20_000; // 2g: below the cap, so 10% = 20s
    sim.meta(a)!.copper = 0;
    slay(sim, a, b);
    expect(ent(sim, b).dead).toBe(true);
    expect(sim.meta(b)!.copper).toBe(18_000);
    expect(sim.meta(a)!.copper).toBe(2_000);
    expect(sim.meta(a)!.honor).toBe(10);
    expect(honorEvents(sim, a)).toEqual([
      { type: 'honor', pid: a, amount: 10, reason: 'world_kill' },
    ]);
    expect(logLines(sim, a)).toContain('You defeat Bet and take 20s from their purse.');
    expect(logLines(sim, b)).toContain('Aleph defeats you and takes 20s from your purse.');
    expect(sim.worldPvpInfoFor(a)).toMatchObject({ kills: 1, deaths: 0 });
    expect(sim.worldPvpInfoFor(b)).toMatchObject({ kills: 0, deaths: 1 });
  });

  it('the stake is capped at 5g on a rich purse', () => {
    const { sim, a, b } = duel();
    sim.meta(b)!.copper = 1_000_000; // 100g
    slay(sim, a, b);
    expect(sim.meta(b)!.copper).toBe(950_000);
    expect(sim.meta(a)!.copper).toBe(50_000);
    expect(logLines(sim, a)).toContain('You defeat Bet and take 5g from their purse.');
  });

  it('a broke victim pays nothing but the honor still flows', () => {
    const { sim, a, b } = duel();
    sim.meta(b)!.copper = 5;
    slay(sim, a, b);
    expect(sim.meta(b)!.copper).toBe(5);
    expect(sim.meta(a)!.copper).toBe(0);
    expect(sim.meta(a)!.honor).toBe(10);
    expect(logLines(sim, a)).toContain('You defeat Bet.');
    expect(logLines(sim, b)).toContain('Aleph defeats you.');
  });

  it('pays a death exactly once, even if the death hub is re-entered on the corpse', () => {
    const { sim, a, b } = duel();
    sim.meta(b)!.copper = 10_000;
    slay(sim, a, b);
    expect(sim.meta(a)!.copper).toBe(1_000);
    worldPvpOnPlayerDeath(sim.ctx, ent(sim, b), ent(sim, a));
    expect(sim.meta(a)!.copper).toBe(1_000);
    expect(sim.meta(b)!.copper).toBe(9_000);
    expect(sim.worldPvpInfoFor(b)!.deaths).toBe(1);
    // Standing up again (the next hit taken) re-arms the next real death.
    revive(sim, b);
    hit(sim, a, b);
    slay(sim, a, b);
    expect(sim.meta(a)!.copper).toBe(1_450); // the second kill of Bet today pays 50%
  });

  it('splits gold and honor across the killer, the damagers and their healers; the blow takes the remainder', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const b = addFighter(sim, 'Bet', 20, 2);
    const healer = addFighter(sim, 'Heal', 20, 3);
    const victim = addFighter(sim, 'Victim', 20, 4);
    standTogether(sim, [victim, a, b, healer]);
    for (const pid of [a, b, healer, victim]) flag(sim, pid);
    sim.meta(victim)!.copper = 10_000; // stake 1000c across 3 -> 333 each, +1 to the blow
    sim.events = [];
    hit(sim, b, victim); // b softens the victim
    heal(sim, healer, b); // the healer keeps b standing
    slay(sim, a, victim); // a lands the blow
    expect(sim.meta(a)!.copper).toBe(334);
    expect(sim.meta(b)!.copper).toBe(333);
    expect(sim.meta(healer)!.copper).toBe(333);
    expect(sim.meta(victim)!.copper).toBe(9_000);
    // The honor pool: floor(10/3) = 3 each, the blow takes the remainder.
    expect(sim.meta(a)!.honor).toBe(4);
    expect(sim.meta(b)!.honor).toBe(3);
    expect(sim.meta(healer)!.honor).toBe(3);
    expect(honorEvents(sim, b)[0]?.reason).toBe('world_assist');
    expect(honorEvents(sim, healer)[0]?.reason).toBe('world_assist');
    expect(logLines(sim, b)).toContain(
      'You defeat Victim and take 3s 33c from their purse (split 3 ways).',
    );
    expect(logLines(sim, victim)).toContain(
      'Aleph and 2 others defeat you and take 10s from your purse.',
    );
    for (const pid of [a, b, healer]) expect(sim.worldPvpInfoFor(pid)!.kills).toBe(1);
  });

  it('a two-contributor kill names one other, never "1 others"', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const b = addFighter(sim, 'Bet', 20, 2);
    const victim = addFighter(sim, 'Victim', 20, 3);
    standTogether(sim, [victim, a, b]);
    for (const pid of [a, b, victim]) flag(sim, pid);
    sim.meta(victim)!.copper = 10_000;
    sim.events = [];
    hit(sim, b, victim);
    slay(sim, a, victim);
    expect(logLines(sim, victim)).toContain(
      'Aleph and 1 other defeat you and take 10s from your purse.',
    );
  });

  it('an assist older than the window, a self-heal, and a dead-to-a-mob victim pay nothing', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const b = addFighter(sim, 'Bet', 20, 2);
    const victim = addFighter(sim, 'Victim', 20, 4);
    standTogether(sim, [victim, a, b]);
    for (const pid of [a, b, victim]) flag(sim, pid);
    sim.meta(victim)!.copper = 10_000;
    hit(sim, b, victim);
    advanceClock(sim, WORLD_PVP_ASSIST_WINDOW + 1); // b's hit ages out
    heal(sim, a, a); // self-healing is not support
    expect(sim.worldPvpBooks.recentSupport.has(a)).toBe(false);
    sim.events = [];
    slay(sim, a, victim);
    expect(sim.meta(a)!.copper).toBe(1_000);
    expect(sim.meta(b)!.copper).toBe(0);
    // A flagged player who dies to a MOB (no player behind the blow) stakes nothing.
    const mobVictim = addFighter(sim, 'Wanderer', 20, 5);
    flag(sim, mobVictim);
    sim.meta(mobVictim)!.copper = 10_000;
    sim.ctx.dealDamage(null, ent(sim, mobVictim), 100_000, false, 'physical', 'Falling', 'hit');
    expect(ent(sim, mobVictim).dead).toBe(true);
    expect(sim.meta(mobVictim)!.copper).toBe(10_000);
    expect(sim.worldPvpInfoFor(mobVictim)!.deaths).toBe(0);
  });

  it("a pet's hit is booked under its owner", () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const victim = addFighter(sim, 'Victim', 20, 2);
    flag(sim, a);
    flag(sim, victim);
    const pet = { kind: 'mob', id: 999_999, ownerId: a } as unknown as Entity;
    worldPvpOnPlayerDamaged(sim.ctx, ent(sim, victim), pet);
    expect([...sim.worldPvpBooks.recentDamage.get(victim)!.keys()]).toEqual([a]);
  });

  it('a grey victim pays that contributor nothing and is not charged for them', () => {
    const sim = world();
    const high = addFighter(sim, 'Cap', 20, 1);
    const peer = addFighter(sim, 'Peer', 14, 2);
    const low = addFighter(sim, 'Low', 14, 3);
    standTogether(sim, [low, high, peer]);
    for (const pid of [high, peer, low]) flag(sim, pid);
    sim.meta(low)!.copper = 10_000;
    hit(sim, peer, low);
    sim.events = [];
    slay(sim, high, low);
    // The level-20 blow is grey to a level-14 victim (gap 6 > 5): only the peer pays out.
    expect(sim.meta(high)!.copper).toBe(0);
    expect(sim.meta(high)!.honor).toBe(0);
    expect(sim.meta(peer)!.copper).toBe(1_000);
    expect(sim.meta(peer)!.honor).toBe(10);
    expect(sim.meta(low)!.copper).toBe(9_000);
  });

  it('repeated kills of the same victim decay 100/50/25/0 today and reset with the day', () => {
    const { sim, a, b } = duel();
    const kill = () => {
      sim.meta(b)!.copper = 10_000;
      const before = sim.meta(a)!.copper;
      const honorBefore = sim.meta(a)!.honor;
      revive(sim, b);
      hit(sim, a, b);
      slay(sim, a, b);
      return { gold: sim.meta(a)!.copper - before, honor: sim.meta(a)!.honor - honorBefore };
    };
    expect(kill()).toEqual({ gold: 1_000, honor: 10 });
    expect(kill()).toEqual({ gold: 500, honor: 5 });
    expect(kill()).toEqual({ gold: 250, honor: 2 });
    expect(kill()).toEqual({ gold: 0, honor: 0 });
    expect(sim.meta(b)!.copper).toBe(10_000); // the fully decayed kill charged nothing
    // The fully decayed fourth kill paid nothing and is not counted.
    expect(sim.meta(a)!.honorArenaDaily?.worldKillsByVictim).toEqual({ 'character:1002': 3 });
    sim.resetDay = DAY_TWO;
    expect(kill()).toEqual({ gold: 1_000, honor: 10 });
  });

  it('persists the per-victim counter with the character, so neither a relog nor a restart resets it', () => {
    const { sim, a, b } = duel();
    slay(sim, a, b);
    const state = sim.serializeCharacter(a)!;
    expect(state.honorArenaDaily?.worldKillsByVictim).toEqual({ 'character:1002': 1 });
    // A fresh realm process (a new Sim on the same day) loads the counter back.
    const next = world();
    const a2 = next.addPlayer('warrior', 'Aleph', { state, characterId: 1001 });
    const b2 = addFighter(next, 'Bet', 20, 1002);
    standTogether(next, [a2, b2]);
    flag(next, a2);
    flag(next, b2);
    next.meta(b2)!.copper = 10_000;
    const before = next.meta(a2)!.copper;
    slay(next, a2, b2);
    expect(next.meta(a2)!.copper - before).toBe(500);
  });
});

describe('the healer rule: aiding a flagged fighter raises your own flag', () => {
  it('an unflagged healer who heals a flagged player mid-fight is flagged and then credited', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const healer = addFighter(sim, 'Priest', 20, 2);
    const victim = addFighter(sim, 'Victim', 20, 3);
    standTogether(sim, [victim, a, healer]);
    flag(sim, a);
    flag(sim, victim);
    sim.meta(victim)!.copper = 10_000;
    // Not yet a fight: healing a flagged idler flags nobody.
    heal(sim, healer, a);
    expect(ent(sim, healer).pvpFlag).toBeUndefined();
    // The fight starts (the victim hits back), and the next heal flags the healer.
    hit(sim, a, victim);
    hit(sim, victim, a);
    sim.events = [];
    heal(sim, healer, a);
    expect(ent(sim, healer).pvpFlag).toBe(true);
    expect(logLines(sim, healer)).toContain(
      'World PvP enabled: you aided a flagged player in combat.',
    );
    expect(sim.isHostileTo(ent(sim, victim), ent(sim, healer))).toBe(true);
    slay(sim, a, victim);
    expect(sim.meta(healer)!.copper).toBe(500);
    expect(sim.meta(a)!.copper).toBe(500);
  });

  it('an under-level healer is left unflagged and unpaid', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const healer = addFighter(sim, 'Novice', 9, 2);
    const victim = addFighter(sim, 'Victim', 20, 3);
    standTogether(sim, [victim, a, healer]);
    flag(sim, a);
    flag(sim, victim);
    sim.meta(victim)!.copper = 10_000;
    hit(sim, a, victim);
    heal(sim, healer, a);
    expect(ent(sim, healer).pvpFlag).toBeUndefined();
    slay(sim, a, victim);
    expect(sim.meta(healer)!.copper).toBe(0);
    expect(sim.meta(a)!.copper).toBe(1_000);
  });
});

describe('the books', () => {
  it('a hit player who leaves without dying is swept from the recency rows', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const b = addFighter(sim, 'Bet', 20, 2);
    standTogether(sim, [a, b]);
    flag(sim, a);
    flag(sim, b);
    hit(sim, a, b);
    expect(sim.worldPvpBooks.recentDamage.has(b)).toBe(true);
    sim.removePlayer(b);
    tickSeconds(sim, 61);
    expect(sim.worldPvpBooks.recentDamage.has(b)).toBe(false);
  });

  it('runs the disarm pass only when a countdown is due', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    expect(sim.worldPvpBooks.nextDisarmAt).toBe(Number.POSITIVE_INFINITY);
    flag(sim, a);
    expect(sim.worldPvpBooks.nextDisarmAt).toBe(Number.POSITIVE_INFINITY);
    flag(sim, a, false);
    expect(sim.worldPvpBooks.nextDisarmAt).toBeCloseTo(sim.time + 300, 6);
    tickSeconds(sim, WORLD_PVP_DISARM_SECONDS + 1);
    expect(sim.worldPvpBooks.nextDisarmAt).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('persistence', () => {
  it('round-trips the flag, the countdown (re-anchored) and the record; an untouched character writes nothing', () => {
    const sim = world();
    const idle = addFighter(sim, 'Idle');
    expect(sim.serializeCharacter(idle)!.worldPvp).toBeUndefined();
    const a = addFighter(sim, 'Aleph');
    flag(sim, a);
    flag(sim, a, false);
    tickSeconds(sim, 100);
    sim.meta(a)!.worldPvp!.kills = 3;
    sim.meta(a)!.worldPvp!.deaths = 2;
    const saved = sim.serializeCharacter(a)!;
    expect(saved.worldPvp).toEqual({
      flagged: true,
      disarmRemaining: expect.closeTo(200, 3),
      kills: 3,
      deaths: 2,
    });
    const loaded = world();
    tickSeconds(loaded, 50); // a different sim clock: the countdown must re-anchor
    const pid = loaded.addPlayer('warrior', 'Aleph', { state: saved });
    expect(ent(loaded, pid).pvpFlag).toBe(true);
    expect(loaded.worldPvpInfoFor(pid)).toMatchObject({ flagged: true, kills: 3, deaths: 2 });
    expect(loaded.worldPvpInfoFor(pid)!.disarmRemaining).toBe(200);
    expect(loaded.worldPvpBooks.nextDisarmAt).toBeCloseTo(loaded.time + 200, 3);
    tickSeconds(loaded, 201);
    expect(ent(loaded, pid).pvpFlag).toBe(false);
  });

  it('a lowered flag with a record round-trips the record alone', () => {
    const sim = world();
    const seed = addFighter(sim, 'Seed');
    const state = sim.serializeCharacter(seed)!;
    state.worldPvp = { flagged: false, kills: 3, deaths: 2 };
    const pid = sim.addPlayer('warrior', 'Loaded', { state });
    expect(ent(sim, pid).pvpFlag).toBeFalsy();
    expect(sim.worldPvpInfoFor(pid)).toMatchObject({ flagged: false, kills: 3, deaths: 2 });
    expect(sim.serializeCharacter(pid)!.worldPvp).toEqual({ flagged: false, kills: 3, deaths: 2 });
  });

  it('tolerates malformed records: the whole thing, the countdown, a negative countdown', () => {
    const sim = world();
    const seed = addFighter(sim, 'Seed');
    const base = sim.serializeCharacter(seed)! as unknown as Record<string, unknown>;
    let n = 0;
    const load = (worldPvp: unknown) =>
      sim.addPlayer('warrior', `Loaded${n++}`, { state: { ...base, worldPvp } as never });
    const junk = load({ flagged: 'yes', kills: -4, deaths: Number.NaN, disarmRemaining: 'soon' });
    expect(ent(sim, junk).pvpFlag).toBeUndefined();
    expect(sim.meta(junk)!.worldPvp).toBeUndefined();
    const badClock = load({ flagged: true, disarmRemaining: 'soon' });
    expect(ent(sim, badClock).pvpFlag).toBe(true);
    expect(sim.worldPvpInfoFor(badClock)!.disarmRemaining).toBeNull();
    const negative = load({ flagged: true, disarmRemaining: -50 });
    expect(sim.worldPvpInfoFor(negative)!.disarmRemaining).toBe(0);
    sim.tick();
    expect(ent(sim, negative).pvpFlag).toBe(false);
  });

  it('a saved flag on a character now under the level gate loads down', () => {
    const sim = world();
    const seed = addFighter(sim, 'Seed');
    flag(sim, seed);
    const state = sim.serializeCharacter(seed)!;
    state.level = 5;
    const pid = sim.addPlayer('warrior', 'Shrunk', { state });
    expect(ent(sim, pid).pvpFlag).toBeFalsy();
    expect(sim.worldPvpInfoFor(pid)!.flagged).toBe(false);
  });
});

describe('determinism', () => {
  it('two identical runs agree on every purse, every honor balance and the rng position', () => {
    const run = () => {
      const sim = world();
      const a = addFighter(sim, 'Aleph', 20, 1);
      const b = addFighter(sim, 'Bet', 20, 2);
      standTogether(sim, [a, b]);
      flag(sim, a);
      flag(sim, b);
      sim.meta(b)!.copper = 12_345;
      sim.meta(a)!.copper = 100;
      hit(sim, b, a);
      slay(sim, a, b);
      flag(sim, a, false);
      tickSeconds(sim, 10);
      return {
        copper: [sim.meta(a)!.copper, sim.meta(b)!.copper],
        honor: [sim.meta(a)!.honor, sim.meta(b)!.honor],
        rng: sim.rng.next(),
        flag: [ent(sim, a).pvpFlag, sim.worldPvpInfoFor(a)!.disarmRemaining],
      };
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(first.copper[0] + first.copper[1]).toBe(12_445);
  });

  it('formats the kill and defeat lines the client matcher pins', () => {
    expect(worldPvpKillLine('Bet', 0, 1)).toBe('You defeat Bet.');
    expect(worldPvpKillLine('Bet', 1_234, 1)).toBe(
      'You defeat Bet and take 12s 34c from their purse.',
    );
    expect(worldPvpKillLine('Bet', 50_000, 3)).toBe(
      'You defeat Bet and take 5g from their purse (split 3 ways).',
    );
    expect(worldPvpDefeatLine('Aleph', 0, 1)).toBe('Aleph defeats you.');
    expect(worldPvpDefeatLine('Aleph', 700, 1)).toBe(
      'Aleph defeats you and takes 7s from your purse.',
    );
    expect(worldPvpDefeatLine('Aleph', 0, 2)).toBe('Aleph and 1 other defeat you.');
    expect(worldPvpDefeatLine('Aleph', 700, 2)).toBe(
      'Aleph and 1 other defeat you and take 7s from your purse.',
    );
    expect(worldPvpDefeatLine('Aleph', 0, 3)).toBe('Aleph and 2 others defeat you.');
    expect(worldPvpDefeatLine('Aleph', 700, 3)).toBe(
      'Aleph and 2 others defeat you and take 7s from your purse.',
    );
  });
});
