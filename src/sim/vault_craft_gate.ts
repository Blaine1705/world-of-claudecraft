// Where a craft may reach into the Materials Vault, and where it may not.
//
// PURPOSE-BUILT for ONE question: may this player's craft (or enchant) draw
// reagents out of their Materials Vault from where they are standing right
// now? The vault is a TOWN service (its four command bodies are all
// nearBanker-gated, materials_vault.ts), and the two-pool crafting mechanic
// deliberately relaxes that for the CRAFT path only: you may spend stockpiled
// material anywhere the vault is conceptually reachable. THE OPEN WORLD IS THE
// ONLY ALLOWED CONTEXT. Every instanced context refuses, so a party cannot
// resupply a raid consumable from an infinite-feeling pocket stockpile
// mid-clear, and a rated bout cannot be decided by who banked more reagents.
//
// The predicate is FAIL CLOSED, through two KINDS of arm. Be precise about
// which context gets which, because it is not uniform:
//
// - MEMBERSHIP arms (battleground, arena, delve) answer logical presence.
//   They are keyed by player id, so they still refuse in the frames where the
//   player's POSITION does not yet (or no longer) says where they are: a match
//   formed but not teleported into, a delve run whose room was already torn
//   down, the gap between a run ending and the exit teleport landing.
// - GEOMETRY arms answer physical presence. Dungeon, raid and rift have ONLY
//   these: a player staged at a dungeon door is standing in the open world and
//   may legitimately draw, so there is no membership arm to add for them and
//   none is missing.
//
// The band backstop at the bottom is a THIRD thing again, and it is what makes
// the whole predicate safe rather than merely correct: it refuses anywhere on
// the instance plane even when no live record can be found at all (a slot
// freed the instant a wipe resolved, a hand-edited save parked in a band with
// no run). It provably subsumes the two position arms above it for today's
// layout; those are kept anyway because they are layout-INDEPENDENT, and the
// layout is not (the Yumi band's own header records that its absolute x
// already had to move once, when the world grid landed).
//
// NEW INSTANCED CONTENT MUST BE ADDED HERE. Nothing about this is automatic: a
// future band placed WEST of DUNGEON_X_THRESHOLD slips past the backstop, and
// a context with no per-player registry has no membership arm to add. Ship the
// content without touching this file and you have shipped a vault-fed
// instance.
//
// NEVER reuse colliders.ts isInstancedRegion for this. That predicate is the
// PHYSICS SOLVER's dispatch switch (which collider set to scan), it deliberately
// excludes the battleground band (Thornhollow Fields carries real sculpted
// terrain and registers its colliders into the open-world spatial grid), and a
// vault gate built on it would hand every battleground team an infinite pocket
// stockpile.
//
// `src/sim`-pure: no DOM/Three/render-ui-game-net imports, no Math.random/
// Date.now. This module draws NO rng and mutates nothing.

import { DUNGEON_X_THRESHOLD } from './data';
import { instanceInfoAt } from './instances/dungeons';
import { riftInstanceAtPos } from './rift/runs';
import type { SimContext } from './sim_context';

/**
 * True when vault reagent draw is REFUSED for `pid` where they stand: the
 * craft falls back to carried materials alone, exactly as it behaved before
 * the two-pool mechanic landed.
 *
 * An unresolvable pid (no meta, no entity, or both) refuses, the fail-closed
 * direction: a draw we cannot place is a draw we do not perform.
 */
export function vaultDrawBlocked(ctx: SimContext, pid: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return true;
  const pos = r.e.pos;
  // A non-finite coordinate is a corrupt position, not the open world. BOTH
  // axes are checked because both are consumed: a NaN z alone would still
  // read as open world, since the band comparison below only looks at x while
  // the two region reads (which do look at z) answer null for a NaN the same
  // way they answer null for a real open-world position. Every comparison
  // against NaN is false, so a corrupt coordinate that is not refused here is
  // refused nowhere.
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return true;
  // Battleground (Thornhollow Fields, social/battleground.ts): keyed per
  // participant pid, so it closes the pre-teleport and post-match frames.
  if (ctx.bgMatches.has(pid)) return true;
  // Arena (the Ashen Coliseum, social/arena.ts), which also carries the 2v2,
  // fiesta and Protect Yumi formats on the same match map. A DELIBERATE sixth
  // context beyond the five-context ruling: ranked arena postdates that
  // ruling, and competitive parity is the rationale the ruling itself gives.
  if (ctx.arenaMatches.has(pid)) return true;
  // Delve (I2a private party instances): the run registry is per player, so a
  // run torn down a tick before the exit teleport still refuses.
  if (ctx.delveRunForPlayer(pid) !== null) return true;
  // Dungeon AND raid: instanceInfoAt is the canonical claim-footprint read
  // over the live slot pool (the raid instances are ordinary slots carrying a
  // RAID_ALLOWED_DUNGEON_IDS dungeon id, so one arm covers both). It is
  // position-keyed and does NOT filter freed slots, which is the fail-closed
  // direction here.
  if (instanceInfoAt(ctx, pos) !== null) return true;
  // Rift (procedural floors): the floor-region read over the live rift pool.
  //
  // Both of the arms above are SUBSUMED by the band backstop below for today's
  // layout (every claim footprint and every floor region is anchored far east
  // of the threshold), so neither can be the deciding arm right now. They are
  // the layout-independent statement of the same refusal and they are what
  // keeps this file honest if a band ever moves; see the header.
  if (riftInstanceAtPos(ctx, pos) !== null) return true;
  // THE GEOMETRY BACKSTOP, one arm rather than seven.
  //
  // Every instanced band in the game sits on the far-east instance plane, and
  // every one of them opens at least 3575 yards EAST of this threshold, so
  // this single comparison provably subsumes all seven band predicates in
  // data.ts. Measured from INSTANCE_X_BASE, with DUNGEON_X_THRESHOLD at +600:
  // the dungeon band opens at +900 (instanceOrigin) and its overflow arm at
  // +15000; ARENA_X_MIN at +4175 (ARENA_X +4200 less DUNGEON_WALL_X 23 +
  // DUNGEON_WALL_HW 1 + 1); DELVE_BAND_X_MIN at +4773; VC_PRACTICE_BAND_X_MIN
  // at +6000; RIFT_BAND_X_MIN at +8960; YUMI_BAND_X_MIN at +10000;
  // BG_BAND_X_MIN at +30000. So isArenaPos/isDelvePos/isVcPracticePos/
  // isRiftPos/isYumiMazePos/isBgPos and the dungeon band arm are each dropped
  // as provably subsumed, NOT as unimportant.
  //
  // It also covers what none of them do: the far-east VOID between and beyond
  // the bands, which is where a half-finished teleport or a hand-edited save
  // parks a character. No legitimate open-world position is ever out here (the
  // whole instance plane was moved to INSTANCE_X_BASE precisely so real zones
  // could keep growing east without standing in it).
  //
  // ONE dependency worth naming: pre-grid saves carry instance positions in
  // the OLD bands, west of INSTANCE_X_BASE and therefore west of this
  // threshold. They read as open world here, and the only reason that is safe
  // is that data.ts migrateLegacyInstancePos remaps every one of them to a
  // door position at load, so no live entity ever sits there. A load path that
  // skipped that migration would need its own arm.
  return pos.x > DUNGEON_X_THRESHOLD;
}

/**
 * The LIVE vault stock a reagent draw may spend for `pid` here, or null when
 * this player draws from their bags alone (unresolvable, or
 * `vaultDrawBlocked`). Null is the "behaves exactly like before the two-pool
 * mechanic" answer that every caller branches on. In practice null means
 * BLOCKED OR UNRESOLVABLE and nothing else: `PlayerMeta.vault` is
 * non-optional and every player is constructed with `{ stock: {}, upgrades:
 * 0 }`, so a resolvable open-world player always gets a record (an empty one
 * plans no takes, which is the same byte-identical outcome). The `?? null`
 * arm below is defensive against a meta-less pid only. Consumers must never
 * read null as "has no vault".
 *
 * THE RETURNED RECORD IS THE LIVE `PlayerMeta.vault.stock` REFERENCE, not a
 * clone, and that carries obligations:
 *
 * - SIM-INTERNAL ONLY. It must never be handed across the IWorld seam, put on
 *   a snapshot, or returned from a world-api member. `materials_vault.ts`
 *   `craftVaultStockFor` is the ONLY boundary shape; every consumer outside
 *   the sim takes that clone.
 * - READ-ONLY to its consumers. Nothing may write to it directly. The one
 *   sanctioned mutation is `consumeVaultStock`, which owns the drawable rule
 *   and the delete-at-zero write shape.
 *
 * It is live rather than cloned because the consume path plans nothing it does
 * not immediately spend: a second reagent naming the same material must see
 * the first one's spend, and a snapshot would let both claim the same units.
 *
 * Ungated the same way `consumeVaultStock` is (no rung, no nearBanker, no dead
 * check), for the same reasons: this is the read half of that primitive, and
 * `vaultDrawBlocked` above is the gate that actually applies here.
 */
export function vaultDrawStock(ctx: SimContext, pid: number): Record<string, number> | null {
  if (vaultDrawBlocked(ctx, pid)) return null;
  return ctx.players.get(pid)?.vault?.stock ?? null;
}
