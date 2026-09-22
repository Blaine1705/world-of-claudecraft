// Pure decision for the NPC gossip dialog: does this NPC answer the active Clue
// Scroll step? A click on an NPC opens the gossip window client-side and never
// reaches the sim, so an npc or deliver clue step (src/sim/clue_scrolls.ts
// onNpcTalkedForClueHunt, fired from Sim.talkToNpc) could not be solved by
// clicking the NPC it names (playtest). The dialog shows a "Discuss" row for the
// hunt, the same family as the quest discussion rows, and that row sends the
// talk. DOM-free; the controller renders and wires the row.

import { clueHuntById } from '../../../sim/clue_scrolls';

/** The active hunt id when its current step is a talk to (or a delivery for)
 *  the NPC `npcTemplateId`, else null. */
export function clueTalkHuntFor(
  clueHunt: Readonly<{ huntId: string; step: number }> | null,
  npcTemplateId: string,
): string | null {
  if (!clueHunt) return null;
  const step = clueHuntById(clueHunt.huntId)?.steps[clueHunt.step];
  if (!step || (step.kind !== 'npc' && step.kind !== 'deliver')) return null;
  return step.npcId === npcTemplateId ? clueHunt.huntId : null;
}
