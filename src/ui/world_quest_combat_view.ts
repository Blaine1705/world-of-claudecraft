import { COMBAT_QUEST_SITES } from '../sim/content/world_quest_combat';
import type { WorldQuestProgress } from '../sim/types';
import { npcDisplayName } from './entity_display_labels';
import type { TrackedObjective } from './hud/quest/quest_tracker';
import { formatNumber, t } from './i18n';

/** Live combat counters lead the tracker so narrow layouts never bury them. */
export function combatQuestTrackedObjectives(progress: WorldQuestProgress): TrackedObjective[] {
  const state = progress.combat;
  const lines = combatQuestInstructionLines(progress);
  if (
    state &&
    (state.phase === 'waves' || state.phase === 'boss') &&
    COMBAT_QUEST_SITES.some(
      (site) => site.questId === progress.questId && site.encounterId === 'hold_highwatch',
    )
  ) {
    const integrity = Math.max(0, Math.min(100, state.integrity));
    return [
      {
        label: t('questUi.worldQuest.combat.gate', { integrity: formatNumber(integrity) }),
        current: integrity,
        total: 100,
        instruction: true,
        progressBar: true,
      },
      ...[lines[1], t('questUi.worldQuest.combat.highwatchRule')].map((label) => ({
        label,
        current: 0,
        total: 1,
        instruction: true,
      })),
    ];
  }
  return lines.map((label) => ({
    label,
    current: 0,
    total: 1,
    instruction: true,
  }));
}

export function combatQuestInstructionLines(progress: WorldQuestProgress): string[] {
  const site = COMBAT_QUEST_SITES.find((s) => s.questId === progress.questId);
  if (!site) return [];
  const state = progress.combat;
  const lines = [t(`questUi.worldQuest.combat.${site.encounterId}.objective`)];
  if (!state || state.phase === 'ready' || state.phase === 'failed') {
    if (state?.phase === 'failed') lines.push(t('questUi.worldQuest.combat.failed'));
    lines.push(t('questUi.worldQuest.combat.start', { npc: npcDisplayName(site.npcId) }));
    return lines;
  }
  if (state.phase === 'boss') lines.push(t('questUi.worldQuest.combat.boss'));
  else if (state.phase === 'leaders')
    lines.push(
      t('questUi.worldQuest.combat.leaders', {
        count: formatNumber(state.kills),
        total: formatNumber(state.required),
      }),
    );
  else
    lines.push(
      t('questUi.worldQuest.combat.wave', {
        wave: formatNumber(state.stage),
        total: formatNumber(3),
      }),
    );
  if (site.encounterId === 'hold_highwatch')
    lines.push(t('questUi.worldQuest.combat.gate', { integrity: formatNumber(state.integrity) }));
  return lines;
}
