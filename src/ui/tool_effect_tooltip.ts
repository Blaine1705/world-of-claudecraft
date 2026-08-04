// Tool-effect charm tooltip lines: what Gatherer's Cache / Artisan's Eye (and
// the catalog Springback Charm) do, how a player slots them, and that a slot
// burns the charm. Pure string-builder composed inside Hud.itemTooltip (the
// gather_tool_tooltip.ts / material_hint_view.ts pattern): t() + esc here, no
// DOM, no Hud state, so tests/tool_effect_tooltip.test.ts drives it directly.
//
// Numbers come from the sim catalog and charge ladder, never re-invented copy:
// TOOL_EFFECTS.startingDurability and RARITY_DURABILITY_BONUS (tools.ts). The
// bonus prose tracks applyEffectBonus kinds (quantity / quality / respawnSpeed).
// Fishing is never advertised as a slot target: slotToolEffectRefused refuses
// every effect on fishing until an arm has real fishing behavior.

import { TOOL_EFFECTS, type ToolEffectId } from '../sim/content/professions';
import { RARITY_DURABILITY_BONUS } from '../sim/professions/tools';
import type { ItemDef } from '../sim/types';
import { esc } from './esc';
import { formatNumber, type TranslationKey, t } from './i18n';
import { QUALITY_COLOR } from './icons';
import { toolEffectNameKey } from './tool_effect_name';

/** Effect id -> bonus-description key. Mirrors TOOL_EFFECTS; an id absent here
 *  has no honest bonus line (a retired or unknown id renders no tooltip). */
const BONUS_KEYS: Record<ToolEffectId, TranslationKey> = {
  gatherers_cache: 'hudChrome.professions.toolEffectTooltip.bonus.gatherersCache',
  artisans_eye: 'hudChrome.professions.toolEffectTooltip.bonus.artisansEye',
  quickening_charm: 'hudChrome.professions.toolEffectTooltip.bonus.quickeningCharm',
};

function line(cls: 'tt-sub' | 'tt-desc' | 'tt-green', text: string): string {
  return `<div class="${cls}">${esc(text)}</div>`;
}

/** True when the def is a tool-effect charm (use.type 'toolEffect'). */
export function isToolEffectItem(item: Pick<ItemDef, 'use'>): boolean {
  return item.use?.type === 'toolEffect';
}

/** hasOwn-safe bonus key for one effect id, or undefined when the id is not a
 *  live catalog entry with copy. */
export function toolEffectBonusKey(effectId: string): TranslationKey | undefined {
  return Object.hasOwn(BONUS_KEYS, effectId) ? BONUS_KEYS[effectId as ToolEffectId] : undefined;
}

/**
 * Standalone tooltip body for one tool-effect id (title + bonus + how-to), used
 * by the Professions window on slot buttons and live effect rows. Empty string
 * when the id has no display name or bonus copy (a retired effect).
 */
export function toolEffectStandaloneTooltip(effectId: string): string {
  const nameKey = toolEffectNameKey(effectId);
  const bonusKey = toolEffectBonusKey(effectId);
  if (nameKey === undefined || bonusKey === undefined) return '';
  const def = Object.hasOwn(TOOL_EFFECTS, effectId)
    ? TOOL_EFFECTS[effectId as ToolEffectId]
    : undefined;
  if (!def) return '';
  const baseCharges = formatNumber(def.startingDurability, { maximumFractionDigits: 0 });
  const rarityBonus = formatNumber(RARITY_DURABILITY_BONUS, { maximumFractionDigits: 0 });
  return (
    `<div class="tt-title" style="color:${QUALITY_COLOR.rare}">${esc(t(nameKey))}</div>` +
    line('tt-sub', t('hudChrome.professions.toolEffectTooltip.kind')) +
    line('tt-green', t(bonusKey)) +
    line('tt-desc', t('hudChrome.professions.toolEffectTooltip.howToSlot')) +
    line(
      'tt-desc',
      t('hudChrome.professions.toolEffectTooltip.charges', {
        base: baseCharges,
        bonus: rarityBonus,
      }),
    ) +
    line('tt-sub', t('hudChrome.professions.toolEffectTooltip.landOnly'))
  );
}

/** The tooltip lines for one tool-effect charm item, or '' for any other item.
 *  Composed into Hud.itemTooltip so bags, bank, crafting, market, and every
 *  other surface that reuses itemTooltip show the same card. */
export function toolEffectTooltipLines(item: ItemDef): string {
  const use = item.use;
  if (use?.type !== 'toolEffect') return '';
  const bonusKey = toolEffectBonusKey(use.effectId);
  if (bonusKey === undefined) return '';
  const def = Object.hasOwn(TOOL_EFFECTS, use.effectId)
    ? TOOL_EFFECTS[use.effectId as ToolEffectId]
    : undefined;
  if (!def) return '';
  const baseCharges = formatNumber(def.startingDurability, { maximumFractionDigits: 0 });
  const rarityBonus = formatNumber(RARITY_DURABILITY_BONUS, { maximumFractionDigits: 0 });
  return (
    line('tt-sub', t('hudChrome.professions.toolEffectTooltip.kind')) +
    line('tt-green', t(bonusKey)) +
    line('tt-desc', t('hudChrome.professions.toolEffectTooltip.howToSlot')) +
    line(
      'tt-desc',
      t('hudChrome.professions.toolEffectTooltip.charges', {
        base: baseCharges,
        bonus: rarityBonus,
      }),
    ) +
    line('tt-sub', t('hudChrome.professions.toolEffectTooltip.landOnly')) +
    line('tt-sub', t('hudChrome.professions.toolEffectTooltip.openProfessions'))
  );
}
