// The Stormbrass Foundry's quest chain (docs/design/dungeon-rework/
// stormbrass_foundry.md section 2): the Lift Warden at the cable-lift station
// at the foot of the storm line, and the four quests that carry a level 19
// player up the foundry and on to the Crucible raid.
//
//   The Storm Line            break the Rail Yard: the Gantry Hauler.
//   Stop the Line             Line-Master Ambrel Tock.
//   The First Draft           read the Draft Record in the Prime Draft's
//                             opened chest (an interact object the encounter
//                             leaves on its death, encounters/stormbrass_foundry/
//                             prime_draft.ts). Its completion names the Last
//                             Spring and the Forgefather's Isle.
//   To the Forgefather's Isle the hand-off: carry the record to Archivist
//                             Maelin at the Crucible's forge (Echoes in Iron
//                             onward). Gated with the raid's own flag: while the
//                             Crucible rooms stay development-only (guideVisible
//                             false), the quest is never offered, so no public
//                             quest points at hidden content.
//
// All three dungeon quests open together at level 19 (the Sanctum's one-run
// shape: a group takes all three and clears the foundry once). Rewards ride
// the Sanctum's level-19 to 20 boss quest ladder (q_korgath, q_gravewyrm).
// The Lift Warden is a singleton under a reserved entity id (the harbormaster
// idiom), so placing him moves no other entity id and no parity golden.
//
// Names checked 2026-10-01: "Lift Warden" and "Corwin Ashby" are clear as a
// game name; the quest titles are the design's generic English phrases.

import { IGNIVAR_FORGE_APPROACH_ID } from '../ignivar_raid_ids';
import type { NpcDef, QuestDef } from '../types';
import { STORMBRASS_FOUNDRY_DOOR } from './stormbrass_foundry';

export const LIFT_WARDEN_NPC_ID = 'lift_warden_corwin';

/** The Lift Warden's reserved entity id (the singleton NPCs' 1_000_000_x band,
 *  types.ts STATIC_WORLD_SERVICE_ENTITY_ID_MIN's note). */
export const LIFT_WARDEN_ENTITY_ID = 1_000_000_007;

export const STORMBRASS_FOUNDRY_QUEST_IDS = {
  stormLine: 'q_sf_storm_line',
  stopTheLine: 'q_sf_stop_the_line',
  firstDraft: 'q_sf_first_draft',
  forgefathersIsle: 'q_sf_forgefathers_isle',
} as const;

const Q = STORMBRASS_FOUNDRY_QUEST_IDS;

/** The Lift Warden stands beside the lift station's door, facing the road up. */
export const LIFT_WARDEN_POS = {
  x: STORMBRASS_FOUNDRY_DOOR.x + 5,
  z: STORMBRASS_FOUNDRY_DOOR.z - 4,
} as const;

export const STORMBRASS_FOUNDRY_NPCS: Record<string, NpcDef> = {
  [LIFT_WARDEN_NPC_ID]: {
    id: LIFT_WARDEN_NPC_ID,
    name: 'Lift Warden Corwin Ashby',
    title: 'Keeper of the Storm Line Lift',
    pos: { ...LIFT_WARDEN_POS },
    facing: -Math.PI / 2 - 0.6,
    color: 0xc9a14a,
    questIds: [Q.stormLine, Q.stopTheLine, Q.firstDraft, Q.forgefathersIsle],
    // Spawned under its reserved id by ../stormbrass_lift_warden.ts.
    dynamic: true,
    greeting:
      'Mind the cable, friend. That lift still climbs to the old foundry on the storm line, and the machines up there still run for a master who never came back.',
  },
};

const DUNGEON_QUEST = {
  turnInNpcId: LIFT_WARDEN_NPC_ID,
  giverNpcId: LIFT_WARDEN_NPC_ID,
  itemRewards: {},
  minLevel: 19,
  suggestedPlayers: 5,
} as const;

export const STORMBRASS_FOUNDRY_QUESTS: Record<string, QuestDef> = {
  [Q.stormLine]: {
    ...DUNGEON_QUEST,
    id: Q.stormLine,
    name: 'The Storm Line',
    text: 'Every hour the lift brings down scrap and sparks, $N, never a living soul. Something up there still hauls the rails: a great steam crawler the engineers called the Gantry Hauler. Ride up, break the Rail Yard, and put that crawler down.',
    completionText:
      'The yard is quiet for the first time in years. Quiet, but not empty. Listen: the line is still running above it.',
    objectives: [
      {
        type: 'kill',
        targetMobId: 'gantry_hauler',
        count: 1,
        label: 'Gantry Hauler destroyed',
      },
    ],
    xpReward: 4200,
    copperReward: 2500,
  },
  [Q.stopTheLine]: {
    ...DUNGEON_QUEST,
    id: Q.stopTheLine,
    name: 'Stop the Line',
    text: 'The Line-Master, Ambrel Tock, kept the foundry running when its master left, and he has never stopped. Now he feeds anything that climbs onto his belts into the press. Stop him, $N, and the whole line stops with him.',
    completionText:
      'Tock is still, and so are his belts. Whatever he was building, he was building it for someone else. Go higher.',
    objectives: [
      {
        type: 'kill',
        targetMobId: 'line_master_tock',
        count: 1,
        label: 'Line-Master Ambrel Tock slain',
      },
    ],
    xpReward: 4500,
    copperReward: 3000,
  },
  [Q.firstDraft]: {
    ...DUNGEON_QUEST,
    id: Q.firstDraft,
    name: 'The First Draft',
    text: 'At the top of the foundry stands the thing every machine up there was built to serve: the Prime Draft, a giant that was never finished. If the storm ever wakes it, nothing below the shelf is safe. Put it down, $N, and read whatever its maker left inside it.',
    completionText:
      'The record says the storm moved the metal but could never give it a heart. "Only living water remembers." The Last Spring, and the Forgefather\'s Isle. This was his first work, $N. The last one is still out there.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'draft_record',
        count: 1,
        label: 'Draft Record read',
      },
    ],
    xpReward: 5300,
    copperReward: 25000,
  },
  [Q.forgefathersIsle]: {
    id: Q.forgefathersIsle,
    name: "To the Forgefather's Isle",
    giverNpcId: LIFT_WARDEN_NPC_ID,
    turnInNpcId: 'archivist_maelin_emberward',
    text: "The record names the Forgefather's Isle. An archivist named Maelin has been reading the hammer marks in the forge there for months. Take her the Draft Record, $N: she will know what Varkhul learned here, and what he did with it.",
    completionText:
      'His first draft. So the storm came before the fire. Then I know what he was trying to replace, and why every one of his automata failed. Stay close: we read the rest of this together.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'archivist_maelin_emberward',
        count: 1,
        label: 'Archivist Maelin found',
      },
    ],
    xpReward: 2000,
    copperReward: 5000,
    itemRewards: {},
    requiresQuest: Q.firstDraft,
    minLevel: 20,
    // The Crucible's own development flag: never offered while its rooms stay
    // out of the public Guide (quests/quest_commands.ts computeQuestState).
    gatedWithDungeon: IGNIVAR_FORGE_APPROACH_ID,
    shareable: false,
  },
};

/** The chain in the order the Lift Warden offers it (quest log, guide). */
export const STORMBRASS_FOUNDRY_QUEST_ORDER: readonly string[] = [
  Q.stormLine,
  Q.stopTheLine,
  Q.firstDraft,
  Q.forgefathersIsle,
];
