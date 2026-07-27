// Gathering-tool item tooltip lines (#2343): what a pick/axe/sickle/rod is,
// what it is required for, how using it behaves, and its speed/fishing
// bonuses. A pure string-builder composed inside Hud.itemTooltip (the
// item_instance_tooltip.ts pattern): t() + esc here, no DOM, no Hud state,
// so tests/gather_tool_tooltip.test.ts drives it directly. Numbers come
// straight from the sim's own tuning constants, never re-invented copy:
// the gather cast sheds GATHER_CAST_TOOL_TIER_REDUCTION_SEC per owned tier
// above the node's, a rod pulls the bite-delay ceiling down by
// FISH_BITE_DELAY_ROD_REDUCTION_SEC and widens the reel window by
// FISH_REEL_WINDOW_ROD_BONUS_SEC per tier above 1, and catch band b needs
// rod tier b + 1 (completeFishing), so band thresholds index by tier - 1.
// The dormant tool-effect slotting (tools.ts, parked) is deliberately NOT
// advertised here.

import type { GatheringProfessionId } from '../sim/content/professions';
import {
  FISH_BITE_DELAY_MAX_SEC,
  FISH_BITE_DELAY_MIN_SEC,
  FISH_BITE_DELAY_ROD_REDUCTION_SEC,
  FISH_REEL_WINDOW_ROD_BONUS_SEC,
} from '../sim/professions/fishing';
import { PROFICIENCY_BAND_THRESHOLDS } from '../sim/professions/proficiency_bands';
import { isGatherToolUse } from '../sim/professions/tools';
import type { ItemDef } from '../sim/types';
import { esc } from './esc';
import { formatNumber, type TranslationKey, t } from './i18n';

const KIND_KEYS: Record<GatheringProfessionId, TranslationKey> = {
  mining: 'hudChrome.gathering.toolTooltip.kind.mining',
  logging: 'hudChrome.gathering.toolTooltip.kind.logging',
  herbalism: 'hudChrome.gathering.toolTooltip.kind.herbalism',
  fishing: 'hudChrome.gathering.toolTooltip.kind.fishing',
};

const UNLOCKS_KEYS: Partial<Record<GatheringProfessionId, TranslationKey>> = {
  mining: 'hudChrome.gathering.toolTooltip.unlocks.mining',
  logging: 'hudChrome.gathering.toolTooltip.unlocks.logging',
  herbalism: 'hudChrome.gathering.toolTooltip.unlocks.herbalism',
};

const USE_KEYS: Partial<Record<GatheringProfessionId, TranslationKey>> = {
  mining: 'hudChrome.gathering.toolTooltip.use.mining',
  logging: 'hudChrome.gathering.toolTooltip.use.logging',
  herbalism: 'hudChrome.gathering.toolTooltip.use.herbalism',
};

function line(cls: 'tt-sub' | 'tt-desc', text: string): string {
  return `<div class="${cls}">${esc(text)}</div>`;
}

/** The tooltip lines for one gathering implement, or '' for any other item.
 *  Handles both shapes: the tiered gatherTool items (picks, axes, sickles,
 *  rods) and the simple fishing pole (use.type 'fishing', which keeps its
 *  legacy useFishing line and gains the required-to-fish line). */
export function gatherToolTooltipLines(item: ItemDef): string {
  const use = item.use;
  if (!use) return '';
  if (use.type === 'fishing') {
    return (
      line('tt-desc', t('itemUi.tooltip.useFishing')) +
      line('tt-desc', t('hudChrome.gathering.toolTooltip.rodRequired'))
    );
  }
  if (!isGatherToolUse(use)) return '';
  const tier = formatNumber(use.tier, { maximumFractionDigits: 0 });
  let html = line('tt-sub', t(KIND_KEYS[use.professionId], { tier }));
  if (use.professionId === 'fishing') {
    html += line('tt-desc', t('itemUi.tooltip.useFishing'));
    html += line('tt-desc', t('hudChrome.gathering.toolTooltip.rodRequired'));
    if (use.tier > 1) {
      const tiersAbove = use.tier - 1;
      // CLAMPED, because the sim clamps. The bite window is
      // [MIN, max(MIN, MAX - reduction * tiersAbove)], so once the reduction
      // would push the ceiling under the floor the rod stops buying seconds:
      // at tier 5 the raw product is 6 but the real improvement is 5, and the
      // unclamped number told a player the rod was a second better than it is.
      const biteSaved =
        FISH_BITE_DELAY_MAX_SEC -
        Math.max(
          FISH_BITE_DELAY_MIN_SEC,
          FISH_BITE_DELAY_MAX_SEC - FISH_BITE_DELAY_ROD_REDUCTION_SEC * tiersAbove,
        );
      html += line(
        'tt-desc',
        t('hudChrome.gathering.toolTooltip.rodBite', {
          seconds: formatNumber(biteSaved, { maximumFractionDigits: 2 }),
        }),
      );
      html += line(
        'tt-desc',
        t('hudChrome.gathering.toolTooltip.rodReel', {
          seconds: formatNumber(FISH_REEL_WINDOW_ROD_BONUS_SEC * tiersAbove, {
            maximumFractionDigits: 2,
          }),
        }),
      );
      // The band line is only true while the rod actually raises the ceiling.
      // A rod of tier T unlocks catch band T - 1, and there are three bands,
      // so tier 3 reaches the last one and tiers 4 and 5 unlock no band at
      // all. Clamping the index instead (which is what this did) made every
      // rod above tier 3 repeat the tier-3 rod's claim, telling the owner of a
      // crafted rod it unlocks something the rod below it already had. Their
      // real gains are the two bonus lines above, which do keep scaling.
      if (use.tier <= PROFICIENCY_BAND_THRESHOLDS.length) {
        html += line(
          'tt-desc',
          t('hudChrome.gathering.toolTooltip.rodBand', {
            skill: formatNumber(PROFICIENCY_BAND_THRESHOLDS[tiersAbove], {
              maximumFractionDigits: 0,
            }),
          }),
        );
      }
    }
    return html;
  }
  const unlocksKey = UNLOCKS_KEYS[use.professionId];
  const useKey = USE_KEYS[use.professionId];
  if (unlocksKey) html += line('tt-desc', t(unlocksKey, { tier }));
  if (useKey) html += line('tt-desc', t(useKey));
  if (use.tier > 1) {
    html += line('tt-desc', t('hudChrome.gathering.toolTooltip.speed', { tier }));
  }
  return html;
}
