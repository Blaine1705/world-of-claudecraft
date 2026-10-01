// The Voltaic Warden's Conduction Plating (G21 damage-kind immunity,
// docs/design/dungeon-rework/stormbrass_foundry.md 5.3): a plated body (the
// Warden, or one of its Arc Drones) wears one face, Grounded (copper out:
// physical damage lands, spell damage does not) or Charged (blue out: spell
// damage lands, physical does not). A player's or pet's hit of the wrong kind
// is turned aside, and on the Warden itself it is banked as Stored Charge for
// the next Discharge (voltaic_warden.ts). Heroic Split Plating turns the back
// half to the other face, so where the attacker stands decides what lands.
//
// Pure (no SimContext, no rng): combat/damage.ts dealDamage asks it before any
// mitigation, the Temple's reflection_guard.ts way, so every damage path
// (swings, spells, ticks, splashes) honours it. The plating rides auras the
// client already mirrors.

import type { Entity } from '../../types';
import {
  platingFacing,
  platingFor,
  VOLTAIC_CHARGED,
  VOLTAIC_GROUNDED,
  VOLTAIC_STORED,
  type VoltaicPlating,
} from './ids';

/** The face a body wears and whether it is split (heroic), or null. */
export function platingOf(e: Entity): { face: VoltaicPlating; split: boolean } | null {
  for (const a of e.auras) {
    if (a.id === VOLTAIC_GROUNDED) return { face: 'grounded', split: a.value2 === 1 };
    if (a.id === VOLTAIC_CHARGED) return { face: 'charged', split: a.value2 === 1 };
  }
  return null;
}

/**
 * Does the plating turn this hit aside? Only a player's (or a pet's) hit is
 * read; anything else lands as it would. A turned-aside hit on the Warden is
 * banked as Stored Charge (its fight state, mirrored on its Stored Charge
 * aura's stacks).
 */
export function platingTurnsAside(
  source: Entity | null,
  target: Entity,
  school: string,
  amount: number,
): boolean {
  if (!source || target.kind !== 'mob' || target.dead) return false;
  if (source.kind !== 'player' && source.ownerId === null) return false;
  const plating = platingOf(target);
  if (!plating) return false;
  const face = platingFacing(
    plating.face,
    plating.split,
    target.pos.x,
    target.pos.z,
    target.facing,
    source.pos.x,
    source.pos.z,
  );
  if (face === platingFor(school)) return false;
  const st = target.foundryFight;
  if (st?.kind === 'voltaic' && amount > 0) {
    st.stored += amount;
    const stored = target.auras.find((a) => a.id === VOLTAIC_STORED);
    if (stored) stored.stacks = Math.round(st.stored);
  }
  return true;
}
