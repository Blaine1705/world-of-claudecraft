// King of the Hill: the system half, behind the SimContext seam.
//
// Once an hour (HILL_CYCLE_SECONDS) a hill rises in one of the free-for-all
// zones (world_pvp_zones.ts): a HILL_RADIUS circle on dry, open ground, clear
// of the water, the hub settlement and every collider, wholly inside its
// zone. Everyone standing in that zone is already hostile to every stranger
// there (the free-for-all arm of world_pvp.ts), so the hill needs no flag of
// its own. Once a second the presence pass counts the players inside the
// circle by GROUP (a party or raid is one group, an ungrouped player a group
// of one, hill_rules.ts hillGroupKey); the largest group that beats the
// holder's present count by a strict majority is the challenger, and after
// HILL_CAPTURE_SECONDS of unbroken majority it takes the hill (a tie never
// moves it; a challenge that lapses starts over). Every holder standing inside
// banks a second of presence per pass, and each HILL_ACCRUAL_SECONDS pays
// HILL_HONOR_PER_PAYOUT Honor, to at most HILL_MAX_PAYEES of them at once.
//
// State lives on the Sim as ONE live view (`ctx.hillState`), never in this
// module: the modules hold functions, the Sim holds state (src/sim/CLAUDE.md).
// Session-only and never persisted: a realm restart rises the next hill on
// its own clock, and the hour's accruals are not worth a blob field.
//
// The spot probe (the terrain, the water, the colliders) is bound by the Sim
// (hill_probe.ts) and read through `ctx.hillProbe`, never imported here: the
// pvp barrel must not reach the terrain modules (an import cycle).
//
// Determinism: the spawn draws from a PRIVATE rng derived from the seed and
// the hill's ordinal (the natural rift portal precedent), so the world's own
// rng stream never moves for a hill and every host resolves the same spot; the
// schedule, the contest clock and the accruals run on ctx.time and
// ctx.tickCount. No DOM, no wall clock.

import { zoneContaining } from '../data';
import { Rng } from '../rng';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { Entity, ZoneDef } from '../types';
import {
  HILL_ACCRUAL_SECONDS,
  HILL_CAPTURE_SECONDS,
  HILL_CYCLE_SECONDS,
  HILL_EDGE_MARGIN,
  HILL_HONOR_PER_PAYOUT,
  HILL_HUB_MARGIN,
  HILL_RADIUS,
  HILL_SPAWN_ATTEMPTS,
  type HillSpotProbe,
  hillChallengeStands,
  hillContains,
  hillContestStep,
  hillGroupKey,
  hillLeader,
  hillOrdinalAt,
  hillPayees,
  hillRiseTime,
  hillSpotIsOpen,
} from './hill_rules';
import { grantHonor } from './honor';
import { WORLD_PVP_MIN_LEVEL } from './world_pvp_rules';
import { worldPvpFfaZones } from './world_pvp_zones';

/** One standing hill. */
export interface ActiveHill {
  ordinal: number;
  zoneId: string;
  x: number;
  z: number;
  radius: number;
  /** Sim time it closes (the next hill's rise). */
  closesAt: number;
  /** The holding group's key (hillGroupKey), or null while unheld. */
  holder: string | null;
  /** The leading challenger's key and its banked seconds of majority. */
  challenger: string | null;
  contest: number;
  /** Last presence pass: group key -> members inside; pid -> group key. */
  counts: Map<string, number>;
  insideKeys: Map<number, string>;
  /** pid -> seconds of paid presence banked toward the next payout. */
  accrual: Map<number, number>;
  /** Honor paid out by this hill so far (the readout and the tests). */
  honorPaid: number;
}

/** The Sim-owned session state, exposed on SimContext as a live view. */
export interface HillState {
  active: ActiveHill | null;
  /** Hills risen so far (the next one's ordinal is this). */
  risen: number;
  /** Sim time of the next spawn attempt; a failed attempt retries a minute on. */
  nextAt: number;
}

export function newHillState(): HillState {
  return { active: null, risen: 0, nextAt: hillRiseTime(0) };
}

const PASS_TICKS = 20;
const RETRY_SECONDS = 60;
const NOTICE_COLOR = '#ffd100';
const RISE_COLOR = '#f0c060';

/** The notice lines the client matcher re-localizes (src/ui/sim_i18n.ts). The
 *  rise line carries the zone's English name, localized by the matcher's zone
 *  rule like the rift portal lines. */
export function hillRiseLine(zoneName: string): string {
  return `A hill has risen in ${zoneName}: hold it to earn Honor.`;
}
export const HILL_TAKEN_LINE = 'Your group holds the hill.';
export const HILL_LOST_LINE = 'Another group has taken the hill.';

function hillRng(ctx: SimContext, ordinal: number): Rng {
  return new Rng((ctx.cfg.seed ^ Math.imul(ordinal + 1, 0x7f4a7c15) ^ 0x5bd1e995) >>> 0);
}

/** A legal spot for a hill in `zone`, or null when HILL_SPAWN_ATTEMPTS random
 *  tries found none (the caller retries later). */
export function pickHillSpot(
  ctx: SimContext,
  rng: Rng,
  zone: ZoneDef,
  probe: HillSpotProbe = ctx.hillProbe,
): { x: number; z: number } | null {
  const pad = HILL_RADIUS + HILL_EDGE_MARGIN;
  const xMin = (zone.xMin ?? -180) + pad;
  const xMax = (zone.xMax ?? 180) - pad;
  const zMin = zone.zMin + pad;
  const zMax = zone.zMax - pad;
  if (xMin >= xMax || zMin >= zMax) return null;
  const hubClear = zone.hub.radius + HILL_RADIUS + HILL_HUB_MARGIN;
  for (let attempt = 0; attempt < HILL_SPAWN_ATTEMPTS; attempt++) {
    const x = rng.range(xMin, xMax);
    const z = rng.range(zMin, zMax);
    if (Math.hypot(x - zone.hub.x, z - zone.hub.z) < hubClear) continue;
    if (!hillSpotIsOpen(probe, zone.id, x, z, HILL_RADIUS)) continue;
    return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }
  return null;
}

function announce(ctx: SimContext, text: string, color: string): void {
  ctx.emit({ type: 'log', text, color });
}

function notice(ctx: SimContext, pid: number, text: string, color = NOTICE_COLOR): void {
  ctx.emit({ type: 'log', text, color, pid });
}

/**
 * Raise hill `ordinal` in a free-for-all zone (a random one by the private
 * rng, or `zoneId` when given: the /dev arm and the tests). Returns the hill,
 * or null when no legal spot was found this attempt. A standing hill closes
 * as the new one rises.
 */
export function spawnHill(ctx: SimContext, ordinal: number, zoneId?: string): ActiveHill | null {
  const zones = worldPvpFfaZones();
  if (zones.length === 0) return null;
  const rng = hillRng(ctx, ordinal);
  const zone = zoneId ? zones.find((z) => z.id === zoneId) : zones[rng.int(0, zones.length - 1)];
  if (!zone) return null;
  const spot = pickHillSpot(ctx, rng, zone);
  if (!spot) return null;
  const hill: ActiveHill = {
    ordinal,
    zoneId: zone.id,
    x: spot.x,
    z: spot.z,
    radius: HILL_RADIUS,
    closesAt: hillRiseTime(ordinal + 1),
    holder: null,
    challenger: null,
    contest: 0,
    counts: new Map(),
    insideKeys: new Map(),
    accrual: new Map(),
    honorPaid: 0,
  };
  ctx.hillState.active = hill;
  announce(ctx, hillRiseLine(zone.name), RISE_COLOR);
  return hill;
}

/** The /dev arm: rise a hill now, closing any that stands, on the next
 *  ordinal (so its spot is the one the schedule would have picked). It
 *  stands a full cycle from now, and the schedule resumes when it closes. */
export function spawnHillNow(ctx: SimContext, zoneId?: string): ActiveHill | null {
  const state = ctx.hillState;
  const hill = spawnHill(ctx, state.risen, zoneId);
  if (!hill) return null;
  hill.closesAt = ctx.time + HILL_CYCLE_SECONDS;
  state.risen += 1;
  state.nextAt = hill.closesAt;
  return hill;
}

/** The schedule: rise the hill whose time has come, retry a failed spot a
 *  minute on, never rise on a realm whose World PvP switch is set. */
function updateSchedule(ctx: SimContext): void {
  const state = ctx.hillState;
  if (ctx.time < state.nextAt) return;
  const due = hillOrdinalAt(ctx.time);
  if (due < 0) return;
  // A realm that slept through several cycles (or a sim clock jumped forward)
  // rises the CURRENT hill, not every missed one in turn.
  const ordinal = Math.max(due, state.risen);
  const hill = spawnHill(ctx, ordinal);
  if (!hill) {
    state.nextAt = ctx.time + RETRY_SECONDS;
    return;
  }
  state.risen = ordinal + 1;
  state.nextAt = hill.closesAt;
}

/** The presence pass: who stands inside, by group. */
function countInside(ctx: SimContext, hill: ActiveHill): void {
  hill.counts.clear();
  hill.insideKeys.clear();
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e || e.dead || !hillContains(hill, e.pos.x, e.pos.z)) continue;
    const key = hillGroupKey(e.id, ctx.partyOf(e.id));
    hill.insideKeys.set(e.id, key);
    hill.counts.set(key, (hill.counts.get(key) ?? 0) + 1);
  }
}

/** The contest clock: the leader beats the holder for HILL_CAPTURE_SECONDS
 *  of unbroken majority and takes the hill. Tells everyone inside. */
function updateContest(ctx: SimContext, hill: ActiveHill, dt: number): void {
  const holderCount = hill.holder === null ? 0 : (hill.counts.get(hill.holder) ?? 0);
  const leader = hillLeader(hill.counts);
  const challenger =
    leader && leader.key !== hill.holder && hillChallengeStands(leader.count, holderCount)
      ? leader.key
      : null;
  hill.contest = hillContestStep(
    hill.contest,
    challenger !== null,
    challenger === hill.challenger,
    dt,
  );
  hill.challenger = challenger;
  if (challenger === null || hill.contest < HILL_CAPTURE_SECONDS) return;
  const ousted = hill.holder;
  hill.holder = challenger;
  hill.challenger = null;
  hill.contest = 0;
  hill.accrual.clear();
  for (const [pid, key] of hill.insideKeys) {
    if (key === challenger) notice(ctx, pid, HILL_TAKEN_LINE);
    else if (key === ousted) notice(ctx, pid, HILL_LOST_LINE);
  }
}

/** The trickle: every holder inside (up to HILL_MAX_PAYEES, by pid) banks
 *  this pass; a full minute pays one Honor. Under WORLD_PVP_MIN_LEVEL a
 *  player banks nothing (an alt parked on the hill earns its party nothing). */
function payHolders(ctx: SimContext, hill: ActiveHill, dt: number): void {
  if (hill.holder === null) return;
  const inside: number[] = [];
  for (const [pid, key] of hill.insideKeys) if (key === hill.holder) inside.push(pid);
  const payees = new Set(hillPayees(inside));
  for (const pid of hill.accrual.keys()) if (!payees.has(pid)) hill.accrual.delete(pid);
  for (const pid of payees) {
    const meta: PlayerMeta | undefined = ctx.players.get(pid);
    const e: Entity | undefined = ctx.entities.get(pid);
    if (!meta || !e || e.level < WORLD_PVP_MIN_LEVEL) continue;
    const banked = (hill.accrual.get(pid) ?? 0) + dt;
    if (banked < HILL_ACCRUAL_SECONDS) {
      hill.accrual.set(pid, banked);
      continue;
    }
    hill.accrual.set(pid, banked - HILL_ACCRUAL_SECONDS);
    hill.honorPaid += grantHonor(ctx, meta, HILL_HONOR_PER_PAYOUT, 'hill_hold');
  }
}

/**
 * Per-tick entry (the sim's world-PvP lap): once a second run the schedule,
 * the presence pass, the contest clock and the payouts. Draws no rng from the
 * world stream. A realm whose World PvP switch is set never rises a hill and
 * drops a standing one.
 */
export function updateHill(ctx: SimContext): void {
  if (ctx.tickCount % PASS_TICKS !== 0) return;
  const state = ctx.hillState;
  if (ctx.worldPvpDisabled) {
    state.active = null;
    return;
  }
  const hill = state.active;
  if (hill && ctx.time >= hill.closesAt) state.active = null;
  updateSchedule(ctx);
  const live = state.active;
  if (!live) return;
  const dt = PASS_TICKS * (1 / 20);
  countInside(ctx, live);
  updateContest(ctx, live, dt);
  payHolders(ctx, live, dt);
}

/** The IWorld readout for one viewer (src/world_api/world_pvp.ts HillInfo).
 *  The live fields are zero for a viewer outside the hill's zone, so the self
 *  wire elides the readout for everyone else between holder changes. */
export function hillInfoFor(
  ctx: SimContext,
  pid: number,
): import('../../world_api').HillInfo | null {
  const hill = ctx.hillState.active;
  if (!hill) return null;
  const e = ctx.entities.get(pid);
  if (!e || e.kind !== 'player') return null;
  const key = hillGroupKey(pid, ctx.partyOf(pid));
  const side = (group: string | null): 'none' | 'you' | 'other' =>
    group === null ? 'none' : group === key ? 'you' : 'other';
  const inZone = zoneContaining(e.pos.x, e.pos.z)?.id === hill.zoneId;
  const minutesLeft = Math.max(0, Math.ceil((hill.closesAt - ctx.time) / 60));
  const base = {
    zoneId: hill.zoneId,
    x: hill.x,
    z: hill.z,
    radius: hill.radius,
    minutesLeft,
    inZone,
    holder: side(hill.holder),
  };
  if (!inZone) {
    return {
      ...base,
      inside: false,
      holderCount: 0,
      yourCount: 0,
      challenger: 'none',
      challengerCount: 0,
      contest: 0,
    };
  }
  return {
    ...base,
    inside: hill.insideKeys.has(pid),
    holderCount: hill.holder === null ? 0 : (hill.counts.get(hill.holder) ?? 0),
    yourCount: hill.counts.get(key) ?? 0,
    challenger: side(hill.challenger),
    challengerCount: hill.challenger === null ? 0 : (hill.counts.get(hill.challenger) ?? 0),
    contest: Math.floor(hill.contest),
  };
}

/** The whole-cycle length, for the readouts that quote it. */
export const HILL_CYCLE_MINUTES = Math.round(HILL_CYCLE_SECONDS / 60);

export const HILL_READOUT_NONE_LINE = 'No hill stands right now.';

/** The /hill chat readout: where the hill stands, who holds it from this
 *  player's seat, and when it moves. Three shapes plus the no-hill line, each
 *  re-localized by the client matcher (the zone name through its zone rule). */
export function hillReadoutLine(ctx: SimContext, pid: number): string {
  const info = hillInfoFor(ctx, pid);
  if (!info) return HILL_READOUT_NONE_LINE;
  const zoneName = worldPvpFfaZones().find((z) => z.id === info.zoneId)?.name ?? info.zoneId;
  const held =
    info.holder === 'you'
      ? 'your group holds it'
      : info.holder === 'other'
        ? 'another group holds it'
        : 'nobody holds it';
  return `The hill stands in ${zoneName}: ${held}. It moves in ${info.minutesLeft} minutes.`;
}
