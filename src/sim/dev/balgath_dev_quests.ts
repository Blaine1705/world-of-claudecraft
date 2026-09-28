// [dev] /dev balgath quests|trophy|weekly|drill|pound: the muster's quest chain, solo.
//
// A playtest hook for the three muster quests (content/mirefen_muster_quests.ts). Testing
// them for real means a Fenbridge walk, a drill and a world-boss kill in a raid; these
// verbs cut each wait out for one tester, and nothing else:
//   quests          reset the chain for you (Warden Fenwick offers the first one again)
//   quests weekly   skip to the weekly (the first two marked done, the weekly lock cleared)
//   trophy          hand you the Barrowhide Slab, as if torn off his corpse (weekly active)
//   weekly          clear this week's lock, so the Commander offers the weekly again
//   drill           stand you on the drill lane, facing the Straw Foreman
//   pound           make the drillmaster swing his mallet now
//
// Reached only through handleDevChat behind ctx.devCommands (ALLOW_DEV_COMMANDS), so it
// does not exist in production. Replies are dev-channel English. Draws no rng.

import { MUSTER_EFFIGY_POST } from '../content/mirefen_muster';
import {
  BARROWHIDE_SLAB_ITEM_ID,
  MUSTER_PIKE_DRILL_QUEST_ID,
  MUSTER_QUEST_ORDER,
  MUSTER_SUMMONS_QUEST_ID,
  MUSTER_TROPHY_QUEST_ID,
} from '../content/mirefen_muster_quests';
import { poundMusterDrill } from '../muster_drill';
import { closeEffigyWindow } from '../muster_effigy';
import { weeklyQuestLockoutId } from '../quests/weekly_quest_lock';
import type { SimContext } from '../sim_context';
import { displacePlayerForDev } from './dev_displace';

/** Where `drill` stands you: on the lane, this far in front of the effigy's face. */
export const BALGATH_DEV_DRILL_LANE = 7;

export type BalgathQuestDevVerb =
  | 'quests'
  | 'quests weekly'
  | 'trophy'
  | 'weekly'
  | 'drill'
  | 'pound';

const VERBS: readonly BalgathQuestDevVerb[] = [
  'quests',
  'quests weekly',
  'trophy',
  'weekly',
  'drill',
  'pound',
];

/** One help line per verb. */
export const BALGATH_QUEST_DEV_HELP: readonly string[] = [
  '/dev balgath quests: reset the muster quest chain for you (Warden Fenwick in Fenbridge offers the first again)',
  '/dev balgath quests weekly: skip to the weekly (first two quests marked done, the weekly lock cleared; talk to the Muster Commander)',
  '/dev balgath trophy: get the Barrowhide Slab as if looted from his corpse (the weekly must be in your log)',
  "/dev balgath weekly: clear this week's lock so the Commander offers the weekly again",
  '/dev balgath drill: stand on the drill lane facing the Straw Foreman (take a pike from the rack first)',
  '/dev balgath pound: make the drillmaster swing his mallet now',
];

/** Parse the quest verbs of `/dev balgath`; null when the line is not one of them. */
export function parseBalgathQuestDevCommand(raw: string): BalgathQuestDevVerb | null {
  const m = /^\/(?:dev\s+balgath|devbalgath)\s+(\S+)(?:\s+(\S+))?\s*$/i.exec(raw);
  if (!m) return null;
  const verb = [m[1], m[2]].filter(Boolean).join(' ').toLowerCase();
  return (VERBS as readonly string[]).includes(verb) ? (verb as BalgathQuestDevVerb) : null;
}

export interface BalgathQuestDevResult {
  ok: boolean;
  message: string;
}

export function runBalgathQuestDev(
  ctx: SimContext,
  pid: number,
  verb: BalgathQuestDevVerb,
): BalgathQuestDevResult {
  const r = ctx.resolve(pid);
  if (!r) return { ok: false, message: 'No caller.' };
  const { meta, e: p } = r;
  const army = ctx.musterArmy;
  switch (verb) {
    case 'quests':
    case 'quests weekly': {
      for (const questId of MUSTER_QUEST_ORDER) {
        meta.questLog.delete(questId);
        meta.questsDone.delete(questId);
      }
      meta.raidLockouts.delete(weeklyQuestLockoutId(MUSTER_TROPHY_QUEST_ID));
      const slabs = ctx.countItem(BARROWHIDE_SLAB_ITEM_ID, pid);
      if (slabs > 0) ctx.removeItem(BARROWHIDE_SLAB_ITEM_ID, slabs, pid);
      closeEffigyWindow(ctx, army, pid);
      if (verb === 'quests weekly') {
        meta.questsDone.add(MUSTER_SUMMONS_QUEST_ID);
        meta.questsDone.add(MUSTER_PIKE_DRILL_QUEST_ID);
      }
      meta.wireRev++;
      return {
        ok: true,
        message:
          verb === 'quests'
            ? 'Muster quests reset. Warden Fenwick in Fenbridge offers "The Muster\'s Summons" again.'
            : 'Skipped to the weekly: the Muster Commander (command camp, /dev tp 149 208) offers "A Chip Off the Foreman".',
      };
    }
    case 'trophy': {
      const qp = meta.questLog.get(MUSTER_TROPHY_QUEST_ID);
      if (!qp) {
        return {
          ok: false,
          message:
            'Take "A Chip Off the Foreman" from the Muster Commander first (/dev balgath quests weekly to skip there).',
        };
      }
      if (ctx.countItem(BARROWHIDE_SLAB_ITEM_ID, pid) > 0)
        return { ok: false, message: 'You already carry a Barrowhide Slab.' };
      if (!ctx.canAddItem(BARROWHIDE_SLAB_ITEM_ID, 1, pid))
        return { ok: false, message: 'Your bags are full.' };
      ctx.addItem(BARROWHIDE_SLAB_ITEM_ID, 1, pid);
      return {
        ok: true,
        message: 'You tear a Barrowhide Slab off the Foreman. Take it to the Commander.',
      };
    }
    case 'weekly': {
      const had = meta.raidLockouts.delete(weeklyQuestLockoutId(MUSTER_TROPHY_QUEST_ID));
      meta.wireRev++;
      return {
        ok: true,
        message: had
          ? 'Weekly lock cleared: the Commander offers "A Chip Off the Foreman" again.'
          : 'No weekly lock to clear.',
      };
    }
    case 'drill': {
      const f = MUSTER_EFFIGY_POST.facing;
      const x = MUSTER_EFFIGY_POST.x + Math.sin(f) * BALGATH_DEV_DRILL_LANE;
      const z = MUSTER_EFFIGY_POST.z + Math.cos(f) * BALGATH_DEV_DRILL_LANE;
      displacePlayerForDev(ctx, p, x, z);
      p.facing = f + Math.PI;
      p.prevFacing = p.facing;
      return {
        ok: true,
        message: `On the drill lane, facing the Straw Foreman (${x.toFixed(1)}, ${z.toFixed(1)}). The rack is on your right.`,
      };
    }
    case 'pound': {
      if (army.drillmasterId === null)
        return { ok: false, message: 'The muster is not raised in this world yet.' };
      poundMusterDrill(ctx, army);
      return { ok: true, message: 'The drillmaster swings his mallet.' };
    }
  }
}
