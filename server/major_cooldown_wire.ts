// Encode half of the enemy cooldown row on nameplates: a player's tracked
// cooldowns (src/sim/major_cooldowns.ts, the classifier both hosts share) as
// absolute deadlines on the sim clock, under the `mcd` key of the peer dynamic
// record. The decode is src/net/peer_major_cooldown_wire.ts; the pair is pinned
// together by tests/major_cooldown_wire.test.ts.
//
// Deadlines, not remaining seconds, for the reason the stable aura wire uses
// them: a deadline holds still while the cooldown counts down, so the
// per-entity dynamic cache (wireCacheFor) only re-serializes the record on the
// tick a tracked cooldown is armed or runs out, never every tick it ticks.
//
// Runs inside the per-entity, per-tick dynamic stringify, so it stays a walk of
// the entity's own cooldown map (bounded by the classified roster, a few dozen
// keys at most) that allocates only when a tracked cooldown is actually running.
// Players only: a mob's cooldowns never ride. Sparse: no running tracked
// cooldown, no key.

import { majorCooldownGroup } from '../src/sim/major_cooldowns';
import type { Entity } from '../src/sim/types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function writeMajorCooldownWire(
  e: Entity,
  simTime: number,
  out: Record<string, unknown>,
): void {
  if (e.kind !== 'player' || e.cooldowns.size === 0) return;
  let wire: Record<string, number> | null = null;
  for (const [key, remaining] of e.cooldowns) {
    if (!(remaining > 0) || majorCooldownGroup(key) === null) continue;
    if (wire === null) wire = {};
    wire[key] = round2(simTime + remaining);
  }
  if (wire !== null) out.mcd = wire;
}
