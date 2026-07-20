// Rift rank (C/B/A/S) tuning: the one place a rift's baseLevel is turned into
// rank-driven difficulty. Every consumer (the floor generator's mob levels, the
// spawn-time heroic stat transform, the boss mechanic budget, the one-shot
// hazard gate) derives the SAME rank from the descriptor's baseLevel, so the
// authoritative sim, the offline sim, and the headless env all regenerate
// identical difficulty from the wire descriptor. Natural portals map tier ->
// baseLevel via RIFT_RANK_BASE_LEVEL (portals.ts reads it back), and a /dev
// portal picks its rank implicitly through the level it was opened at.
//
// Pure leaf: no SimContext; a Vitest imports it directly.

import { MOBS } from '../data';
import type { Entity, MobTemplate, RiftTier } from '../types';

/** Canonical rank -> portal baseLevel map (portals.ts RIFT_TIER_INFO consumes
 * this, and riftRankForBaseLevel inverts it). */
export const RIFT_RANK_BASE_LEVEL: Record<RiftTier, number> = { C: 20, B: 22, A: 25, S: 28 };

/** The rank a descriptor baseLevel encodes (inverse of RIFT_RANK_BASE_LEVEL,
 * banded so a /dev portal at any level lands in the nearest rank). */
export function riftRankForBaseLevel(baseLevel: number): RiftTier {
  if (baseLevel >= RIFT_RANK_BASE_LEVEL.S) return 'S';
  if (baseLevel >= RIFT_RANK_BASE_LEVEL.A) return 'A';
  if (baseLevel >= RIFT_RANK_BASE_LEVEL.B) return 'B';
  return 'C';
}

// Mob levels by rank. C ramps from its baseLevel (20) and stays inside the
// classic fairness cap (22, two above the level-20 player cap, matching the
// heroic dungeon pin). B, A, and S all hold the 22 cap; their additional
// difficulty comes from the heroic stat transform below. S is additionally
// nudged to flat 23 on every floor, one step above the fairness cap, to
// signal that S-rank is the hardest tier while keeping its mobs at a level
// where the heroic stat transform does the heavy lifting. Giantslayer (+5-level
// kill) is no longer earnable inside S-rank rifts as a result (the maintainer
// explicitly accepted this in v0.23.0 rank retune).
export const RIFT_LEVEL_CAP = 22;
export const RIFT_S_LEVEL = 23;
/** The highest level any rift mob can spawn at (flat S-rank level). Also the
 * game-wide creditable-mob ceiling pinned by deeds (MAX_CREDITABLE_MOB_LEVEL). */
export const RIFT_MAX_MOB_LEVEL = 23;

/** Mob level for a floor: C ramps baseLevel + floorIndex under cap 22;
 * B and A hold a flat 22; S holds a flat 23 on every floor. */
export function riftFloorLevel(baseLevel: number, floorIndex: number): number {
  const rounded = Math.round(baseLevel);
  if (riftRankForBaseLevel(rounded) === 'S') {
    return RIFT_S_LEVEL;
  }
  return Math.max(1, Math.min(RIFT_LEVEL_CAP, rounded + floorIndex));
}

/** How many of a boss template's `rankMechanics` are live per rank. */
export const RIFT_RANK_MECHANIC_BUDGET: Record<RiftTier, number> = { C: 1, B: 2, A: 3, S: 4 };

/** Whether a rift boss mechanic is suppressed on this spawn by its rank budget.
 * Consulted at every timed/threshold fire site (mob/locomotion.ts, the
 * updateBossMechanics threshold pass). Inert unless the entity carries a
 * riftMechanicLimit AND its template lists the key in `rankMechanics`, so
 * every non-rift mob (and any unlisted mechanic, e.g. enrage) is untouched. */
export function riftMechanicSuppressed(mob: Entity, key: string): boolean {
  const limit = mob.riftMechanicLimit;
  if (limit === undefined) return false;
  const order = MOBS[mob.templateId]?.rankMechanics;
  if (!order) return false;
  const index = order.indexOf(key);
  return index >= 0 && index >= limit;
}

// B-, A-, and S-rank rifts are heroic scaled: a spawn-time stat transform (the
// same shape as instances/difficulty.ts mobTemplateForDungeonDifficulty) plus
// the per-entity mechanicDamageMult/mechanicHealMult applied at each mechanic
// fire site AFTER the rng draw (draw count and order stay identical across
// ranks). The shared gate riftHeroicTuningFor drives four behaviors for all
// three ranks: the stat transform, boss-add scaling (softer addDamageMultiplier),
// boulder lethality, and citadel exclusion (now C-only). The multipliers stay
// below the heroic five-man ladder (damage x4-5); B is the entry rung scaled
// proportionally between no-tuning and A.
export interface RiftHeroicTuning {
  healthMultiplier: number;
  damageMultiplier: number;
  // Boss-summoned add waves land on top of the boss's own output, so they take
  // a softer multiplier (the heroic addDamageMultiplier precedent).
  addDamageMultiplier: number;
  armorMultiplier: number;
}

export const RIFT_HEROIC_TUNING: Partial<Record<RiftTier, RiftHeroicTuning>> = {
  // B is the entry heroic tier: scaled proportionally between no-tuning and A.
  // As with A/S, the shared gate (riftHeroicTuningFor) drives the stat transform,
  // boss-add scaling, boulder lethality, and citadel exclusion (now C-only).
  B: {
    healthMultiplier: 1.5,
    damageMultiplier: 1.35,
    addDamageMultiplier: 1.12,
    armorMultiplier: 1.12,
  },
  A: {
    healthMultiplier: 1.9,
    damageMultiplier: 1.6,
    addDamageMultiplier: 1.25,
    armorMultiplier: 1.25,
  },
  S: {
    healthMultiplier: 2.5,
    damageMultiplier: 2.0,
    addDamageMultiplier: 1.5,
    armorMultiplier: 1.4,
  },
};

/** The heroic rift tuning for a descriptor baseLevel, or null (C only). */
export function riftHeroicTuningFor(baseLevel: number): RiftHeroicTuning | null {
  return RIFT_HEROIC_TUNING[riftRankForBaseLevel(baseLevel)] ?? null;
}

// Every heroic-rift mob moves at least this fast (player RUN_SPEED is 7), the
// same anti-kite floor heroic dungeons use (instances/difficulty.ts).
export const RIFT_HEROIC_MIN_MOVE_SPEED = 8;

/** The spawn-time stat transform for a B/A/S-rank rift mob. Mirrors
 * mobTemplateForDungeonDifficulty (stats only; levels come from
 * riftFloorLevel, and mechanics still read the base MOBS table at fire time,
 * scaled by the per-entity multipliers the spawner sets alongside this). */
export function riftHeroicTemplate(template: MobTemplate, tuning: RiftHeroicTuning): MobTemplate {
  return {
    ...template,
    hpBase: template.hpBase * tuning.healthMultiplier,
    hpPerLevel: template.hpPerLevel * tuning.healthMultiplier,
    dmgBase: template.dmgBase * tuning.damageMultiplier,
    dmgPerLevel: template.dmgPerLevel * tuning.damageMultiplier,
    armorPerLevel: template.armorPerLevel * tuning.armorMultiplier,
    moveSpeed: Math.max(template.moveSpeed, RIFT_HEROIC_MIN_MOVE_SPEED),
  };
}
