// World PvP (the /pvp flag, src/sim/pvp/world_pvp.ts): the flag lifecycle
// (raise, the 5-minute disarm and its in-combat deferral, the /pvp chat arms),
// the hostility arm in isHostileTo (mutual flag, party and guild exemptions,
// the #96 griefing invariant for everyone unflagged), the kill resolution (the
// gold stake and the honor pool split across the killing blow, the damagers
// and their healers; the grey rule; the per-pair diminishing returns), the
// persistence round trip, and the determinism guarantees (zero rng, ledger
// arithmetic that sums exactly).
import { describe, expect, it } from 'vitest';
import { applyHeal } from '../src/sim/combat/heal';
import { BUILTIN_WORLD } from '../src/sim/data';
import {
  WORLD_PVP_ASSIST_WINDOW,
  WORLD_PVP_DISARM_SECONDS,
  WORLD_PVP_KILL_HONOR,
  WORLD_PVP_MIN_LEVEL,
  WORLD_PVP_PAIR_DR_WINDOW,
  WORLD_PVP_STAKE_CAP_COPPER,
} from '../src/sim/pvp';
import { worldPvpDefeatLine, worldPvpKillLine } from '../src/sim/pvp/world_pvp';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent, WorldContent } from '../src/sim/types';
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

function world(): Sim {
  return new Sim({ seed: 7, playerClass: 'warrior', noPlayer: true, world: ARENA_FREE_WORLD });
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

/** Tick, collecting one player's log lines from every tick's event window. */
function tickCollecting(sim: Sim, seconds: number, pid: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    // tick() RETURNS the window's events and clears the queue.
    for (const ev of sim.tick()) {
      if (ev.type === 'log' && ev.pid === pid) seen.push(ev.text);
    }
  }
  return seen;
}

/** Jump the sim clock without paying for an hour of ticks (the DR window). */
function advanceClock(sim: Sim, seconds: number): void {
  (sim as unknown as { time: number }).time += seconds;
  sim.tick();
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
    expect(sim.meta(a)!.worldPvp).toEqual({ flagged: true, disarmAt: null, kills: 0, deaths: 0 });
    expect(logLines(sim, a)).toContain('World PvP enabled: other flagged players can attack you.');
    expect(sim.worldPvpInfoFor(a)!.flagged).toBe(true);
  });

  it('refuses below the minimum level and leaves no record behind', () => {
    const sim = world();
    const a = addFighter(sim, 'Novice', WORLD_PVP_MIN_LEVEL - 1);
    expect(sim.worldPvpInfoFor(a)!.levelLocked).toBe(true);
    sim.setWorldPvpFlag(true, a);
    expect(ent(sim, a).pvpFlag).toBeUndefined();
    expect(sim.meta(a)!.worldPvp).toBeUndefined();
    expect(errorLines(sim, a)).toContain(
      `You must be at least level ${WORLD_PVP_MIN_LEVEL} to enable World PvP.`,
    );
  });

  it('lowering starts the countdown, the flag stays up until it runs out', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(false, a);
    expect(ent(sim, a).pvpFlag).toBe(true);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(WORLD_PVP_DISARM_SECONDS);
    expect(logLines(sim, a)).toContain('World PvP will be disabled in 5 minutes.');
    tickSeconds(sim, WORLD_PVP_DISARM_SECONDS - 1);
    expect(ent(sim, a).pvpFlag).toBe(true);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeCloseTo(1, 3);
    const seen = tickCollecting(sim, 2, a);
    expect(ent(sim, a).pvpFlag).toBe(false);
    expect(sim.worldPvpInfoFor(a)!).toMatchObject({ flagged: false, disarmRemaining: null });
    expect(seen).toContain('World PvP disabled.');
  });

  it('a running countdown is deferred while the player is in combat', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(false, a);
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
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(false, a);
    sim.setWorldPvpFlag(true, a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeNull();
    expect(logLines(sim, a)).toContain('World PvP stays enabled.');
    tickSeconds(sim, WORLD_PVP_DISARM_SECONDS + 5);
    expect(ent(sim, a).pvpFlag).toBe(true);
    // Bare /pvp: armed -> starts the countdown; during the countdown -> re-arms.
    sim.chat('/pvp', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeCloseTo(WORLD_PVP_DISARM_SECONDS, 6);
    sim.chat('/pvp', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBeNull();
    expect(ent(sim, a).pvpFlag).toBe(true);
  });

  it('answers every no-op with its own error line', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    sim.setWorldPvpFlag(false, a);
    expect(errorLines(sim, a)).toContain('World PvP is already disabled.');
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(true, a);
    expect(errorLines(sim, a)).toContain('World PvP is already enabled.');
    sim.setWorldPvpFlag(false, a);
    sim.setWorldPvpFlag(false, a);
    expect(errorLines(sim, a)).toContain('World PvP is already switching off.');
  });

  it('/pvp on, /pvp off and a bad argument route through the chat command', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    sim.chat('/pvp on', a);
    expect(ent(sim, a).pvpFlag).toBe(true);
    sim.chat('/pvp OFF', a);
    expect(sim.worldPvpInfoFor(a)!.disarmRemaining).toBe(WORLD_PVP_DISARM_SECONDS);
    sim.chat('/pvp maybe', a);
    expect(errorLines(sim, a)).toContain('Usage: /pvp, /pvp on, or /pvp off.');
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
    sim.setWorldPvpFlag(true, a);
    // One-sided: a flagged player is NOT hostile to an unflagged one, either way.
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(false);
    expect(sim.isHostileTo(ent(sim, b), ent(sim, a))).toBe(false);
    sim.setWorldPvpFlag(true, b);
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
    sim.setWorldPvpFlag(true, a);
    const startHp = ent(sim, b).hp;
    sim.targetEntity(b, a);
    sim.startAutoAttack(a);
    tickSeconds(sim, 6);
    expect(ent(sim, b).hp).toBe(startHp);
  });

  it('party mates and guildmates are exempt even when both are flagged', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    const b = addFighter(sim, 'Bet');
    const c = addFighter(sim, 'Gimel');
    for (const pid of [a, b, c]) sim.setWorldPvpFlag(true, pid);
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    expect(sim.partyOf(a)?.members).toContain(b);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(false);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, c))).toBe(true);
    sim.setPlayerGuild(a, 'Ravens');
    sim.setPlayerGuild(c, 'Ravens');
    expect(sim.isHostileTo(ent(sim, a), ent(sim, c))).toBe(false);
    expect(sim.isHostileTo(ent(sim, c), ent(sim, a))).toBe(false);
  });

  it('a flagged player is friendly-targetable (heals) only by non-hostile players', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph');
    const b = addFighter(sim, 'Bet');
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(true, b);
    // isFriendlyTo is the negation of the hostile verdict for players, so a
    // flagged enemy is not a heal target and an unflagged bystander still is.
    const c = addFighter(sim, 'Gimel');
    expect(sim.isHostileTo(ent(sim, c), ent(sim, a))).toBe(false);
    expect(sim.isHostileTo(ent(sim, a), ent(sim, b))).toBe(true);
  });
});

describe('kill resolution: the stake and the honor pool', () => {
  function duel(): { sim: Sim; a: number; b: number } {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1001);
    const b = addFighter(sim, 'Bet', 20, 1002);
    standTogether(sim, [a, b]);
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(true, b);
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
    expect(sim.meta(a)!.honor).toBe(WORLD_PVP_KILL_HONOR);
    expect(honorEvents(sim, a)).toEqual([
      { type: 'honor', pid: a, amount: WORLD_PVP_KILL_HONOR, reason: 'world_kill' },
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
    expect(sim.meta(b)!.copper).toBe(1_000_000 - WORLD_PVP_STAKE_CAP_COPPER);
    expect(sim.meta(a)!.copper).toBe(WORLD_PVP_STAKE_CAP_COPPER);
    expect(logLines(sim, a)).toContain('You defeat Bet and take 5g from their purse.');
  });

  it('a broke victim pays nothing but the honor still flows', () => {
    const { sim, a, b } = duel();
    sim.meta(b)!.copper = 5;
    slay(sim, a, b);
    expect(sim.meta(b)!.copper).toBe(5);
    expect(sim.meta(a)!.copper).toBe(0);
    expect(sim.meta(a)!.honor).toBe(WORLD_PVP_KILL_HONOR);
    expect(logLines(sim, a)).toContain('You defeat Bet.');
    expect(logLines(sim, b)).toContain('Aleph defeats you.');
  });

  it('splits gold and honor across the killer, the damagers and their healers; the blow takes the remainder', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const b = addFighter(sim, 'Bet', 20, 2);
    const healer = addFighter(sim, 'Heal', 20, 3);
    const victim = addFighter(sim, 'Victim', 20, 4);
    standTogether(sim, [victim, a, b, healer]);
    for (const pid of [a, b, healer, victim]) sim.setWorldPvpFlag(true, pid);
    sim.meta(victim)!.copper = 10_000; // stake 1000c across 3 -> 333 each, +1 to the blow
    sim.events = [];
    hit(sim, b, victim); // b softens the victim
    // The healer keeps b standing (a real heal on b, recorded as support for b).
    ent(sim, b).hp = Math.max(1, ent(sim, b).hp - 50);
    applyHeal(sim.ctx, ent(sim, healer), ent(sim, b), 40, 'Flash Heal', null, false, false);
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

  it('an assist older than the window, an unflagged healer, and a dead-to-a-mob victim pay nothing', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const b = addFighter(sim, 'Bet', 20, 2);
    const bystander = addFighter(sim, 'Priest', 20, 3);
    const victim = addFighter(sim, 'Victim', 20, 4);
    standTogether(sim, [victim, a, b, bystander]);
    for (const pid of [a, b, victim]) sim.setWorldPvpFlag(true, pid);
    sim.meta(victim)!.copper = 10_000;
    hit(sim, b, victim);
    tickSeconds(sim, WORLD_PVP_ASSIST_WINDOW + 1); // b's hit ages out
    ent(sim, a).hp = Math.max(1, ent(sim, a).hp - 50);
    applyHeal(sim.ctx, ent(sim, bystander), ent(sim, a), 40, 'Flash Heal', null, false, false); // unflagged healer
    sim.events = [];
    slay(sim, a, victim);
    expect(sim.meta(a)!.copper).toBe(1_000);
    expect(sim.meta(b)!.copper).toBe(0);
    expect(sim.meta(bystander)!.copper).toBe(0);
    expect(sim.meta(bystander)!.honor).toBe(0);
    // A flagged player who dies to a MOB (no player behind the blow) stakes nothing.
    const mobVictim = addFighter(sim, 'Wanderer', 20, 5);
    sim.setWorldPvpFlag(true, mobVictim);
    sim.meta(mobVictim)!.copper = 10_000;
    sim.ctx.dealDamage(null, ent(sim, mobVictim), 100_000, false, 'physical', 'Falling', 'hit');
    expect(ent(sim, mobVictim).dead).toBe(true);
    expect(sim.meta(mobVictim)!.copper).toBe(10_000);
    expect(sim.worldPvpInfoFor(mobVictim)!.deaths).toBe(0);
  });

  it('a grey victim pays that contributor nothing and is not charged for them', () => {
    const sim = world();
    const high = addFighter(sim, 'Cap', 20, 1);
    const peer = addFighter(sim, 'Peer', 14, 2);
    const low = addFighter(sim, 'Low', 14, 3);
    standTogether(sim, [low, high, peer]);
    for (const pid of [high, peer, low]) sim.setWorldPvpFlag(true, pid);
    sim.meta(low)!.copper = 10_000;
    hit(sim, peer, low);
    sim.events = [];
    slay(sim, high, low);
    // The level-20 blow is grey to a level-14 victim (gap 6 > 5): only the peer pays out.
    expect(sim.meta(high)!.copper).toBe(0);
    expect(sim.meta(high)!.honor).toBe(0);
    expect(sim.meta(peer)!.copper).toBe(1_000);
    expect(sim.meta(peer)!.honor).toBe(WORLD_PVP_KILL_HONOR);
    expect(sim.meta(low)!.copper).toBe(9_000);
  });

  it('repeated kills of the same victim decay 100/50/25/0 and reset after the window', () => {
    const { sim, a, b } = duel();
    const kill = () => {
      sim.meta(b)!.copper = 10_000;
      const before = sim.meta(a)!.copper;
      const honorBefore = sim.meta(a)!.honor;
      const e = ent(sim, b);
      e.dead = false;
      e.hp = e.maxHp;
      slay(sim, a, b);
      return { gold: sim.meta(a)!.copper - before, honor: sim.meta(a)!.honor - honorBefore };
    };
    expect(kill()).toEqual({ gold: 1_000, honor: 10 });
    expect(kill()).toEqual({ gold: 500, honor: 5 });
    expect(kill()).toEqual({ gold: 250, honor: 2 });
    expect(kill()).toEqual({ gold: 0, honor: 0 });
    expect(sim.meta(b)!.copper).toBe(10_000); // the fully decayed kill charged nothing
    advanceClock(sim, WORLD_PVP_PAIR_DR_WINDOW + 1);
    expect(kill()).toEqual({ gold: 1_000, honor: 10 });
  });

  it('keys the diminishing returns by character id, so a relog cannot reset them', () => {
    const { sim, a, b } = duel();
    slay(sim, a, b);
    const state = sim.serializeCharacter(b)!;
    sim.removePlayer(b);
    const b2 = sim.addPlayer('warrior', 'Bet', { state, characterId: 1002 });
    const e = ent(sim, b2);
    e.dead = false;
    e.hp = e.maxHp;
    e.pos = { ...ent(sim, a).pos, x: ent(sim, a).pos.x + 2 };
    sim.meta(b2)!.copper = 10_000;
    const before = sim.meta(a)!.copper;
    slay(sim, a, b2);
    expect(sim.meta(a)!.copper - before).toBe(500);
  });
});

describe('persistence', () => {
  it('round-trips the flag, the countdown (re-anchored) and the record; an untouched character writes nothing', () => {
    const sim = world();
    const idle = addFighter(sim, 'Idle');
    expect(sim.serializeCharacter(idle)!.worldPvp).toBeUndefined();
    const a = addFighter(sim, 'Aleph');
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(false, a);
    tickSeconds(sim, 100);
    sim.meta(a)!.worldPvp!.kills = 3;
    const saved = sim.serializeCharacter(a)!;
    expect(saved.worldPvp).toEqual({
      flagged: true,
      disarmRemaining: expect.closeTo(WORLD_PVP_DISARM_SECONDS - 100, 3),
      kills: 3,
    });
    const loaded = world();
    tickSeconds(loaded, 50); // a different sim clock: the countdown must re-anchor
    const pid = loaded.addPlayer('warrior', 'Aleph', { state: saved });
    expect(ent(loaded, pid).pvpFlag).toBe(true);
    expect(loaded.worldPvpInfoFor(pid)).toMatchObject({ flagged: true, kills: 3, deaths: 0 });
    expect(loaded.worldPvpInfoFor(pid)!.disarmRemaining).toBeCloseTo(
      WORLD_PVP_DISARM_SECONDS - 100,
      3,
    );
    tickSeconds(loaded, WORLD_PVP_DISARM_SECONDS - 100 + 1);
    expect(ent(loaded, pid).pvpFlag).toBe(false);
  });

  it('tolerates a malformed record by loading unflagged', () => {
    const sim = world();
    const seed = addFighter(sim, 'Seed');
    const state = sim.serializeCharacter(seed)! as unknown as Record<string, unknown>;
    state.worldPvp = { flagged: 'yes', kills: -4, deaths: Number.NaN, disarmRemaining: 'soon' };
    const pid = sim.addPlayer('warrior', 'Loaded', { state: state as never });
    expect(ent(sim, pid).pvpFlag).toBeUndefined();
    expect(sim.meta(pid)!.worldPvp).toBeUndefined();
  });
});

describe('determinism', () => {
  it('flagging, fighting and disarming draw no rng and the ledger sums exactly', () => {
    const sim = world();
    const a = addFighter(sim, 'Aleph', 20, 1);
    const b = addFighter(sim, 'Bet', 20, 2);
    standTogether(sim, [a, b]);
    const draws = () => (sim.rng as unknown as { draws?: number }).draws;
    const before = sim.rng.next();
    const twin = world();
    const ta = addFighter(twin, 'Aleph', 20, 1);
    const tb = addFighter(twin, 'Bet', 20, 2);
    standTogether(twin, [ta, tb]);
    twin.rng.next();
    void draws;
    void before;
    sim.setWorldPvpFlag(true, a);
    sim.setWorldPvpFlag(true, b);
    sim.meta(b)!.copper = 12_345;
    sim.meta(a)!.copper = 100;
    slay(sim, a, b);
    sim.setWorldPvpFlag(false, a);
    tickSeconds(sim, 10);
    tickSeconds(twin, 10);
    // The same stream position on both: nothing here consumed a draw.
    expect(sim.rng.next()).toBe(twin.rng.next());
    expect(sim.meta(a)!.copper + sim.meta(b)!.copper).toBe(12_445);
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
    expect(worldPvpDefeatLine('Aleph', 0, 3)).toBe('Aleph and 2 others defeat you.');
    expect(worldPvpDefeatLine('Aleph', 700, 3)).toBe(
      'Aleph and 2 others defeat you and take 7s from your purse.',
    );
  });
});
