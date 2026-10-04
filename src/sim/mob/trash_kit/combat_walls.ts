// The trash engine's temporary combat walls: an object a mechanic drops in
// the middle of a fight that blocks movement and line of sight for a while
// (the Ogre Sledge-Hauler's Ice Slab, TrashKitDef.toss.leavesWall). The wall
// is a ground object of the claim (Entity.kitObject kind 'wall') whose
// template id names its shape in instances/combat_wall_state.ts
// COMBAT_WALL_SHAPES; after every trash pass the claim's live walls are
// published to that per-slot collision view, which every interior collision
// reader composes (interior_collider_sets.ts), so a body slides along the
// wall and a spell, a bolt or a nova (kit_nova.ts) is stopped by it. When its
// time is up the wall shatters (a `nova` spellfx keyed on its template) and
// goes.
//
// Placement: at the spot the mechanic chose, turned to the yaw it gives. A
// body standing where the wall lands is pushed clear by the ordinary
// depenetration on its next move. Zero rng.

import { DUNGEONS, instanceOrigin } from '../../data';
import {
  type CombatWallPlacement,
  isCombatWallTemplate,
  setCombatWalls,
} from '../../instances/combat_wall_state';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, type Entity } from '../../types';
import { dropKitObject, spawnKitObject } from './kit_objects';

/** The spellfx ability id a wall's crash-down and its shatter carry (the
 *  renderer keys the look on the object's template id; this names the beat). */
export const COMBAT_WALL_RISE = 'trash_combat_wall_rise';
export const COMBAT_WALL_SHATTER = 'trash_combat_wall_shatter';

/** Drop a wall of `templateId` at (x, z), turned to `facing`, for `seconds`. */
export function spawnCombatWall(
  ctx: SimContext,
  inst: InstanceSlot,
  templateId: string,
  name: string,
  x: number,
  z: number,
  facing: number,
  seconds: number,
): Entity | null {
  if (!isCombatWallTemplate(templateId)) return null;
  const wall = spawnKitObject(ctx, inst, templateId, name, x, z, 1, facing, {
    kind: 'wall',
    remaining: seconds,
  });
  ctx.emit({
    type: 'spellfx',
    sourceId: wall.id,
    targetId: wall.id,
    school: 'frost',
    fx: 'nova',
    ability: COMBAT_WALL_RISE,
  });
  return wall;
}

/** Count a wall down; returns true on the tick it shatters (and is gone). */
export function stepCombatWall(ctx: SimContext, inst: InstanceSlot, obj: Entity): boolean {
  const st = obj.kitObject;
  if (st?.kind !== 'wall') return false;
  st.remaining -= DT;
  if (st.remaining > 1e-9) return false;
  ctx.emit({
    type: 'spellfx',
    sourceId: obj.id,
    targetId: obj.id,
    school: 'frost',
    fx: 'nova',
    ability: COMBAT_WALL_SHATTER,
  });
  dropKitObject(ctx, inst, obj.id);
  return true;
}

/** The claim's live walls as the collision view takes them (object-roster
 *  order, instance-local). */
export function combatWallPlacements(
  ctx: SimContext,
  inst: InstanceSlot,
  ox: number,
  oz: number,
): CombatWallPlacement[] {
  const out: CombatWallPlacement[] = [];
  for (const id of inst.objectIds) {
    const e = ctx.entities.get(id);
    if (!e || e.kitObject?.kind !== 'wall') continue;
    out.push({
      id: e.id,
      templateId: e.templateId,
      x: e.pos.x - ox,
      z: e.pos.z - oz,
      y: e.pos.y,
      rot: e.facing,
      scale: e.scale,
    });
  }
  return out;
}

// Claims this world published, so a freed slot is cleared by the world that
// held it and never by a short-lived world that never did.
const walledBy = new WeakMap<InstanceSlot, true>();

/**
 * Publish one slot's live walls to the collision view. A claimed slot is
 * re-published every tick (empty when no wall stands), so whatever another
 * world left in the process-wide view for this slot is overwritten at once,
 * the gate view's rule; a freed claim clears what this world published there
 * (once). A no-op whenever the walls are unchanged (setCombatWalls compares a
 * signature), so a quiet claim costs one empty compare per tick.
 */
export function syncCombatWallCollision(ctx: SimContext, inst: InstanceSlot): void {
  const def = DUNGEONS[inst.dungeonId];
  if (!def) return;
  const o = instanceOrigin(def.index, inst.slot);
  if (inst.partyKey === null) {
    if (walledBy.has(inst)) {
      setCombatWalls(o.x, o.z, []);
      walledBy.delete(inst);
    }
    return;
  }
  setCombatWalls(o.x, o.z, combatWallPlacements(ctx, inst, o.x, o.z));
  walledBy.set(inst, true);
}
