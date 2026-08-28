// The forge-lift antechamber: the Halls of the First Tempering's entry
// pocket plays as a lift car that "rides down" into the dungeon. The room
// NEVER moves; the descent is presentation (src/render/ignivar_lift_room.ts
// scrolls the shaft past the car's grilles). This module owns the sim half:
// a fixed ride after the instance claim, during which the car's inner gate
// stays sealed, then a one-way in-place template swap opens it for the rest
// of the claim (the ignivar_raid_progression idiom). While sealed, the gate
// is a runtime position clamp, never a static collider (the rift portcullis
// doctrine: interior collider sets are static per-dungeon caches with no
// add/remove lifecycle). Draws NO rng.
import { DUNGEON_X_THRESHOLD, DUNGEONS, instanceOrigin } from './data';
import {
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_LIFT_GATE_LOCKED_TEMPLATE,
  IGNIVAR_LIFT_GATE_OPEN_TEMPLATE,
} from './ignivar_raid_ids';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

/** How long the car "descends" after the instance claim before the gate
 *  opens. Checked at the 1 Hz instance sweep, so the door lands within a
 *  second of this; late joiners (anyone entering after the ride) find it
 *  already open. */
export const IGNIVAR_LIFT_RIDE_SECONDS = 9;

/** The gate line in instance-local coordinates: the car is the entry pocket
 *  behind it (entry at z -50, exit portal at -54, the shell wall at -58),
 *  walled to x +-8 by the grille props in ignivarApproachPropPlacements. */
export const IGNIVAR_LIFT_GATE_Z = -46;
export const IGNIVAR_LIFT_GATE_HALF_WIDTH = 8;
const GATE_HALF_DEPTH = 0.5;
const PLAYER_BODY_R = 0.6;
// Only bodies inside this band are clamped: a sealed gate is solid from
// both faces, and each body is pushed back toward the side it came from.
const GATE_BAND = GATE_HALF_DEPTH + PLAYER_BODY_R + 0.75;

const APPROACH_INDEX = () => DUNGEONS[IGNIVAR_FORGE_APPROACH_ID].index;

interface LiftInstanceLike {
  dungeonId: string;
  slot: number;
  partyKey: string | null;
  claimedAt?: number;
  objectIds: number[];
}

function liftGateEntity(ctx: SimContext, inst: LiftInstanceLike): Entity | null {
  for (const id of inst.objectIds) {
    const entity = ctx.entities.get(id);
    if (!entity) continue;
    if (
      entity.templateId === IGNIVAR_LIFT_GATE_LOCKED_TEMPLATE ||
      entity.templateId === IGNIVAR_LIFT_GATE_OPEN_TEMPLATE
    )
      return entity;
  }
  return null;
}

/** Pure ride predicate: has this claim's lift finished its descent? */
export function ignivarLiftArrived(claimedAt: number | undefined, now: number): boolean {
  return claimedAt !== undefined && now - claimedAt >= IGNIVAR_LIFT_RIDE_SECONDS;
}

/** The 1 Hz arrival sweep (rides updateInstances beside the raid
 *  progression): once a claim's ride elapses, swap the gate open in place
 *  (the renderer rebuilds the view off the templateId diff, both hosts),
 *  grind the shaft sound, and tell everyone aboard. One-way per claim;
 *  freeInstance tears the entity down so a fresh claim re-arms it. */
export function updateIgnivarForgeLift(ctx: SimContext): void {
  for (const inst of ctx.instances) {
    if (inst.dungeonId !== IGNIVAR_FORGE_APPROACH_ID || inst.partyKey === null) continue;
    if (!ignivarLiftArrived(inst.claimedAt, ctx.time)) continue;
    const gate = liftGateEntity(ctx, inst);
    if (!gate || gate.templateId === IGNIVAR_LIFT_GATE_OPEN_TEMPLATE) continue;
    gate.templateId = IGNIVAR_LIFT_GATE_OPEN_TEMPLATE;
    // The rift gate's grind, reused verbatim: spellfxAt interest-scopes to
    // the instance and carries the recorded one-shot on every host.
    ctx.emit({
      type: 'spellfxAt',
      x: gate.pos.x,
      z: gate.pos.z,
      school: 'fire',
      fx: 'nova',
      sfxKey: 'rift_gate_grind',
    });
    const origin = instanceOrigin(APPROACH_INDEX(), inst.slot);
    for (const member of ctx.players.values()) {
      const player = ctx.entities.get(member.entityId);
      if (!player) continue;
      if (Math.abs(player.pos.x - origin.x) > 120 || Math.abs(player.pos.z - origin.z) > 250)
        continue;
      ctx.emit({
        type: 'log',
        text: 'The forge-lift settles; its gate grinds open.',
        color: '#ffb066',
        pid: player.id,
      });
    }
  }
}

/** The per-tick crossing clamp for one player (rides the door-trigger pass,
 *  players only, zero rng): while a claim's lift gate is still sealed, a
 *  body crossing the gate line is pushed back to the face it came from.
 *  Teleports (entry, dev moves) land freely; only walking is clamped. */
export function clampIgnivarForgeLift(ctx: SimContext, p: Entity): void {
  if (p.pos.x < DUNGEON_X_THRESHOLD) return;
  for (const inst of ctx.instances) {
    if (inst.dungeonId !== IGNIVAR_FORGE_APPROACH_ID || inst.partyKey === null) continue;
    const origin = instanceOrigin(APPROACH_INDEX(), inst.slot);
    const lx = p.pos.x - origin.x;
    const lz = p.pos.z - origin.z;
    if (Math.abs(lx) > IGNIVAR_LIFT_GATE_HALF_WIDTH) continue;
    if (Math.abs(lz - IGNIVAR_LIFT_GATE_Z) > GATE_BAND) continue;
    const gate = liftGateEntity(ctx, inst);
    if (!gate || gate.templateId !== IGNIVAR_LIFT_GATE_LOCKED_TEMPLATE) continue;
    const cameFromCar = p.prevPos.z - origin.z <= IGNIVAR_LIFT_GATE_Z;
    const face = cameFromCar
      ? IGNIVAR_LIFT_GATE_Z - GATE_HALF_DEPTH - PLAYER_BODY_R
      : IGNIVAR_LIFT_GATE_Z + GATE_HALF_DEPTH + PLAYER_BODY_R;
    const crossed = cameFromCar ? lz > face : lz < face;
    if (!crossed) continue;
    p.pos = ctx.groundPos(p.pos.x, origin.z + face + (cameFromCar ? -0.05 : 0.05));
    p.prevPos = { ...p.pos };
    ctx.rebucket(p);
    return;
  }
}
