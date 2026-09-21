// The ONE client-side "is this player hostile to me right now" verdict, shared
// by the renderer (nameplate colour, hostile selection) and the HUD (the target
// frame's colour, the auto-attack-on-ability gate). The instanced arms (duel,
// ranked arena, Thornhollow Fields) come from isPvpHostileTarget, which reads
// the IWorld readouts those modes publish; the open-world arm reads the two
// entities' /pvp flags through the sim's own pair rule
// (src/sim/pvp/world_pvp_rules.ts worldPvpPairHostile) with the party check
// answered by the party readout, so the client can never colour a player red
// whom the sim would refuse to let it hit.
//
// Extracted the day the third copy of the verdict appeared (the renderer's
// private isHostilePlayer and the action bar's isPvpHostileTarget were the
// first two; the World PvP flag was the third), exactly as the action bar's
// comment asked. Pure and host-agnostic: no DOM, no i18n, no Sim reference.
//
// Deliberately narrower than the sim's isHostileTo, like both predecessors:
// no jail brawl, no warden arm, and a pet resolves to its owner in the callers
// (the renderer's isOwnedPetHostile), never here.

import { worldPvpPairHostile } from '../sim/pvp/world_pvp_rules';
import type { Entity } from '../sim/types';
import type { IWorld } from '../world_api';
import { isPvpHostileTarget } from './hud/action_bar/attack_on_ability';

/** The readouts the verdict needs; the offline Sim and the online ClientWorld
 *  both satisfy it structurally. */
export type PvpHostileWorld = Pick<
  IWorld,
  'playerId' | 'entities' | 'duelInfo' | 'arenaInfo' | 'bgInfo' | 'partyInfo'
>;

/** Is `target` (an entity record) a player the local player may attack? Never
 *  the local player, never a corpse. */
export function isPvpHostilePlayer(world: PvpHostileWorld, target: Entity): boolean {
  if (target.kind !== 'player' || target.dead || target.id === world.playerId) return false;
  if (isPvpHostileTarget(target.id, world.duelInfo, world.arenaInfo, world.bgInfo)) return true;
  const self = world.entities.get(world.playerId);
  if (!self) return false;
  const sameParty = !!world.partyInfo?.members.some((member) => member.pid === target.id);
  return worldPvpPairHostile(self, target, sameParty);
}

/** The id-taking twin for callers that hold a target id (the action bar). */
export function isPvpHostileTargetId(
  world: PvpHostileWorld,
  targetId: number | null | undefined,
): boolean {
  if (targetId === null || targetId === undefined) return false;
  const target = world.entities.get(targetId);
  return target !== undefined && isPvpHostilePlayer(world, target);
}
