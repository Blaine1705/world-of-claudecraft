// The character sheet's mount picker: a thin DOM section builder over the pure
// mount_picker_view core (the gatheringHtml shape: the CharWindow composes the
// HTML and wires the section after each innerHTML rebuild). Replaces the
// retired Mounts window: it renders ONLY the mounts the player owns as pickable
// cards (a level-locked one shown dimmed, not pickable), the pick is written
// through IWorldMounts.selectMount (re-validated server-side), and riding is
// the Z keybind's job, never a button here. A player who owns no mount yet sees
// an empty state telling them how to earn a first one.
//
// Also the shared home of the mount name/description i18n key maps (the bag
// tooltip for reins items reuses them).

import { MOUNTS } from '../sim/content/mounts';
import { esc } from './esc';
import { type TranslationKey, t } from './i18n';
import { iconDataUrl, QUALITY_COLOR } from './icons';
import type { MountPickerRow, MountPickerView } from './mount_picker_view';

export const MOUNT_NAME_KEYS: Record<string, TranslationKey> = {
  valorsteed: 'hudChrome.mounts.name_valorsteed',
  grag_bear: 'hudChrome.mounts.name_grag_bear',
  stalkglider_snail: 'hudChrome.mounts.name_stalkglider_snail',
  aether_hover_cycle: 'hudChrome.mounts.name_aether_hover_cycle',
  shadowjump_toad: 'hudChrome.mounts.name_shadowjump_toad',
  stormfeather_griffin: 'hudChrome.mounts.name_stormfeather_griffin',
  thunderstrut_gobbler: 'hudChrome.mounts.name_thunderstrut_gobbler',
};

export const MOUNT_DESC_KEYS: Record<string, TranslationKey> = {
  valorsteed: 'hudChrome.mounts.desc_valorsteed',
  grag_bear: 'hudChrome.mounts.desc_grag_bear',
  stalkglider_snail: 'hudChrome.mounts.desc_stalkglider_snail',
  aether_hover_cycle: 'hudChrome.mounts.desc_aether_hover_cycle',
  shadowjump_toad: 'hudChrome.mounts.desc_shadowjump_toad',
  stormfeather_griffin: 'hudChrome.mounts.desc_stormfeather_griffin',
  thunderstrut_gobbler: 'hudChrome.mounts.desc_thunderstrut_gobbler',
};

export const MOUNT_RARITY_KEYS: Record<string, TranslationKey> = {
  common: 'hudChrome.mounts.rarity_common',
  rare: 'hudChrome.mounts.rarity_rare',
  epic: 'hudChrome.mounts.rarity_epic',
};

/** Display name for a catalog mount (cards + tooltips); English fallback from
 *  the sim record never renders: every key has a catalog entry. */
export function mountDisplayName(key: string): string {
  const nameKey = MOUNT_NAME_KEYS[key];
  return nameKey ? t(nameKey) : ((MOUNTS as Record<string, { name: string }>)[key]?.name ?? key);
}

/** The specialty lines ("+40% extra mobility", ...) for a mount row. */
export function mountSpecLines(row: {
  speedPct: number;
  blockPct: number;
  critPct: number;
}): string[] {
  const parts = [t('hudChrome.mounts.spec_speed', { pct: row.speedPct })];
  if (row.blockPct > 0) parts.push(t('hudChrome.mounts.spec_block', { pct: row.blockPct }));
  if (row.critPct > 0) parts.push(t('hudChrome.mounts.spec_crit', { pct: row.critPct }));
  return parts;
}

// The state chip never co-renders a contradiction: the "Riding" chip only when
// actually riding, the "Selected" chip only for an unlocked pick (a level-locked
// card shows its requirement line instead). Every rendered row is owned.
function stateChip(row: MountPickerRow): string {
  if (row.active)
    return `<span class="mp-state mp-riding">${esc(t('hudChrome.mounts.riding'))}</span>`;
  if (row.selected && !row.locked)
    return `<span class="mp-state">${esc(t('hudChrome.mounts.selected'))}</span>`;
  return '';
}

function cardHtml(row: MountPickerRow, highlightKey: string): string {
  const color = QUALITY_COLOR[row.rarity] ?? 'var(--color-quality-default)';
  const classes = ['mp-card'];
  if (row.locked) classes.push('mp-locked');
  if (row.selected) classes.push('mp-selected');
  if (row.key === highlightKey) classes.push('mp-highlight');
  // Level-locked (owned but under the gate): only the level requirement (never a
  // Selected chip). Otherwise the specialty lines.
  const sub = row.locked
    ? `<div class="mp-sub mp-lock">${esc(t('hudChrome.mounts.requiresLevel', { level: row.level }))}</div>`
    : `<div class="mp-sub">${mountSpecLines(row)
        .map((p) => `<span class="mp-spec">${esc(p)}</span>`)
        .join('')}</div>`;
  // A pickable card is a real button (its own role, no list semantics layered
  // on top); the rest stay inert divs so the keyboard order only visits
  // actionable cards.
  const tag = row.pickable ? 'button' : 'div';
  const typeAttr = row.pickable ? ' type="button"' : '';
  // The rendered 3D face icon (the reins item's image; every catalog mount has
  // a reins item, so the id is always resolvable through the item-icon seam).
  const face = `<img class="mp-face" src="${iconDataUrl('item', `reins_${row.key}`)}" alt="" draggable="false">`;
  return (
    `<${tag}${typeAttr} class="${classes.join(' ')}" data-mount-key="${esc(row.key)}"` +
    `${row.selected ? ' aria-current="true"' : ''}>` +
    face +
    `<div class="mp-info"><div class="mp-name" style="color:${color}">${esc(mountDisplayName(row.key))}${stateChip(row)}</div>` +
    sub +
    `</div></${tag}>`
  );
}

// The empty state (no owned mount): a short heading plus how to earn a first
// mount. Non-interactive text only (no buttons), so the keybind hint and the
// card grid are both suppressed until the player owns something.
function emptyStateHtml(): string {
  return (
    `<div class="mp-empty">` +
    `<div class="mp-name">${esc(t('hudChrome.mounts.emptyTitle'))}</div>` +
    `<div class="mp-hint">${esc(t('hudChrome.mounts.emptyStableHint'))}</div>` +
    `<div class="mp-hint">${esc(t('hudChrome.mounts.emptyDropHint'))}</div>` +
    `</div>`
  );
}

/** The whole section: a titled card row of the OWNED mounts in the character
 *  sheet's progression style plus the Z-keybind hint, or the empty state when
 *  the player owns none. */
export function mountPickerHtml(view: MountPickerView, highlightKey = ''): string {
  const title = `<div class="cp-title">${esc(t('hudChrome.mounts.title'))}</div>`;
  const body =
    view.rows.length === 0
      ? emptyStateHtml()
      : `<div class="mp-cards">${view.rows.map((row) => cardHtml(row, highlightKey)).join('')}</div>` +
        `<div class="mp-hint">${esc(t('hudChrome.mounts.keybindHint'))}</div>`;
  return `<div class="char-progression mount-picker">${title}${body}</div>`;
}

/** The hover/focus tooltip for one catalog mount (cards + the reins bag item). */
export function mountTooltipHtml(row: MountPickerRow): string {
  const color = QUALITY_COLOR[row.rarity] ?? 'var(--color-quality-default)';
  let html = `<div class="tt-title" style="color:${color}">${esc(mountDisplayName(row.key))}</div>`;
  html += `<div class="tt-sub">${esc(t(MOUNT_RARITY_KEYS[row.rarity]))}</div>`;
  const descKey = MOUNT_DESC_KEYS[row.key];
  if (descKey) html += `<div class="tt-desc">${esc(t(descKey))}</div>`;
  for (const line of mountSpecLines(row)) html += `<div class="tt-green">${esc(line)}</div>`;
  // Every rendered mount is owned; a level-locked one shows its ride-level gate.
  if (row.locked) {
    html += `<div class="tt-sub mp-lock">${esc(t('hudChrome.mounts.requiresLevel', { level: row.level }))}</div>`;
  }
  return html;
}

export interface MountPickerWireDeps {
  /** Pick a mount (IWorldMounts.selectMount; re-validated server-side). */
  selectMount(key: string): void;
  /** Re-render the hosting sheet after a pick so the cards reflect it. */
  rerender(): void;
  /** The shared HUD tooltip (PainterHostPresentation.attachTooltip). */
  attachTooltip(el: HTMLElement, html: () => string): void;
}

/** Wire the freshly rebuilt section: tooltips on every card, click-to-pick on
 *  the pickable ones, and the one-shot highlight scroll. */
export function wireMountPicker(
  root: HTMLElement,
  view: MountPickerView,
  deps: MountPickerWireDeps,
): void {
  const byKey = new Map(view.rows.map((row) => [row.key as string, row]));
  for (const card of root.querySelectorAll<HTMLElement>('[data-mount-key]')) {
    const row = byKey.get(card.dataset.mountKey ?? '');
    if (!row) continue;
    deps.attachTooltip(card, () => mountTooltipHtml(row));
    if (row.pickable) {
      card.addEventListener('click', () => {
        deps.selectMount(row.key);
        deps.rerender();
      });
    }
  }
  const highlight = root.querySelector<HTMLElement>('.mp-highlight');
  highlight?.scrollIntoView({ block: 'nearest' });
}
