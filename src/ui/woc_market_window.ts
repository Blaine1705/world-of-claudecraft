// The $WOC Exchange window (docs/prd/woc/marketplace.md): a COLD window on
// the leaderboard pattern (async data behind a renderSeq epoch, no driver of
// its own; Hud.update()'s slow band polls refreshIfChanged, which rebuilds
// only when the wocMarketViewSig digest moves, second-resolution countdowns
// included). The pure model lives in woc_market_view.ts; this painter owns
// every t() string, formatter, and the wall clock, and reaches the server
// only through the injected WocMarketHooks (main.ts wires the SDK + wallet
// signer; ui/ itself never imports net/ at runtime).
//
// Cold contracts held here: no forced-reflow layout read, no repeating
// driver. Rebuilds carry typed input across via form_draft.ts and focus via
// focus_restore.ts; the language fan-out calls relocalize(), which re-renders
// once and re-latches the signature.

import type {
  WocActivityView,
  WocEstimateView,
  WocListingView,
  WocMarketClient,
  WocMarketStatus,
  WocQuoteView,
  WocSaleView,
} from '../net/woc_market_sdk';
import { ITEMS } from '../sim/data';
import type { IWorld } from '../world_api';
import { userFacingApiError } from './api_error_i18n';
import { markDialogRoot } from './dialog_root';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import { captureFocusKey, restoreFirstEnabled } from './focus_restore';
import { captureFormDraft, restoreFormDraft } from './form_draft';
import type { TranslationKey } from './i18n';
import { formatDateTime, formatDuration, formatNumber, t } from './i18n';
import { iconDataUrl, QUALITY_COLOR } from './icons';
import { focusActiveTab, wireTabStrip } from './tab_strip_painter';
import { tabStripHtml, tabStripModel } from './tab_strip_view';
import {
  buildWocMarketView,
  type WocMarketTab,
  type WocMarketViewModel,
  wocMarketViewSig,
} from './woc_market_view';

/** Online-only glue main.ts wires (the ClaudiumHooks pattern): the typed SDK,
 *  the session identity, and the wallet signer. Absent hooks = the window is
 *  never openable (the platform gate). */
export interface WocMarketHooks {
  client: WocMarketClient;
  characterId(): number;
  walletLinked(): boolean;
  /** Sign and broadcast a service-built transaction; resolves the signature.
   *  Throws an Error whose message is already player-facing. */
  signTransaction(transactionBase64: string): Promise<string>;
}

export interface WocMarketWindowDeps {
  root(): HTMLElement;
  world(): IWorld;
  hooks(): WocMarketHooks | null;
  closeOthers(): void;
  hideTooltip(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
}

type PendingQuote =
  | { kind: 'bond'; bidId: number; usdCents: number; quote: WocQuoteView }
  | {
      kind: 'settlement';
      settlementId: number;
      itemId: string;
      usdCents: number;
      quote: WocQuoteView;
    };

const PAGE_SIZE = 25;

export class WocMarketWindow {
  private built = false;
  private opener: HTMLElement | null = null;
  private renderSeq = 0;
  private lastSig = '';

  private tab: WocMarketTab = 'browse';
  private status: WocMarketStatus | null = null;
  private statusFailed = false;
  private listings: WocListingView[] = [];
  private total = 0;
  private page = 0;
  private sort: 'ending' | 'newest' | 'price_asc' | 'price_desc' = 'ending';
  private browseLoading = false;
  private browseFailed = false;
  private selectedId: number | null = null;
  private detail: WocListingView | null = null;
  private estimate: WocEstimateView | null = null;
  private sales: WocSaleView[] | null = null;
  private activity: WocActivityView | null = null;
  private sellIndex: number | null = null;
  private pendingQuote: PendingQuote | null = null;
  private busy = false;
  private busyLabel: TranslationKey | null = null;
  private notice: { text: string; error: boolean } | null = null;

  constructor(private readonly deps: WocMarketWindowDeps) {}

  get isOpen(): boolean {
    return this.deps.root().style.display === 'flex';
  }

  open(): void {
    if (this.deps.hooks() === null) return;
    this.opener = this.deps.captureFocus();
    this.deps.closeOthers();
    this.deps.root().style.display = 'flex';
    void this.reload();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  close(): void {
    if (!this.isOpen) return;
    this.deps.root().style.display = 'none';
    this.deps.hideTooltip();
    this.deps.restoreFocus(this.opener);
    this.opener = null;
  }

  /** Full refetch (open, tab change, after a mutation). */
  private async reload(): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks) return;
    const seq = ++this.renderSeq;
    this.render();
    const status = await hooks.client.status();
    if (seq !== this.renderSeq) return;
    this.status = status;
    this.statusFailed = !status.ok;
    await Promise.all([this.loadBrowse(seq), this.loadActivity(seq)]);
    if (seq !== this.renderSeq) return;
    this.render();
  }

  private async loadBrowse(seq: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks) return;
    this.browseLoading = true;
    const out = await hooks.client.browse({
      page: this.page,
      quality: null,
      format: null,
      itemIds: null,
      sort: this.sort,
    });
    if (seq !== this.renderSeq) return;
    this.browseLoading = false;
    if (!out.ok) {
      this.browseFailed = true;
      return;
    }
    this.browseFailed = false;
    this.listings = out.listings;
    this.total = out.total;
  }

  private async loadActivity(seq: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks) return;
    const out = await hooks.client.me();
    if (seq !== this.renderSeq) return;
    if (out.ok) this.activity = out.activity;
  }

  private async selectListing(id: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks) return;
    this.selectedId = id;
    this.detail = null;
    this.estimate = null;
    this.sales = null;
    this.render();
    const seq = this.renderSeq;
    const detail = await hooks.client.detail(id);
    if (seq !== this.renderSeq) return;
    if (detail.ok) {
      this.detail = detail.listing;
      this.estimate = detail.estimate;
      const history = await hooks.client.history(detail.listing.itemId);
      if (seq !== this.renderSeq) return;
      this.sales = history.ok ? history.sales : [];
    }
    this.render();
  }

  // -------------------------------------------------------------------------
  // Poll + language fan-out
  // -------------------------------------------------------------------------

  /** Hud.update() slow-band entry: rebuild only when the data digest moves. */
  refreshIfChanged(): void {
    if (!this.isOpen) return;
    const sig = wocMarketViewSig(this.buildModel());
    if (sig === this.lastSig) return;
    this.render();
  }

  /** Language fan-out arm: self-gated, one rebuild, signature re-latched. */
  relocalize(): void {
    if (!this.isOpen) return;
    this.render();
  }

  // -------------------------------------------------------------------------
  // Model + render
  // -------------------------------------------------------------------------

  private buildModel(): WocMarketViewModel {
    return buildWocMarketView({
      capable: this.deps.hooks() !== null,
      status: this.status,
      statusFailed: this.statusFailed,
      walletLinked: this.deps.hooks()?.walletLinked() ?? false,
      tab: this.tab,
      nowMs: Date.now(),
      browse: {
        listings: this.listings,
        total: this.total,
        page: this.page,
        pageSize: PAGE_SIZE,
        loading: this.browseLoading,
        failed: this.browseFailed,
        selectedId: this.selectedId,
        detail: this.detail,
        estimate: this.estimate,
        sales: this.sales,
      },
      inventory: this.deps.world().inventory,
      activity: this.activity,
    });
  }

  render(): void {
    const root = this.deps.root();
    if (!this.built) {
      this.built = true;
      markDialogRoot(root, { labelledBy: 'woc-market-title' });
      root.addEventListener('click', (e) => this.onClick(e));
      root.addEventListener('change', (e) => this.onChange(e));
    }
    const model = this.buildModel();
    this.lastSig = wocMarketViewSig(model);
    const focusKey = captureFocusKey(root);
    const draft = captureFormDraft(root);
    root.innerHTML = this.html(model);
    this.wire(root, model);
    restoreFormDraft(root, draft);
    if (focusKey) {
      restoreFirstEnabled([root.querySelector<HTMLElement>(focusKey)]);
    }
  }

  private usd(cents: number): string {
    return formatNumber(cents / 100, { style: 'currency', currency: 'USD' });
  }

  private tokens(value: number): string {
    return formatNumber(value, { maximumFractionDigits: 2 });
  }

  private itemName(itemId: string): string {
    const def = ITEMS[itemId];
    return def ? itemDisplayName(def) : itemId;
  }

  private itemCellHtml(itemId: string, quality: string): string {
    const icon = iconDataUrl('item', itemId, 28);
    // Build-time color from the shared QUALITY_COLOR map (the vendor/bags
    // convention); the default token keeps unknown qualities theme-correct.
    const color = QUALITY_COLOR[quality] ?? 'var(--color-quality-default)';
    return (
      `<img class="wm-icon" src="${icon}" alt="" />` +
      `<span class="wm-name" style="color: ${color}">${esc(this.itemName(itemId))}</span>`
    );
  }

  private html(model: WocMarketViewModel): string {
    const header =
      `<div class="window-header">` +
      `<h2 id="woc-market-title">${esc(t('hudChrome.wocMarket.title'))}</h2>` +
      `<button type="button" class="window-close" data-action="close" aria-label="${esc(
        t('hudChrome.wocMarket.close'),
      )}">&times;</button></div>`;
    if (model.kind === 'unavailable') return header;
    if (model.kind === 'loading') {
      return `${header}<div class="wm-status">${esc(t('hudChrome.wocMarket.loading'))}</div>`;
    }
    if (model.kind === 'error') {
      return `${header}<div class="wm-status">${esc(t('hudChrome.wocMarket.loadFailed'))}</div>`;
    }
    if (model.kind === 'disabled') {
      return `${header}<div class="wm-status">${esc(t('hudChrome.wocMarket.disabledRealm'))}</div>`;
    }

    const strip = tabStripHtml(
      tabStripModel({
        ariaLabel: t('hudChrome.wocMarket.title'),
        panelId: 'woc-market-panel',
        stripClass: 'wm-tabs',
        tabClass: 'wm-tab',
        selectedClass: 'wm-tab-selected',
        selected: model.tab,
        tabs: [
          { id: 'browse', label: t('hudChrome.wocMarket.tabBrowse') },
          { id: 'sell', label: t('hudChrome.wocMarket.tabSell') },
          { id: 'activity', label: t('hudChrome.wocMarket.tabActivity') },
        ],
      }),
    );

    const banners =
      (model.paused
        ? `<div class="wm-banner wm-banner-paused">${esc(t('hudChrome.wocMarket.pausedBanner'))}</div>`
        : '') +
      (model.walletLinked
        ? ''
        : `<div class="wm-banner wm-banner-wallet">${esc(t('hudChrome.wocMarket.walletBanner'))}</div>`) +
      (model.tokensPerUsd !== null && model.priceAsOfMs !== null
        ? `<div class="wm-rate">${esc(
            t('hudChrome.wocMarket.rateNote', {
              tokens: this.tokens(model.tokensPerUsd),
              time: formatDateTime(model.priceAsOfMs, { timeStyle: 'short' }),
            }),
          )}</div>`
        : '');

    const notice = this.notice
      ? `<div class="wm-notice ${this.notice.error ? 'wm-notice-error' : ''}" role="status">${esc(this.notice.text)}</div>`
      : '';
    const busy = this.busy
      ? `<div class="wm-busy" role="status">${esc(t(this.busyLabel ?? 'hudChrome.wocMarket.confirming'))}</div>`
      : '';

    const body =
      this.pendingQuote !== null
        ? this.quoteHtml(model)
        : model.tab === 'browse'
          ? this.browseHtml(model)
          : model.tab === 'sell'
            ? this.sellHtml(model)
            : this.activityHtml(model);

    return `${header}${strip}${banners}${notice}${busy}<div id="woc-market-panel" class="wm-body window-fill" role="tabpanel">${body}</div>`;
  }

  private browseHtml(model: Extract<WocMarketViewModel, { kind: 'ready' }>): string {
    const b = model.browse;
    if (b.failed)
      return `<div class="wm-status">${esc(t('hudChrome.wocMarket.browseError'))}</div>`;
    if (b.rows.length === 0 && !b.loading) {
      return `<div class="wm-status">${esc(t('hudChrome.wocMarket.browseEmpty'))}</div>`;
    }
    const rows = b.rows
      .map((r) => {
        const badge =
          r.reserveBadge === null
            ? ''
            : `<span class="wm-reserve wm-reserve-${r.reserveBadge}">${esc(
                t(
                  r.reserveBadge === 'met'
                    ? 'hudChrome.wocMarket.reserveMet'
                    : 'hudChrome.wocMarket.reserveNotMet',
                ),
              )}</span>`;
        const mine = r.mine
          ? `<span class="wm-mine">${esc(t('hudChrome.wocMarket.yourListing'))}</span>`
          : '';
        const locked = r.buyNowLocked
          ? `<span class="wm-locked">${esc(t('hudChrome.wocMarket.buyNowLockedBadge'))}</span>`
          : '';
        return (
          `<tr class="wm-row ${r.selected ? 'wm-row-selected' : ''}" data-listing="${r.id}">` +
          `<td>${this.itemCellHtml(r.itemId, r.quality)}${mine}${locked}</td>` +
          `<td>${esc(r.sellerName)}</td>` +
          `<td>${r.currentCents === null ? esc(t('hudChrome.wocMarket.detailNoBids')) : esc(this.usd(r.currentCents))}${badge}</td>` +
          `<td>${r.buyNowCents === null ? '' : esc(this.usd(r.buyNowCents))}</td>` +
          `<td>${esc(formatDuration(Math.ceil(r.remainingMs / 1000)))}</td></tr>`
        );
      })
      .join('');
    const pager =
      `<div class="wm-pager">` +
      `<button type="button" data-action="page-prev" ${b.page <= 0 ? 'disabled' : ''} aria-label="${esc(t('hudChrome.wocMarket.pagePrev'))}">&#8249;</button>` +
      `<span>${esc(t('hudChrome.wocMarket.pageStatus', { current: formatNumber(b.page + 1), total: formatNumber(b.pageCount) }))}</span>` +
      `<button type="button" data-action="page-next" ${b.page + 1 >= b.pageCount ? 'disabled' : ''} aria-label="${esc(t('hudChrome.wocMarket.pageNext'))}">&#8250;</button>` +
      `<label class="wm-sort">${esc(t('hudChrome.wocMarket.sortLabel'))}` +
      `<select data-field="sort" data-focus-key="wm-sort">` +
      `<option value="ending" ${this.sort === 'ending' ? 'selected' : ''}>${esc(t('hudChrome.wocMarket.sortEnding'))}</option>` +
      `<option value="newest" ${this.sort === 'newest' ? 'selected' : ''}>${esc(t('hudChrome.wocMarket.sortNewest'))}</option>` +
      `<option value="price_asc" ${this.sort === 'price_asc' ? 'selected' : ''}>${esc(t('hudChrome.wocMarket.sortPriceAsc'))}</option>` +
      `<option value="price_desc" ${this.sort === 'price_desc' ? 'selected' : ''}>${esc(t('hudChrome.wocMarket.sortPriceDesc'))}</option>` +
      `</select></label></div>`;
    const table =
      `<table class="wm-table"><thead><tr>` +
      `<th>${esc(t('hudChrome.wocMarket.colItem'))}</th>` +
      `<th>${esc(t('hudChrome.wocMarket.colSeller'))}</th>` +
      `<th>${esc(t('hudChrome.wocMarket.colCurrentBid'))}</th>` +
      `<th>${esc(t('hudChrome.wocMarket.colBuyNow'))}</th>` +
      `<th>${esc(t('hudChrome.wocMarket.colTimeLeft'))}</th>` +
      `</tr></thead><tbody>${rows}</tbody></table>`;
    return `<div class="wm-browse">${pager}${table}${this.detailPaneHtml(model)}</div>`;
  }

  private detailPaneHtml(model: Extract<WocMarketViewModel, { kind: 'ready' }>): string {
    const d = model.browse.detail;
    if (!d) return '';
    const name = this.itemName(d.row.itemId);
    const endUtc = formatDateTime(d.row.endsAtMs, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    });
    const endLocal = formatDateTime(d.row.endsAtMs, { dateStyle: 'medium', timeStyle: 'short' });
    const estimate = d.estimateAmount
      ? `<p class="wm-estimate">${esc(
          t('hudChrome.wocMarket.estimateNote', { tokens: this.tokens(d.estimateAmount.tokens) }),
        )}</p>`
      : '';
    const sales =
      d.sales.length === 0
        ? `<p class="wm-sales-empty">${esc(t('hudChrome.wocMarket.detailNoSales'))}</p>`
        : `<ul class="wm-sales">${d.sales
            .map(
              (s) =>
                `<li>${esc(
                  t('hudChrome.wocMarket.detailSaleRow', {
                    usd: this.usd(s.priceCents),
                    seller: s.sellerName,
                    buyer: s.buyerName,
                  }),
                )}</li>`,
            )
            .join('')}</ul>`;
    const bidForm = this.bidFormHtml(model, d.row.id, name);
    const buyNow =
      d.row.buyNowCents !== null && !d.row.mine
        ? `<button type="button" class="wm-primary" data-action="buy-now" data-listing="${d.row.id}" ` +
          `${model.paused || !model.walletLinked || d.row.buyNowLocked ? 'disabled' : ''} ` +
          `aria-label="${esc(t('hudChrome.wocMarket.buyNowAria', { item: name, usd: this.usd(d.row.buyNowCents) }))}" data-focus-key="wm-buy-now">` +
          `${esc(t('hudChrome.wocMarket.buyNowButton', { usd: this.usd(d.row.buyNowCents) }))}</button>`
        : '';
    const cancel =
      d.row.mine && d.row.currentCents === null
        ? `<button type="button" data-action="cancel-listing" data-listing="${d.row.id}" ` +
          `aria-label="${esc(t('hudChrome.wocMarket.cancelAria', { item: name }))}" data-focus-key="wm-cancel">` +
          `${esc(t('hudChrome.wocMarket.cancelButton'))}</button>`
        : '';
    return (
      `<div class="wm-detail"><h3>${esc(t('hudChrome.wocMarket.detailTitle'))}</h3>` +
      `<div class="wm-detail-item">${this.itemCellHtml(d.row.itemId, d.row.quality)}</div>` +
      `<p>${esc(t('hudChrome.wocMarket.detailSeller', { name: d.row.sellerName }))}</p>` +
      `<p>${esc(t('hudChrome.wocMarket.detailEndsAt', { utc: endUtc, local: endLocal }))}</p>` +
      `<p>${
        d.row.currentCents === null
          ? esc(t('hudChrome.wocMarket.detailStartingBid', { usd: this.usd(d.row.startCents) }))
          : esc(t('hudChrome.wocMarket.detailCurrentBid', { usd: this.usd(d.row.currentCents) }))
      }</p>` +
      estimate +
      bidForm +
      buyNow +
      cancel +
      `<h4>${esc(t('hudChrome.wocMarket.detailSales'))}</h4>${sales}</div>`
    );
  }

  private bidFormHtml(
    model: Extract<WocMarketViewModel, { kind: 'ready' }>,
    listingId: number,
    itemName: string,
  ): string {
    const d = model.browse.detail;
    if (!d || d.row.mine || d.row.format === 'buy_now' || d.row.remainingMs <= 0) return '';
    const disabled = model.paused || !model.walletLinked || this.busy ? 'disabled' : '';
    const termsRow = model.activity?.termsAccepted
      ? ''
      : `<label class="wm-terms"><input type="checkbox" data-field="accept-terms" data-focus-key="wm-terms" /> ${esc(
          t('hudChrome.wocMarket.termsLabel'),
        )}</label>`;
    return (
      `<div class="wm-bid-form">` +
      `<p class="wm-min-next">${esc(t('hudChrome.wocMarket.detailMinNext', { usd: this.usd(d.row.minNextBidCents) }))}</p>` +
      `<label>${esc(t('hudChrome.wocMarket.bidLabel'))}` +
      `<input type="number" inputmode="decimal" min="0" step="0.25" data-field="bid-usd" data-focus-key="wm-bid-usd" placeholder="${esc(
        t('hudChrome.wocMarket.bidPlaceholder'),
      )}" /></label>` +
      `<label class="wm-totp">${esc(t('hudChrome.wocMarket.totpLabel'))}` +
      `<input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" data-field="totp" data-focus-key="wm-totp" placeholder="${esc(
        t('hudChrome.wocMarket.totpPlaceholder'),
      )}" /></label>` +
      `<p class="wm-note">${esc(t('hudChrome.wocMarket.totpNote', { usd: this.usd(model.totpThresholdCents) }))}</p>` +
      termsRow +
      `<p class="wm-note">${esc(t('hudChrome.wocMarket.variableTokenWarning'))}</p>` +
      `<p class="wm-note">${esc(
        t('hudChrome.wocMarket.settlementDeadlineNote', {
          duration: formatDuration(model.settlementWindowSeconds),
        }),
      )}</p>` +
      `<button type="button" class="wm-primary" data-action="place-bid" data-listing="${listingId}" ${disabled} ` +
      `aria-label="${esc(t('hudChrome.wocMarket.bidAria', { item: itemName }))}" data-focus-key="wm-bid-submit">` +
      `${esc(t('hudChrome.wocMarket.bidButton'))}</button></div>`
    );
  }

  private sellHtml(model: Extract<WocMarketViewModel, { kind: 'ready' }>): string {
    if (model.sell.rows.length === 0) {
      return `<div class="wm-status">${esc(t('hudChrome.wocMarket.sellEmpty'))}</div>`;
    }
    const rows = model.sell.rows
      .map(
        (r) =>
          `<button type="button" class="wm-sell-item ${this.sellIndex === r.index ? 'wm-sell-selected' : ''}" ` +
          `data-action="sell-select" data-index="${r.index}" ` +
          `aria-label="${esc(t('hudChrome.wocMarket.sellSelectAria', { item: this.itemName(r.itemId) }))}" ` +
          `data-focus-key="wm-sell-${r.index}">${this.itemCellHtml(r.itemId, r.quality)}</button>`,
      )
      .join('');
    const selected = model.sell.rows.find((r) => r.index === this.sellIndex) ?? null;
    const durations = model.durationsHours
      .map(
        (h, i) =>
          `<option value="${h}" ${i === 1 ? 'selected' : ''}>${esc(
            t('hudChrome.wocMarket.sellDurationHours', { hours: formatNumber(h) }),
          )}</option>`,
      )
      .join('');
    const form = selected
      ? `<div class="wm-sell-form">` +
        `<label>${esc(t('hudChrome.wocMarket.sellFormat'))}` +
        `<select data-field="sell-format" data-focus-key="wm-sell-format">` +
        `<option value="auction">${esc(t('hudChrome.wocMarket.sellFormatAuction'))}</option>` +
        `<option value="buy_now">${esc(t('hudChrome.wocMarket.sellFormatBuyNow'))}</option>` +
        `<option value="auction_buy_now">${esc(t('hudChrome.wocMarket.sellFormatAuctionBuyNow'))}</option>` +
        `</select></label>` +
        `<label>${esc(t('hudChrome.wocMarket.sellStart'))}<input type="number" inputmode="decimal" min="0" step="0.25" data-field="sell-start" data-focus-key="wm-sell-start" /></label>` +
        `<label>${esc(t('hudChrome.wocMarket.sellReserve'))}<input type="number" inputmode="decimal" min="0" step="0.25" data-field="sell-reserve" data-focus-key="wm-sell-reserve" /></label>` +
        `<p class="wm-note">${esc(t('hudChrome.wocMarket.sellReserveNote'))}</p>` +
        `<label>${esc(t('hudChrome.wocMarket.sellBuyNowPrice'))}<input type="number" inputmode="decimal" min="0" step="0.25" data-field="sell-buy-now" data-focus-key="wm-sell-buy-now" /></label>` +
        `<label>${esc(t('hudChrome.wocMarket.sellDuration'))}<select data-field="sell-duration" data-focus-key="wm-sell-duration">${durations}</select></label>` +
        `<label class="wm-offer-next"><input type="checkbox" data-field="sell-offer-next" data-focus-key="wm-sell-offer-next" /> ${esc(
          t('hudChrome.wocMarket.sellOfferNext'),
        )}</label>` +
        `<p class="wm-note">${esc(t('hudChrome.wocMarket.sellFeeNote'))}</p>` +
        `<button type="button" class="wm-primary" data-action="sell-submit" ${model.paused || !model.walletLinked || this.busy ? 'disabled' : ''} ` +
        `aria-label="${esc(t('hudChrome.wocMarket.sellSubmitAria', { item: this.itemName(selected.itemId) }))}" data-focus-key="wm-sell-submit">` +
        `${esc(t('hudChrome.wocMarket.sellSubmit'))}</button></div>`
      : '';
    return `<div class="wm-sell"><h3>${esc(t('hudChrome.wocMarket.sellTitle'))}</h3><div class="wm-sell-list">${rows}</div>${form}</div>`;
  }

  private activityHtml(model: Extract<WocMarketViewModel, { kind: 'ready' }>): string {
    const a = model.activity;
    if (!a || (a.listings.length === 0 && a.bids.length === 0 && a.settlements.length === 0)) {
      return `<div class="wm-status">${esc(t('hudChrome.wocMarket.activityEmpty'))}</div>`;
    }
    const listingStatus = (status: string, resolution: string | null): string => {
      if (status !== 'closed') {
        return t(
          status === 'settling' || status === 'ending'
            ? 'hudChrome.wocMarket.listingStatusSettling'
            : 'hudChrome.wocMarket.listingStatusActive',
        );
      }
      switch (resolution) {
        case 'sold':
          return t('hudChrome.wocMarket.listingStatusSold');
        case 'cancelled':
          return t('hudChrome.wocMarket.listingStatusCancelled');
        case 'suspended':
          return t('hudChrome.wocMarket.listingStatusSuspended');
        case 'no_bids':
        case 'reserve_not_met':
        case 'unsettled':
          return t('hudChrome.wocMarket.listingStatusUnsold');
        default:
          return t('hudChrome.wocMarket.listingStatusReturned');
      }
    };
    const bidStatusKey = (status: string): TranslationKey => {
      switch (status) {
        case 'pending_bond':
          return 'hudChrome.wocMarket.bidStatusPending';
        case 'active':
          return 'hudChrome.wocMarket.bidStatusActive';
        case 'outbid':
          return 'hudChrome.wocMarket.bidStatusOutbid';
        case 'won':
          return 'hudChrome.wocMarket.bidStatusWon';
        case 'defaulted':
          return 'hudChrome.wocMarket.bidStatusDefaulted';
        case 'cancelled':
          return 'hudChrome.wocMarket.bidStatusCancelled';
        default:
          return 'hudChrome.wocMarket.bidStatusLapsed';
      }
    };
    const settlementKey = (state: string): TranslationKey => {
      switch (state) {
        case 'confirming':
        case 'confirmed':
        case 'delivering':
          return 'hudChrome.wocMarket.settlementConfirming';
        case 'delivered':
          return 'hudChrome.wocMarket.settlementDelivered';
        case 'expired':
          return 'hudChrome.wocMarket.settlementExpired';
        case 'failed':
          return 'hudChrome.wocMarket.settlementFailed';
        default:
          return 'hudChrome.wocMarket.settlementOffered';
      }
    };
    const listings = a.listings
      .map(
        (l) =>
          `<li>${this.itemCellHtml(l.itemId, l.quality)} ` +
          `<span>${l.currentCents === null ? esc(this.usd(l.startCents)) : esc(this.usd(l.currentCents))}</span> ` +
          `<span>${esc(listingStatus(l.status, l.resolution))}</span></li>`,
      )
      .join('');
    const bids = a.bids
      .map((b) => {
        const payBond =
          b.status === 'pending_bond'
            ? ` <button type="button" data-action="pay-bond" data-bid="${b.id}" ${this.busy ? 'disabled' : ''} ` +
              `aria-label="${esc(t('hudChrome.wocMarket.bidBondPayAria', { id: formatNumber(b.listingId) }))}" data-focus-key="wm-bond-${b.id}">` +
              `${esc(t('hudChrome.wocMarket.bidBondPay'))}</button>`
            : '';
        return `<li><span>${esc(this.usd(b.amountCents))}</span> <span>${esc(t(bidStatusKey(b.status)))}</span>${payBond}</li>`;
      })
      .join('');
    const settlements = a.settlements
      .map((s) => {
        const pay =
          s.state === 'offered' || s.state === 'failed'
            ? ` <button type="button" class="wm-primary" data-action="pay-settlement" data-settlement="${s.id}" ${this.busy ? 'disabled' : ''} ` +
              `aria-label="${esc(t('hudChrome.wocMarket.activityPayNowAria', { id: formatNumber(s.id) }))}" data-focus-key="wm-settle-${s.id}">` +
              `${esc(t('hudChrome.wocMarket.activityPayNow'))}</button>`
            : '';
        const deadline =
          s.state === 'offered' || s.state === 'failed'
            ? ` <span>${esc(t('hudChrome.wocMarket.activityDeadline', { duration: formatDuration(Math.ceil(s.deadlineRemainingMs / 1000)) }))}</span>`
            : '';
        return `<li><span>${esc(this.usd(s.amountCents))}</span> <span>${esc(t(settlementKey(s.state)))}</span>${deadline}${pay}</li>`;
      })
      .join('');
    const strikes =
      a.strikes > 0
        ? `<p class="wm-strikes">${esc(t('hudChrome.wocMarket.activityStrikes', { count: formatNumber(a.strikes) }))}</p>` +
          (a.suspendedRemainingMs !== null
            ? `<p class="wm-strikes">${esc(t('hudChrome.wocMarket.activitySuspended', { duration: formatDuration(Math.ceil(a.suspendedRemainingMs / 1000)) }))}</p>`
            : '')
        : '';
    return (
      `<div class="wm-activity">` +
      `<h3>${esc(t('hudChrome.wocMarket.activityListings'))}</h3><ul>${listings}</ul>` +
      `<h3>${esc(t('hudChrome.wocMarket.activityBids'))}</h3><ul>${bids}</ul>` +
      `<h3>${esc(t('hudChrome.wocMarket.activitySettlements'))}</h3><ul>${settlements}</ul>` +
      strikes +
      `</div>`
    );
  }

  private quoteHtml(model: Extract<WocMarketViewModel, { kind: 'ready' }>): string {
    const pending = this.pendingQuote;
    if (!pending) return '';
    void model;
    const q = pending.quote;
    const remainingMs = q.expiresAtMs === null ? 0 : Math.max(0, q.expiresAtMs - Date.now());
    const expired = remainingMs <= 0;
    const title =
      pending.kind === 'bond'
        ? t('hudChrome.wocMarket.quoteBondFor', { usd: this.usd(pending.usdCents) })
        : t('hudChrome.wocMarket.quoteSettlementFor', {
            item: this.itemName(pending.itemId),
            usd: this.usd(pending.usdCents),
          });
    const legs =
      (q.amount
        ? `<p>${esc(t('hudChrome.wocMarket.quoteTotal', { tokens: this.tokens(q.amount.tokens) }))}</p>`
        : '') +
      (q.seller
        ? `<p>${esc(t('hudChrome.wocMarket.quoteSeller', { tokens: this.tokens(q.seller.tokens) }))}</p>`
        : '') +
      (q.burn
        ? `<p>${esc(t('hudChrome.wocMarket.quoteBurn', { tokens: this.tokens(q.burn.tokens) }))}</p>`
        : '') +
      (q.treasury
        ? `<p>${esc(t('hudChrome.wocMarket.quoteTreasury', { tokens: this.tokens(q.treasury.tokens) }))}</p>`
        : '');
    const countdown = expired
      ? `<p class="wm-quote-expired">${esc(t('hudChrome.wocMarket.quoteExpired'))}</p>`
      : `<p>${esc(t('hudChrome.wocMarket.quoteExpires', { duration: formatDuration(Math.ceil(remainingMs / 1000)) }))}</p>`;
    return (
      `<div class="wm-quote"><h3>${esc(t('hudChrome.wocMarket.quoteTitle'))}</h3>` +
      `<p>${esc(title)}</p>${legs}${countdown}` +
      `<p class="wm-note">${esc(t('hudChrome.wocMarket.variableTokenWarning'))}</p>` +
      `<div class="wm-quote-actions">` +
      `<button type="button" class="wm-primary" data-action="quote-sign" ${expired || this.busy ? 'disabled' : ''} data-focus-key="wm-quote-sign">${esc(
        t('hudChrome.wocMarket.quoteSign'),
      )}</button>` +
      `<button type="button" data-action="quote-refresh" ${this.busy ? 'disabled' : ''} data-focus-key="wm-quote-refresh">${esc(
        t('hudChrome.wocMarket.quoteRefresh'),
      )}</button>` +
      `<button type="button" data-action="quote-cancel" ${this.busy ? 'disabled' : ''} data-focus-key="wm-quote-cancel">${esc(
        t('hudChrome.wocMarket.quoteCancel'),
      )}</button></div></div>`
    );
  }

  // -------------------------------------------------------------------------
  // Wiring + actions
  // -------------------------------------------------------------------------

  private wire(root: HTMLElement, model: WocMarketViewModel): void {
    if (model.kind !== 'ready') return;
    wireTabStrip(root, 'wm-tab', (id, focusFollow) => {
      if (id === 'browse' || id === 'sell' || id === 'activity') {
        this.tab = id;
        this.notice = null;
        this.render();
        if (focusFollow) focusActiveTab(root, 'wm-tab', 'wm-tab-selected');
      }
    });
  }

  private field<T extends HTMLElement>(selector: string): T | null {
    return this.deps.root().querySelector<T>(selector);
  }

  private numberFieldCents(selector: string): number | null {
    const el = this.field<HTMLInputElement>(selector);
    if (!el || el.value.trim() === '') return null;
    const dollars = Number(el.value);
    if (!Number.isFinite(dollars) || dollars <= 0) return null;
    return Math.round(dollars * 100);
  }

  private onChange(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const field = target.getAttribute('data-field');
    if (field === 'sort') {
      const value = (target as HTMLSelectElement).value;
      if (
        value === 'ending' ||
        value === 'newest' ||
        value === 'price_asc' ||
        value === 'price_desc'
      ) {
        this.sort = value;
        this.page = 0;
        void this.reloadBrowseOnly();
      }
    }
  }

  private async reloadBrowseOnly(): Promise<void> {
    const seq = ++this.renderSeq;
    await this.loadBrowse(seq);
    if (seq !== this.renderSeq) return;
    this.render();
  }

  private onClick(e: Event): void {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action], .wm-row');
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action === 'close') {
      this.close();
      return;
    }
    if (!action && target.classList.contains('wm-row')) {
      const id = Number(target.getAttribute('data-listing'));
      if (Number.isFinite(id)) void this.selectListing(id);
      return;
    }
    if (this.busy) return;
    switch (action) {
      case 'page-prev':
        this.page = Math.max(0, this.page - 1);
        void this.reloadBrowseOnly();
        break;
      case 'page-next':
        this.page += 1;
        void this.reloadBrowseOnly();
        break;
      case 'sell-select':
        this.sellIndex = Number(target.getAttribute('data-index'));
        this.render();
        break;
      case 'place-bid':
        void this.placeBid(Number(target.getAttribute('data-listing')));
        break;
      case 'buy-now':
        void this.buyNow(Number(target.getAttribute('data-listing')));
        break;
      case 'cancel-listing':
        void this.cancelListing(Number(target.getAttribute('data-listing')));
        break;
      case 'sell-submit':
        void this.submitListing();
        break;
      case 'pay-bond':
        void this.payBond(Number(target.getAttribute('data-bid')));
        break;
      case 'pay-settlement':
        void this.paySettlement(Number(target.getAttribute('data-settlement')));
        break;
      case 'quote-sign':
        void this.signPendingQuote();
        break;
      case 'quote-refresh':
        void this.refreshPendingQuote();
        break;
      case 'quote-cancel':
        this.pendingQuote = null;
        this.render();
        break;
      default:
        break;
    }
  }

  private ok(key: TranslationKey): void {
    this.notice = { text: t(key), error: false };
  }

  private fail(code: string): void {
    this.notice = { text: userFacingApiError({ code }), error: true };
  }

  private async withBusy(label: TranslationKey, run: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.busyLabel = label;
    this.render();
    try {
      await run();
    } finally {
      this.busy = false;
      this.busyLabel = null;
      this.render();
    }
  }

  private acceptTermsChecked(): boolean {
    return this.field<HTMLInputElement>('[data-field="accept-terms"]')?.checked === true;
  }

  private totpValue(): string | null {
    const value = this.field<HTMLInputElement>('[data-field="totp"]')?.value.trim() ?? '';
    return value === '' ? null : value;
  }

  private async placeBid(listingId: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks || !Number.isFinite(listingId)) return;
    const amountCents = this.numberFieldCents('[data-field="bid-usd"]');
    if (amountCents === null) {
      this.fail('woc_market.invalid_input');
      this.render();
      return;
    }
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.placeBid({
        listingId,
        characterId: hooks.characterId(),
        amountCents,
        totpCode: this.totpValue(),
        acceptTerms: this.acceptTermsChecked(),
      });
      if (!out.ok) {
        this.fail(out.code);
        return;
      }
      this.notice = null;
      this.pendingQuote = {
        kind: 'bond',
        bidId: out.bid.id,
        usdCents: out.bid.bondCents,
        quote: out.bond,
      };
    });
  }

  private async buyNow(listingId: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks || !Number.isFinite(listingId)) return;
    const itemId = this.detail?.itemId ?? '';
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.buyNow({
        listingId,
        characterId: hooks.characterId(),
        totpCode: this.totpValue(),
        acceptTerms: this.acceptTermsChecked(),
      });
      if (!out.ok) {
        this.fail(out.code);
        return;
      }
      this.notice = null;
      this.pendingQuote = {
        kind: 'settlement',
        settlementId: out.settlement.id,
        itemId,
        usdCents: out.settlement.amountCents,
        quote: out.quote,
      };
    });
  }

  private async cancelListing(listingId: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks || !Number.isFinite(listingId)) return;
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.cancelListing(listingId);
      if (!out.ok) {
        this.fail(out.code);
        return;
      }
      this.ok('hudChrome.wocMarket.listingCancelled');
      this.selectedId = null;
      this.detail = null;
      await this.reload();
    });
  }

  private async submitListing(): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks || this.sellIndex === null) return;
    const inventory = this.deps.world().inventory;
    const slot = inventory[this.sellIndex];
    if (!slot) {
      this.fail('woc_market.stale_item');
      this.render();
      return;
    }
    const format = this.field<HTMLSelectElement>('[data-field="sell-format"]')?.value ?? 'auction';
    const startCents = this.numberFieldCents('[data-field="sell-start"]');
    const reserveCents = this.numberFieldCents('[data-field="sell-reserve"]');
    const buyNowCents = this.numberFieldCents('[data-field="sell-buy-now"]');
    const durationHours = Number(
      this.field<HTMLSelectElement>('[data-field="sell-duration"]')?.value ?? '',
    );
    const offerNext =
      this.field<HTMLInputElement>('[data-field="sell-offer-next"]')?.checked === true;
    if (startCents === null || !Number.isFinite(durationHours)) {
      this.fail('woc_market.invalid_params');
      this.render();
      return;
    }
    if (format !== 'auction' && format !== 'buy_now' && format !== 'auction_buy_now') return;
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.createListing({
        characterId: hooks.characterId(),
        itemIndex: this.sellIndex ?? 0,
        itemId: slot.itemId,
        expectInstance: slot.instance ?? null,
        format,
        startCents,
        reserveCents: format === 'buy_now' ? null : reserveCents,
        buyNowCents: format === 'auction' ? null : buyNowCents,
        durationHours,
        offerNext,
      });
      if (!out.ok) {
        this.fail(out.code);
        return;
      }
      this.ok('hudChrome.wocMarket.listingCreated');
      this.sellIndex = null;
      await this.reload();
    });
  }

  private async payBond(bidId: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks || !Number.isFinite(bidId)) return;
    const bid = this.activity?.bids.find((b) => b.id === bidId) ?? null;
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.bondQuote(bidId);
      if (!out.ok) {
        this.fail(out.code);
        return;
      }
      this.pendingQuote = { kind: 'bond', bidId, usdCents: bid?.bondCents ?? 0, quote: out.bond };
    });
  }

  private async paySettlement(settlementId: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks || !Number.isFinite(settlementId)) return;
    const settlement = this.activity?.settlements.find((s) => s.id === settlementId) ?? null;
    const listing = this.activity?.listings.find((l) => l.id === settlement?.listingId) ?? null;
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.settlementQuote(settlementId);
      if (!out.ok) {
        this.fail(out.code);
        return;
      }
      this.pendingQuote = {
        kind: 'settlement',
        settlementId,
        itemId: listing?.itemId ?? '',
        usdCents: settlement?.amountCents ?? 0,
        quote: out.quote,
      };
    });
  }

  private async refreshPendingQuote(): Promise<void> {
    const hooks = this.deps.hooks();
    const pending = this.pendingQuote;
    if (!hooks || !pending) return;
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      if (pending.kind === 'bond') {
        const out = await hooks.client.bondQuote(pending.bidId);
        if (out.ok) this.pendingQuote = { ...pending, quote: out.bond };
        else this.fail(out.code);
      } else {
        const out = await hooks.client.settlementQuote(pending.settlementId);
        if (out.ok) this.pendingQuote = { ...pending, quote: out.quote };
        else this.fail(out.code);
      }
    });
  }

  private async signPendingQuote(): Promise<void> {
    const hooks = this.deps.hooks();
    const pending = this.pendingQuote;
    if (!hooks || !pending || pending.quote.transactionBase64 === null) return;
    await this.withBusy('hudChrome.wocMarket.signing', async () => {
      let signature: string;
      try {
        signature = await hooks.signTransaction(pending.quote.transactionBase64 ?? '');
      } catch (err) {
        this.notice = {
          text:
            err instanceof Error && err.message ? err.message : t('hudChrome.wocMarket.loadFailed'),
          error: true,
        };
        return;
      }
      this.busyLabel = 'hudChrome.wocMarket.confirming';
      this.render();
      if (pending.kind === 'bond') {
        const out = await hooks.client.confirmBond(pending.bidId, signature);
        if (!out.ok) {
          this.fail(out.code);
          return;
        }
        this.ok(
          out.standing
            ? 'hudChrome.wocMarket.bidPlacedStanding'
            : 'hudChrome.wocMarket.bidPlacedOutbid',
        );
      } else {
        const out = await hooks.client.confirmSettlement(pending.settlementId, signature);
        if (!out.ok) {
          this.fail(out.code);
          return;
        }
        this.ok('hudChrome.wocMarket.purchaseComplete');
      }
      this.pendingQuote = null;
      await this.reload();
    });
  }
}
