// How hard a Buried Hoard presses, as ONE table every boss mechanic reads.
//
// A hoard already scales its mobs' health and damage two ways: by the party's
// head count (content/treasure_maps.ts vaultHealthFactor / vaultDamageFactor, so
// a lone reader fights roughly open-world strength) and by the map's rarity,
// which picks the Rift rank and with it the heroic stat transform. What neither
// reached was the boss MECHANICS: a frontal, a meteor, a scythe, a soul hit for
// the same share of a player's health on a common map as on a legendary one,
// alone or five strong.
//
// This table closes that, and it is per RARITY on purpose. Head count keeps a
// solo run fair; rarity is what makes a legendary hoard cost more than a common
// one for whoever walks in, alone included. Mechanic damage is a share of the
// victim's own health, so it needs no head count term: it is already the same
// threat to one player as to each of five.
//
// Pure data plus one lookup. Rare is the baseline (every mechanic was tuned on
// it), so a rare hoard plays exactly as before.

import type { TreasureMapRarity } from '../content/treasure_maps';
import type { Entity } from '../types';
import type { RiftInstance } from './types';

export interface HoardPressure {
  /** Multiplier on every boss mechanic's damage (a share of the victim's health). */
  damage: number;
  /** Multiplier on the time BETWEEN a boss's mechanics: below 1 they come faster. */
  cadence: number;
  /** Extra things to deal with at once (souls, for one), on top of the head count. */
  extra: number;
  /** Multiplier on how fast a moving mechanic closes (a soul's walk). */
  speed: number;
}

/** How hard the hoard leans on the room as a whole: the living head count plus
 *  the rarity's step. It is what decides whether a mechanic comes in MULTIPLES
 *  (a second Wandering Scythe): a full party in a legendary hoard, or five in an
 *  epic one, never a lone player. */
export const HOARD_RARITY_STEP: Readonly<Record<TreasureMapRarity, number>> = Object.freeze({
  common: -1,
  rare: 0,
  epic: 1,
  legendary: 2,
});
export const HOARD_DOUBLE_MECHANIC_INTENSITY = 6;

export function hoardIntensity(
  vault: RiftInstance['vault'] | undefined,
  livingPlayers: number,
): number {
  return Math.max(1, livingPlayers) + (vault ? HOARD_RARITY_STEP[vault.rarity] : 0);
}

export const HOARD_RARITY_PRESSURE: Readonly<Record<TreasureMapRarity, HoardPressure>> =
  Object.freeze({
    common: { damage: 0.85, cadence: 1.15, extra: -1, speed: 0.9 },
    rare: { damage: 1, cadence: 1, extra: 0, speed: 1 },
    epic: { damage: 1.12, cadence: 0.92, extra: 1, speed: 1.08 },
    legendary: { damage: 1.25, cadence: 0.84, extra: 1, speed: 1.16 },
  });

const BASELINE: HoardPressure = HOARD_RARITY_PRESSURE.rare;

export function hoardPressure(vault: RiftInstance['vault'] | undefined): HoardPressure {
  return vault ? HOARD_RARITY_PRESSURE[vault.rarity] : BASELINE;
}

/** What one boss mechanic does to `player`: `fraction` of their health, pressed
 *  by the rarity of the hoard `inst`. Every hoard mechanic goes through here, so
 *  the rarity ladder holds for all eight bosses and their casters. */
export function hoardMechanicDamage(inst: RiftInstance, player: Entity, fraction: number): number {
  const scale = hoardPressure(inst.vault).damage;
  return Math.max(1, Math.round(player.maxHp * fraction * scale));
}
