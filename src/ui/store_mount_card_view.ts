// Machine Stable presentation: the WOC Store's account-mount section and its
// cards. Split out of src/ui/daily_rewards_window.ts the same way the Armory
// (src/ui/armory_card_view.ts) and the Strongbox charters
// (src/ui/charter_card_view.ts) were: every function here is a pure function
// of its arguments (src/ui/CLAUDE.md, pure-core plus thin painter), so a
// Vitest renders the section without a DOM. The rows themselves are projected
// by buildStoreMountRows in src/ui/woc_store_view.ts; this module only turns
// them into HTML, and the purchase flow lives in src/ui/store_mount_purchase.ts.

import { MOUNTS, type MountKey } from '../sim/content/mounts';
import { ITEMS } from '../sim/data';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { MOUNT_DESC_KEYS } from './mount_labels';
import type { StoreMountRow } from './woc_store_view';

/** The buy button's data attribute; the store body binding reads the item id
 *  back off it (src/ui/store_body_actions.ts). */
export const STORE_MOUNT_BUY_ATTR = 'data-store-mount-buy';

/** The reins item's display name, for the card and the confirm dialog. Falls
 *  back to the id only for a row whose item the catalog does not declare, which
 *  buildStoreMountRows never produces. */
export function storeMountName(itemId: string): string {
  const def = ITEMS[itemId];
  return def ? itemDisplayName(def) : itemId;
}

/** One card, or '' for a row whose reins item or mount is unknown: a row the
 *  catalog does not declare never renders, and no card is invented for it. */
export function storeMountCardHtml(row: StoreMountRow): string {
  const def = ITEMS[row.itemId];
  const mountKey = def?.kind === 'mount' ? def.mount : undefined;
  const mount = mountKey ? MOUNTS[mountKey as MountKey] : undefined;
  if (!def || !mount) return '';
  const state = row.owned
    ? `<span class="armory-state">${esc(t('hudChrome.wocStore.owned'))}</span>`
    : row.costClaudium === null
      ? `<span class="armory-state unavailable">${esc(t('hudChrome.wocStore.unavailable'))}</span>`
      : `<button type="button" class="armory-buy" ${STORE_MOUNT_BUY_ATTR}="${esc(row.itemId)}">` +
        `<img src="/claudium/icons/claudium_coin_64.webp" alt="">${formatNumber(row.costClaudium, { maximumFractionDigits: 0 })}</button>`;
  return (
    `<article class="armory-card store-mount-card rarity-${esc(mount.rarity)}">` +
    `<img class="store-mount-icon" src="/ui/items/${esc(row.itemId)}.webp" alt="">` +
    `<div><h4>${esc(itemDisplayName(def))}</h4>` +
    `<p>${esc(t(MOUNT_DESC_KEYS[mount.key] ?? 'hudChrome.mounts.useToRide'))}</p>` +
    `<p class="store-mount-spec">${esc(t('hudChrome.mounts.spec_speed', { pct: Math.round(mount.moveSpeedPct * 100) }))}</p></div>` +
    `${state}</article>`
  );
}

/** The store's Mounts strip, or '' when there is nothing to show. */
export function storeMountsSectionHtml(rows: readonly StoreMountRow[]): string {
  const cards = rows.map(storeMountCardHtml).join('');
  if (!cards) return '';
  return (
    `<section class="armory-section store-mounts"><header><div>` +
    `<span>${esc(t('hudChrome.wocStore.mountsEyebrow'))}</span>` +
    `<h3>${esc(t('hudChrome.wocStore.mountsTitle'))}</h3></div></header>` +
    `<div class="armory-grid">${cards}</div></section>`
  );
}
