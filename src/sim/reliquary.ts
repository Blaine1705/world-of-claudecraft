// The Reliquary runtime: sparse first-find meta, capped recent finds, pure
// completion helpers. System module behind the SimContext seam (functions only;
// state lives on PlayerMeta.reliquary). Ownership of item relics reuses
// deedStats.itemsDiscovered via markItemDiscovered; this module never dual-
// writes a second full discovery set.
//
// Determinism: pure state transitions over live meta references. No Rng, no
// wall clock, no Math.random / Date.now. Clear counts are READ from existing
// sources (dungeonClears / delveClears / deedStats.counters via a deed_stat
// clearSource) at first obtain only (never invented on retro).
//
// Performance: firstFind and marks are allowlist-only (catalogued ids).
// recent is a fixed-cap ring. Serialize omits empty. No per-drop saveCharacter.
// The wire blob is memoized per state revision (reliquaryWireJson), and each
// fill chain builds its ownership snapshot ONCE and threads it, rather than
// rescanning inventory + bank for owned mounts at every step.

import {
  isCataloguedRelicItem,
  isCataloguedRelicMark,
  RELIQUARY_HORIZON_TITLES,
  RELIQUARY_ITEM_TO_PAGES,
  RELIQUARY_MARK_IDS,
  RELIQUARY_MARK_TO_PAGES,
  RELIQUARY_PAGE_ORDER,
  RELIQUARY_PAGES,
  RELIQUARY_PAGES_BY_ID,
  type ReliquaryClearSource,
  type ReliquaryPageDef,
  type ReliquaryRelicDef,
} from './content/reliquary';
import { ITEMS } from './data';
import { ownedMounts as ownedMountKeys } from './mounts';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { DeedStatKey, DeedStats, ItemDef } from './types';
import { DEED_STAT_KEYS } from './types';

/** Horizon title deed ids that score catalogRankOwned (title rewards only). */
const HORIZON_TITLE_DEED_IDS: ReadonlySet<string> = new Set(RELIQUARY_HORIZON_TITLES);

/** Cap for the recent-find ring buffer (plan: 12). Drop oldest on push. */
export const RELIQUARY_RECENT_CAP = 12;

/** Cap on a single relic's obtain tally. Far above any real play, so it never
 *  binds in practice; it exists so a hand-edited blob cannot park a number
 *  that formats into an absurd tooltip or overflows a later sum. */
export const RELIQUARY_OBTAIN_COUNT_CAP = 1e9;

/** Sparse first-obtain metadata for one catalogued relic item id. */
export interface ReliquaryFirstFind {
  /**
   * Clear count of the page's source meter at first obtain, present only when
   * that meter had actually turned over at least once. Zero is omitted rather
   * than stamped, because "first found on clear 0" states a fact about a run
   * that did not happen: the meter reads zero exactly when the player has no
   * clear of that source behind them, whether the relic dropped mid first run
   * before its clear was credited or arrived with no run behind it at all.
   * Absent means unknown, the same shape a retro fill writes.
   *
   * A first find that arrived through a MOVEMENT grant is sparse too, at any
   * meter value: the stamp answers "which clear did you find this on", and a
   * relic bought, traded, or mailed to you was not found on one of your runs
   * at all. See noteRelicItemFind for where the two gates live.
   */
  clears?: number;
}

/**
 * Sparse Reliquary state on PlayerMeta. Item ownership is NOT here: it lives
 * in deedStats.itemsDiscovered. Only catalogued first-find meta, authored
 * non-item marks, a capped recent ring, and the sparse obtain tally.
 */
export interface ReliquaryState {
  firstFind: Record<string, ReliquaryFirstFind>;
  marks: Set<string>;
  recent: string[];
  /**
   * Per-relic obtain tally, keyed by catalogued relic ITEM id, sparse (an
   * absent id has never been counted). Counts WORLD-SOURCED acquisitions
   * only; see noteRelicObtain. Information, never a score: nothing reads it
   * for power, drop rate, pity, or Curator rank, and it is never membership
   * (ownership stays on deedStats.itemsDiscovered).
   */
  counts: Record<string, number>;
}

/** One serialized firstFind entry: sparse provenance plus the folded tally. */
export interface SavedReliquaryFirstFind {
  /** See ReliquaryFirstFind.clears (omitted at zero). */
  clears?: number;
  /** state.counts[itemId], folded onto its entry. Only ever >= 1. */
  count?: number;
}

/** Serialized shape (CharacterState.reliquary). Omit-empty on write. The
 *  tally rides the firstFind entries rather than a fourth top-level key, so a
 *  relic costs one object either way and the blob keeps three keys. */
export interface SavedReliquaryState {
  firstFind?: Record<string, SavedReliquaryFirstFind>;
  marks?: string[];
  recent?: string[];
}

export function freshReliquaryState(): ReliquaryState {
  return { firstFind: {}, marks: new Set(), recent: [], counts: {} };
}

/** True when the state has nothing worth persisting. `counts` is deliberately
 *  NOT read here: every counted relic carries a firstFind entry (noteRelicObtain
 *  writes the carrier the saved tally rides on), so a counts-only state cannot
 *  exist, and testing it would let a state with a tally and nothing else
 *  serialize to a firstFind-less object the count could not survive. */
export function isReliquaryStateEmpty(state: ReliquaryState): boolean {
  return (
    Object.keys(state.firstFind).length === 0 && state.marks.size === 0 && state.recent.length === 0
  );
}

/**
 * Serialize with zero-default omission and sorted mark lists so equal states
 * are byte-stable and untouched characters never grow a reliquary key.
 */
export function serializeReliquaryState(state: ReliquaryState): SavedReliquaryState | undefined {
  if (isReliquaryStateEmpty(state)) return undefined;
  const out: SavedReliquaryState = {};
  const firstKeys = Object.keys(state.firstFind).sort();
  if (firstKeys.length > 0) {
    const firstFind: Record<string, SavedReliquaryFirstFind> = {};
    for (const k of firstKeys) {
      const entry = state.firstFind[k];
      // Sparse per FIELD, not per entry: an entry with neither provenance nor
      // a tally still writes {}, because membership is the entry existing.
      const slim: SavedReliquaryFirstFind = {};
      if (entry.clears !== undefined) slim.clears = entry.clears;
      const count = state.counts[k];
      if (typeof count === 'number' && count >= 1) slim.count = count;
      firstFind[k] = slim;
    }
    out.firstFind = firstFind;
  }
  if (state.marks.size > 0) out.marks = [...state.marks].sort();
  if (state.recent.length > 0) out.recent = [...state.recent];
  return out;
}

/**
 * Restore from a saved blob. Filters firstFind and marks to catalogued ids
 * only so a hand-edited save cannot grow unbounded membership.
 */
export function restoreReliquaryState(saved: SavedReliquaryState | undefined): ReliquaryState {
  const state = freshReliquaryState();
  if (!saved) return state;
  if (saved.firstFind) {
    for (const [itemId, entry] of Object.entries(saved.firstFind)) {
      if (!isCataloguedRelicItem(itemId)) continue;
      // Array.isArray as well as the typeof gate: `typeof [] === 'object'`, so
      // a clone-mangled or hand-edited entry that arrived as an ARRAY used to
      // slip through and land as an empty carrier, quietly inventing
      // membership for a relic whose row was junk. Dropped whole, like every
      // other non-object entry.
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const slim: ReliquaryFirstFind = {};
      if (typeof entry.clears === 'number' && Number.isFinite(entry.clears)) {
        // Floor FIRST, then the >= 1 gate, so 0 and 0.x drop the field while
        // the entry survives, matching what the live stamp would have written.
        const clears = Math.floor(entry.clears);
        if (clears >= 1) slim.clears = clears;
      }
      // A pre-Phase-17 blob still carries the retired `pageId` diagnostic and
      // possibly a `clears: 0`. Neither is read: the entry loads clean, and
      // where a relic lives comes from the catalog index, which is where the
      // fallback arm always computed the identical answer. One release of
      // tolerance, then no save written since carries the field at all.
      state.firstFind[itemId] = slim;
      // The tally is split back out of its carrier entry, so counts keys can
      // only ever be a SUBSET of the entries that survived the filters above:
      // a count riding an entry this loop drops whole vanishes with it.
      const count = sanitizeObtainCount(entry.count);
      if (count !== undefined) state.counts[itemId] = count;
    }
  }
  for (const mark of saved.marks ?? []) {
    if (typeof mark === 'string' && RELIQUARY_MARK_IDS.has(mark)) state.marks.add(mark);
  }
  if (Array.isArray(saved.recent)) {
    // The ring is OLDEST-first, and restore must agree with pushRecent: the
    // live ring holds each id once (a repeat moves to the tail rather than
    // appending), so a hand-edited or legacy blob carrying the same id twice
    // must not burn two of the twelve slots. LAST occurrence wins, because a
    // repeat find refreshes recency, and when the survivors exceed the cap the
    // NEWEST ones survive (drop from the head, the oldest side), exactly as
    // pushRecent's shift does. Relative order is preserved either way.
    // Walking from the newest end makes both rules fall out at once: the first
    // time an id is seen going backwards IS its last occurrence, and stopping
    // at the cap keeps the newest survivors.
    const seen = new Set<string>();
    const newestFirst: string[] = [];
    for (let i = saved.recent.length - 1; i >= 0; i--) {
      const id = saved.recent[i];
      if (typeof id !== 'string') continue;
      // Recent may hold item or mark ids that are still catalogued.
      if (!isCataloguedRelicItem(id) && !RELIQUARY_MARK_IDS.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      newestFirst.push(id);
      if (newestFirst.length >= RELIQUARY_RECENT_CAP) break;
    }
    for (let i = newestFirst.length - 1; i >= 0; i--) {
      state.recent.push(newestFirst[i]);
    }
  }
  return state;
}

/** Load guard for a saved obtain tally: a finite number, floored, at least 1
 *  (0 and 0.x mean "never counted", which is the absent key), capped. Anything
 *  else is dropped rather than coerced. */
function sanitizeObtainCount(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  if (n < 1) return undefined;
  return Math.min(n, RELIQUARY_OBTAIN_COUNT_CAP);
}

// ---------------------------------------------------------------------------
// Clear-count reads (existing state only; never invent a parallel map)
// ---------------------------------------------------------------------------

/** Lifetime clears for a catalog clear source from live meta fields. */
export function clearCountForSource(
  meta: Pick<PlayerMeta, 'deedStats' | 'delveClears'>,
  source: ReliquaryClearSource | undefined,
): number | undefined {
  if (!source || source.kind === 'none') return undefined;
  if (source.kind === 'delve') {
    // The only writer is grantDelveClearTo (src/sim/delves/runs.ts), whose
    // clearKey shape is `${delveId}:${tierId}`, so the lifetime count sums
    // every tier under the delve prefix like delveShopGateUnlocked does.
    // Each entry must be a finite number > 0 and is floored individually so
    // a hand-edited blob cannot inflate or poison provenance.
    const prefix = `${source.delveId}:`;
    let total = 0;
    for (const key in meta.delveClears) {
      if (!key.startsWith(prefix)) continue;
      const n = meta.delveClears[key];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) total += Math.floor(n);
    }
    return total;
  }
  if (source.kind === 'deed_stat') {
    // Only authored DEED_STAT_KEYS are readable; unknown strings yield 0 so a
    // hand-edited catalog cannot invent a parallel counter channel.
    if (!(DEED_STAT_KEYS as readonly string[]).includes(source.stat)) return 0;
    const n = meta.deedStats.counters[source.stat as DeedStatKey];
    return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
  }
  // dungeon
  return dungeonClearCount(meta.deedStats, source.dungeonId, source.difficulty);
}

function dungeonClearCount(
  stats: DeedStats,
  dungeonId: string,
  difficulty: 'normal' | 'heroic' | 'any' | undefined,
): number {
  if (difficulty === 'heroic') return stats.dungeonClears[`${dungeonId}:heroic`] ?? 0;
  if (difficulty === 'normal') return stats.dungeonClears[dungeonId] ?? 0;
  return (stats.dungeonClears[dungeonId] ?? 0) + (stats.dungeonClears[`${dungeonId}:heroic`] ?? 0);
}

// ---------------------------------------------------------------------------
// Mark path (called only from markItemDiscovered on first discover)
// ---------------------------------------------------------------------------

/**
 * Hook from markItemDiscovered after a NEW item id enters itemsDiscovered.
 * Writes sparse firstFind + capped recent only for catalogued relic item ids,
 * then emits id-only reliquaryUnlock for presentation (including curatorRank
 * when this fill crossed a cosmetic rank threshold). Syncs zero-Renown rank
 * deed bridges via grantDeed (durability path for titles only). Idempotent:
 * a second call for the same id is a no-op. Does not call saveCharacter on
 * pure silhouette fill and does not dual-write discovery.
 *
 * `opts.retro` is the join-time seed pass (seedItemDiscovery): the fill stays
 * SILENT (no recent push, no fabricated clear provenance) and every event it
 * emits carries the retro flag. That flag buys two things, and nothing else:
 * the CLIENT collapses retro fills into one catch-up summary line instead of
 * a toast per relic, and the deedUnlocked grants this same join pass produces
 * stay out of the server's guild / activity-feed fan-out through its ev.retro
 * gate (server/game.ts, which gates deedUnlocked only). reliquaryUnlock itself
 * is never fanned out on any path: it is a self-scoped HEAVY_SELF_EVENTS
 * member, so it only ever reaches the earner.
 *
 * Mount reins are not catalogued item relics (Horizons owns them via live
 * ownedMounts). On first discovery of reins the item is already in bags, so
 * rank may cross a threshold: sync deeds without inventing firstFind or a
 * reliquaryUnlock toast (Phase 8 membership stays live-seam only).
 */
export function onItemDiscovered(
  ctx: SimContext,
  meta: PlayerMeta,
  itemId: string,
  opts?: Readonly<{ retro?: boolean; movement?: boolean }>,
): void {
  if (!isCataloguedRelicItem(itemId)) {
    if (ITEMS[itemId]?.kind === 'mount') maybeSyncCuratorRankDeeds(ctx, meta, opts);
    return;
  }
  // ONE ownership snapshot for this whole fill chain, threaded into the emit
  // and the rank sync instead of each rebuilding its own. Reusing it is exact,
  // not approximate: three of its four surfaces (itemsDiscovered, marks,
  // deedsEarned) are LIVE references, so any write the chain performs is
  // already visible through this object, and the fourth (ownedMounts, a fresh
  // Set built from a full inventory + bank scan, the expensive half) cannot
  // change inside a fill chain at all, since nothing here moves a reins item.
  const ownership = characterReliquaryOwnership(meta);
  // Rank is character-durable catalogued fills (items + marks + mounts + titles;
  // never account skins). Prior count is owned - 1 because this discover is the
  // first time the id entered itemsDiscovered (markItemDiscovered only calls on first add).
  const owned = catalogRankOwned(ownership);
  const previousRank = curatorRankFromOwned(Math.max(0, owned - 1));
  const newRank = curatorRankFromOwned(owned);
  const rankedUp = newRank > previousRank ? newRank : undefined;
  // The unlock event is the first-find MOMENT, so it fires only when a new
  // firstFind entry actually landed (an already-noted id must never re-toast).
  // The rank sync is keyed on the ledger add instead: a save whose sparse blob
  // ran ahead of itemsDiscovered would otherwise drop the threshold crossing
  // this discover just earned. grantDeed is idempotent, so the extra call is
  // a no-op whenever the bridges are already held.
  if (noteRelicItemFind(meta, itemId, opts)) {
    emitReliquaryUnlock(
      ctx,
      meta,
      { itemId, curatorRank: rankedUp, retro: opts?.retro },
      ownership,
    );
  }
  if (rankedUp !== undefined) syncCuratorRankDeeds(ctx, meta, opts, ownership);
}

/**
 * True when a deed id is a Horizons title relic (scores catalogRankOwned).
 * Border-only curator rank 5 is not on the list.
 */
export function isHorizonsTitleDeed(deedId: string): boolean {
  return HORIZON_TITLE_DEED_IDS.has(deedId);
}

/**
 * Re-sync zero-Renown Curator rank deed bridges when character-durable
 * ownership may have grown outside the item/mark unlock paths (mount reins
 * first discover, Horizons title deed grant). Fast no-op when every bridge
 * for the current rank is already earned. No reliquaryUnlock toast.
 */
export function maybeSyncCuratorRankDeeds(
  ctx: SimContext,
  meta: PlayerMeta,
  opts?: Readonly<{ retro?: boolean }>,
): void {
  // One snapshot for this chain too, handed to the sync below rather than
  // rebuilt there: the mount-reins arm is the join-time path, where a veteran
  // holding a bagful of reins would otherwise rescan inventory + bank twice
  // per discover. See the reuse note in onItemDiscovered.
  const ownership = characterReliquaryOwnership(meta);
  const owned = catalogRankOwned(ownership);
  const rank = curatorRankFromOwned(owned);
  if (rank <= 0) return;
  for (let i = 0; i < rank; i++) {
    const deedId = CURATOR_RANK_DEFS[i]?.deedId;
    if (deedId && !meta.deedsEarned.has(deedId)) {
      syncCuratorRankDeeds(ctx, meta, opts, ownership);
      return;
    }
  }
}

/**
 * Record first-find meta and push the recent ring for a catalogued item relic.
 * Safe to call only when the item is already in itemsDiscovered (the deeds hub
 * owns that set). Retro ownership without this call leaves firstFind absent.
 * `opts.retro` is the join-time seed: the entry lands sparse with NO clears
 * key (the clear count now is not the count at the real first obtain, and
 * provenance is never fabricated) and the recent ring is left alone (logging
 * in is not a find moment). A live find whose page meter still reads zero
 * lands the same sparse way, for the same reason: see ReliquaryFirstFind.
 * @returns true when a new firstFind entry was written.
 */
export function noteRelicItemFind(
  meta: PlayerMeta,
  itemId: string,
  opts?: Readonly<{ retro?: boolean; movement?: boolean }>,
): boolean {
  // The SAME catalogue predicate noteRelicObtain gates on, so the two writers
  // can never disagree about what a relic is (they used to differ: this one
  // asked whether the item-to-pages index held a NON-EMPTY array, which would
  // have parted company with isCataloguedRelicItem had content ever mapped an
  // id to an empty page list).
  if (!isCataloguedRelicItem(itemId)) return false;

  const state = meta.reliquary;
  if (state.firstFind[itemId] !== undefined) {
    // Already noted: do not re-stamp clears or re-push recent.
    return false;
  }

  const entry: ReliquaryFirstFind = {};
  // Provenance is stamped only for a find the player's own play produced.
  // `retro` is the join-time seed (today's meter is not the meter at the real
  // first obtain) and `movement` is a grant that relocated somebody's existing
  // copy (a trade, mail, a market buy, a re-mint). Both leave the entry
  // sparse, because in both the clear count the meter happens to read has
  // nothing to do with how this relic was acquired: a player sitting on twelve
  // Hollow Crypt clears who BUYS the drop did not find it on clear twelve.
  // Provenance only; the fill itself is real, so the unlock event, the toast,
  // and the recent push below are deliberately unchanged on a movement find.
  if (!opts?.retro && !opts?.movement) {
    const pageId = RELIQUARY_ITEM_TO_PAGES.get(itemId)?.[0];
    const page = pageId !== undefined ? RELIQUARY_PAGES_BY_ID[pageId] : undefined;
    const clears = clearCountForSource(meta, page?.clearSource);
    // >= 1 only. A page with no clear meter answers undefined; a meter that
    // has not turned over answers 0, and both mean the same thing here, that
    // there is no clear to name, so both leave the entry sparse.
    if (clears !== undefined && clears >= 1) entry.clears = clears;
  }
  state.firstFind[itemId] = entry;
  if (!opts?.retro) pushRecent(state, itemId);
  bumpReliquaryWireRev(state);
  return true;
}

/**
 * Count one WORLD-SOURCED acquisition of a catalogued relic item. Information,
 * never a score: nothing reads this for power, drop rate, pity, Curator rank,
 * or membership (ownership stays on deedStats.itemsDiscovered), and no page,
 * deed, or reward looks at it.
 *
 * World-sourced is the whole rule. The grant hub calls this for every
 * acquisition EXCEPT the ones flagged `movement: true` (trade, mail, the
 * market, an enchant re-mint, an unbind stack split, a returned commission),
 * which relocate or re-mint copies somebody already held. Counting those would
 * let two players hand one relic back and forth and watch both tallies climb,
 * which is exactly the reading the number must not support.

 *
 * Deliberately quiet: no event, no recent push, no saveCharacter, no rank
 * sync. The tally rides the sparse blob's 30s autosave like the rest.
 */
export function noteRelicObtain(meta: PlayerMeta, itemId: string, copies = 1): void {
  if (!(copies >= 1)) return;
  const state = meta.reliquary;
  const units = Math.floor(copies);
  // The SAME heroic walk the discovery ledger runs (deeds.ts
  // markItemDiscovered): a heroic instance drops the generated heroic_<base>
  // variant in place of the base item, the catalog lists BASE ids only
  // (pinned in tests/reliquary_content.test.ts), and the tally has to agree
  // with the slot that fill lands in or roughly half the catalog would show an
  // owned relic whose count never moves. Every catalogued id in the chain
  // increments, so a catalogued variant would count itself as well as its
  // base. Bases are never variants themselves, so the walk visits at most two
  // ids; the depth cap only guards against a malformed def cycle in content.
  let id: string | undefined = itemId;
  let wrote = false;
  for (let depth = 0; id !== undefined && depth < 3; depth++) {
    // Annotated for the same reason deeds.ts annotates its walk: indexing by
    // the reassigned `id` would otherwise infer circularly through heroicOf.
    const def: ItemDef | undefined = ITEMS[id];
    if (!def) break;
    if (isCataloguedRelicItem(id)) {
      state.counts[id] = Math.min((state.counts[id] ?? 0) + units, RELIQUARY_OBTAIN_COUNT_CAP);
      // The saved blob folds each tally onto its firstFind entry, so the entry
      // is the carrier the count needs to survive a round trip. A relic
      // discovered BEFORE the Reliquary shipped has no entry and can never
      // grow one on its own: markItemDiscovered fires the first-find hook only
      // on an id's first ever discovery, and the join-time seed cannot re-enter
      // it for an id already on the ledger. So the re-obtain that starts such a
      // relic's tally writes the empty carrier here. Sparse {} is the honest
      // shape and already ships: it is what a retro fill writes. Owned,
      // provenance unknown.
      if (state.firstFind[id] === undefined) state.firstFind[id] = {};
      wrote = true;
    }
    id = def.heroicOf;
  }
  if (wrote) bumpReliquaryWireRev(state);
}

/**
 * Grant an authored non-item Reliquary mark (profession trophy, etc.).
 * Only catalog mark ids land; unknown ids are ignored. Cosmetic only: no
 * skill power, drop rate, or pity. No saveCharacter on pure mark fill.
 * @returns true when a new mark was written.
 */
export function noteReliquaryMark(ctx: SimContext, meta: PlayerMeta, markId: string): boolean {
  if (!RELIQUARY_MARK_IDS.has(markId)) return false;
  if (meta.reliquary.marks.has(markId)) return false;
  // One snapshot for the chain (see onItemDiscovered). The EVALUATION POINTS
  // are unchanged: previousOwned is still read BEFORE the add below, and every
  // later read still happens after it. Reusing the object is what carries the
  // add to those later reads, because `marks` on it is the live Set itself.
  const ownership = characterReliquaryOwnership(meta);
  // Rank uses pre-add owned so this mark is the +1 that may cross a threshold.
  const previousOwned = catalogRankOwned(ownership);
  meta.reliquary.marks.add(markId);
  pushRecent(meta.reliquary, markId);
  bumpReliquaryWireRev(meta.reliquary);
  const newOwned = previousOwned + 1;
  const previousRank = curatorRankFromOwned(previousOwned);
  const newRank = curatorRankFromOwned(newOwned);
  const rankedUp = newRank > previousRank ? newRank : undefined;
  emitReliquaryUnlock(ctx, meta, { markId, curatorRank: rankedUp }, ownership);
  if (rankedUp !== undefined) syncCuratorRankDeeds(ctx, meta, undefined, ownership);
  return true;
}

/**
 * Join / load retro: copy every catalog mark id already on the deed visit
 * ledger (gather_event:*, masterwork:*) into the sparse marks Set. Silent:
 * no unlock toast and no recent push. Nothing is invented here: a mark only
 * fills from a visit its own live call site wrote when the real event
 * happened, so the ledger is proof, never a guess. Returns how many marks
 * were added.
 */
export function syncReliquaryMarksFromVisited(meta: PlayerMeta): number {
  let added = 0;
  for (const mark of meta.deedStats.visited) {
    if (!RELIQUARY_MARK_IDS.has(mark)) continue;
    if (meta.reliquary.marks.has(mark)) continue;
    meta.reliquary.marks.add(mark);
    added++;
  }
  // Every writer of the serialized surfaces bumps, this one included. It runs
  // at join, ahead of the session's first snapshot, so today no cached blob
  // can predate it; bumping anyway means the memo stays correct if the join
  // order ever changes rather than silently shipping a stale mark list.
  if (added > 0) bumpReliquaryWireRev(meta.reliquary);
  return added;
}

/**
 * Id-only presentation event for a new catalogued relic or mark. Never
 * English. Membership authority stays on itemsDiscovered + sparse blob.
 * Optional curatorRank is the new cosmetic rank index when this fill ranked up.
 * Optional retro marks the join-time seed pass (silent on the client, no
 * server fan-out).
 *
 * Illumination computes from characterReliquaryOwnership, which deliberately
 * OMITS account weapon skins: the server cannot answer account cosmetics from
 * inside the sim, so any skin-aware read here would be online-inert and would
 * disagree with itself per host. That is safe because every catalog page is
 * single-kind (pinned in tests/reliquary_content.test.ts) and an item or mark
 * fill can only ever reach item or mark pages, never a weapon-skin page. The
 * online window-vs-emit skin gap (parity W3) stays open BY DESIGN until a
 * mixed-kind page ships; the single-kind pin is what keeps that honest.
 */
function emitReliquaryUnlock(
  ctx: SimContext,
  meta: PlayerMeta,
  ids: { itemId?: string; markId?: string; curatorRank?: number; retro?: boolean },
  // Required, not defaulted: the old code built this snapshot lazily, inside
  // the multi-page branch below, while a default parameter evaluates eagerly
  // at every call. Module-private with two call sites, both already holding
  // their chain's snapshot, so there is nothing for a default to serve.
  ownership: ReliquaryOwnershipSurfaces,
): void {
  const pageIds =
    ids.itemId !== undefined
      ? RELIQUARY_ITEM_TO_PAGES.get(ids.itemId)
      : ids.markId !== undefined
        ? RELIQUARY_MARK_TO_PAGES.get(ids.markId)
        : undefined;
  let illuminatedPageId: string | undefined;
  if (pageIds && pageIds.length > 0) {
    for (const pageId of pageIds) {
      const page = RELIQUARY_PAGES_BY_ID[pageId];
      if (!page) continue;
      if (pageCompletion(page, ownership).complete) {
        illuminatedPageId = pageId;
        break;
      }
    }
  }
  ctx.emit({
    type: 'reliquaryUnlock',
    pid: meta.entityId,
    ...(ids.itemId !== undefined ? { itemId: ids.itemId } : {}),
    ...(ids.markId !== undefined ? { markId: ids.markId } : {}),
    ...(pageIds && pageIds.length > 0 ? { pageIds: [...pageIds] } : {}),
    ...(illuminatedPageId !== undefined ? { illuminatedPageId } : {}),
    ...(ids.curatorRank !== undefined && ids.curatorRank > 0
      ? { curatorRank: ids.curatorRank }
      : {}),
    ...(ids.retro ? { retro: true } : {}),
  });
}

// ---------------------------------------------------------------------------
// Wire memo: build once per CHANGE, not once per heavy tick
// ---------------------------------------------------------------------------

/**
 * Monotonic revision per live ReliquaryState, bumped by every writer that can
 * move the serialized blob (a find, a mark, an obtain). Restore needs no bump:
 * it returns a NEW state object, so the cache below simply has no entry for it.
 *
 * Both maps are WeakMaps keyed on state IDENTITY. That buys three things at
 * once: nothing leaks into the save shape or the live-meta goldens (the
 * bookkeeping is not on PlayerMeta at all), nothing leaks between tests (a
 * fresh Sim builds a fresh state object, so no exported reset hook is needed),
 * and a departed character's entry drops with the character.
 */
const reliquaryWireRev = new WeakMap<ReliquaryState, number>();
const reliquaryWireCache = new WeakMap<ReliquaryState, { rev: number; json: string }>();

function bumpReliquaryWireRev(state: ReliquaryState): void {
  reliquaryWireRev.set(state, (reliquaryWireRev.get(state) ?? 0) + 1);
}

/**
 * The sparse `reliq` self blob as JSON, built once per change. The heavy self
 * gate re-runs on a staggered refresh even when nothing moved, and the old
 * path rebuilt and re-stringified this blob on every one of those ticks purely
 * to hand the delta gate a string it had already seen.
 *
 * Byte-identical to JSON.stringify(serializeReliquaryState(state) ?? {}), the
 * exact expression the caller used to pass through `maybe`, so a session's
 * lastSent comparison sees the same bytes across the swap and no client gets
 * a spurious re-ship. Never a second full itemsDiscovered array.
 */
export function reliquaryWireJson(state: ReliquaryState): string {
  const rev = reliquaryWireRev.get(state) ?? 0;
  const cached = reliquaryWireCache.get(state);
  if (cached !== undefined && cached.rev === rev) return cached.json;
  const json = JSON.stringify(serializeReliquaryState(state) ?? {});
  reliquaryWireCache.set(state, { rev, json });
  return json;
}

/** Test-only probe: the live cache record for a state. It exists so a pin can
 *  prove a quiet tick REUSED a build by object identity, which is the thing
 *  the memo is for; equal bytes alone would pass with no memo at all. */
export function reliquaryWireCacheProbe(
  state: ReliquaryState,
): Readonly<{ rev: number; json: string }> | undefined {
  return reliquaryWireCache.get(state);
}

function pushRecent(state: ReliquaryState, id: string): void {
  // Ring layout: new entries land at the TAIL and the cap drops the HEAD, so
  // index 0 is the OLDEST entry and the last index is the newest. De-dupe:
  // only an id that is ALREADY the newest is left alone; anything else (the
  // oldest entry included) moves to the tail.
  const existing = state.recent.indexOf(id);
  if (existing >= 0 && existing === state.recent.length - 1) return;
  if (existing >= 0) state.recent.splice(existing, 1);
  state.recent.push(id);
  while (state.recent.length > RELIQUARY_RECENT_CAP) state.recent.shift();
}

// ---------------------------------------------------------------------------
// Pure ownership + completion (no mutation)
// ---------------------------------------------------------------------------

/** Any set-like container of owned item ids (itemsDiscovered or a test Set). */
export interface OwnedIdLookup {
  has(id: string): boolean;
}

/** True when an item relic is owned via the discovery ledger. */
export function ownsItemRelic(ownedItems: OwnedIdLookup, itemId: string): boolean {
  return ownedItems.has(itemId);
}

/** True when a relic slot is filled for the given ownership surfaces. */
export function isRelicFilled(
  relic: ReliquaryRelicDef,
  opts: {
    itemsDiscovered: OwnedIdLookup;
    marks?: OwnedIdLookup;
    ownedMounts?: OwnedIdLookup;
    weaponSkins?: OwnedIdLookup;
    deedsEarned?: OwnedIdLookup;
  },
): boolean {
  switch (relic.kind) {
    case 'item':
      return opts.itemsDiscovered.has(relic.itemId);
    case 'mark':
      return opts.marks?.has(relic.markId) === true;
    case 'mount':
      return opts.ownedMounts?.has(relic.mountId) === true;
    case 'weapon_skin':
      return opts.weaponSkins?.has(relic.skinId) === true;
    case 'title':
      return opts.deedsEarned?.has(relic.deedId) === true;
  }
}

/** Page progress X/Y over item (+ optional other) ownership. */
export function pageCompletion(
  page: ReliquaryPageDef,
  opts: {
    itemsDiscovered: OwnedIdLookup;
    marks?: OwnedIdLookup;
    ownedMounts?: OwnedIdLookup;
    weaponSkins?: OwnedIdLookup;
    deedsEarned?: OwnedIdLookup;
  },
): { owned: number; total: number; complete: boolean } {
  let owned = 0;
  const total = page.relics.length;
  for (const relic of page.relics) {
    if (isRelicFilled(relic, opts)) owned++;
  }
  return { owned, total, complete: total > 0 && owned === total };
}

/** Catalog-wide unique item-relic progress (item ids de-duped across pages). */
export function catalogItemCompletion(
  itemsDiscovered: OwnedIdLookup,
  pages: readonly ReliquaryPageDef[] = RELIQUARY_PAGES,
): { owned: number; total: number } {
  const all = new Set<string>();
  let owned = 0;
  for (const page of pages) {
    for (const relic of page.relics) {
      if (relic.kind !== 'item') continue;
      if (all.has(relic.itemId)) continue;
      all.add(relic.itemId);
      if (itemsDiscovered.has(relic.itemId)) owned++;
    }
  }
  return { owned, total: all.size };
}

/**
 * Catalog-wide unique relic progress for Curator rank and Overview totals:
 * de-duped item relics, authored mark relics, and Horizons mounts / skins /
 * titles. Ownership stays on existing seams (itemsDiscovered, marks,
 * ownedMounts, weaponSkins, deedsEarned); never a second discovery set.
 */
export function catalogRelicCompletion(
  opts: {
    itemsDiscovered: OwnedIdLookup;
    marks?: OwnedIdLookup;
    ownedMounts?: OwnedIdLookup;
    weaponSkins?: OwnedIdLookup;
    deedsEarned?: OwnedIdLookup;
  },
  pages: readonly ReliquaryPageDef[] = RELIQUARY_PAGES,
): { owned: number; total: number } {
  const items = catalogItemCompletion(opts.itemsDiscovered, pages);
  const allMarks = new Set<string>();
  const allMounts = new Set<string>();
  const allSkins = new Set<string>();
  const allTitles = new Set<string>();
  let marksOwned = 0;
  let mountsOwned = 0;
  let skinsOwned = 0;
  let titlesOwned = 0;
  for (const page of pages) {
    for (const relic of page.relics) {
      if (relic.kind === 'mark') {
        if (allMarks.has(relic.markId)) continue;
        allMarks.add(relic.markId);
        if (opts.marks?.has(relic.markId) === true) marksOwned++;
      } else if (relic.kind === 'mount') {
        if (allMounts.has(relic.mountId)) continue;
        allMounts.add(relic.mountId);
        if (opts.ownedMounts?.has(relic.mountId) === true) mountsOwned++;
      } else if (relic.kind === 'weapon_skin') {
        if (allSkins.has(relic.skinId)) continue;
        allSkins.add(relic.skinId);
        if (opts.weaponSkins?.has(relic.skinId) === true) skinsOwned++;
      } else if (relic.kind === 'title') {
        if (allTitles.has(relic.deedId)) continue;
        allTitles.add(relic.deedId);
        if (opts.deedsEarned?.has(relic.deedId) === true) titlesOwned++;
      }
    }
  }
  return {
    owned: items.owned + marksOwned + mountsOwned + skinsOwned + titlesOwned,
    total: items.total + allMarks.size + allMounts.size + allSkins.size + allTitles.size,
  };
}

/**
 * Character-durable fills for Curator rank thresholds and rank-deed grants:
 * items + marks + mounts + titles. Account weapon skins never score rank
 * (they are not on PlayerMeta; Overview totals still count them via
 * catalogRelicCompletion). Keeps grant path and display rank aligned.
 */
export function catalogRankOwned(
  opts: {
    itemsDiscovered: OwnedIdLookup;
    marks?: OwnedIdLookup;
    ownedMounts?: OwnedIdLookup;
    deedsEarned?: OwnedIdLookup;
  },
  pages: readonly ReliquaryPageDef[] = RELIQUARY_PAGES,
): number {
  return catalogCharacterCompletion(opts, pages).owned;
}

/**
 * Character-scoped Reliquary completion pair for character sheet and public
 * sheet fields. Owned matches catalogRankOwned (items + marks + mounts +
 * titles). Total excludes account weapon-skin slots so the pair never invents
 * character progress from account cosmetics. Overview still uses the full
 * catalogRelicCompletion (skins included when the host has them).
 */
export function catalogCharacterCompletion(
  opts: {
    itemsDiscovered: OwnedIdLookup;
    marks?: OwnedIdLookup;
    ownedMounts?: OwnedIdLookup;
    deedsEarned?: OwnedIdLookup;
  },
  pages: readonly ReliquaryPageDef[] = RELIQUARY_PAGES,
): { owned: number; total: number } {
  const full = catalogRelicCompletion(
    {
      itemsDiscovered: opts.itemsDiscovered,
      marks: opts.marks,
      ownedMounts: opts.ownedMounts,
      deedsEarned: opts.deedsEarned,
      // Explicitly omit weapon skins from character-scoped sheet math.
      weaponSkins: undefined,
    },
    pages,
  );
  const skinSlots = new Set<string>();
  for (const page of pages) {
    for (const relic of page.relics) {
      if (relic.kind === 'weapon_skin') skinSlots.add(relic.skinId);
    }
  }
  return { owned: full.owned, total: full.total - skinSlots.size };
}

/**
 * Pure ownership surfaces for Reliquary completion reads. Prefer this helper
 * so Sim, ClientWorld, and tests share one opts shape (no parallel discovery).
 */
export function reliquaryOwnershipOpts(input: {
  itemsDiscovered: OwnedIdLookup;
  marks?: OwnedIdLookup;
  ownedMounts?: readonly string[] | OwnedIdLookup;
  weaponSkinIds?: readonly string[] | OwnedIdLookup;
  deedsEarned?: OwnedIdLookup;
}): {
  itemsDiscovered: OwnedIdLookup;
  marks?: OwnedIdLookup;
  ownedMounts?: OwnedIdLookup;
  weaponSkins?: OwnedIdLookup;
  deedsEarned?: OwnedIdLookup;
} {
  return {
    itemsDiscovered: input.itemsDiscovered,
    marks: input.marks,
    ownedMounts: asOwnedLookup(input.ownedMounts),
    weaponSkins: asOwnedLookup(input.weaponSkinIds),
    deedsEarned: input.deedsEarned,
  };
}

/**
 * Character-scoped ownership for mutation paths and join sync: items, marks,
 * live ownedMounts (bags+bank reins), and deedsEarned. Weapon skins are
 * account cosmetics and are not on PlayerMeta; hosts pass them separately
 * for page/Overview fills only (never rank grants).
 */
export interface ReliquaryOwnershipSurfaces {
  itemsDiscovered: OwnedIdLookup;
  marks: OwnedIdLookup;
  ownedMounts: OwnedIdLookup;
  deedsEarned: OwnedIdLookup;
}

export function characterReliquaryOwnership(meta: PlayerMeta): ReliquaryOwnershipSurfaces {
  return {
    itemsDiscovered: meta.deedStats.itemsDiscovered,
    marks: meta.reliquary.marks,
    ownedMounts: new Set(ownedMountKeys(meta)),
    deedsEarned: meta.deedsEarned,
  };
}

function asOwnedLookup(
  value: readonly string[] | OwnedIdLookup | undefined,
): OwnedIdLookup | undefined {
  if (value === undefined) return undefined;
  if (typeof (value as OwnedIdLookup).has === 'function' && !Array.isArray(value)) {
    return value as OwnedIdLookup;
  }
  const set = new Set(value as readonly string[]);
  return set;
}

/**
 * Pure Curator rank tiers: cosmetic-only. Rank from unique catalogued relic
 * fills (never kill count alone). Rewards are titles / borders / window seal
 * chrome; never combat stats, drop rate, pity, or actionable combat info.
 * Thresholds are inclusive minimums for rank 1..N. Rank 0 = none.
 */
export interface CuratorRankDef {
  /** Rank index 1..N (matches curatorRankFromOwned). */
  rank: number;
  /** Inclusive unique-owned minimum for this rank. */
  threshold: number;
  /** Window seal chrome id (CSS data-seal); derived, never stored. */
  sealId: string;
  /**
   * Optional zero-Renown deed bridge granted when this rank is first reached.
   * Titles/borders only; renown must stay 0 (luck/catalog prestige never
   * scores Renown). grantDeed is the sticky set; no rankRewardsGranted blob.
   */
  deedId?: string;
}

export const CURATOR_RANK_DEFS: readonly CuratorRankDef[] = [
  { rank: 1, threshold: 1, sealId: 'apprentice' },
  { rank: 2, threshold: 10, sealId: 'keeper', deedId: 'col_reliquary_rank_2' },
  { rank: 3, threshold: 25, sealId: 'master', deedId: 'col_reliquary_rank_3' },
  { rank: 4, threshold: 50, sealId: 'grand', deedId: 'col_reliquary_rank_4' },
  { rank: 5, threshold: 100, sealId: 'eternal', deedId: 'col_reliquary_rank_5' },
];

/** Inclusive unique-owned thresholds for rank 1..N (derived from CURATOR_RANK_DEFS). */
export const CURATOR_RANK_THRESHOLDS: readonly number[] = CURATOR_RANK_DEFS.map((d) => d.threshold);

export function curatorRankFromOwned(
  ownedUnique: number,
  thresholds: readonly number[] = CURATOR_RANK_THRESHOLDS,
): number {
  if (!(ownedUnique > 0)) return 0;
  let rank = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (ownedUnique >= thresholds[i]) rank = i + 1;
    else break;
  }
  return rank;
}

/** Seal chrome id for a rank, or null when unranked. Pure; never invents power. */
export function curatorSealIdForRank(rank: number): string | null {
  if (!(rank > 0)) return null;
  const def = CURATOR_RANK_DEFS[rank - 1];
  return def?.sealId ?? null;
}

/**
 * Grant zero-Renown Curator rank deed bridges for every rank the player has
 * already earned by unique catalogued fill count. Idempotent via grantDeed.
 * Does not force saveCharacter itself: grantDeed (title/border durability)
 * is the existing durability-critical path when a new deed lands.
 */
export function syncCuratorRankDeeds(
  ctx: SimContext,
  meta: PlayerMeta,
  opts?: Readonly<{ retro?: boolean }>,
  /** The chain's already-built ownership snapshot, when a caller has one. Its
   *  item / mark / deed surfaces are live references, so a snapshot taken
   *  earlier in the same fill chain scores exactly what a rebuild here would. */
  ownership: ReliquaryOwnershipSurfaces = characterReliquaryOwnership(meta),
): void {
  const owned = catalogRankOwned(ownership);
  const rank = curatorRankFromOwned(owned);
  if (rank <= 0) return;
  for (let i = 0; i < rank; i++) {
    const deedId = CURATOR_RANK_DEFS[i]?.deedId;
    if (!deedId) continue;
    ctx.grantDeed(meta, deedId, opts?.retro ? { retro: true } : undefined);
  }
}

/** Convenience: live pages in append order (skip missing defs). */
export function orderedReliquaryPages(
  order: readonly string[] = RELIQUARY_PAGE_ORDER,
  byId: Readonly<Record<string, ReliquaryPageDef>> = RELIQUARY_PAGES_BY_ID,
): ReliquaryPageDef[] {
  const out: ReliquaryPageDef[] = [];
  for (const id of order) {
    const page = byId[id];
    if (page) out.push(page);
  }
  return out;
}

// Re-export catalog lookup helpers so callers can import from one runtime module.
export {
  isCataloguedRelicItem,
  isCataloguedRelicMark,
  RELIQUARY_ITEM_TO_PAGES,
  RELIQUARY_MARK_IDS,
  RELIQUARY_MARK_TO_PAGES,
  RELIQUARY_PAGE_ORDER,
  RELIQUARY_PAGES,
  RELIQUARY_PAGES_BY_ID,
};
