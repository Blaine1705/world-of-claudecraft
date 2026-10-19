// Encode half of the enemy cooldown row on nameplates: WHICH of a player's
// tracked cooldowns (src/sim/major_cooldowns.ts, the classifier both hosts share)
// are spent, under the `mcd` key, as a sorted array of cooldown keys. The decode
// is src/net/peer_major_cooldown_wire.ts; the pair is pinned together by
// tests/major_cooldown_wire.test.ts.
//
// Never WHEN they come back. A player sees that an enemy has burned a defensive,
// not how long until it is ready again: no remaining time or deadline is ever
// sent, and the set changes only when a tracked cooldown is used or comes back,
// so the wire carries no timing beyond what the plate shows. (A client that
// watched the use happen and knows the base cooldown can still estimate it; no
// encoding can hide that while the spent state is shown at all.)
//
// It rides the STABLE AURA CHANNEL, not the base dynamic record: game.ts
// wireCacheFor splices `mcd` beside `auras` and folds this cache's revision into
// the entity's aura version, so a peer receives it on first sight, on a full
// record, and on a lite record only when the auras or this set changed. A moving
// player's lite records (sent most ticks) therefore never repeat it, and the
// client keeps its held set when a lite record omits the channel. Legacy-wire
// sessions never get it (they predate the row).
//
// The PvP medallion counts only once USED: equipping a trinket arms a lockout of
// TRINKET_EQUIP_LOCKOUT on its key (src/sim/combat/trinkets.ts), which must not
// read as a spent medallion. A key first seen above that lockout is a use; one
// first seen at or under it is the equip lockout and stays off the wire. The
// cache encodes only while someone observes the entity, so it also keeps the
// sim time the judged cooldown ends: a key that now ends LATER was re-armed
// meanwhile (a use, or an equip after an unobserved end) and is judged afresh.
// Known limit: a use made entirely unobserved and first seen in its last
// TRINKET_EQUIP_LOCKOUT seconds reads as a lockout and stays hidden.
//
// Per tick per observed entity: a walk of the entity's own cooldown map (bounded
// by the classified roster, a few dozen keys at most) into a reused scratch list,
// compared key by key; the JSON is rebuilt only when the set changed.

import { TRINKET_EQUIP_LOCKOUT } from '../src/sim/combat/trinkets';
import { majorCooldownGroup, PVP_MEDALLION_COOLDOWN_KEY } from '../src/sim/major_cooldowns';
import type { Entity } from '../src/sim/types';
import { jsonWithField } from './snapshot_timer_wire';

/** Seconds a medallion's end may drift between encodes (tick rounding, a sim
 *  time read a frame apart) before it counts as re-armed. */
const MEDALLION_REARM_SLACK = 0.5;

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class MajorCooldownWireCache {
  /** The `mcd` value as JSON: a sorted array of spent keys, or `null` for none. */
  json = 'null';
  /** Bumps whenever the paired aura revision or this set changes; the caller
   *  uses it as the entity's whole aura-channel version. */
  revision = 0;
  private current: string[] = [];
  private scratch: string[] = [];
  private auraRevision = -1;
  private medallionUsed = false;
  /** Sim time the last judged medallion cooldown ends; -Infinity for none. */
  private medallionEndsAt = Number.NEGATIVE_INFINITY;

  encode(e: Entity, auraRevision: number, simTime: number): this {
    let changed = auraRevision !== this.auraRevision;
    this.auraRevision = auraRevision;
    const next = this.scratch;
    next.length = 0;
    if (e.kind === 'player' && e.cooldowns.size > 0) {
      for (const [key, remaining] of e.cooldowns) {
        if (!(remaining > 0) || majorCooldownGroup(key) === null) continue;
        if (key === PVP_MEDALLION_COOLDOWN_KEY && !this.judgeMedallion(remaining, simTime)) {
          continue;
        }
        next.push(key);
      }
      next.sort();
    }
    if (!((e.cooldowns.get(PVP_MEDALLION_COOLDOWN_KEY) ?? 0) > 0)) {
      this.medallionUsed = false;
      this.medallionEndsAt = Number.NEGATIVE_INFINITY;
    }
    if (!sameKeys(next, this.current)) {
      this.scratch = this.current;
      this.current = next;
      this.json = next.length > 0 ? JSON.stringify(next) : 'null';
      changed = true;
    }
    if (changed) this.revision++;
    return this;
  }

  /** Whether the medallion's live cooldown is a use (shown) rather than an equip
   *  lockout (hidden), judged once per arming of the key. */
  private judgeMedallion(remaining: number, simTime: number): boolean {
    const endsAt = simTime + remaining;
    if (endsAt > this.medallionEndsAt + MEDALLION_REARM_SLACK) {
      this.medallionUsed = remaining > TRINKET_EQUIP_LOCKOUT;
    }
    this.medallionEndsAt = endsAt;
    return this.medallionUsed;
  }

  /** Splice `mcd` into an entity record already carrying its `auras`. */
  splice(recordJson: string): string {
    return jsonWithField(recordJson, 'mcd', this.json);
  }
}
