// Natural (world-spawned) Rift portals + the C/B/A/S rank system.
//
// A scheduler opens ranked rift portals across the three overworld zones on a
// fixed sim-time cadence, announces each world-visibly, and collapses portals
// nobody closes in time. Closing a rift (killing its final boss) seals the
// portal and pays Heroic Marks scaled by rank (daily-gated per rank, riding the
// same meta.heroicDaily set the heroic dungeons use).
//
// Determinism: this module NEVER draws from the shared ctx.rng stream. Every
// roll (zone, rank, position, rift seed) comes from a dedicated Rng derived
// from (world seed, spawn ordinal), so adding the scheduler does not shift the
// global draw order any existing content depends on.
//
// State (naturalRiftPortals, riftPortalSpawnCount) stays on Sim as live
// SimContext views; behaviour lives here (module-first, SimContext seam).

import { isBlocked } from '../colliders';
import { WORLD_MAX_X, WORLD_MIN_X, ZONES } from '../data';
import { createGroundObject } from '../entity';
import { Rng } from '../rng';
import type { SimContext } from '../sim_context';
import { RIFT_TIER_COLORS, type RiftTier } from '../types';
import { groundHeight, WATER_LEVEL } from '../world';
import { generateRiftPlan } from './rift_gen';

// Every rift portal is endgame content: level 20+ only, in every zone (a low
// level player walking into an Eastbrook portal gets the denial line instead).
export const RIFT_MIN_LEVEL = 20;

export const RIFT_PORTAL_FIRST_AT = 120; // s of sim time before the first natural portal
export const RIFT_PORTAL_INTERVAL = 300; // s between natural portal spawns
export const RIFT_PORTAL_LIFETIME = 900; // s an unclosed portal stays before collapsing
export const RIFT_PORTAL_MAX_OPEN = 3; // open natural portals at once, world-wide

/** Per-rank tuning: the generated dungeon's baseLevel (MAX_LEVEL is 20, so B+
 * mobs run above the player cap), the Heroic Marks paid on sealing it, and the
 * badge colour both hosts render above the portal. */
export const RIFT_TIER_INFO: Record<RiftTier, { baseLevel: number; marks: number; color: number }> =
  {
    C: { baseLevel: 20, marks: 1, color: RIFT_TIER_COLORS.C },
    B: { baseLevel: 22, marks: 2, color: RIFT_TIER_COLORS.B },
    A: { baseLevel: 25, marks: 3, color: RIFT_TIER_COLORS.A },
    S: { baseLevel: 28, marks: 4, color: RIFT_TIER_COLORS.S },
  };

/** Zone band -> rank pool: Eastbrook Vale rolls only C, Mirefen Marsh B/A,
 * Thornpeak Heights A/S (higher zones skew higher). */
export function riftTierForZone(zoneIndex: number, roll: number): RiftTier {
  if (zoneIndex <= 0) return 'C';
  if (zoneIndex === 1) return roll < 0.6 ? 'B' : 'A';
  return roll < 0.6 ? 'A' : 'S';
}

/** One open world-spawned portal (a live Sim-field view via SimContext). */
export interface NaturalRiftPortal {
  id: number; // portal ground-object entity id
  tier: RiftTier;
  zoneName: string;
  riftName: string;
  expiresAt: number; // sim time; collapse when nobody closed it
}

function announce(ctx: SimContext, text: string, color: string): void {
  ctx.emit({ type: 'log', text, color });
}

function spawnNaturalRiftPortal(ctx: SimContext, ordinal: number): void {
  // Dedicated stream per spawn ordinal: never the shared ctx.rng.
  const rng = new Rng((ctx.cfg.seed ^ ((ordinal + 1) * 0x9e3779b9)) >>> 0);
  const zoneIndex = rng.int(0, ZONES.length - 1);
  const zone = ZONES[zoneIndex];
  const tier = riftTierForZone(zoneIndex, rng.next());
  const info = RIFT_TIER_INFO[tier];

  // Deterministic rejection sampling for a sane overworld spot: on land, out of
  // buildings/props, and clear of the hub settlement.
  let x = zone.hub.x;
  let z = zone.hub.z + zone.hub.radius + 40;
  for (let attempt = 0; attempt < 24; attempt++) {
    const cx = rng.range(WORLD_MIN_X + 30, WORLD_MAX_X - 30);
    const cz = rng.range(zone.zMin + 25, zone.zMax - 25);
    const hubD = Math.hypot(cx - zone.hub.x, cz - zone.hub.z);
    if (hubD < zone.hub.radius + 30) continue;
    if (groundHeight(cx, cz, ctx.cfg.seed) < WATER_LEVEL + 0.5) continue;
    if (isBlocked(ctx.cfg.seed, cx, cz, 1.5)) continue;
    x = cx;
    z = cz;
    break;
  }

  const seed = rng.int(1, 1_000_000_000) >>> 0;
  const plan = generateRiftPlan(seed, info.baseLevel);
  const portal = createGroundObject(ctx.nextId++, '', plan.name, ctx.groundPos(x, z));
  portal.templateId = 'rift_portal';
  portal.objectItemId = null;
  portal.lootable = true;
  portal.riftSeed = seed;
  portal.riftBaseLevel = info.baseLevel;
  portal.riftTier = tier;
  ctx.addEntity(portal);
  ctx.naturalRiftPortals.push({
    id: portal.id,
    tier,
    zoneName: zone.name,
    riftName: plan.name,
    expiresAt: ctx.time + RIFT_PORTAL_LIFETIME,
  });
  announce(ctx, `A ${tier}-rank rift tears open in ${zone.name}!`, '#d9f');
}

/** Seal (boss killed) or collapse (timed out) a natural portal by entity id.
 * Safe to call for dev-spawned portals: an id not in the registry is a no-op. */
export function closeNaturalRiftPortal(
  ctx: SimContext,
  portalId: number,
  outcome: 'sealed' | 'collapsed',
): void {
  const i = ctx.naturalRiftPortals.findIndex((p) => p.id === portalId);
  if (i < 0) return;
  const p = ctx.naturalRiftPortals[i];
  ctx.naturalRiftPortals.splice(i, 1);
  if (ctx.entities.has(p.id)) ctx.dropEntity(p.id);
  if (outcome === 'sealed') {
    announce(ctx, `The ${p.tier}-rank rift in ${p.zoneName} has been sealed.`, '#9f9');
  } else {
    announce(ctx, `The ${p.tier}-rank rift in ${p.zoneName} collapses.`, '#a9c');
  }
}

/** Per-tick scheduler (runs once a second, offset from the instance driver's
 * tick slot): expire overdue portals, then open a new one when the cadence is
 * due and the world-wide open cap has room. A due spawn skipped by the cap is
 * consumed (not queued), so a busy world does not burst-spawn later. */
export function updateRiftPortals(ctx: SimContext): void {
  if (ctx.tickCount % 20 !== 10) return;

  for (let i = ctx.naturalRiftPortals.length - 1; i >= 0; i--) {
    const p = ctx.naturalRiftPortals[i];
    if (ctx.time >= p.expiresAt) closeNaturalRiftPortal(ctx, p.id, 'collapsed');
  }

  const due = ctx.time >= RIFT_PORTAL_FIRST_AT + ctx.riftPortalSpawnCount * RIFT_PORTAL_INTERVAL;
  if (!due) return;
  const ordinal = ctx.riftPortalSpawnCount;
  ctx.riftPortalSpawnCount += 1;
  if (ctx.naturalRiftPortals.length >= RIFT_PORTAL_MAX_OPEN) return;
  spawnNaturalRiftPortal(ctx, ordinal);
}
