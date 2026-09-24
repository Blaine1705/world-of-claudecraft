// Thundercall v0.44 rework kit: the classic elemental procs layered on the
// build-and-vent Thunder engine (combat/shaman_thundercall.ts).
//
// - Arc Overload: the TBC Lightning Overload talent at 5/5 (20% chance, the
//   repeat strikes for half). Its repeat also banks one Thunder, so the bank
//   fills at a variable pace instead of a fixed five-bolt count.
// - Magma Burst: the Wrath Lava Burst rule, a guaranteed crit against a
//   target carrying the caster's own Cinder Jolt DoT.
// - Magma Surge: the Cataclysm Lava Surge proc (20% per Cinder Jolt tick)
//   resets Magma Burst and makes the next one instant.
// - Stormbreak: the Wrath Thunderstorm's 8% maximum Mana return.
//
// Every rng draw here is gated on a Thundercall caster who KNOWS the relevant
// ability, so no other build's draw stream moves. Design and numbers:
// docs/prd/shaman-thundercall-elemental-v028.md ("v0.44.0 rework").

import type { SimContext } from '../sim_context';
import type { Aura, Entity } from '../types';
import { addThunderCharges, MAGMA_SURGE_ID } from './shaman_thundercall';

export const ARC_OVERLOAD_ABILITY_ID = 'lightning_overload';
export const ARC_OVERLOAD_CHANCE = 0.2;
export const ARC_OVERLOAD_DAMAGE_FRACTION = 0.5;
export const ARC_OVERLOAD_THUNDER = 1;
export const MAGMA_BURST_ABILITY_ID = 'lava_burst';
export const MAGMA_SURGE_CHANCE = 0.2;
export const MAGMA_SURGE_DURATION = 10;
export const STORMBREAK_ABILITY_ID = 'thunderstorm';
export const STORMBREAK_MANA_FRACTION = 0.08;

const CINDER_JOLT_DOT_ID = 'flame_shock';
const OVERLOAD_ABILITIES: ReadonlySet<string> = new Set(['lightning_bolt', 'chain_lightning']);

function thundercallMeta(ctx: SimContext, player: Entity | null) {
  if (!player || player.kind !== 'player') return null;
  const meta = ctx.players.get(player.id);
  if (!meta || ctx.playerMods(meta).spec !== 'elemental') return null;
  return meta;
}

function knows(ctx: SimContext, player: Entity, abilityId: string): boolean {
  const meta = thundercallMeta(ctx, player);
  return meta !== null && meta.known.some((known) => known.def.id === abilityId);
}

/**
 * Rolls Arc Overload after a landed Arc Bolt or Skybranch. `landedDamage` is
 * the fully resolved amount the primary hit dealt (crit included), so the
 * repeat is an exact half copy and draws no damage or crit roll of its own:
 * the only draw is the proc chance itself.
 */
export function rollArcOverload(
  ctx: SimContext,
  player: Entity,
  target: Entity,
  abilityId: string,
  landedDamage: number,
  threatOpts?: { flat?: number; mult?: number },
): boolean {
  if (!OVERLOAD_ABILITIES.has(abilityId) || landedDamage <= 0 || target.dead) return false;
  if (!knows(ctx, player, ARC_OVERLOAD_ABILITY_ID)) return false;
  if (!ctx.rng.chance(ARC_OVERLOAD_CHANCE)) return false;
  ctx.emit({
    type: 'spellfx',
    sourceId: player.id,
    targetId: target.id,
    school: 'nature',
    fx: 'projectile',
    ability: 'lightning_bolt',
  });
  ctx.dealDamage(
    player,
    target,
    Math.max(1, Math.round(landedDamage * ARC_OVERLOAD_DAMAGE_FRACTION)),
    false,
    'nature',
    'Arc Overload',
    'hit',
    false,
    threatOpts,
    true,
    false,
    // The copied amount already carries every source-output multiplier.
    true,
    ARC_OVERLOAD_ABILITY_ID,
  );
  addThunderCharges(ctx, player, ARC_OVERLOAD_THUNDER);
  return true;
}

/** Magma Burst always crits a target burning with the caster's own Cinder Jolt. */
export function magmaBurstGuaranteedCrit(
  ctx: SimContext,
  player: Entity,
  abilityId: string,
  target: Entity,
): boolean {
  if (abilityId !== MAGMA_BURST_ABILITY_ID || thundercallMeta(ctx, player) === null) return false;
  return target.auras.some(
    (aura) => aura.id === CINDER_JOLT_DOT_ID && aura.kind === 'dot' && aura.sourceId === player.id,
  );
}

/** Called once per landed DoT tick; only a Thundercall's own Cinder Jolt can surge. */
export function thundercallOnDotTick(ctx: SimContext, source: Entity | null, dot: Aura): void {
  if (dot.id !== CINDER_JOLT_DOT_ID || !source || source.dead) return;
  if (!knows(ctx, source, MAGMA_BURST_ABILITY_ID)) return;
  if (!ctx.rng.chance(MAGMA_SURGE_CHANCE)) return;
  source.cooldowns.delete(MAGMA_BURST_ABILITY_ID);
  ctx.applyAura(source, {
    id: MAGMA_SURGE_ID,
    name: 'Magma Burst',
    kind: 'next_cast_instant',
    value: 1,
    remaining: MAGMA_SURGE_DURATION,
    duration: MAGMA_SURGE_DURATION,
    sourceId: source.id,
    school: 'fire',
    empowerAbilities: [MAGMA_BURST_ABILITY_ID],
  });
  ctx.emit({
    type: 'spellfx',
    sourceId: source.id,
    targetId: source.id,
    school: 'fire',
    fx: 'procSurge',
  });
}

/** Stormbreak's Mana return, applied once per successful cast. */
export function applyStormbreakMana(ctx: SimContext, player: Entity): void {
  if (thundercallMeta(ctx, player) === null || player.resourceType !== 'mana') return;
  player.resource = Math.min(
    player.maxResource,
    player.resource + Math.round(player.maxResource * STORMBREAK_MANA_FRACTION),
  );
}
