// The World Market's Wanted tab: the thin DOM painter over market_orders_core.ts.
// Three regions, top to bottom: the place-order card (an item picker, a unit
// count, and the Sell tab's three coin fields, with the escrow total and a
// Place button that asks first through Hud's one modal confirm prompt), the
// open-order rows (Deliver from bags into someone else's order, or Withdraw
// your own), and the "not on the market" strip (every material with no listing
// at all; a chip stages that item into the card).
//
// Snapshot-driven like the rest of the window: the rows and the strip are
// rebuilt whenever the window's refresh signature moves, but the place card
// holds typed inputs, so it is built ONCE per open and re-attached across
// repaints (the Sell tab's never-rebuild-typed-inputs rule), with only its
// stage-dependent lines (total, button state) patched in place.

import { audio } from '../game/audio';
import { MARKET_ORDER_MAX_UNITS } from '../sim/market_orders';
import type { ItemDef } from '../sim/types';
import type { IWorld } from '../world_api';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import { formatMoney as formatLocalizedMoney, formatNumber, t } from './i18n';
import { marketNameColor } from './market_name_color';
import {
  buildMarketOrders,
  type MarketOrderRow,
  type MarketOrderStage,
  orderableItemById,
  orderableMatches,
  orderCountFromInput,
  orderStageProblem,
  orderStageTotal,
} from './market_orders_core';
import { COPPER_PER_GOLD, COPPER_PER_SILVER } from './market_view';
import type { PainterHostPresentation } from './painter_host';
import { wornItemCellParts } from './worn_item_cell_view';

export interface MarketOrdersPanelDeps extends PainterHostPresentation {
  world(): IWorld;
  showError(text: string): void;
  confirmDialog(
    title: string,
    body: string,
    okText: string,
    cancelText: string,
    onOk: () => void,
  ): void;
  /** Plain (fungible) units of an item in the viewer's bags. */
  fungibleBagCount(itemId: string): number;
}

const count0 = (n: number) => formatNumber(n, { maximumFractionDigits: 0 });

export class MarketOrdersPanel {
  private stagedItemId: string | null = null;
  private card: HTMLElement | null = null;
  private lastCardSig = '';

  constructor(private readonly deps: MarketOrdersPanelDeps) {}

  /** Drop the typed state (the window closing or leaving the tab). */
  reset(): void {
    this.stagedItemId = null;
    this.card = null;
    this.lastCardSig = '';
  }

  /** A strip chip or an outside caller: stage `itemId` into the place card. */
  stage(itemId: string): void {
    this.stagedItemId = itemId;
    this.syncCard();
    this.card?.querySelector<HTMLInputElement>('#mkt-order-qty')?.focus();
  }

  /** Build the whole tab into `body` (the window's renderContent for this tab). */
  mount(body: HTMLElement): void {
    const world = this.deps.world();
    const info = world.marketInfo;
    if (!info) return;
    const view = buildMarketOrders(info, (id) => this.deps.fungibleBagCount(id));
    body.innerHTML = `<div class="mkt-note">${esc(
      t('itemUi.market.ordersNote', {
        cut: count0(view.cutPct),
        used: count0(view.myOrderCount),
        max: count0(view.maxOrders),
      }),
    )}</div>`;
    body.appendChild(this.ensureCard());
    this.syncCard();
    const list = document.createElement('div');
    list.className = 'mkt-list mkt-order-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', t('itemUi.market.ordersListAria'));
    if (view.rows.length === 0) {
      list.innerHTML = `<div class="mkt-empty">${esc(t('itemUi.market.ordersEmpty'))}</div>`;
    }
    for (const row of view.rows) list.appendChild(this.buildRow(row));
    body.appendChild(list);
    body.appendChild(this.buildUnlisted(view.unlisted));
  }

  /** Per-frame: the card's stage-dependent lines (purse-driven affordability). */
  refresh(): void {
    if (this.card?.isConnected) this.syncCard();
  }

  private ensureCard(): HTMLElement {
    if (this.card) return this.card;
    const card = document.createElement('div');
    card.className = 'mkt-order-card ui-card';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', t('itemUi.market.orderCardTitle'));
    card.innerHTML =
      `<div class="mkt-order-head">${esc(t('itemUi.market.orderCardTitle'))}</div>` +
      `<div class="mkt-order-pick" data-order-pick></div>` +
      `<div class="mkt-price-row mkt-order-search-row"><label for="mkt-order-search">${esc(t('itemUi.market.orderPickLabel'))}</label>` +
      `<input type="search" class="mkt-search ui-input" id="mkt-order-search" placeholder="${esc(t('itemUi.market.orderSearchPlaceholder'))}" aria-label="${esc(t('itemUi.market.orderSearchAria'))}" autocomplete="off"></div>` +
      `<div class="mkt-order-matches" role="listbox" aria-label="${esc(t('itemUi.market.orderSearchAria'))}"></div>` +
      `<div class="mkt-price-row"><label for="mkt-order-qty">${esc(t('itemUi.market.orderQuantity'))}</label>` +
      `<input class="coininput ui-input" id="mkt-order-qty" type="number" min="1" max="${MARKET_ORDER_MAX_UNITS}" inputmode="numeric" value="1"></div>` +
      `<div class="mkt-price-row"><label>${esc(t('itemUi.market.orderPriceEach'))}</label>` +
      `<input class="coininput ui-input" id="mkt-order-g" type="number" min="0" value="0" aria-label="${esc(t('itemUi.money.gold'))}"><span class="coin g" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.goldShort'))}</span>` +
      `<input class="coininput ui-input" id="mkt-order-s" type="number" min="0" max="99" value="0" aria-label="${esc(t('itemUi.money.silver'))}"><span class="coin s" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.silverShort'))}</span>` +
      `<input class="coininput ui-input" id="mkt-order-c" type="number" min="0" max="99" value="0" aria-label="${esc(t('itemUi.money.copper'))}"><span class="coin c" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.copperShort'))}</span></div>` +
      `<div class="mkt-order-total" role="status" aria-live="polite"></div>` +
      `<button type="button" class="mkt-order-go ui-btn ui-btn--gold" disabled>${esc(t('itemUi.market.orderPlaceButton'))}</button>`;
    const search = card.querySelector<HTMLInputElement>('#mkt-order-search');
    search?.addEventListener('input', () => this.paintMatches(card, search.value));
    for (const id of ['#mkt-order-qty', '#mkt-order-g', '#mkt-order-s', '#mkt-order-c']) {
      card.querySelector<HTMLInputElement>(id)?.addEventListener('input', () => this.syncCard());
    }
    card.querySelector('.mkt-order-go')?.addEventListener('click', () => {
      audio.click();
      this.promptPlace();
    });
    this.card = card;
    return card;
  }

  private paintMatches(card: HTMLElement, query: string): void {
    const box = card.querySelector<HTMLElement>('.mkt-order-matches');
    if (!box) return;
    box.innerHTML = '';
    const matches = orderableMatches(query, itemDisplayName);
    if (query.trim() !== '' && matches.length === 0) {
      box.innerHTML = `<div class="mkt-order-match-none">${esc(t('itemUi.market.orderPickNone'))}</div>`;
      return;
    }
    for (const item of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mkt-order-match ui-btn';
      btn.setAttribute('role', 'option');
      const parts = wornItemCellParts(item, undefined);
      btn.innerHTML = `${this.deps.itemIcon(item, parts.quality)}<span style="color:${marketNameColor(parts.quality)}">${esc(parts.name)}</span>`;
      btn.addEventListener('click', () => {
        audio.click();
        box.innerHTML = '';
        const search = card.querySelector<HTMLInputElement>('#mkt-order-search');
        if (search) search.value = '';
        this.stage(item.id);
      });
      box.appendChild(btn);
    }
  }

  private readStage(): MarketOrderStage {
    const card = this.card;
    const num = (id: string, fallback: number) => {
      const v = parseInt(card?.querySelector<HTMLInputElement>(id)?.value ?? '', 10);
      return Number.isFinite(v) ? Math.max(0, v) : fallback;
    };
    const count = orderCountFromInput(
      card?.querySelector<HTMLInputElement>('#mkt-order-qty')?.value ?? '1',
    );
    const unitPrice =
      num('#mkt-order-g', 0) * COPPER_PER_GOLD +
      num('#mkt-order-s', 0) * COPPER_PER_SILVER +
      num('#mkt-order-c', 0);
    return { itemId: this.stagedItemId, count, unitPrice };
  }

  /** Patch the staged-item pick, the total line, and the button's state. */
  private syncCard(): void {
    const card = this.card;
    if (!card) return;
    const world = this.deps.world();
    const info = world.marketInfo;
    const stage = this.readStage();
    const problem = orderStageProblem(
      stage,
      world.copper,
      info?.myOrderCount ?? 0,
      info?.maxOrders ?? 0,
    );
    const sig = JSON.stringify([stage, problem]);
    if (sig === this.lastCardSig) return;
    this.lastCardSig = sig;
    const pick = card.querySelector<HTMLElement>('[data-order-pick]');
    if (pick) {
      const item = stage.itemId ? orderableItemById(stage.itemId) : null;
      if (item) {
        const parts = wornItemCellParts(item, undefined);
        pick.className = 'mkt-order-pick mkt-sell-pick ui-card';
        pick.innerHTML = `${this.deps.itemIcon(item, parts.quality)}<span class="ps-name" style="color:${marketNameColor(parts.quality)}">${esc(parts.name)}</span>`;
        this.deps.attachTooltip(pick, () => this.deps.itemTooltip(item));
      } else {
        pick.className = 'mkt-order-pick mkt-sell-pick ui-card empty';
        pick.textContent = t('itemUi.market.orderPickEmpty');
      }
    }
    const total = card.querySelector<HTMLElement>('.mkt-order-total');
    const go = card.querySelector<HTMLButtonElement>('.mkt-order-go');
    if (!total || !go) return;
    if (problem === 'no-item') total.textContent = '';
    else if (problem === 'at-cap') total.textContent = t('itemUi.market.orderAtCap');
    else if (problem === 'bad-price') total.textContent = t('itemUi.market.minPriceError');
    else {
      total.textContent = t(
        problem === 'cannot-afford'
          ? 'itemUi.market.orderCannotAfford'
          : 'itemUi.market.orderEscrowLine',
        { total: formatLocalizedMoney(orderStageTotal(stage)) },
      );
    }
    go.disabled = problem !== 'ok';
  }

  private promptPlace(): void {
    const stage = this.readStage();
    const item = stage.itemId ? orderableItemById(stage.itemId) : null;
    if (!item) return;
    const world = this.deps.world();
    const info = world.marketInfo;
    if (
      orderStageProblem(stage, world.copper, info?.myOrderCount ?? 0, info?.maxOrders ?? 0) !== 'ok'
    )
      return;
    const total = orderStageTotal(stage);
    this.deps.confirmDialog(
      t('itemUi.market.orderConfirmTitle'),
      t('itemUi.market.orderConfirmBody', {
        item: itemDisplayName(item),
        count: count0(stage.count),
        each: formatLocalizedMoney(stage.unitPrice),
        total: formatLocalizedMoney(total),
      }),
      t('itemUi.market.orderPlaceButton'),
      t('itemUi.market.buyConfirmCancel'),
      () => {
        world.marketOrderPlace(item.id, stage.count, stage.unitPrice);
        this.stagedItemId = null;
        this.syncCard();
        audio.coin();
      },
    );
  }

  private buildRow(row: MarketOrderRow): HTMLElement {
    const el = document.createElement('div');
    el.className = `mkt-row mkt-order-row ui-card${row.mine ? ' mine' : ''}`;
    el.setAttribute('role', 'listitem');
    const parts = wornItemCellParts(row.item, undefined);
    const name = parts.name;
    el.innerHTML =
      `<span class="mkt-ico ui-socket ui-socket--bag">${this.deps.itemIcon(row.item, parts.quality)}</span>` +
      `<span class="mkt-name"><span class="nm" style="color:${marketNameColor(parts.quality)}">${esc(name)}</span>` +
      `<span class="stack">${esc(t('itemUi.market.orderWanted', { count: count0(row.count) }))}</span>` +
      `<span class="seller">${esc(row.mine ? t('itemUi.market.orderMine') : t('itemUi.market.orderBy', { buyer: row.buyerName }))}</span></span>` +
      `<span class="mkt-price ui-money">${this.deps.moneyHtml(row.unitPrice)}<span class="mkt-each">${esc(t('itemUi.market.orderEach'))}</span></span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    if (row.mine) {
      btn.className = 'mkt-btn ui-btn cancel';
      btn.textContent = t('itemUi.market.orderWithdraw');
      btn.setAttribute('aria-label', t('itemUi.market.orderWithdrawAria', { item: name }));
      btn.addEventListener('click', () => {
        audio.click();
        this.deps.world().marketOrderCancel(row.id);
      });
    } else {
      btn.className = 'mkt-btn ui-btn ui-btn--gold';
      btn.textContent = t('itemUi.market.orderDeliver');
      btn.setAttribute(
        'aria-label',
        t('itemUi.market.orderDeliverAria', { item: name, buyer: row.buyerName }),
      );
      btn.disabled = row.deliverable < 1;
      if (btn.disabled) btn.title = t('itemUi.market.orderDeliverNone');
      btn.addEventListener('click', () => {
        audio.click();
        this.promptDeliver(row, name);
      });
    }
    el.appendChild(btn);
    this.deps.attachTooltip(el, () => this.deps.itemTooltip(row.item));
    return el;
  }

  private promptDeliver(row: MarketOrderRow, name: string): void {
    const info = this.deps.world().marketInfo;
    const units = row.deliverable;
    if (units < 1 || !info) return;
    const total = units * row.unitPrice;
    const proceeds = Math.max(0, Math.floor(total * (1 - info.cutPct / 100)));
    this.deps.confirmDialog(
      t('itemUi.market.orderDeliverConfirmTitle'),
      t('itemUi.market.orderDeliverConfirmBody', {
        item: name,
        count: count0(units),
        buyer: row.buyerName,
        total: formatLocalizedMoney(total),
        each: formatLocalizedMoney(row.unitPrice),
        proceeds: formatLocalizedMoney(proceeds),
      }),
      t('itemUi.market.orderDeliver'),
      t('itemUi.market.buyConfirmCancel'),
      () => {
        this.deps.world().marketOrderFill(row.id, units);
        audio.coin();
      },
    );
  }

  private buildUnlisted(items: ItemDef[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'mkt-unlisted';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', t('itemUi.market.unlistedTitle'));
    wrap.innerHTML =
      `<div class="mkt-unlisted-head">${esc(t('itemUi.market.unlistedTitle'))}</div>` +
      `<div class="mkt-note">${esc(t('itemUi.market.unlistedNote'))}</div>`;
    const strip = document.createElement('div');
    strip.className = 'mkt-unlisted-strip';
    if (items.length === 0) {
      strip.innerHTML = `<span class="mkt-unlisted-none">${esc(t('itemUi.market.unlistedNone'))}</span>`;
    }
    for (const item of items) {
      const parts = wornItemCellParts(item, undefined);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mkt-unlisted-chip ui-chip';
      chip.innerHTML = `${this.deps.itemIcon(item, parts.quality)}<span style="color:${marketNameColor(parts.quality)}">${esc(parts.name)}</span>`;
      chip.setAttribute('aria-label', t('itemUi.market.unlistedStageAria', { item: parts.name }));
      chip.addEventListener('click', () => {
        audio.click();
        this.stage(item.id);
        this.card?.scrollIntoView({ block: 'nearest' });
      });
      this.deps.attachTooltip(chip, () => this.deps.itemTooltip(item));
      strip.appendChild(chip);
    }
    wrap.appendChild(strip);
    return wrap;
  }
}
