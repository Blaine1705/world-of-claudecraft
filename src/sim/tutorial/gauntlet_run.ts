// The Gauntlet run (tutorial island): sim-side, server-authoritative credit
// for q_ps_the_gauntlet. The quest's one objective is an 'interact' keyed on
// the sentinel ps_gauntlet_flag with NO live ground entity (the
// mounts_training riding-lesson idiom): the flags a player sees are pure
// decorProps dressing, and this sweep credits the objective directly when
// the player passes each flag IN RUNNING ORDER, one count per flag. The
// objective's count doubles as the next-flag index, so run progress is
// persisted, wire-synced to the HUD tracker, and shared with the bootcamp
// coachmark, which mirrors the same count instead of keeping its own tally.
//
// Runs every tick, not on the 1 Hz mail cadence: a sprinting player crosses
// a flag's tag radius in about a second, and a missed sample would demand a
// walk back. The whole-sweep cost is one cheap gate per player (west of the
// strait?) and one hypot for the single active runner, so the tick can
// afford it. Zero rng (it only credits counts and emits events, which draw
// nothing), so its position in the tick cannot fork the deterministic draw
// order. `src/sim`-pure: no DOM/render/ui/game/net imports, no
// Math.random/Date.now (tests/architecture.test.ts).

import { BOOTCAMP_COURSE_CHECKPOINTS } from '../content/proving_shore';
import { QUESTS } from '../data';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';

export const GAUNTLET_QUEST_ID = 'q_ps_the_gauntlet';
export const GAUNTLET_FLAG_ITEM_ID = 'ps_gauntlet_flag';
/** How close (yards) a runner must pass to the NEXT flag to be credited.
 *  Matches the bootcamp overlay's radius so the card and the quest tracker
 *  can never disagree about a tag. */
export const GAUNTLET_FLAG_RADIUS_YD = 4;

/** The island column gate: nobody east of the strait can be mid-run. */
const ISLAND_MAX_X = -180;

function creditNextFlag(ctx: SimContext, meta: PlayerMeta): void {
  const qp = meta.questLog.get(GAUNTLET_QUEST_ID);
  if (!qp || qp.state !== 'active') return;
  const quest = QUESTS[GAUNTLET_QUEST_ID];
  const objective = quest?.objectives[0];
  if (!objective || objective.type !== 'interact') return;
  const next = qp.counts[0] ?? 0;
  if (next >= objective.count) return;
  const flag = BOOTCAMP_COURSE_CHECKPOINTS[next];
  if (!flag) return;
  const e = ctx.entities.get(meta.entityId);
  if (!e || e.dead) return;
  if (e.pos.x >= ISLAND_MAX_X) return;
  if (Math.hypot(e.pos.x - flag.x, e.pos.z - flag.z) > GAUNTLET_FLAG_RADIUS_YD) return;
  qp.counts[0] = next + 1;
  meta.counters.questProgress++;
  ctx.emit({
    type: 'questProgress',
    questId: qp.questId,
    objectiveIndex: 0,
    current: qp.counts[0],
    required: objective.count,
    text: `${objective.label}: ${qp.counts[0]}/${objective.count}`,
    pid: meta.entityId,
  });
  ctx.checkQuestReady(qp, meta);
}

/** The per-tick sweep (called from Sim.tick beside updateTutorialGreeting):
 *  advance every active runner's next-flag check. */
export function updateGauntletRuns(ctx: SimContext): void {
  for (const meta of ctx.players.values()) creditNextFlag(ctx, meta);
}
