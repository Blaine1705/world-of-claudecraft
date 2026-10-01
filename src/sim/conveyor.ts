// Conveyor regions (G19 in docs/design/dungeon-rework/README.md): a floor
// region that carries whatever stands on it, a few yards a second along its
// heading (Line-Master Tock's belts in the Stormbrass Foundry). Each tick the
// body is displaced through the knockback's terrain clamp and collider sweep
// (knockback.ts displaceAlong, resolved by ctx.resolveMove), so a carried body
// stops at a wall, a press post or a cliff edge exactly like a shoved one, and
// the result is identical on every host. A player in the air (a jump) rides
// over the belt; the shields that hold a body against a pull hold it here too
// (Ice Block, the Veilbound March, the Mooring Stone, a dev anchor). Zero rng.

import { isVeilboundMarchActive } from './combat/paladin_veilbound_state';
import { isMoored } from './combat/trinkets';
import { displaceAlong } from './knockback';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

/** An axis-aligned conveyor in world coordinates and its velocity (yd/s). */
export interface ConveyorRegion {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  vx: number;
  vz: number;
}

/** The region a body stands in, or null (regions never overlap). */
export function conveyorUnder(
  regions: readonly ConveyorRegion[],
  x: number,
  z: number,
): ConveyorRegion | null {
  for (const r of regions) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

/** Is a body held in place against a conveyor this tick? */
function heldInPlace(ctx: SimContext, body: Entity): boolean {
  if (body.kind !== 'player') return false;
  if (!body.onGround) return true;
  if (ctx.isIceBlocked(body) || isVeilboundMarchActive(body) || isMoored(body)) return true;
  return ctx.cfg.devCommands === true && ctx.players.get(body.id)?.devAnchored === true;
}

/**
 * Carry each living body standing on a region along it for `dt` seconds.
 * Bodies are walked in the caller's order (entity-id order keeps it
 * deterministic). Returns the ids of the bodies that moved.
 */
export function carryOnConveyors(
  ctx: SimContext,
  bodies: readonly Entity[],
  regions: readonly ConveyorRegion[],
  dt: number,
): number[] {
  const moved: number[] = [];
  if (regions.length === 0) return moved;
  for (const body of bodies) {
    if (body.dead) continue;
    const r = conveyorUnder(regions, body.pos.x, body.pos.z);
    if (!r) continue;
    const speed = Math.hypot(r.vx, r.vz);
    if (speed <= 0 || heldInPlace(ctx, body)) continue;
    const yards = displaceAlong(ctx, body, r.vx / speed, r.vz / speed, speed * dt);
    if (yards > 0) {
      ctx.rebucket(body);
      moved.push(body.id);
    }
  }
  return moved;
}
