// The renderer's direct-pick entry: the pure stack resolver (pick_resolution.ts)
// fed with what the live world and the static content tables know about each
// hit. Renderer.pickDirect raycasts the click capsules and hands the hit ids,
// nearest first, to resolveWorldDirectPick.
//
// The one fact it adds is the USE-ONLY body: a mob the local player can use
// right now and cannot attack (the Hollow Crypt's Remembrance Candle while
// Morthen's Rite runs: a held, non-hostile body whose only meaning for a click
// is "relight this"). Such a body wins the first click over the live mobs the
// ray reached before it, so a boss capsule standing between the camera and the
// candle no longer swallows every click on it; the resolver's overlap cycling
// then reaches the boss on the next click.
//
// "Usable right now" is the sim's own rule (encounter_use.ts kitUsableNow: a
// living mob whose kit carries a `usable`), the one the interact press reads
// (src/game/nearby_interaction_core.ts) and the HUD's use prompt mirrors. The
// candle bodies exist only while the Rite runs and each is dropped the moment
// it is lit, so existence is the gate; reach is not (the click is how a player
// picks the candle to walk to). A dead local player can use nothing.
//
// A usable body the player can ALSO attack is deliberately not use-only: the
// Gravewyrm Sanctum's Soul Brazier is a hostile mob planted beside the
// Pyre-Tender whose death snuffs it, and a click on her must not be pulled onto
// the brazier behind her. It competes nearest first like any hostile mob, and
// the interact press reaches it without a click.
//
// A pick made to ATTACK (the Attack Move key, main.ts handleAttackMove) wants
// the hostile under the cursor and nothing else, so it asks with `attackIntent`
// and gets plain ray order: a body it cannot attack must not take that pick.

import { kitUsableNow } from '../sim/mob/trash_kit/encounter_use';
import type { Entity } from '../sim/types';
import { resolveDirectPickEntityId } from './pick_resolution';

/** The slice of the world a direct pick reads (IWorld satisfies it). */
export interface DirectPickWorld {
  entities: Pick<Map<number, Entity>, 'get'>;
  player: Pick<Entity, 'targetId' | 'dead'> | null | undefined;
}

/** A body whose only meaning for a click is its use: usable right now, and not
 *  something the player attacks. */
export function isUseOnlyBody(e: Entity): boolean {
  return !e.hostile && kitUsableNow(e);
}

/** Resolve a raycast's hit ids (nearest first) to the entity a click selects. */
export function resolveWorldDirectPick(
  hitEntityIds: readonly number[],
  world: DirectPickWorld,
  attackIntent = false,
): number | null {
  const player = world.player;
  return resolveDirectPickEntityId(
    hitEntityIds,
    world.entities,
    player?.targetId ?? null,
    player && !player.dead && !attackIntent ? isUseOnlyBody : null,
  );
}
