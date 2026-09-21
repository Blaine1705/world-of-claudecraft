// World PvP (the /pvp flag): the system half, behind the SimContext seam.
//
// A player raises the flag with /pvp (or the World PvP tab of the PvP window)
// and becomes attackable by, and able to attack, every other flagged player
// who is not in their party or guild, anywhere in the open world. Lowering it
// takes WORLD_PVP_DISARM_SECONDS, and the drop waits for combat to end. A kill
// moves a gold stake (world_pvp_rules.ts worldPvpStake) from the victim's purse
// to everyone who worked for it, and pays the same people a share of the honor
// pool: the killing blow, everyone who damaged the victim inside the assist
// window, and every healer who kept one of those damagers standing. The books
// that remember who hit and healed whom live on the Sim as ONE live view
// (`ctx.worldPvpBooks`), never inside this module: the modules hold functions,
// the Sim holds state (src/sim/CLAUDE.md).
//
// Authority and persistence: `PlayerMeta.worldPvp` is the truth (persisted in
// the character blob, absent until the character first raises the flag so an
// unflagged save stays byte-identical); `Entity.pvpFlag` is the display mirror
// that rides the entity wire, written ONLY here, the away.ts precedent.
//
// Host-agnostic: no DOM, no rng, no wall clock. The disarm clock and the assist
// window run on `ctx.time` (tick math), so the offline Sim, the server, and the
// headless env resolve every flag and every kill identically.

import { formatMoney } from '../format_money';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';
import { grantHonor } from './honor';
import {
  WORLD_PVP_ASSIST_WINDOW,
  WORLD_PVP_DISARM_SECONDS,
  WORLD_PVP_KILL_HONOR,
  WORLD_PVP_MIN_LEVEL,
  WORLD_PVP_PAIR_DR_WINDOW,
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

/** The Sim-owned assist and diminishing-returns books, exposed on SimContext as
 *  a live view. Pruned on every write and on every death, so the two recency
 *  maps never outgrow the players currently trading blows; the pair rows are
 *  swept once a minute. */
export interface WorldPvpBooks {
  /** victim pid -> attacker pid -> sim time of the last enemy hit. */
  recentDamage: Map<number, Map<number, number>>;
  /** ally pid -> healer pid -> sim time of the last heal. */
  recentSupport: Map<number, Map<number, number>>;
  /** `contributorKey:victimKey` -> kills inside the rolling DR window. */
  killPairs: Map<string, { count: number; firstAt: number }>;
  sweptAtTick: number;
}

export function newWorldPvpBooks(): WorldPvpBooks {
  return {
    recentDamage: new Map(),
    recentSupport: new Map(),
    killPairs: new Map(),
    sweptAtTick: 0,
  };
}

const PAIR_SWEEP_TICKS = 20 * 60;
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
  if (enabled) {
    if (current?.flagged && current.disarmAt === null) {
      ctx.error(pid, 'World PvP is already enabled.');
      return false;
    }
    if (r.e.level < WORLD_PVP_MIN_LEVEL) {
      ctx.error(pid, `You must be at least level ${WORLD_PVP_MIN_LEVEL} to enable World PvP.`);
      return false;
    }
    const state = ensureState(r.meta);
    if (state.flagged) {
      // Mid-countdown: keep the flag, drop the clock.
      state.disarmAt = null;
      notice(ctx, pid, 'World PvP stays enabled.');
      return true;
    }
    state.flagged = true;
    state.disarmAt = null;
    r.e.pvpFlag = true;
    notice(ctx, pid, 'World PvP enabled: other flagged players can attack you.');
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

/**
 * Per-tick: drop every flag whose countdown has run out, unless its owner is
 * still in combat (a flag can never fall mid-fight and fizzle the blow already
 * on its way). Draws no rng; a tick with nobody disarming touches nothing.
 */
export function updateWorldPvp(ctx: SimContext): void {
  for (const meta of ctx.players.values()) {
    const state = meta.worldPvp;
    if (!state || !state.flagged || state.disarmAt === null || ctx.time < state.disarmAt) continue;
    const e = ctx.entities.get(meta.entityId);
    if (!e) continue;
    if (e.inCombat) continue;
    state.flagged = false;
    state.disarmAt = null;
    e.pvpFlag = false;
    notice(ctx, meta.entityId, 'World PvP disabled.');
  }
  const books = ctx.worldPvpBooks;
  if (ctx.tickCount - books.sweptAtTick >= PAIR_SWEEP_TICKS) {
    books.sweptAtTick = ctx.tickCount;
    for (const [key, row] of books.killPairs) {
      if (ctx.time - row.firstAt > WORLD_PVP_PAIR_DR_WINDOW) books.killPairs.delete(key);
    }
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
 * a live battleground or arena. Symmetric. Does not read `dead`: the death
 * hook uses it to credit contributors who fell before the blow landed, and
 * every attack path already refuses a dead attacker or target on its own.
 */
export function isWorldPvpHostile(ctx: SimContext, attacker: Entity, target: Entity): boolean {
  if (attacker.kind !== 'player' || target.kind !== 'player') return false;
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

/** Damage hook (combat/damage.ts): an enemy hit on a flagged player is remembered
 *  so the kill it leads to can pay the people who worked for it. */
export function worldPvpOnPlayerDamaged(ctx: SimContext, victim: Entity, source: Entity): void {
  if (!victim.pvpFlag) return;
  const attacker = controllerOf(ctx, source);
  if (!attacker || !isWorldPvpHostile(ctx, attacker, victim)) return;
  noteRecent(ctx.worldPvpBooks.recentDamage, victim.id, attacker.id, ctx.time);
}

/** Heal hook (combat/heal.ts): a heal on a flagged player is remembered so a
 *  kill that player lands can pay the healer who kept them standing. */
export function worldPvpOnPlayerHealed(ctx: SimContext, target: Entity, source: Entity): void {
  if (!target.pvpFlag) return;
  const healer = controllerOf(ctx, source);
  if (!healer || healer.id === target.id || !healer.pvpFlag) return;
  noteRecent(ctx.worldPvpBooks.recentSupport, target.id, healer.id, ctx.time);
}

function pairKey(ctx: SimContext, contributor: number, victim: number): string {
  const key = (pid: number) => {
    const meta = ctx.players.get(pid);
    return meta?.characterId !== undefined ? `character:${meta.characterId}` : `pid:${pid}`;
  };
  return `${key(contributor)}:${key(victim)}`;
}

function pairKills(books: WorldPvpBooks, key: string, now: number): number {
  const row = books.killPairs.get(key);
  if (!row) return 0;
  if (now - row.firstAt > WORLD_PVP_PAIR_DR_WINDOW) {
    books.killPairs.delete(key);
    return 0;
  }
  return row.count;
}

function notePairKill(books: WorldPvpBooks, key: string, now: number): void {
  const row = books.killPairs.get(key);
  if (!row || now - row.firstAt > WORLD_PVP_PAIR_DR_WINDOW) {
    books.killPairs.set(key, { count: 1, firstAt: now });
    return;
  }
  row.count++;
}

interface Contributor {
  e: Entity;
  meta: PlayerMeta;
  mult: number;
  key: string;
}

/** What one paid contributor is told. Exported for the client matcher tests. */
export function worldPvpKillLine(victimName: string, copper: number, contributors: number): string {
  if (copper <= 0) return `You defeat ${victimName}.`;
  const money = formatMoney(copper);
  if (contributors <= 1) return `You defeat ${victimName} and take ${money} from their purse.`;
  return `You defeat ${victimName} and take ${money} from their purse (split ${contributors} ways).`;
}

/** What the victim is told. */
export function worldPvpDefeatLine(
  killerName: string,
  copper: number,
  contributors: number,
): string {
  const who = contributors > 1 ? `${killerName} and ${contributors - 1} others` : killerName;
  const verb = contributors > 1 ? 'defeat' : 'defeats';
  if (copper <= 0) return `${who} ${verb} you.`;
  const take = contributors > 1 ? 'take' : 'takes';
  return `${who} ${verb} you and ${take} ${formatMoney(copper)} from your purse.`;
}

/**
 * Death hook (combat/damage.ts handleDeath, beside the battleground's): resolve
 * a flagged player's death. The assist rows are read and cleared together, so
 * one death pays exactly one round. Everything is integer copper and integer
 * honor; the victim is charged exactly what was paid out, never the full stake
 * when a contributor was grey or fully decayed.
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
  if (!victim.pvpFlag) return;
  const victimMeta = ctx.players.get(victim.id);
  if (!victimMeta) return;
  const killerPlayer = controllerOf(ctx, killer);
  if (!killerPlayer || !isWorldPvpHostile(ctx, killerPlayer, victim)) return;
  ensureState(victimMeta).deaths++;

  const contributors: Contributor[] = [];
  const seen = new Set<number>();
  const fresh = (at: number) => ctx.time - at <= WORLD_PVP_ASSIST_WINDOW;
  const consider = (pid: number) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    const r = playerOf(ctx, pid);
    if (!r || !isWorldPvpHostile(ctx, r.e, victim)) return;
    if (worldPvpVictimIsGrey(r.e.level, victim.level)) return;
    const key = pairKey(ctx, pid, victim.id);
    const mult = worldPvpPairMultiplier(pairKills(books, key, ctx.time));
    if (mult <= 0) return;
    contributors.push({ e: r.e, meta: r.meta, mult, key });
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
    notePairKill(books, c.key, ctx.time);
    ensureState(c.meta).kills++;
    c.meta.copper += goldShare;
    taken += goldShare;
    notice(ctx, c.e.id, worldPvpKillLine(victim.name, goldShare, n));
    grantHonor(ctx, c.meta, honorShare, isKiller ? 'world_kill' : 'world_assist');
  }
  victimMeta.copper = Math.max(0, victimMeta.copper - taken);
  notice(ctx, victim.id, worldPvpDefeatLine(killerPlayer.name, taken, n), DEFEATED_COLOR);
}

/** The IWorld readout for the World PvP tab and the target/nameplate cores. */
export function worldPvpInfoFor(
  ctx: SimContext,
  pid: number,
): import('../../world_api').WorldPvpInfo | null {
  const r = playerOf(ctx, pid);
  if (!r) return null;
  const state = r.meta.worldPvp;
  return {
    flagged: state?.flagged === true,
    disarmRemaining: worldPvpDisarmRemaining(r.meta, ctx.time),
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
 *  malformed or absent record leaves the character unflagged. */
export function loadWorldPvpState(meta: PlayerMeta, e: Entity, saved: unknown, now: number): void {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
  const record = saved as Record<string, unknown>;
  const flagged = record.flagged === true;
  const kills = nonNegativeInt(record.kills);
  const deaths = nonNegativeInt(record.deaths);
  if (!flagged && kills === 0 && deaths === 0) return;
  const remaining =
    flagged && typeof record.disarmRemaining === 'number' && Number.isFinite(record.disarmRemaining)
      ? Math.max(0, record.disarmRemaining)
      : null;
  meta.worldPvp = { flagged, disarmAt: remaining === null ? null : now + remaining, kills, deaths };
  e.pvpFlag = flagged;
}
