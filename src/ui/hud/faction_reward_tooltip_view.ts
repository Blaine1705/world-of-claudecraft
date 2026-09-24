import type { ItemDef } from '../../sim/types';
import { esc } from '../esc';
import { t } from '../i18n';

/** Tooltip description lines for allied faction rewards and consumables. */
export function factionRewardTooltipLines(item: ItemDef, attunement?: string | null): string {
  if (item.id === 'allied_hearthstone') {
    const hubName =
      attunement === 'rift_watch'
        ? t('hudChrome.factionRewards.hub_rift_watch')
        : attunement === 'church_order'
          ? t('hudChrome.factionRewards.hub_church_order')
          : attunement === 'automatons'
            ? t('hudChrome.factionRewards.hub_automatons')
            : t('hudChrome.factionRewards.hub_none');
    return (
      `<div class="tt-desc">${esc(t('hudChrome.factionRewards.alliedHearthstoneUse'))}</div>` +
      `<div class="tt-sub" style="color:var(--gold)">${esc(t('hudChrome.factionRewards.alliedHearthstoneAttuned', { hub: hubName }))}</div>`
    );
  }
  if (item.id === 'rift_feather_glider') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.riftGliderUse'))}</div>`;
  }
  if (item.id === 'clockwork_target_dummy') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.targetDummyUse'))}</div>`;
  }
  if (item.id === 'dawn_battle_standard') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.battleStandardUse'))}</div>`;
  }
  if (item.id === 'clockwork_shock_bomb') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.shockBombUse'))}</div>`;
  }
  if (item.id === 'potion_of_invisibility') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.invisibilityUse'))}</div>`;
  }
  if (item.id === 'reinforced_armor_kit') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.armorKitUse'))}</div>`;
  }
  if (item.id === 'dense_sharpening_stone') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.sharpeningStoneUse'))}</div>`;
  }
  if (item.id === 'elixir_of_mana_regeneration') {
    return `<div class="tt-desc">${esc(t('hudChrome.factionRewards.manaElixirUse'))}</div>`;
  }
  return '';
}
