// World PvP (the /pvp flag): the system half, behind the SimContext seam.
//
// A player raises the flag with /pvp (or the World PvP tab of the PvP window)
// and becomes attackable by, and able to attack, every other flagged player
// who is not in their party or guild, anywhere in the open world. Lowering it
// takes WORLD_PVP_DISARM_SECONDS, and the drop waits for combat to end. A kill
// moves a gold stake (world_pvp_rules.ts worldPvpStake) from the victim's purse
// to everyone who worked for it, and pays the same people a share of the honor
// pool: the killing blow, everyone who damaged the victim inside the assist
// window, and every healer who kept one of those damagers standing. Healing a
// flagged player who is in a world fight raises the healer's own flag (the
// classic rule), so nobody can carry a fight from behind a flag they do not
// wear. The books that remember who hit and healed whom live on the Sim as ONE
// live view (`ctx.worldPvpBooks`), never inside this module: the modules hold
// functions, the Sim holds state (src/sim/CLAUDE.md).
//
// Authority and persistence: `PlayerMeta.worldPvp` is the truth (persisted in
// the character blob, absent until the character first raises the flag so an
// unflagged save stays byte-identical); `Entity.pvpFlag` is the display mirror
// that rides the entity wire, written ONLY here, the away.ts precedent. The
// per-victim diminishing returns ride the persisted UTC-day honor window
// (honor.ts `worldKillsByVictim`), the arena's own anti-farm precedent, so a
// realm restart cannot reset them.
//
// Host-agnostic: no DOM, no rng, no wall clock. The disarm clock and the assist
// window run on `ctx.time` (tick math), so the offline Sim, the server, and the
// headless env resolve every flag and every kill identically.

import { formatMoney } from '../format_money';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';
import { grantHonor, noteWorldKill, worldKillRepeats } from './honor';
import {
  WORLD_PVP_ASSIST_WINDOW,
  WORLD_PVP_DISARM_SECONDS,
  WORLD_PVP_KILL_HONOR,
  WORLD_PVP_MIN_LEVEL,
  worldPvpPairHostile,
  worldPvpPairMultiplier,
  worldPvpSplit,
  worldPvpStake,
  worldPvpVictimIsGrey,
} from './world_pvp_rules';

/** The authoritative per-character flag state (PlayerMeta.worldPvp). */
export interface WorldPvpMetaState {
  /** Attackable by, and able to attack, other flagged players right now. Stays
   *  true through the whole disarm countdown. */
  flagged: boolean;
  /** Sim time the flag drops after /pvp off, or null while armed for good (or
   *  not flagged at all). */
  disarmAt: number | null;
  /** Career world kills this character was paid for (every contributor counts,
   *  the classic honorable-kill tally) and career deaths to flagged players. */
  kills: number;
  deaths: number;
  /** Sim time of the last accepted raise/lower/cancel: the toggle cooldown
   *  (WORLD_PVP_TOGGLE_COOLDOWN) reads it. Session-only, never persisted. */
  changedAt?: number;
}

/** The persisted shape (CharacterState.worldPvp). The countdown is stored as
 *  the REMAINING seconds, re-anchored to the loading sim's clock, because sim
 *  time restarts at zero on every boot (the node-readiness precedent). */
export interface WorldPvpSavedState {
  flagged: boolean;
  disarmRemaining?: number;
  kills?: number;
  deaths?: number;
}

/** The Sim-owned session books, exposed on SimContext as a live view. The two
 *  recency maps are pruned on every write and cleared on every death, and the
 *  once-a-minute sweep (`updateWorldPvp`) drops any row whose subject has left
 *  the world or whose last stamp aged out of the window, so a player who was
 *  hit and then logged out without dying never leaves a row behind. Bounded by
 *  the players trading blows in the last window, never by realm age. */
export interface WorldPvpBooks {
  /** victim pid -> attacker pid -> sim time of the last enemy hit. */
  recentDamage: Map<number, Map<number, number>>;
  /** ally pid -> healer pid -> sim time of the last heal. */
  recentSupport: Map<number, Map<number, number>>;
  /** Victims whose death already paid, so a re-entrant handleDeath on a corpse
   *  can never pay the kill twice. A pid leaves the set the moment the player
   *  is seen alive again (their next hit taken) and on the sweep. */
  paidDeaths: Set<number>;
  /** The earliest pending disarm (sim time), Infinity when nobody is switching
   *  off: the per-tick pass is skipped entirely until then, so a realm with no
   *  countdown running pays one comparison per tick, not a roster walk. */
  nextDisarmAt: number;
  sweptAtTick: number;
}

export function newWorldPvpBooks(): WorldPvpBooks {
  return {
    recentDamage: new Map(),
    recentSupport: new Map(),
    paidDeaths: new Set(),
    nextDisarmAt: Number.POSITIVE_INFINITY,
    sweptAtTick: 0,
  };
}

const SWEEP_TICKS = 20 * 60;
/** Seconds between accepted flag changes: a client cannot flap the flag at
 *  wire rate and burn the world loop on notices. */
export const WORLD_PVP_TOGGLE_COOLDOWN = 2;
const NOTICE_COLOR = '#ffd100';
const DEFEATED_COLOR = '#ff5555';

export function isWorldPvpFlagged(meta: PlayerMeta): boolean {
  return meta.worldPvp?.flagged === true;
}

/** Seconds until the flag drops, or null when it is not switching off. Never
 *  negative: a deferred drop (still in combat) reads as 0. */
export function worldPvpDisarmRemaining(meta: PlayerMeta, now: number): number | null {
  const state = meta.worldPvp;
  if (!state || !state.flagged || state.disarmAt === null) return null;
  return Math.max(0, state.disarmAt - now);
}

function ensureState(meta: PlayerMeta): WorldPvpMetaState {
  if (!meta.worldPvp) meta.worldPvp = { flagged: false, disarmAt: null, kills: 0, deaths: 0 };
  return meta.worldPvp;
}

function playerOf(ctx: SimContext, pid: number): { e: Entity; meta: PlayerMeta } | null {
  const e = ctx.entities.get(pid);
  const meta = ctx.players.get(pid);
  return e && e.kind === 'player' && meta ? { e, meta } : null;
}

function notice(ctx: SimContext, pid: number, text: string, color = NOTICE_COLOR): void {
  ctx.emit({ type: 'log', text, color, pid });
}

/** The disarm delay in whole minutes, for the notice line. */
export const WORLD_PVP_DISARM_MINUTES = Math.round(WORLD_PVP_DISARM_SECONDS / 60);

function raiseFlag(ctx: SimContext, e: Entity, meta: PlayerMeta, text: string): void {
  const state = ensureState(meta);
  state.flagged = true;
  state.disarmAt = null;
  state.changedAt = ctx.time;
  e.pvpFlag = true;
  notice(ctx, e.id, text);
}

/**
 * Raise or lower the flag. Raising it during the disarm countdown cancels the
 * countdown (the flag never dropped, so nothing re-announces the enable).
 * Lowering it starts the countdown; the actual drop is updateWorldPvp's.
 * Returns true when the request changed something; every refusal and every
 * no-op tells the player why through the error channel.
 */
export function setWorldPvpFlag(ctx: SimContext, pid: number, enabled: boolean): boolean {
  const r = playerOf(ctx, pid);
  if (!r) return false;
  const current = r.meta.worldPvp;
  if (
    current?.changedAt !== undefined &&
    ctx.time - current.changedAt < WORLD_PVP_TOGGLE_COOLDOWN
  ) {
    ctx.error(pid, 'World PvP: wait a moment before switching again.');
    return false;
  }
  if (enabled) {
    if (current?.flagged && current.disarmAt === null) {
      ctx.error(pid, 'World PvP is already enabled.');
      return false;
    }
    if (ctx.worldPvpDisabled) {
      ctx.error(pid, 'World PvP is disabled on this realm.');
      return false;
    }
    if (r.e.level < WORLD_PVP_MIN_LEVEL) {
      ctx.error(pid, `You must be at least level ${WORLD_PVP_MIN_LEVEL} to enable World PvP.`);
      return false;
    }
    if (current?.flagged) {
      // Mid-countdown: keep the flag, drop the clock.
      current.disarmAt = null;
      current.changedAt = ctx.time;
      notice(ctx, pid, 'World PvP stays enabled.');
      return true;
    }
    raiseFlag(ctx, r.e, r.meta, 'World PvP enabled: other flagged players can attack you.');
    return true;
  }
  if (!current?.flagged) {
    ctx.error(pid, 'World PvP is already disabled.');
    return false;
  }
  if (current.disarmAt !== null) {
    ctx.error(pid, 'World PvP is already switching off.');
    return false;
  }
  current.disarmAt = ctx.time + WORLD_PVP_DISARM_SECONDS;
  current.changedAt = ctx.time;
  const books = ctx.worldPvpBooks;
  books.nextDisarmAt = Math.min(books.nextDisarmAt, current.disarmAt);
  notice(ctx, pid, `World PvP will be disabled in ${WORLD_PVP_DISARM_MINUTES} minutes.`);
  return true;
}

/** The bare /pvp: off when armed, on otherwise (an ongoing countdown counts as
 *  "wants it off", so /pvp during one turns it back on, the classic toggle). */
export function toggleWorldPvpFlag(ctx: SimContext, pid: number): boolean {
  const meta = ctx.players.get(pid);
  const armed = meta?.worldPvp?.flagged === true && meta.worldPvp.disarmAt === null;
  return setWorldPvpFlag(ctx, pid, !armed);
}

/** Drop the rows the sweep no longer needs: a subject who left the world, a
 *  roster whose every stamp aged out, a paid death whose victim stands again. */
function sweepBooks(ctx: SimContext, books: WorldPvpBooks): void {
  for (const book of [books.recentDamage, books.recentSupport]) {
    for (const [subject, roster] of book) {
      for (const [pid, at] of roster) {
        if (ctx.time - at > WORLD_PVP_ASSIST_WINDOW) roster.delete(pid);
      }
      if (roster.size === 0 || !ctx.entities.has(subject)) book.delete(subject);
    }
  }
  for (const pid of books.paidDeaths) {
    const e = ctx.entities.get(pid);
    if (!e || !e.dead) books.paidDeaths.delete(pid);
  }
}

/**
 * Per-tick: drop every flag whose countdown has run out, unless its owner is
 * still in combat (a flag can never fall mid-fight and fizzle the blow already
 * on its way). The roster walk runs only once the earliest pending countdown
 * is due (`nextDisarmAt`); a deferred drop keeps it due every tick until the
 * fight ends. Draws no rng. Once a minute the books are swept (above).
 */
export function updateWorldPvp(ctx: SimContext): void {
  const books = ctx.worldPvpBooks;
  if (ctx.time >= books.nextDisarmAt) {
    let next = Number.POSITIVE_INFINITY;
    for (const meta of ctx.players.values()) {
      const state = meta.worldPvp;
      if (!state || !state.flagged || state.disarmAt === null) continue;
      const e = ctx.entities.get(meta.entityId);
      if (!e) continue;
      if (ctx.time < state.disarmAt) {
        next = Math.min(next, state.disarmAt);
        continue;
      }
      if (e.inCombat) {
        next = Math.min(next, ctx.time);
        continue;
      }
      state.flagged = false;
      state.disarmAt = null;
      e.pvpFlag = false;
      notice(ctx, meta.entityId, 'World PvP disabled.');
    }
    books.nextDisarmAt = next;
  }
  if (ctx.tickCount - books.sweptAtTick >= SWEEP_TICKS) {
    books.sweptAtTick = ctx.tickCount;
    sweepBooks(ctx, books);
  }
}

/** A player mid-battleground or mid-arena is under that mode's rules, never
 *  the open world's, whatever their flag says. */
function inInstancedPvp(ctx: SimContext, pid: number): boolean {
  if (ctx.bgMatches.get(pid)?.state === 'active') return true;
  return ctx.arenaMatches.get(pid)?.state === 'active';
}

function inSameParty(ctx: SimContext, a: number, b: number): boolean {
  const party = ctx.partyOf(a);
  return party !== null && party.members.includes(b);
}

/**
 * The open-world hostility arm isHostileTo consults for two PLAYERS (the
 * coordinator resolves a pet to its owner first). Both flagged, not grouped,
 * not guildmates, neither jailed (the jail has its own brawl rule), neither in
 * a live battleground or arena. Symmetric. The two flag reads come first so an
 * unflagged realm pays one boolean per pair, never the party lookup. Does not
 * read `dead`: the death hook uses it to credit contributors who fell before
 * the blow landed, and every attack path already refuses a dead attacker or
 * target on its own.
 */
export function isWorldPvpHostile(ctx: SimContext, attacker: Entity, target: Entity): boolean {
  if (attacker.kind !== 'player' || target.kind !== 'player') return false;
  if (!attacker.pvpFlag || !target.pvpFlag) return false;
  if (attacker.jailed || target.jailed) return false;
  if (!worldPvpPairHostile(attacker, target, inSameParty(ctx, attacker.id, target.id)))
    return false;
  return !inInstancedPvp(ctx, attacker.id) && !inInstancedPvp(ctx, target.id);
}

function controllerOf(ctx: SimContext, source: Entity | null): Entity | null {
  if (!source) return null;
  if (source.kind === 'player') return source;
  if (source.kind === 'mob' && source.ownerId !== null) {
    const owner = ctx.entities.get(source.ownerId);
    return owner?.kind === 'player' ? owner : null;
  }
  return null;
}

function noteRecent(
  book: Map<number, Map<number, number>>,
  subject: number,
  actor: number,
  now: number,
): void {
  let roster = book.get(subject);
  if (!roster) {
    roster = new Map();
    book.set(subject, roster);
  }
  roster.set(actor, now);
  for (const [pid, at] of roster) {
    if (now - at > WORLD_PVP_ASSIST_WINDOW) roster.delete(pid);
  }
}

/** Is this flagged player in a world fight right now: hit by an enemy inside
 *  the window, or the one doing the hitting? Bounded by the rosters of the
 *  players trading blows in the last window. */
function isEngagedInWorldPvp(ctx: SimContext, e: Entity): boolean {
  const books = ctx.worldPvpBooks;
  const fresh = (at: number) => ctx.time - at <= WORLD_PVP_ASSIST_WINDOW;
  const hits = books.recentDamage.get(e.id);
  if (hits) for (const at of hits.values()) if (fresh(at)) return true;
  for (const roster of books.recentDamage.values()) {
    const at = roster.get(e.id);
    if (at !== undefined && fresh(at)) return true;
  }
  return false;
}

/** Damage hook (combat/damage.ts): an enemy hit on a flagged player is remembered
 *  so the kill it leads to can pay the people who worked for it. Runs for every
 *  hit on a live player; the unflagged path is one property read. */
export function worldPvpOnPlayerDamaged(ctx: SimContext, victim: Entity, source: Entity): void {
  const books = ctx.worldPvpBooks;
  // A live hit proves the victim stood up again since their last paid death.
  if (books.paidDeaths.size > 0) books.paidDeaths.delete(victim.id);
  if (!victim.pvpFlag) return;
  const attacker = controllerOf(ctx, source);
  if (!attacker || !isWorldPvpHostile(ctx, attacker, victim)) return;
  noteRecent(books.recentDamage, victim.id, attacker.id, ctx.time);
}

/**
 * Heal hook (combat/heal.ts): a heal on a flagged player is remembered so a
 * kill that player lands can pay the healer who kept them standing. An
 * UNFLAGGED healer who aids a flagged player in a world fight raises their own
 * flag first (the classic rule): the fight then carries the same risk for the
 * healer as for the fighter, and nobody can sustain a killer from behind a
 * flag they do not wear. Under WORLD_PVP_MIN_LEVEL the raise is refused like
 * every other, so the heal still lands and earns nothing.
 */
export function worldPvpOnPlayerHealed(ctx: SimContext, target: Entity, source: Entity): void {
  if (!target.pvpFlag) return;
  const healer = controllerOf(ctx, source);
  if (!healer || healer.id === target.id) return;
  if (!healer.pvpFlag) {
    const meta = ctx.players.get(healer.id);
    if (
      !meta ||
      healer.jailed ||
      healer.level < WORLD_PVP_MIN_LEVEL ||
      inInstancedPvp(ctx, target.id) ||
      !isEngagedInWorldPvp(ctx, target)
    )
      return;
    raiseFlag(ctx, healer, meta, 'World PvP enabled: you aided a flagged player in combat.');
  }
  noteRecent(ctx.worldPvpBooks.recentSupport, target.id, healer.id, ctx.time);
}

/** The rename-proof identity the daily DR window keys a victim by (the
 *  honorTeamIdentity convention: database character ids online, the stable
 *  character name offline). */
function victimKeyOf(meta: PlayerMeta): string {
  return meta.characterId !== undefined
    ? `character:${meta.characterId}`
    : `name:${meta.name.trim().toLowerCase()}`;
}

interface Contributor {
  e: Entity;
  meta: PlayerMeta;
  mult: number;
}

/** What one paid contributor is told. Exported for the client matcher tests. */
export function worldPvpKillLine(victimName: string, copper: number, contributors: number): string {
  if (copper <= 0) return `You defeat ${victimName}.`;
  const money = formatMoney(copper);
  if (contributors <= 1) return `You defeat ${victimName} and take ${money} from their purse.`;
  return `You defeat ${victimName} and take ${money} from their purse (split ${contributors} ways).`;
}

/** What the victim is told: the blow alone, the blow and one other, or the blow
 *  and N others (three shapes, so the plural never reads "1 others"). */
export function worldPvpDefeatLine(
  killerName: string,
  copper: number,
  contributors: number,
): string {
  const others = contributors - 1;
  const who =
    others <= 0
      ? killerName
      : others === 1
        ? `${killerName} and 1 other`
        : `${killerName} and ${others} others`;
  const verb = contributors > 1 ? 'defeat' : 'defeats';
  if (copper <= 0) return `${who} ${verb} you.`;
  const take = contributors > 1 ? 'take' : 'takes';
  return `${who} ${verb} you and ${take} ${formatMoney(copper)} from your purse.`;
}

/**
 * Death hook (combat/damage.ts handleDeath, beside the battleground's): resolve
 * a flagged player's death. The assist rows are read and cleared together and
 * the victim joins `paidDeaths`, so one death pays exactly one round even if
 * the death hub is re-entered on the corpse. Everything is integer copper and
 * integer honor; the victim is charged exactly what was paid out, never the
 * full stake when a contributor was grey or fully decayed. Cost is bounded by
 * the damagers inside the window times their healers inside the window (a
 * few dozen visits in the largest world brawl), once per flagged death.
 */
export function worldPvpOnPlayerDeath(
  ctx: SimContext,
  victim: Entity,
  killer: Entity | null,
): void {
  const books = ctx.worldPvpBooks;
  const helpers = books.recentDamage.get(victim.id);
  books.recentDamage.delete(victim.id);
  books.recentSupport.delete(victim.id);
  if (!victim.pvpFlag || books.paidDeaths.has(victim.id)) return;
  const victimMeta = ctx.players.get(victim.id);
  if (!victimMeta) return;
  const killerPlayer = controllerOf(ctx, killer);
  if (!killerPlayer || !isWorldPvpHostile(ctx, killerPlayer, victim)) return;
  books.paidDeaths.add(victim.id);
  ensureState(victimMeta).deaths++;
  const victimKey = victimKeyOf(victimMeta);

  const contributors: Contributor[] = [];
  const seen = new Set<number>();
  const fresh = (at: number) => ctx.time - at <= WORLD_PVP_ASSIST_WINDOW;
  const consider = (pid: number) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    const r = playerOf(ctx, pid);
    if (!r || !isWorldPvpHostile(ctx, r.e, victim)) return;
    if (worldPvpVictimIsGrey(r.e.level, victim.level)) return;
    const mult = worldPvpPairMultiplier(worldKillRepeats(ctx, r.meta, victimKey));
    if (mult <= 0) return;
    contributors.push({ e: r.e, meta: r.meta, mult });
  };
  consider(killerPlayer.id);
  if (helpers) {
    for (const [pid, at] of helpers) {
      if (!fresh(at)) continue;
      consider(pid);
      const support = books.recentSupport.get(pid);
      if (!support) continue;
      for (const [healerPid, healedAt] of support) if (fresh(healedAt)) consider(healerPid);
    }
  }

  const n = contributors.length;
  if (n === 0) {
    notice(ctx, victim.id, worldPvpDefeatLine(killerPlayer.name, 0, 1), DEFEATED_COLOR);
    return;
  }
  const gold = worldPvpSplit(worldPvpStake(victimMeta.copper), n);
  const honor = worldPvpSplit(WORLD_PVP_KILL_HONOR, n);
  let taken = 0;
  for (const c of contributors) {
    const isKiller = c.e.id === killerPlayer.id;
    const goldShare = Math.floor((gold.share + (isKiller ? gold.killerBonus : 0)) * c.mult);
    const honorShare = Math.floor((honor.share + (isKiller ? honor.killerBonus : 0)) * c.mult);
    noteWorldKill(ctx, c.meta, victimKey);
    ensureState(c.meta).kills++;
    c.meta.copper += goldShare;
    taken += goldShare;
    notice(ctx, c.e.id, worldPvpKillLine(victim.name, goldShare, n));
    grantHonor(ctx, c.meta, honorShare, isKiller ? 'world_kill' : 'world_assist');
  }
  victimMeta.copper = Math.max(0, victimMeta.copper - taken);
  notice(ctx, victim.id, worldPvpDefeatLine(killerPlayer.name, taken, n), DEFEATED_COLOR);
}

/** The IWorld readout for the World PvP tab and the target/nameplate cores.
 *  The countdown is whole seconds: the self wire diffs the serialized readout,
 *  so an unrounded clock would re-send it every tick of a five-minute disarm. */
export function worldPvpInfoFor(
  ctx: SimContext,
  pid: number,
): import('../../world_api').WorldPvpInfo | null {
  const r = playerOf(ctx, pid);
  if (!r) return null;
  const state = r.meta.worldPvp;
  const remaining = worldPvpDisarmRemaining(r.meta, ctx.time);
  return {
    flagged: state?.flagged === true,
    disarmRemaining: remaining === null ? null : Math.round(remaining),
    kills: state?.kills ?? 0,
    deaths: state?.deaths ?? 0,
    levelLocked: r.e.level < WORLD_PVP_MIN_LEVEL,
  };
}

/** The persisted form, or undefined for a character who never raised the
 *  flag and has no record (so their save stays byte-identical). */
export function savedWorldPvpState(meta: PlayerMeta, now: number): WorldPvpSavedState | undefined {
  const state = meta.worldPvp;
  if (!state) return undefined;
  if (!state.flagged && state.kills === 0 && state.deaths === 0) return undefined;
  const remaining = worldPvpDisarmRemaining(meta, now);
  return {
    flagged: state.flagged,
    ...(remaining !== null ? { disarmRemaining: remaining } : {}),
    ...(state.kills > 0 ? { kills: state.kills } : {}),
    ...(state.deaths > 0 ? { deaths: state.deaths } : {}),
  };
}

/** The CharacterState spread: `{ worldPvp }` when there is a record, else `{}`. */
export function savedWorldPvpFields(
  meta: PlayerMeta,
  now: number,
): { worldPvp?: WorldPvpSavedState } {
  const saved = savedWorldPvpState(meta, now);
  return saved ? { worldPvp: saved } : {};
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Restore a saved record onto a freshly added player, re-anchoring a stored
 *  countdown to THIS sim's clock and mirroring the flag onto the entity. A
 *  malformed or absent record leaves the character unflagged, and so does a
 *  saved flag on a character who now sits under WORLD_PVP_MIN_LEVEL or on a
 *  realm whose kill switch is set (both gates hold on restore as on raise). */
export function loadWorldPvpState(
  ctx: SimContext,
  meta: PlayerMeta,
  e: Entity,
  saved: unknown,
): void {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
  const record = saved as Record<string, unknown>;
  const flagged =
    record.flagged === true && e.level >= WORLD_PVP_MIN_LEVEL && !ctx.worldPvpDisabled;
  const kills = nonNegativeInt(record.kills);
  const deaths = nonNegativeInt(record.deaths);
  if (!flagged && kills === 0 && deaths === 0) return;
  const remaining =
    flagged && typeof record.disarmRemaining === 'number' && Number.isFinite(record.disarmRemaining)
      ? Math.max(0, record.disarmRemaining)
      : null;
  const disarmAt = remaining === null ? null : ctx.time + remaining;
  meta.worldPvp = { flagged, disarmAt, kills, deaths };
  e.pvpFlag = flagged;
  if (disarmAt !== null) {
    const books = ctx.worldPvpBooks;
    books.nextDisarmAt = Math.min(books.nextDisarmAt, disarmAt);
  }
}
