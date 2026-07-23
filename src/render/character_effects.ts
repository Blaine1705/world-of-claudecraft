import type { Entity } from '../sim/types';
import { abilityHexColor } from './ability_vfx_core';
import { ABILITY_VFX_FULL_SPECS } from './ability_vfx_full_specs';

export function characterSoulRendActive(e: Entity): boolean {
  return e.auras.some((a) => a.id === 'nythraxis_soul_rend');
}

/** The held weapon's imbued-overlay color, or null when no worn aura asks for
 *  one. Data-driven off the full spec's buff.weaponAura knob (aura id ==
 *  ability id, the painter's own matching rule): Sanguine Blade's blood soak
 *  and the shaman imbues (Pyrebrand/Rimebound) all resolve here, and the
 *  overlay lives exactly as long as the aura - gained on cast, dropped with
 *  the buff. First worn match wins (weapon-imbue auras are exclusive in the
 *  sim, so concurrent winners cannot happen in practice). */
export function characterWeaponAuraColor(e: Entity): number | null {
  for (const a of e.auras) {
    const tint = ABILITY_VFX_FULL_SPECS[a.id]?.buff?.weaponAura;
    if (tint !== undefined) return abilityHexColor(tint);
  }
  return null;
}

export function characterRecklessnessActive(e: Entity): boolean {
  return e.auras.some((a) => a.kind === 'buff_reckless');
}
