// The death lesson (tutorial island): the last thing the Proving Shore
// teaches, and the one nobody wants to learn for the first time in the vale
// with a wolf still chewing on them.
//
// A new player's first death is the single most confusing moment in the
// genre: the screen greys, they are somewhere else, they are translucent,
// and nothing tells them that the way back is to walk to their own body. So
// the island stages it, on purpose, somewhere nothing is hunting them.
//
// The death is SCRIPTED and consented to: the player walks to the Passing
// Stone and presses interact, exactly like every other lesson's press. It is
// free of consequence by construction, since this game charges no durability
// on death, and the corpse lies a short run from the island graveyard.
//
// Two things keep it from ever stranding a character:
//   - The rite refuses unless the quest is active, so nobody can click the
//     stone into a pointless death.
//   - Credit lands on EITHER resurrection path. The coach teaches the corpse
//     run, and the copy sends them to their body, but a player who takes the
//     Spirit Healer instead still finishes the lesson rather than being left
//     holding a quest whose corpse no longer exists.
//
// Zero rng (it credits a count, emits events, and hands off to the shared
// death path, which draws its own), so its position cannot fork the draw
// order. `src/sim`-pure: no DOM/render/ui/game/net imports, no
// Math.random/Date.now (tests/architecture.test.ts).

import { QUESTS } from '../data';
import { emitQuestProgress } from '../quests/quest_credit';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

export const DEATH_LESSON_QUEST_ID = 'q_ps_the_long_walk';
export const DEATH_LESSON_OBJECT_ITEM_ID = 'ps_passing_stone';

/** The rite's own object id, the thing the player presses. Shares the
 *  sentinel id with the objective: one stone, one lesson. */
export const PASSING_STONE_OBJECT_ID = DEATH_LESSON_OBJECT_ITEM_ID;

/** Is this player mid-lesson? The gate both halves share. */
function lessonActive(meta: PlayerMeta): boolean {
  return meta.questLog.get(DEATH_LESSON_QUEST_ID)?.state === 'active';
}

/**
 * The staged death, routed from the object-interaction dispatcher before the
 * pickup path (the ferry bell's precedent) so a click on the stone always
 * performs the rite rather than trying to loot it.
 *
 * Returns true when the click was consumed. A click WITHOUT the lesson
 * active is consumed too, with an explanatory refusal: a bare stone that
 * silently did nothing would read as a bug, and one that killed a passer-by
 * would be a griefing tool.
 */
export function tryPassingStone(ctx: SimContext, p: Entity, meta: PlayerMeta): boolean {
  if (p.dead || p.ghost) return true;
  if (!lessonActive(meta)) {
    ctx.error(p.id, 'The stone is cold. Instructor Maren has not asked this of you.');
    return true;
  }
  ctx.emit({
    type: 'log',
    text: 'You kneel at the Passing Stone, and the shore lets you go.',
    color: '#c8b8ff',
    entityId: p.id,
  });
  // The shared death path: corpse placed where they knelt, spirit released
  // by the player as usual. No killer, so nothing takes credit and no threat
  // or loot table is involved.
  ctx.handleDeath(p, null, null);
  return true;
}

/**
 * Credit the walk back, called from BOTH resurrection paths (spirit.ts).
 *
 * `atCorpse` records which way they came so the completion copy can tell the
 * two apart; the credit itself is deliberately identical, because a lesson
 * that only completes on the ideal path strands the player who did not take
 * it.
 */
export function creditDeathLesson(ctx: SimContext, meta: PlayerMeta, atCorpse: boolean): void {
  if (!lessonActive(meta)) return;
  const qp = meta.questLog.get(DEATH_LESSON_QUEST_ID);
  if (!qp) return;
  const objective = QUESTS[DEATH_LESSON_QUEST_ID]?.objectives[0];
  if (!objective || objective.type !== 'interact') return;
  if (objective.targetObjectItemId !== DEATH_LESSON_OBJECT_ITEM_ID) return;
  const current = qp.counts[0] ?? 0;
  if (current >= objective.count) return;
  qp.counts[0] = current + 1;
  meta.counters.questProgress++;
  emitQuestProgress(ctx, meta, qp, objective, 0);
  ctx.checkQuestReady(qp, meta);
  ctx.emit({
    type: 'log',
    text: atCorpse
      ? 'You are whole again, and you found your own way back.'
      : 'The Keeper set you on your feet. Next time, walk to your body: it costs you nothing.',
    color: '#8fd3ff',
    entityId: meta.entityId,
  });
}
