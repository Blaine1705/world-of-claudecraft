// The load-side shape bound for a persisted per-instance item payload
// (`ItemInstancePayload`, types.ts). ONE sanitizer, four call sites: the
// equipment map, the carried bags and the vendor buyback rows (all in
// Sim.addPlayer) plus the bank inventory (bank.ts sanitizeBankState). Phase
// 16's first cut clamped only `signer`, and only on two of those four, so a
// signed copy loaded through the bank or the buyback list kept an unbounded
// name, and every OTHER payload string stayed unbounded everywhere. A
// payload is JSONB this process wrote rather than something a client sent,
// but a hand-edited or corrupted row rides every autosave whole, forever:
// that is the growth this bound exists to stop, and it is the same
// shape-bound doctrine the recipe-id ceiling states
// (professions/training.ts MAX_KNOWN_RECIPE_ID_LENGTH).
//
// DROP-ONLY, never truncate and never rewrite: a truncated prefix can equal
// a DIFFERENT real value (the misattribution case the craftedBy rule in
// professions/tools.ts spells out), while an absent field is merely absent.
// Every junk key drops ALONE, so one corrupt field never takes the legal
// payload around it with it.
//
// NOT A WHITELIST, deliberately: an unknown key inside the size bounds
// SURVIVES. The payload is an ADDITIVE shape that has grown a field at a
// time since #1165, and the merge predicate (item_instance_merge.ts)
// compares EVERY present key on purpose, so a load that silently dropped a
// field this binary happens not to know about would let an older binary
// strip identity off a live copy.
//
// `src/sim`-pure (see src/sim/CLAUDE.md): no DOM/render/ui/game/net import,
// no rng, no clock. Total on `unknown`, so a corrupt row can never throw
// inside a character load.

import { isLegalCrafterName } from './professions/tools';
import type { ItemInstancePayload } from './types';

/**
 * The ceiling for every payload string EXCEPT `signer` (which answers to the
 * stricter name shape below). Ids, enchant ids and recipe ids are the real
 * population here and none of them approaches 64 characters, so anything
 * longer has no legal writer.
 */
export const MAX_INSTANCE_STRING_LENGTH = 64;

/**
 * The own-key ceiling for one payload. Sized well above the declared shape
 * because the forward-compatibility rule above admits unknown keys too, so
 * this catches only a row that has stopped being a payload at all rather
 * than one written by a newer binary.
 */
export const MAX_INSTANCE_PAYLOAD_KEYS = 24;

/** The sub-objects whose own keys are scanned one level down. Both are
 *  deep-copied by `cloneItemInstancePayload`, which is what makes it safe to
 *  delete keys inside them (see the ownership contract below); `rift` is
 *  deliberately NOT scanned, because its strings are already validated by
 *  the progression rebuild (rift/progression.ts). */
const SCANNED_SUB_OBJECT_KEYS: readonly string[] = ['rolled', 'charges'];

export interface SanitizedItemInstancePayload {
  /** The cleaned payload, or undefined when nothing usable survives (the
   *  caller then removes the field entirely: an empty `{}` payload is worse
   *  than none, since it can never stack with a plain stack of the same item
   *  again, which strands the row in its slot forever). */
  payload: ItemInstancePayload | undefined;
  /** Key paths this call removed ('signer', 'rolled.quality', ...), plus the
   *  literal 'payload' when the whole payload was dropped. For the caller's
   *  dev-channel log only: nothing reads it as a value. */
  dropped: string[];
}

/**
 * The ONE dev-channel line every call site emits when this bound removed
 * something, so the four sites cannot spell it differently. English by rule
 * (a developer log, never player text: see the i18n split in CLAUDE.md), and
 * a no-op when nothing dropped, so the call is safe to place unconditionally.
 * These bounds are otherwise entirely silent, which is what the phase 16
 * review objected to: a corrupt blob has to leave a trace an operator can
 * find, and this fires only for blobs no legal writer could have produced.
 */
export function warnDroppedInstanceKeys(owner: string, dropped: readonly string[]): void {
  if (dropped.length === 0) return;
  console.warn(`[load] dropped item-instance junk for ${owner}: ${dropped.join(',')}`);
}

/**
 * Bound one persisted instance payload on the way IN.
 *
 * OWNERSHIP CONTRACT: the caller passes a payload IT OWNS (a fresh
 * `cloneItemInstancePayload`/`cloneInvSlot` copy, or a fresh
 * `sanitizeRiftGearInstance` rebuild). This function DELETES keys in place
 * and never rebuilds the object, because a rebuild would re-order keys and
 * the save path is JSON, so a legal payload has to come back out of here
 * byte-identical. It touches the top-level object and its own `rolled` /
 * `charges` sub-objects, which are exactly the parts the clone deep-copies.
 *
 * The arms, each one drop-only:
 *  - anything that is not a plain object (null, a primitive, an array): the
 *    whole payload drops;
 *  - more own keys than MAX_INSTANCE_PAYLOAD_KEYS: the whole payload drops
 *    as corrupt, since no legal writer comes near that count;
 *  - `signer`: kept only when it is a name a legal mint could have stamped
 *    (`isLegalCrafterName`), else dropped;
 *  - any other own string value past MAX_INSTANCE_STRING_LENGTH: dropped;
 *  - the same string rule one level into `rolled` and `charges`;
 *  - a payload left with no own keys at all: dropped whole.
 */
export function sanitizeItemInstancePayloadOnLoad(payload: unknown): SanitizedItemInstancePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { payload: undefined, dropped: ['payload'] };
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > MAX_INSTANCE_PAYLOAD_KEYS) {
    return { payload: undefined, dropped: ['payload'] };
  }
  const dropped: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (key === 'signer') {
      // The signer is a character NAME, so it answers to the name shape
      // rather than to the generic string ceiling: the whole signer
      // ecosystem compares it against live player names, and a value no
      // account can hold is corruption by definition.
      if (!isLegalCrafterName(value)) {
        delete record[key];
        dropped.push(key);
      }
      continue;
    }
    if (typeof value === 'string') {
      if (value.length > MAX_INSTANCE_STRING_LENGTH) {
        delete record[key];
        dropped.push(key);
      }
      continue;
    }
    if (!SCANNED_SUB_OBJECT_KEYS.includes(key)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const sub = value as Record<string, unknown>;
    for (const subKey of Object.keys(sub)) {
      const subValue = sub[subKey];
      if (typeof subValue === 'string' && subValue.length > MAX_INSTANCE_STRING_LENGTH) {
        delete sub[subKey];
        dropped.push(`${key}.${subKey}`);
      }
    }
  }
  if (Object.keys(record).length === 0) {
    // Reported as a drop of the payload itself so the caller's dev log names
    // it: an already-empty stored `{}` reaches here having lost nothing, and
    // it is still the stranding case above.
    dropped.push('payload');
    return { payload: undefined, dropped };
  }
  return { payload: record as ItemInstancePayload, dropped };
}
