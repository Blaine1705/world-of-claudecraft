// Decode half of the enemy cooldown row on nameplates: the `mcd` deadlines a
// peer player's dynamic record carries (server/major_cooldown_wire.ts) become
// remaining seconds in that entity's own `cooldowns` map, the same field the
// offline Sim fills for its bots, so the nameplate row reads one shape on both
// hosts and never asks which world it is in.
//
// The deadlines are held here, keyed by the mirrored entity, because a peer the
// server has nothing new to say about arrives as a bare `keep` id: its record is
// not re-sent while its cooldowns run, so the countdown is aged from the held
// deadlines on every snapshot clock (agePeerMajorCooldowns) instead.
//
// Never applied to the viewer's own record: the self cooldowns ride their own
// exact channel (selfWireJson `cds`) and must not be overwritten here.

import type { Entity } from '../sim/types';

const held = new WeakMap<Entity, Map<string, number>>();

function setRemaining(e: Entity, deadlines: Map<string, number>, now: number): void {
  for (const [key, deadline] of deadlines) {
    const remaining = deadline - now;
    if (remaining > 0) e.cooldowns.set(key, remaining);
    else {
      deadlines.delete(key);
      e.cooldowns.delete(key);
    }
  }
}

/** Apply one peer record's `mcd` field. An absent or empty field clears every
 *  deadline the entity held: the record is the whole truth whenever it arrives. */
export function applyPeerMajorCooldownWire(e: Entity, raw: unknown, now: number): void {
  const prior = held.get(e);
  if (prior) for (const key of prior.keys()) e.cooldowns.delete(key);
  if (raw === null || typeof raw !== 'object' || !Number.isFinite(now)) {
    held.delete(e);
    return;
  }
  const deadlines = new Map<string, number>();
  for (const [key, deadline] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof deadline === 'number' && Number.isFinite(deadline)) deadlines.set(key, deadline);
  }
  setRemaining(e, deadlines, now);
  if (deadlines.size > 0) held.set(e, deadlines);
  else held.delete(e);
}

/** Age every held peer countdown to the snapshot clock `now`. */
export function agePeerMajorCooldowns(entities: Iterable<Entity>, now: number): void {
  if (!Number.isFinite(now)) return;
  for (const e of entities) {
    const deadlines = held.get(e);
    if (!deadlines) continue;
    setRemaining(e, deadlines, now);
    if (deadlines.size === 0) held.delete(e);
  }
}
