// Thin DOM consumer for the vendor window.
//
// The consumer half of the pure-core + thin-consumer split: it paints
// #vendor-window from the structured VendorView (vendor_view.ts) and wires the
// buy / buyback / close actions. It owns no state. The cross-window
// orchestration (which windows to close, bag re-centring, mobile teardown)
// stays in Hud because it needs Hud's private state; this module only renders
// one panel and reports clicks back through the injected callbacks.

import type { ItemInstancePayload } from '../../../sim/types';
import { itemDisplayName } from '../../entity_i18n';
import { esc } from '../../esc';
import { captureFocusKey, restoreFirstEnabled } from '../../focus_restore';
import { GATHERING_PROFESSION_NAME_KEYS } from '../../gathering_profession_name';
import { formatMoney as formatLocalizedMoney, formatNumber, t } from '../../i18n';
import type { PainterHostPresentation } from '../../painter_host';
import { svgIcon } from '../../ui_icons';
import type { VendorGoodsRow, VendorPrice, VendorView } from './vendor_view';

/**
 * Hud-supplied glue. The icon/money/tooltip painters are the shared
 * PainterHostPresentation bag (Hud builds it once and hands it to every window
 * that renders item rows); this composes that base and adds the vendor-specific
 * tooltip teardown, the buy/buyback/sell-junk dispatch, and the sell-junk state.
 * The module never reaches into Hud directly.
 */
export interface VendorWindowDeps extends PainterHostPresentation {
  hideTooltip(): void;
  onBuy(itemId: string): void;
  onBuyBack(
    itemId: string,
    index: number,
    instance: ItemInstancePayload | undefined,
    craftedRecipeId: string | undefined,
  ): void;
  onSellJunk(): void;
  onClose(): void;
  sellJunk: {
    enabled: boolean;
    proceeds: number;
  };
}

function honorText(amount: number): string {
  return t('hudChrome.warfare.honorAmount', {
    amount: formatNumber(amount, { maximumFractionDigits: 0 }),
  });
}

function goodsPriceText(price: VendorPrice): string {
  const money = price.copper > 0 ? formatLocalizedMoney(price.copper) : '';
  const honor = price.honor > 0 ? honorText(price.honor) : '';
  if (money && honor) return t('hudChrome.warfare.dualPrice', { money, honor });
  return money || honor;
}

/** The advisory requirement line under a row's name (R22): the localized
 *  gathering profession plus the wield proficiency the tool will ask of its
 *  owner, e.g. "Requires Mining 40". The row sells either way.
 *
 *  Reuses hudChrome.crafting.skillReqLine rather than minting a second sentence
 *  saying the same thing: its rendered English is exactly this line, it is
 *  filled in every locale, and its `{craft}` placeholder is a name slot, not a
 *  claim that the named thing is a craft (the crafting window passes a craft,
 *  this passes a gathering profession). The trainer's own locked-row key stays
 *  separate because its wording, "Taught at", is trainer-specific and false of a
 *  merchant. Empty string for a profession with no display-name key, matching
 *  every other consumer of that table: no name is printable, so no line is. */
function requirementText(row: VendorGoodsRow): string {
  const requirement = row.requirement;
  if (!requirement) return '';
  const nameKey = GATHERING_PROFESSION_NAME_KEYS[requirement.professionId];
  if (nameKey === undefined) return '';
  return t('hudChrome.crafting.skillReqLine', {
    craft: t(nameKey),
    skill: formatNumber(requirement.proficiency, { maximumFractionDigits: 0 }),
  });
}

function goodsPriceHtml(row: VendorGoodsRow, deps: VendorWindowDeps): string {
  const parts: string[] = [];
  if (row.price.copper > 0) parts.push(deps.moneyHtml(row.price.copper));
  if (row.price.honor > 0) {
    parts.push(`<span class="warfare-price">${esc(honorText(row.price.honor))}</span>`);
  }
  return parts.join('<span aria-hidden="true"> + </span>');
}

/** Paint the vendor panel from a prepared view. */
export function renderVendorWindow(
  el: HTMLElement,
  vendorName: string,
  view: VendorView,
  deps: VendorWindowDeps,
): void {
  // The rebuild replaces the hovered row (its mouseleave never fires) and
  // collapses the scrolled list, drop the tooltip and restore the scroll.
  // It also replaces the FOCUSED row (a keyboard buy rebuilds under the
  // finger), so the focus key is captured here and restored at the end per
  // the focus-across-a-REBUILD contract; requirement-advisory rows are
  // focusable since the R22 turn, which widened the set exposed to the drop.
  deps.hideTooltip();
  const focusKey = captureFocusKey(el);
  const scrollTop = el.scrollTop;
  el.innerHTML = `<div class="panel-title"><span>${esc(t('itemUi.vendor.goodsTitle', { name: vendorName }))}</span><button type="button" class="x-btn" data-close data-focus-key="close" aria-label="${esc(t('itemUi.vendor.close'))}">${svgIcon('close')}</button></div>`;

  if (view.hasHonorGoods) {
    const balance = document.createElement('div');
    balance.className = 'warfare-balance';
    balance.textContent = t('hudChrome.warfare.balance', {
      amount: formatNumber(view.honorBalance, { maximumFractionDigits: 0 }),
    });
    el.appendChild(balance);
  }

  // Landscape layout: goods tile up in a multi-column grid instead of one
  // full-width row per item (see .vendor-goods-grid in components.css).
  const goodsGrid = document.createElement('div');
  goodsGrid.className = 'vendor-goods-grid';
  for (const goods of view.goods) {
    const { itemId, item, quantity } = goods;
    const row = document.createElement('button');
    row.type = 'button';
    // An unmet wield requirement is ADVISORY (R22): the row sells like any
    // other, and .vendor-locked survives purely as the style hook that tints
    // the requirement sub-line so the number reads as "not yet met" rather
    // than decoration. Never disabled for it: the sale is real, the gate is
    // at the harvest.
    row.className = goods.requirementUnmet ? 'vendor-item vendor-locked' : 'vendor-item';
    row.disabled = !goods.affordable;
    const price = goodsPriceText(goods.price);
    const itemName = itemDisplayName(item);
    const stack =
      quantity > 1
        ? ` ${t('itemUi.bags.stackCount', { count: formatNumber(quantity, { maximumFractionDigits: 0 }) })}`
        : '';
    const requirement = goods.requirementUnmet ? requirementText(goods) : '';
    // Every row gets a buy aria-label (the purchase deny is retired, so the
    // promise is true of every row), and an aria-label REPLACES the button's
    // content as its accessible name: a requirement-unmet row must fold the
    // advisory into the name itself or screen-reader users never hear what
    // the sighted sub-line says. One combined key, never two concatenated
    // t() results.
    row.setAttribute(
      'aria-label',
      requirement
        ? t('itemUi.vendor.buyAriaWithRequirement', {
            item: `${itemName}${stack}`,
            price,
            requirement,
          })
        : t('itemUi.vendor.buyAria', { item: `${itemName}${stack}`, price }),
    );
    row.innerHTML = `${deps.itemIcon(item)}<span class="vi-name">${esc(itemName)}${esc(stack)}${requirement ? `<span class="vi-sub">${esc(requirement)}</span>` : ''}</span><span class="vi-price">${goodsPriceHtml(goods, deps)}</span>`;
    row.dataset.focusKey = `buy:${itemId}`;
    row.addEventListener('click', () => deps.onBuy(itemId));
    // No appended requirement line in the tooltip: the shared item tooltip
    // (deps.itemTooltip -> gatherToolTooltipLines) already renders the same
    // "Requires {craft} {skill}" sentence on every requirement-carrying
    // tool, and the painter appending it again showed the line twice on
    // every gated row. The at-a-glance signal stays the .vi-sub row line.
    deps.attachTooltip(
      row,
      () =>
        `${deps.itemTooltip(item)}<div class="tt-sub">${esc(t('itemUi.tooltip.clickBuy'))}</div>`,
    );
    goodsGrid.appendChild(row);
  }
  if (view.goods.length > 0) el.appendChild(goodsGrid);

  const sellJunk = document.createElement('button');
  sellJunk.type = 'button';
  sellJunk.className = 'vendor-sell-junk';
  sellJunk.disabled = !deps.sellJunk.enabled;
  sellJunk.innerHTML = `<span class="vi-name">${esc(t('itemUi.vendor.sellJunk'))}</span>${deps.sellJunk.enabled ? `<span class="vi-price">${deps.moneyHtml(deps.sellJunk.proceeds)}</span>` : ''}`;
  sellJunk.setAttribute(
    'aria-label',
    deps.sellJunk.enabled
      ? t('itemUi.vendor.sellJunkAria', {
          price: formatLocalizedMoney(deps.sellJunk.proceeds),
        })
      : t('itemUi.vendor.sellJunk'),
  );
  sellJunk.dataset.focusKey = 'sell-junk';
  sellJunk.addEventListener('click', () => deps.onSellJunk());
  deps.attachTooltip(
    sellJunk,
    () => `<div class="tt-sub">${esc(t('itemUi.vendor.sellJunkHint'))}</div>`,
  );
  el.appendChild(sellJunk);

  const buybackTitle = document.createElement('div');
  buybackTitle.className = 'vendor-section-title';
  buybackTitle.textContent = t('itemUi.vendor.buybackTitle');
  el.appendChild(buybackTitle);

  if (view.buyback.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'vendor-empty';
    empty.textContent = t('itemUi.vendor.buybackEmpty');
    el.appendChild(empty);
  }
  const buybackGrid = document.createElement('div');
  buybackGrid.className = 'vendor-goods-grid';
  for (const {
    itemId,
    item,
    count,
    price: priceCopper,
    index,
    instance,
    craftedRecipeId,
  } of view.buyback) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'vendor-item';
    const price = formatLocalizedMoney(priceCopper);
    const itemName = itemDisplayName(item);
    row.setAttribute('aria-label', t('itemUi.vendor.buybackAria', { item: itemName, price }));
    row.innerHTML = `${deps.itemIcon(item)}<span class="vi-name">${esc(itemName)}${count > 1 ? ` ${esc(t('itemUi.bags.stackCount', { count: formatNumber(count, { maximumFractionDigits: 0 }) }))}` : ''}</span><span class="vi-price">${deps.moneyHtml(priceCopper)}</span>`;
    row.dataset.focusKey = `buyback:${index}`;
    row.addEventListener('click', () => deps.onBuyBack(itemId, index, instance, craftedRecipeId));
    deps.attachTooltip(
      row,
      () =>
        `${deps.itemTooltip(item, instance)}<div class="tt-sub">${esc(t('itemUi.tooltip.clickBuyback'))}</div>`,
    );
    buybackGrid.appendChild(row);
  }
  if (view.buyback.length > 0) el.appendChild(buybackGrid);

  const hint = document.createElement('div');
  hint.className = 'vendor-hint';
  hint.textContent = t('itemUi.vendor.hint');
  el.appendChild(hint);

  el.querySelector('[data-close]')?.addEventListener('click', () => deps.onClose());
  el.style.display = 'block';
  el.scrollTop = scrollTop;
  // Scroll first, then restore (the family contract): the exact control when
  // it survived the rebuild, else the stable neighbors, so a keyboard buy of
  // the last stack cannot drop focus to <body>.
  if (focusKey) {
    // Matched by dataset equality rather than an attribute selector: the keys
    // are self-minted (buy:<itemId> and friends) but this needs no CSS.escape,
    // which jsdom does not provide.
    const exact = [...el.querySelectorAll<HTMLButtonElement>('[data-focus-key]')].find(
      (b) => b.dataset.focusKey === focusKey,
    );
    restoreFirstEnabled([
      exact,
      el.querySelector<HTMLButtonElement>('.vendor-sell-junk'),
      el.querySelector<HTMLButtonElement>('[data-close]'),
    ]);
  }
}
