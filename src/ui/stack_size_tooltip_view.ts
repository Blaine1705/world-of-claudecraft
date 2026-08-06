// Max-stack item tooltip line: how many copies of the item share one bag
// slot, as a pure string-builder composed inside Hud.itemTooltip (the
// elixir_tooltip_view.ts pattern: t() + esc here, no DOM, no Hud state, so
// tests/stack_size_tooltip_view.test.ts drives it directly). The number comes
// from the one stacking rule every inventory site already consumes
// (sim/bags.ts stackSizeOf), never a re-typed copy, so the line can never
// disagree with what the bags actually do. Unstackable kinds (gear, bags,
// tools: stack cap 1) render nothing; stating "Max stack: 1" on every sword
// would be noise, and the line exists to answer the opposite question: a
// player holding ONE potion has no stack badge to learn from, this line is
// how they find out more will share the slot.

import { stackSizeOf } from '../sim/bags';
import type { ItemDef } from '../sim/types';
import { esc } from './esc';
import { formatNumber, t } from './i18n';

/** The "Max stack: N" sub-line for a stackable item, or '' for a 1-per-slot one. */
export function stackSizeTooltipLine(item: ItemDef): string {
  // Mount reins technically ride the consumable stack default in the bags,
  // but owning the reins IS owning the mount: a second copy is pure waste
  // (noVendorSell, and the bulk-buy path refuses them), so advertising a
  // 20-per-slot cap would teach hoarding a collectible. Suppressed, like the
  // 1-per-slot kinds below.
  if (item.kind === 'mount') return '';
  const size = stackSizeOf(item);
  if (size <= 1) return '';
  const text = t('itemUi.tooltip.maxStack', {
    count: formatNumber(size, { maximumFractionDigits: 0 }),
  });
  return `<div class="tt-sub">${esc(text)}</div>`;
}
