// King of the Hill (src/sim/pvp/hill.ts): the hourly schedule and the realm
// announcement, the spot (dry, open, clear of the hub, wholly inside a
// free-for-all zone, the same on every host, drawn from a private rng), the
// contest (parties as one group, the strict majority, the tie, the lapse, the
// dead), the capture notices, the Honor trickle (a minute of presence pays
// one, only inside, only holders, the payee cap, the level gate), the readout
// from each viewer's seat, the /hill and /dev hill arms, and the kill switch.
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { BUILTIN_WORLD, ZONES, zoneContaining } from '../src/sim/data';
import {
  HILL_ACCRUAL_SECONDS,
  HILL_CAPTURE_SECONDS,
  HILL_CYCLE_SECONDS,
  HILL_FIRST_AT_SECONDS,
  HILL_LOST_LINE,
  HILL_MAX_PAYEES,
  HILL_RADIUS,
  HILL_TAKEN_LINE,
  hillContains,
  hillRiseLine,
  spawnHillNow,
} from '../src/sim/pvp';
import { HILL_READOUT_NONE_LINE, pickHillSpot } from '../src/sim/pvp/hill';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';
import type { Entity, SimConfig, SimEvent, WorldContent } from '../src/sim/types';
import { DT } from '../src/sim/types';
import { groundHeight, isInWaterBody } from '../src/sim/world';

const ARENA_FREE_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};
const SEED = 7;
const FFA_IDS = ['wraithwood', 'evergarden', 'nightbloom'];

function world(extra: Partial<SimConfig> = {}): Sim {
  const sim = new Sim({
    seed: SEED,
    playerClass: 'warrior',
    noPlayer: true,
    world: ARENA_FREE_WORLD,
    ...extra,
  });
  sim.resetDay = '2026-07-08';
  return sim;
}

function ent(sim: Sim, pid: number): Entity {
  return sim.entities.get(pid)!;
}

function addPlayer(sim: Sim, name: string, level = 20): number {
  const pid = sim.addPlayer('warrior', name, { autoEquip: true, characterId: 1000 + pid0(sim) });
  sim.setPlayerLevel(level, pid);
  const e = ent(sim, pid);
  e.hp = e.maxHp;
  return pid;
}
function pid0(sim: Sim): number {
  return sim.players.size;
}

function place(sim: Sim, pid: number, x: number, z: number): void {
  const e = ent(sim, pid);
  e.pos = { x, y: groundHeight(x, z, SEED), z };
  e.prevPos = { ...e.pos };
}

/** Stand a player inside the hill (offset from the centre) or just outside it. */
function inside(sim: Sim, pid: number, dx = 0, dz = 0): void {
  const hill = sim.hillState.active!;
  place(sim, pid, hill.x + dx, hill.z + dz);
}
function outside(sim: Sim, pid: number): void {
  const hill = sim.hillState.active!;
  place(sim, pid, hill.x + hill.radius + 5, hill.z);
}

function tickSeconds(sim: Sim, seconds: number): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) seen.push(...sim.tick());
  return seen;
}

function logLines(events: SimEvent[], pid?: number): string[] {
  return events
    .filter((ev): ev is Extract<SimEvent, { type: 'log' }> => ev.type === 'log')
    .filter((ev) => (pid === undefined ? ev.pid === undefined : ev.pid === pid))
    .map((ev) => ev.text);
}

function honorEvents(events: SimEvent[], pid: number) {
  return events.filter(
    (ev): ev is Extract<SimEvent, { type: 'honor' }> => ev.type === 'honor' && ev.pid === pid,
  );
}

function jumpTo(sim: Sim, time: number): void {
  (sim as unknown as { time: number }).time = time;
}

/** A sim with a hill standing and the fighters placed inside on contested-free
 *  ground: the hill is in a free-for-all zone, so everyone is hostile already. */
function hillWorld(names: string[]): { sim: Sim; pids: number[] } {
  const sim = world();
  const pids = names.map((n) => addPlayer(sim, n));
  expect(spawnHillNow(sim.ctx, 'wraithwood')).not.toBeNull();
  // Stand everyone outside first (the presence pass runs on the tick boundary).
  for (const pid of pids) outside(sim, pid);
  sim.tick();
  sim.events = [];
  return { sim, pids };
}

describe('the schedule and the announcement', () => {
  it('rises the first hill two minutes in, in a free-for-all zone, announced to the realm', () => {
    const sim = world();
    const a = addPlayer(sim, 'Aleph');
    expect(sim.hillInfoFor(a)).toBeNull();
    jumpTo(sim, HILL_FIRST_AT_SECONDS - 2);
    tickSeconds(sim, 1);
    expect(sim.hillState.active).toBeNull();
    const seen = tickSeconds(sim, 2);
    const hill = sim.hillState.active!;
    expect(hill).not.toBeNull();
    expect(FFA_IDS).toContain(hill.zoneId);
    expect(hill.radius).toBe(HILL_RADIUS);
    const zone = ZONES.find((z) => z.id === hill.zoneId)!;
    expect(logLines(seen)).toContain(hillRiseLine(zone.name));
    expect(sim.hillInfoFor(a)).toMatchObject({
      zoneId: hill.zoneId,
      holder: 'none',
      minutesLeft: 60,
    });
  });

  it('closes the hill as the next rises an hour later, and never rises on a switched-off realm', () => {
    const sim = world();
    jumpTo(sim, HILL_FIRST_AT_SECONDS);
    tickSeconds(sim, 1);
    const first = sim.hillState.active!;
    expect(first.ordinal).toBe(0);
    jumpTo(sim, HILL_FIRST_AT_SECONDS + HILL_CYCLE_SECONDS);
    tickSeconds(sim, 1);
    const second = sim.hillState.active!;
    expect(second.ordinal).toBe(1);
    expect(`${second.x},${second.z}`).not.toBe(`${first.x},${first.z}`);
    const closed = world({ worldPvpDisabled: true });
    jumpTo(closed, HILL_FIRST_AT_SECONDS + 10);
    tickSeconds(closed, 2);
    expect(closed.hillState.active).toBeNull();
  });

  it('a realm that slept through cycles rises the current hill, not every missed one', () => {
    const sim = world();
    jumpTo(sim, HILL_FIRST_AT_SECONDS + 3 * HILL_CYCLE_SECONDS + 5);
    tickSeconds(sim, 1);
    expect(sim.hillState.active?.ordinal).toBe(3);
    expect(sim.hillState.risen).toBe(4);
  });
});

describe('the spot', () => {
  it('is dry, clear of colliders, clear of the hub, and wholly inside its zone, for every ordinal', () => {
    const sim = world();
    for (let ordinal = 0; ordinal < 12; ordinal++) {
      sim.hillState.risen = ordinal;
      const hill = spawnHillNow(sim.ctx)!;
      expect(hill, `ordinal ${ordinal}`).not.toBeNull();
      const zone = ZONES.find((z) => z.id === hill.zoneId)!;
      expect(FFA_IDS).toContain(zone.id);
      expect(isInWaterBody(hill.x, hill.z)).toBe(false);
      expect(isBlocked(SEED, hill.x, hill.z, 6)).toBe(false);
      expect(Math.hypot(hill.x - zone.hub.x, hill.z - zone.hub.z)).toBeGreaterThan(
        zone.hub.radius + 50,
      );
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rx = hill.x + Math.cos(a) * hill.radius;
        const rz = hill.z + Math.sin(a) * hill.radius;
        expect(zoneContaining(rx, rz)?.id, `ordinal ${ordinal} rim ${i}`).toBe(zone.id);
        expect(isInWaterBody(rx, rz), `ordinal ${ordinal} rim ${i}`).toBe(false);
      }
    }
  });

  it('is the same on every host for the same seed, and draws nothing from the world rng', () => {
    const a = world();
    const b = world();
    const before = a.rng.next();
    expect(b.rng.next()).toBe(before);
    const ha = spawnHillNow(a.ctx)!;
    const hb = spawnHillNow(b.ctx)!;
    expect([ha.zoneId, ha.x, ha.z]).toEqual([hb.zoneId, hb.x, hb.z]);
    const c = world();
    c.rng.next();
    expect(c.rng.next()).toBe(a.rng.next());
  });

  it('gives up when no open ground is found and the schedule retries a minute on', () => {
    const sim = world();
    const zone = ZONES.find((z) => z.id === 'wraithwood')!;
    const drowned = pickHillSpot(sim.ctx, new Rng(1), zone, {
      wet: () => true,
      steep: () => false,
      blocked: () => false,
      zoneIdAt: () => zone.id,
    });
    expect(drowned).toBeNull();
  });
});

describe('the contest', () => {
  it('a lone player takes an unheld hill after a minute inside, and is told', () => {
    const { sim, pids } = hillWorld(['Aleph']);
    const [a] = pids;
    inside(sim, a);
    tickSeconds(sim, HILL_CAPTURE_SECONDS - 1);
    expect(sim.hillState.active!.holder).toBeNull();
    expect(sim.hillInfoFor(a)).toMatchObject({
      challenger: 'you',
      challengerCount: 1,
      inside: true,
    });
    const seen = tickSeconds(sim, 2);
    expect(sim.hillState.active!.holder).toBe(`solo:${a}`);
    expect(logLines(seen, a)).toContain(HILL_TAKEN_LINE);
    expect(sim.hillInfoFor(a)).toMatchObject({
      holder: 'you',
      holderCount: 1,
      yourCount: 1,
      challenger: 'none',
      contest: 0,
    });
  });

  it('a party counts as one group; a strict majority takes the hill and the ousted are told', () => {
    const { sim, pids } = hillWorld(['Aleph', 'Bet', 'Gimel']);
    const [a, b, c] = pids;
    inside(sim, a);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 1);
    expect(sim.hillState.active!.holder).toBe(`solo:${a}`);
    // One rival inside: a tie, nothing moves.
    inside(sim, b, 5, 0);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 5);
    expect(sim.hillState.active!.holder).toBe(`solo:${a}`);
    expect(sim.hillInfoFor(b)).toMatchObject({
      holder: 'other',
      holderCount: 1,
      yourCount: 1,
      challenger: 'none',
    });
    // Two in one party beat one.
    sim.partyInvite(c, b);
    sim.partyAccept(c);
    inside(sim, c, -5, 0);
    tickSeconds(sim, 2);
    expect(sim.hillInfoFor(b)).toMatchObject({
      challenger: 'you',
      challengerCount: 2,
      yourCount: 2,
    });
    expect(sim.hillInfoFor(a)).toMatchObject({
      challenger: 'other',
      challengerCount: 2,
      holder: 'you',
    });
    sim.events = [];
    const seen = tickSeconds(sim, HILL_CAPTURE_SECONDS);
    const party = sim.partyOf(b)!;
    expect(sim.hillState.active!.holder).toBe(`party:${party.id}`);
    expect(logLines(seen, b)).toContain(HILL_TAKEN_LINE);
    expect(logLines(seen, c)).toContain(HILL_TAKEN_LINE);
    expect(logLines(seen, a)).toContain(HILL_LOST_LINE);
    expect(sim.hillInfoFor(c)).toMatchObject({ holder: 'you', holderCount: 2 });
  });

  it('a challenge that lapses starts over, and a swapped challenger restarts the clock', () => {
    const { sim, pids } = hillWorld(['Aleph', 'Bet']);
    const [a, b] = pids;
    inside(sim, a);
    tickSeconds(sim, 30);
    expect(sim.hillInfoFor(a)!.contest).toBe(30);
    outside(sim, a);
    tickSeconds(sim, 2);
    expect(sim.hillInfoFor(a)!.contest).toBe(0);
    inside(sim, a);
    tickSeconds(sim, 10);
    expect(sim.hillInfoFor(a)!.contest).toBe(10);
    // Bet walks in alone as Aleph leaves: a new challenger, a fresh clock.
    outside(sim, a);
    inside(sim, b);
    tickSeconds(sim, 3);
    expect(sim.hillInfoFor(b)).toMatchObject({ challenger: 'you', contest: 3 });
  });

  it('the dead do not count, and the holder keeps the hill while nobody beats them', () => {
    const { sim, pids } = hillWorld(['Aleph', 'Bet']);
    const [a, b] = pids;
    inside(sim, a);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 1);
    ent(sim, a).dead = true;
    inside(sim, b, 4, 0);
    tickSeconds(sim, 2);
    expect(sim.hillInfoFor(b)).toMatchObject({
      holderCount: 0,
      challenger: 'you',
      challengerCount: 1,
    });
    ent(sim, a).dead = false;
    outside(sim, b);
    tickSeconds(sim, 2);
    expect(sim.hillState.active!.holder).toBe(`solo:${a}`);
    expect(sim.hillInfoFor(a)).toMatchObject({ holder: 'you', challenger: 'none', contest: 0 });
  });
});

describe('the Honor trickle', () => {
  it('pays a holder one Honor for each minute inside, and nothing outside', () => {
    const { sim, pids } = hillWorld(['Aleph']);
    const [a] = pids;
    inside(sim, a);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 1);
    sim.events = [];
    // The capture pass banks the first second of holding, so the first payout lands
    // HILL_ACCRUAL_SECONDS - 1 after the capture.
    let seen = tickSeconds(sim, HILL_ACCRUAL_SECONDS - 3);
    expect(honorEvents(seen, a)).toEqual([]);
    seen = tickSeconds(sim, 3);
    expect(honorEvents(seen, a)).toEqual([
      { type: 'honor', pid: a, amount: 1, reason: 'hill_hold' },
    ]);
    expect(sim.meta(a)!.honor).toBe(1);
    seen = tickSeconds(sim, 4 * HILL_ACCRUAL_SECONDS);
    expect(honorEvents(seen, a)).toHaveLength(4);
    expect(sim.meta(a)!.honor).toBe(5);
    expect(sim.hillState.active!.honorPaid).toBe(5);
    outside(sim, a);
    tickSeconds(sim, 1); // the pass after leaving drops them from the books
    expect(sim.hillState.active!.accrual.has(a)).toBe(false);
    const before = sim.meta(a)!.honor;
    seen = tickSeconds(sim, 2 * HILL_ACCRUAL_SECONDS);
    expect(honorEvents(seen, a)).toEqual([]);
    expect(sim.meta(a)!.honor).toBe(before);
  });

  it('pays only the holding group, at most the cap, and never an under-level alt', () => {
    const { sim, pids } = hillWorld(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Rival', 'Novice']);
    const raid = pids.slice(0, 6);
    const [rival, novice] = pids.slice(6);
    sim.setPlayerLevel(9, novice);
    // A party caps at five, so the sixth joins after the raid conversion.
    for (const pid of raid.slice(1, 5)) {
      sim.partyInvite(pid, raid[0]);
      sim.partyAccept(pid);
    }
    sim.convertPartyToRaid(raid[0]);
    sim.partyInvite(raid[5], raid[0]);
    sim.partyAccept(raid[5]);
    expect(sim.partyOf(raid[0])!.members).toHaveLength(6);
    sim.partyInvite(novice, raid[0]);
    sim.partyAccept(novice);
    for (const [i, pid] of raid.entries()) inside(sim, pid, i * 3 - 9, 0);
    inside(sim, novice, 0, 6);
    inside(sim, rival, 0, -6);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 1);
    expect(sim.hillState.active!.holder).toBe(`party:${sim.partyOf(raid[0])!.id}`);
    sim.events = [];
    const seen = tickSeconds(sim, HILL_ACCRUAL_SECONDS + 1);
    const paid = [...raid, novice, rival].filter((pid) => honorEvents(seen, pid).length > 0);
    expect(paid).toHaveLength(HILL_MAX_PAYEES);
    expect(paid).toEqual([...raid].sort((x, y) => x - y).slice(0, HILL_MAX_PAYEES));
    expect(sim.meta(rival)!.honor).toBe(0);
    expect(sim.meta(novice)!.honor).toBe(0);
  });

  it("a capture clears the old holder's banked minute", () => {
    const { sim, pids } = hillWorld(['Aleph', 'Bet', 'Gimel']);
    const [a, b, c] = pids;
    inside(sim, a);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 30);
    sim.partyInvite(c, b);
    sim.partyAccept(c);
    inside(sim, b, 4, 0);
    inside(sim, c, -4, 0);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 1);
    expect(sim.hillState.active!.holder).toBe(`party:${sim.partyOf(b)!.id}`);
    expect(sim.hillState.active!.accrual.size).toBeLessThanOrEqual(2);
    expect(sim.meta(a)!.honor).toBe(1); // the one minute banked before the capture paid
  });
});

describe('the readout and the chat arms', () => {
  it("shows the live fields only in the hill's zone, and the /hill line names the holder", () => {
    const { sim, pids } = hillWorld(['Aleph', 'Bet']);
    const [a, b] = pids;
    inside(sim, a);
    tickSeconds(sim, HILL_CAPTURE_SECONDS + 1);
    place(sim, b, 60, 700); // Thornpeak Heights, contested ground far away
    tickSeconds(sim, 1);
    expect(sim.hillInfoFor(b)).toMatchObject({
      inZone: false,
      inside: false,
      holder: 'other',
      holderCount: 0,
      yourCount: 0,
      challenger: 'none',
      contest: 0,
      radius: 50,
    });
    expect(sim.hillInfoFor(a)).toMatchObject({
      inZone: true,
      inside: true,
      holder: 'you',
      holderCount: 1,
    });
    sim.events = [];
    sim.chat('/hill', a);
    sim.chat('/hill', b);
    const errors = sim.events.filter(
      (ev): ev is Extract<SimEvent, { type: 'error' }> => ev.type === 'error',
    );
    expect(errors.find((ev) => ev.pid === a)?.text).toBe(
      'The hill stands in The Wraithwood: your group holds it. It moves in 59 minutes.',
    );
    expect(errors.find((ev) => ev.pid === b)?.text).toBe(
      'The hill stands in The Wraithwood: another group holds it. It moves in 59 minutes.',
    );
    const quiet = world();
    const q = addPlayer(quiet, 'Quiet');
    quiet.chat('/hill', q);
    expect(
      quiet.events.some((ev) => ev.type === 'error' && ev.text === HILL_READOUT_NONE_LINE),
    ).toBe(true);
  });

  it('/dev hill rises a hill now and stands the caller on its rim (dev commands only)', () => {
    const sim = world({ devCommands: true });
    const a = addPlayer(sim, 'Aleph');
    sim.chat('/dev hill evergarden', a);
    const hill = sim.hillState.active!;
    expect(hill.zoneId).toBe('evergarden');
    expect(hillContains(hill, ent(sim, a).pos.x, ent(sim, a).pos.z)).toBe(true);
    const plain = world();
    const p = addPlayer(plain, 'Plain');
    plain.chat('/dev hill', p);
    expect(plain.hillState.active).toBeNull();
  });
});

describe('determinism', () => {
  it('two identical runs agree on the holder, every purse of honor and the rng position', () => {
    const run = () => {
      const { sim, pids } = hillWorld(['Aleph', 'Bet']);
      const [a, b] = pids;
      inside(sim, a);
      tickSeconds(sim, HILL_CAPTURE_SECONDS + HILL_ACCRUAL_SECONDS + 5);
      inside(sim, b, 3, 0);
      tickSeconds(sim, 20);
      return {
        holder: sim.hillState.active!.holder,
        honor: [sim.meta(a)!.honor, sim.meta(b)!.honor],
        contest: sim.hillState.active!.contest,
        rng: sim.rng.next(),
      };
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(first.honor).toEqual([1, 0]);
  });
});
