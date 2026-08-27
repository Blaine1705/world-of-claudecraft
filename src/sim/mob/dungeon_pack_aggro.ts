import { MOBS } from '../data';
import type { SpatialGrid } from '../spatial';
import { addThreat } from '../threat';
import type { Entity, MobFamily } from '../types';

/** Pull every idle member of an explicitly authored dungeon pack. Placement
 * claims namespace the key by dungeon and slot, so this scan cannot cross raid
 * rooms or simultaneous instances even when their local pack labels match. */
export function aggroDungeonPackmates(
  entities: Iterable<Entity>,
  mob: Entity,
  target: Entity,
): void {
  if (!mob.dungeonPackId) return;
  for (const packmate of entities) {
    if (
      packmate.kind !== 'mob' ||
      packmate.id === mob.id ||
      packmate.dead ||
      !packmate.hostile ||
      packmate.aiState !== 'idle' ||
      packmate.ownerId !== null ||
      packmate.dungeonPackId !== mob.dungeonPackId
    ) {
      continue;
    }
    packmate.aiState = 'chase';
    packmate.aggroTargetId = target.id;
    packmate.inCombat = true;
    packmate.leashAnchor = { ...packmate.pos };
    addThreat(packmate, target.id, 1);
  }
}

// How far a mob pulls same-family neighbours into a fight ("social aggro").
// Murlocs (the clustered water mobs players call "frogs") used to pull too much,
// chain-aggroing the whole pond and making solo pulls impossible (#102). Tune
// per family here; everything else falls back to the default.
const DEFAULT_SOCIAL_PULL_RADIUS = 5;
const SOCIAL_PULL_RADIUS: Partial<Record<MobFamily, number>> = {
  mudfin: 8,
};

/** The legacy same-template social propagation: an aggroing mob radius-pulls
 * idle same-template neighbours within its family's social radius. Authored
 * packs above engage regardless; this path is gated by the caller's `social`
 * flag. */
export function socialPullSameTemplate(grid: SpatialGrid, mob: Entity, target: Entity): void {
  const family = MOBS[mob.templateId]?.family;
  const pullRadius = (family && SOCIAL_PULL_RADIUS[family]) ?? DEFAULT_SOCIAL_PULL_RADIUS;
  grid.forEachInRadius(mob.pos.x, mob.pos.z, pullRadius, (m, d2) => {
    if (
      m.kind === 'mob' &&
      m.id !== mob.id &&
      !m.dead &&
      m.hostile &&
      m.aiState === 'idle' &&
      m.ownerId === null &&
      m.templateId === mob.templateId &&
      d2 < pullRadius * pullRadius
    ) {
      m.aiState = 'chase';
      m.aggroTargetId = target.id;
      m.inCombat = true;
      m.leashAnchor = { ...m.pos };
      addThreat(m, target.id, 1);
    }
  });
}
