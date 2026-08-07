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
import type { ItemDef, ItemInstancePayload } from '../sim/types';
import type { IWorld } from '../world_api';
import { userFacingApiError } from './api_error_i18n';
import { markDialogRoot } from './dialog_root';
import { dropdownKeyNav } from './dropdown_nav';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import { captureFocusKey, restoreFirstEnabled } from './focus_restore';
import { captureFormDraft, restoreFormDraft } from './form_draft';
import type { TranslationKey } from './i18n';
import { formatDateTime, formatDuration, formatNumber, t, tPlural } from './i18n';
import { iconDataUrl, QUALITY_COLOR } from './icons';
import { focusActiveTab, wireTabStrip } from './tab_strip_painter';
import { tabStripHtml, tabStripModel } from './tab_strip_view';
import { svgIcon } from './ui_icons';
import { verifiedWocBalance } from './wallet_balance';
import { overWalletBalance } from './woc_affordable_core';
import {
  buildWocMarketView,
  type WocMarketTab,
  type WocMarketViewModel,
  type WocSellRowModel,
  wocMarketViewSig,
} from './woc_market_view';

/** Online-only glue main.ts wires (the ClaudiumHooks pattern): the typed SDK,
 *  the session identity, and the wallet signer. Absent hooks = the window is
 *  never openable (the platform gate). */
export interface WocMarketHooks {
  client: WocMarketClient;
  characterId(): number;
  walletLinked(): boolean;
  /** Sign and broadcast a service-built transaction through the reviewed
   *  wallet bridge (the src/net/wallet.ts signAndSendTransactionBase64
   *  vocabulary; the payload is always a server-authorized quote, never
   *  client-assembled). Resolves the signature; throws an Error whose
   *  message is already player-facing. */
  signAndSendTransactionBase64(transactionBase64: string): Promise<string>;
}

export interface WocMarketWindowDeps {
  root(): HTMLElement;
  world(): IWorld;
  hooks(): WocMarketHooks | null;
  closeOthers(): void;
  hideTooltip(): void;
  /** The shared hover/focus tooltip binder (Hud.attachTooltip). It owns the
   *  positioning and the only forced-reflow reads involved, which is what keeps
   *  this cold window's no-layout-read contract intact. */
  attachTooltip(element: HTMLElement, html: () => string): void;
  /** The SAME item tooltip the character window shows (Hud.itemTooltip with
   *  compare on), so a listing reads identically to worn gear: stats, the
   *  instance badges, the enchant, and the compare-to-equipped deltas. */
  itemTooltip(item: ItemDef, instance?: ItemInstancePayload): string;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
}

/**
 * The scroll containers a rebuild replaces, each with the state key that decides
 * whether a saved position still refers to the same content.
 *
 * This is the scroll pair the perf gate's cold allowance table documents as the
 * shape repeated across these windows (bags, bank, deeds and the rest): read the
 * position before the rebuild, write it back after, so the list does not jump
 * under the player. It is load-bearing here rather than cosmetic, because the
 * slow-band poll rebuilds on every countdown bucket change, which is once a
 * minute at rest and once a SECOND inside the anti-snipe window: without it the
 * browse list yanked itself back to the top while the player was reading it.
 *
 * Keyed, so a genuine change of view still starts at the top. The body resets
 * when the tab changes; the detail pane also resets when a different listing is
 * selected, since its old offset means nothing in another listing's content.
 */
const SCROLL_KEEPERS: ReadonlyArray<readonly [keyof WocMarketScrollKeys, string]> = [
  ['body', '.wm-body'],
  ['detail', '.wm-detail'],
];

interface WocMarketScrollKeys {
  body: string;
  detail: string;
}

/** The sell picker's listbox id. One definition: the markup builds the option ids
 *  from it and paintSellActive points aria-activedescendant at them, so two
 *  literals would let the two drift apart silently. */
const SELL_LISTBOX_ID = 'wm-sell-listbox';

// usdCents is NULLABLE on purpose: it is only a display label sourced from the
// cached activity row, and a missing row must render no amount rather than a
// fabricated $0.00 next to a real charge. The quote's token legs are the
// authoritative figures either way.
type PendingQuote =
  | { kind: 'bond'; bidId: number; usdCents: number | null; quote: WocQuoteView }
  | {
      kind: 'settlement';
      settlementId: number;
      itemId: string;
      usdCents: number | null;
      quote: WocQuoteView;
    };

const PAGE_SIZE = 25;

export class WocMarketWindow {
  private built = false;
  private opener: HTMLElement | null = null;
  private renderSeq = 0;
  private lastSig = '';
  /** The model the live DOM was built from, so a keyboard index always resolves
   *  against the rows on screen rather than a freshly rebuilt list. */
  private lastModel: WocMarketViewModel | null = null;

  private tab: WocMarketTab = 'browse';
  private status: WocMarketStatus | null = null;
  private statusFailed = false;
  private listings: WocListingView[] = [];
  private hasMore = false;
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
  // Non-text form state lives HERE, not in the rebuilt DOM: form_draft.ts
  // deliberately carries only text inputs, so a poll rebuild (which fires at
  // least once a minute while any tab is open) would silently reset a select or
  // checkbox and submit would then read the reset value. On a money surface
  // that means listing with the wrong format, duration, or terms flag.
  private sellFormat: 'auction' | 'buy_now' = 'auction';
  /** Sell-tab combobox: the typed query, whether the listbox is open, and the
   *  active (highlighted) option. All painter state, not DOM state: the window
   *  rebuilds from state on the slow poll band, so anything held only in the DOM
   *  would collapse the listbox mid-interaction. form_draft carries the input's
   *  value AND its caret across that rebuild, so typing survives it. */
  private sellSearch = '';
  private sellOpen = false;
  private sellActive = -1;
  /** True for the duration of render(). Any focus movement inside that window is
   *  the rebuild tearing down its own nodes, never the user leaving the control. */
  private rendering = false;
  /** What the scroll positions carried across the last rebuild referred to, so a
   *  restore is skipped once it would point into different content. See
   *  SCROLL_KEEPERS and scrollKeys(). */
  private renderedScrollKey: WocMarketScrollKeys = { body: '', detail: '' };
  private sellDurationHours: number | null = null;
  private sellOfferNext = false;
  private acceptTerms = false;
  private pendingQuote: PendingQuote | null = null;
  /** The bid preview's timer-free coalescing (see onBidPriceInput): the price
   *  still awaiting an estimate, and whether one is already out. */
  private bidEstimateWanted: number | null = null;
  private bidEstimateInFlight = false;
  /** The server-quoted tokens for the price currently typed, or null when there
   *  is no figure to show. Rendered, never written into the DOM directly. */
  private bidEquivalentTokens: number | null = null;
  /** The server-quoted tokens for THIS listing's buy-now price. Its own quote
   *  because the detail's estimate covers the current bid, not the buy-now. */
  private buyNowTokens: number | null = null;

  /** The VERIFIED wallet's balance: the account-linked wallet is the one that
   *  will actually pay, so a merely-connected figure would gate the wrong one. */
  private walletTokens(): number | null {
    return verifiedWocBalance();
  }
  private busy = false;
  private busyLabel: TranslationKey | null = null;
  private notice: { text: string; error: boolean } | null = null;
  // Item hover targets for the CURRENT DOM, rebuilt with it. An instance payload
  // is an object and cannot ride in a data attribute, so the markup carries a
  // stable key and this maps it back to the row it came from. Cleared at the top
  // of every html() pass so a key can never resolve against a destroyed row.
  private tooltipTargets = new Map<string, { itemId: string; instance?: ItemInstancePayload }>();

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
    this.hasMore = out.hasMore;
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
    // A different listing means a different bid: carrying the previous one's
    // token figure across would put a stale rate under an empty price field.
    this.bidEquivalentTokens = null;
    this.bidEstimateWanted = null;
    this.buyNowTokens = null;
    this.render();
    const seq = this.renderSeq;
    const detail = await hooks.client.detail(id);
    if (seq !== this.renderSeq) return;
    if (detail.ok) {
      this.detail = detail.listing;
      this.estimate = detail.estimate;
      // The detail's own estimate prices the CURRENT BID, so buy-now needs its
      // own quote before it can be checked against a balance.
      const buyNowCents = detail.listing.buyNowCents;
      if (buyNowCents !== null && buyNowCents > 0) {
        const quoted = await hooks.client.estimate(buyNowCents);
        if (seq !== this.renderSeq) return;
        this.buyNowTokens = quoted?.amount?.tokens ?? null;
      }
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
    // Never rebuild under an open picker. The rebuild would destroy the option
    // the pointer is resting on, and a removed node fires no mouseleave, so the
    // stats card would vanish and not come back until the pointer moved again.
    // Nothing behind the picker is time-critical, and lastSig is deliberately
    // left unmoved, so the very next poll after it closes picks the change up.
    // Scoped to the tab the picker lives on as well as the flag: the flag is
    // cleared by a focusout that a stray path could skip, and an unscoped skip
    // would then freeze the browse countdowns for the rest of the session, which
    // is a worse failure than the flicker it prevents.
    if (this.tab === 'sell' && this.sellOpen) return;
    const sig = `${wocMarketViewSig(this.buildModel())}|${this.quoteCountdownSig()}`;
    if (sig === this.lastSig) return;
    this.render();
  }

  /**
   * The pending quote's own repaint key.
   *
   * The quote panel is WINDOW state, so it never reaches the pure model and the
   * model's digest cannot move for it. Without this the "expires in" countdown
   * rendered once and then sat there, frozen, while the quote it described ran
   * out underneath the player.
   *
   * Second resolution, matching every other countdown in that digest: the
   * display has no finer grain, so a finer key would rebuild the window many
   * times per second for a string that did not change.
   */
  private quoteCountdownSig(): string {
    const expiresAtMs = this.pendingQuote?.quote.expiresAtMs;
    if (expiresAtMs === undefined || expiresAtMs === null) return '';
    return String(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
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
        hasMore: this.hasMore,
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
      root.addEventListener('input', (e) => this.onInput(e));
      // mousedown, NOT click: the options are non-focusable divs, so a click would
      // blur the input first and focusout would close the listbox out from under
      // the selection. preventDefault keeps focus where it is.
      root.addEventListener('mousedown', (e) => this.onComboMouseDown(e as MouseEvent));
      root.addEventListener('mousemove', (e) => this.onComboMouseMove(e as MouseEvent));
      root.addEventListener('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
      // focusin/focusout, NOT focus/blur: only the former pair bubbles, and this
      // is one delegated listener over a subtree the rebuild replaces wholesale.
      // Opening on focus is the default the picker wants (see onFocusIn); closing
      // on focusout keeps the listbox from outliving the control, guarded on
      // relatedTarget so moving focus WITHIN the combobox does not close it.
      root.addEventListener('focusin', (e) => this.onFocusIn(e as FocusEvent));
      root.addEventListener('focusout', (e) => this.onFocusOut(e as FocusEvent));
    }
    const model = this.buildModel();
    this.lastModel = model;
    // The SAME composite refreshIfChanged compares. Latching only the model half
    // would leave the two permanently unequal, so every poll would rebuild the
    // window: the caret, the hover card and the scroll position with it.
    this.lastSig = `${wocMarketViewSig(model)}|${this.quoteCountdownSig()}`;
    this.rendering = true;
    try {
      this.renderInner(root, model);
    } finally {
      this.rendering = false;
    }
  }

  /** The body of render(), split out so the `rendering` flag can wrap all of it
   *  including the focus restore, which is itself a focus movement. */
  private renderInner(root: HTMLElement, model: WocMarketViewModel): void {
    const focusKey = captureFocusKey(root);
    const draft = captureFormDraft(root);
    // Read every scroll position BEFORE the markup that owns it is thrown away,
    // and only for the containers whose content this rebuild still describes.
    const keys = this.scrollKeys(model);
    const keptScroll: [string, number][] = [];
    for (const [name, selector] of SCROLL_KEEPERS) {
      if (keys[name] !== this.renderedScrollKey[name]) continue;
      const top = root.querySelector<HTMLElement>(selector)?.scrollTop ?? 0;
      if (top > 0) keptScroll.push([selector, top]);
    }
    this.renderedScrollKey = keys;
    // The shared tooltip box is anchored to an element this rebuild is about to
    // destroy. Without this it would hang there pointing at nothing, because a
    // removed node fires no mouseleave.
    this.deps.hideTooltip();
    root.innerHTML = this.html(model);
    this.wire(root, model);
    this.attachItemTooltips(root);
    // After wire(), so the write lands on the container the fresh markup built.
    for (const [selector, top] of keptScroll) {
      const el = root.querySelector<HTMLElement>(selector);
      if (el) el.scrollTop = top;
    }
    restoreFormDraft(root, draft);
    if (focusKey) {
      // captureFocusKey returns the ATTRIBUTE VALUE, so it must be wrapped in
      // the attribute selector; passing it raw made this a type selector that
      // matched nothing and silently dropped focus across every rebuild.
      restoreFirstEnabled([
        root.querySelector<HTMLElement>(`[data-focus-key="${focusKey.replace(/["\\]/g, '\\$&')}"]`),
      ]);
    }
  }

  private usd(cents: number): string {
    return formatNumber(cents / 100, { style: 'currency', currency: 'USD' });
  }

  /** Multi-unit countdown (days/hours/minutes/seconds through the Intl unit
   *  formatter): auction and settlement windows span days, and a raw
   *  formatDuration would render them as tens of thousands of seconds. */
  private countdown(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    if (s >= 172_800) {
      return formatNumber(Math.floor(s / 86_400), {
        style: 'unit',
        unit: 'day',
        unitDisplay: 'long',
      });
    }
    if (s >= 3_600) {
      return formatNumber(Math.floor(s / 3_600), {
        style: 'unit',
        unit: 'hour',
        unitDisplay: 'long',
      });
    }
    if (s >= 60) {
      return formatNumber(Math.floor(s / 60), {
        style: 'unit',
        unit: 'minute',
        unitDisplay: 'long',
      });
    }
    return formatDuration(s);
  }

  private tokens(value: number): string {
    return formatNumber(value, { maximumFractionDigits: 2 });
  }

  private itemName(itemId: string): string {
    const def = ITEMS[itemId];
    return def ? itemDisplayName(def) : itemId;
  }

  /**
   * One item cell: icon plus quality-coloured name, hoverable for the full stat
   * tooltip.
   *
   * `key` must be unique within a render and stable across renders (the tab plus
   * the row's own id), so the hover target survives a poll rebuild. The tag goes
   * on BOTH the icon and the name rather than on a new wrapper element, because a
   * wrapper would become the single flex child of .wm-row-open and collapse the
   * icon/name layout.
   */
  private itemCellHtml(
    itemId: string,
    quality: string,
    key: string,
    instance?: ItemInstancePayload,
  ): string {
    const icon = iconDataUrl('item', itemId, 28);
    // Build-time color from the shared QUALITY_COLOR map (the vendor/bags
    // convention); the default token keeps unknown qualities theme-correct.
    const color = QUALITY_COLOR[quality] ?? 'var(--color-quality-default)';
    this.tooltipTargets.set(key, { itemId, instance });
    const tag = ` data-tt-key="${esc(key)}"`;
    return (
      `<img class="wm-icon"${tag} src="${icon}" alt="" />` +
      `<span class="wm-name"${tag} style="color: ${color}">${esc(this.itemName(itemId))}</span>`
    );
  }

  /**
   * Bind the shared item tooltip to every tagged cell in the freshly built DOM.
   *
   * Runs after each rebuild because the elements are new every time; the previous
   * listeners died with the nodes they were attached to.
   */
  private attachItemTooltips(root: HTMLElement): void {
    for (const el of root.querySelectorAll<HTMLElement>('[data-tt-key]')) {
      const target = this.tooltipTargets.get(el.dataset.ttKey ?? '');
      if (!target) continue;
      const def = ITEMS[target.itemId];
      // An id this client has no def for (a server ahead of this build) simply
      // gets no tooltip rather than an empty box.
      if (!def) continue;
      this.deps.attachTooltip(el, () => this.deps.itemTooltip(def, target.instance));
    }
  }

  private html(model: WocMarketViewModel): string {
    // Same lifetime as the DOM it describes (see the field's comment).
    this.tooltipTargets.clear();
    // The shared window-chrome family (.panel-title + .x-btn + the close glyph,
    // the social/bank/report markup), not a bespoke header: the invented
    // .window-header / .window-close classes matched no rule in any sheet, so
    // the title and close button rendered as raw browser chrome.
    const header =
      `<div class="panel-title">` +
      `<span id="woc-market-title">${esc(t('hudChrome.wocMarket.title'))}</span>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(
        t('hudChrome.wocMarket.close'),
      )}" title="${esc(t('hudChrome.wocMarket.close'))}">${svgIcon('close')}</button></div>`;
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
          `<tr class="wm-row ${r.selected ? 'wm-row-selected' : ''}" data-listing="${r.id}" ` +
          `role="row" aria-selected="${r.selected ? 'true' : 'false'}">` +
          // The row is the only route to the detail pane, the bid form and
          // buy-now, so its activator is a real button: keyboard and screen
          // readers reach the purchase flow, not just the mouse.
          `<td><button type="button" class="wm-row-open" data-listing="${r.id}" ` +
          `data-focus-key="wm-row-${r.id}" aria-label="${esc(t('hudChrome.wocMarket.bidAria', { item: this.itemName(r.itemId) }))}">` +
          `${this.itemCellHtml(r.itemId, r.quality, `browse:${r.id}`, r.instance)}</button>${mine}${locked}</td>` +
          `<td>${esc(r.sellerName)}</td>` +
          `<td>${r.currentCents === null ? esc(t('hudChrome.wocMarket.detailNoBids')) : esc(this.usd(r.currentCents))}${badge}</td>` +
          `<td>${r.buyNowCents === null ? '' : esc(this.usd(r.buyNowCents))}</td>` +
          `<td>${esc(this.countdown(r.remainingMs / 1000))}</td></tr>`
        );
      })
      .join('');
    const pager =
      `<div class="wm-pager">` +
      `<button type="button" data-action="page-prev" ${b.page <= 0 ? 'disabled' : ''} aria-label="${esc(t('hudChrome.wocMarket.pagePrev'))}">&#8249;</button>` +
      `<span>${esc(t('hudChrome.wocMarket.pageNumber', { current: formatNumber(b.page + 1) }))}</span>` +
      `<button type="button" data-action="page-next" ${b.hasMore ? '' : 'disabled'} aria-label="${esc(t('hudChrome.wocMarket.pageNext'))}">&#8250;</button>` +
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
    // EXACT here, unlike the bid: buy-now carries no bond, so the server compares
    // this same price and nothing else.
    const overBuyNow = overWalletBalance(this.buyNowTokens, this.walletTokens());
    const buyNow =
      d.row.buyNowCents !== null && !d.row.mine
        ? `<button type="button" class="wm-primary" data-action="buy-now" data-listing="${d.row.id}" ` +
          `${model.paused || !model.walletLinked || d.row.buyNowLocked || overBuyNow ? 'disabled' : ''} ` +
          `aria-label="${esc(t('hudChrome.wocMarket.buyNowAria', { item: name, usd: this.usd(d.row.buyNowCents) }))}" data-focus-key="wm-buy-now">` +
          `${esc(t('hudChrome.wocMarket.buyNowButton', { usd: this.usd(d.row.buyNowCents) }))}</button>` +
          (overBuyNow
            ? `<p class="wm-over-balance">${esc(
                t('hudChrome.trade.woc.hintInsufficientBalance'),
              )}</p>`
            : '')
        : '';
    const cancel =
      d.row.mine && d.row.currentCents === null
        ? `<button type="button" data-action="cancel-listing" data-listing="${d.row.id}" ` +
          `aria-label="${esc(t('hudChrome.wocMarket.cancelAria', { item: name }))}" data-focus-key="wm-cancel">` +
          `${esc(t('hudChrome.wocMarket.cancelButton'))}</button>`
        : '';
    // A fixed-price listing has no bid form, so nothing else would carry the two
    // fields buyNow's own server-side guards demand. Rendered only when the bid
    // form is absent: a legacy combined listing would otherwise emit the same
    // data-field twice and the reader would take whichever came first.
    const buyNowFields = buyNow !== '' && bidForm === '' ? this.confirmFieldsHtml(model) : '';
    return (
      `<div class="wm-detail"><h3>${esc(t('hudChrome.wocMarket.detailTitle'))}</h3>` +
      `<div class="wm-detail-item">${this.itemCellHtml(d.row.itemId, d.row.quality, `detail:${d.row.id}`, d.row.instance)}</div>` +
      `<p>${esc(t('hudChrome.wocMarket.detailSeller', { name: d.row.sellerName }))}</p>` +
      `<p>${esc(t('hudChrome.wocMarket.detailEndsAt', { utc: endUtc, local: endLocal }))}</p>` +
      `<p>${
        d.row.currentCents === null
          ? esc(t('hudChrome.wocMarket.detailStartingBid', { usd: this.usd(d.row.startCents) }))
          : esc(t('hudChrome.wocMarket.detailCurrentBid', { usd: this.usd(d.row.currentCents) }))
      }</p>` +
      estimate +
      bidForm +
      buyNowFields +
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
    // A LOWER BOUND on the server's rule, which checks the bid PLUS its bond.
    // The bond for an arbitrary bid is server-computed and the client may not
    // derive money, so this catches the clear case (bidding well past what you
    // hold) and leaves the narrow band between bid and bid+bond to the server's
    // own refusal. Erring this way only ever permits, never wrongly blocks.
    const overBid = overWalletBalance(this.bidEquivalentTokens, this.walletTokens());
    const disabled = model.paused || !model.walletLinked || this.busy || overBid ? 'disabled' : '';
    return (
      `<div class="wm-bid-form">` +
      `<p class="wm-min-next">${esc(t('hudChrome.wocMarket.detailMinNext', { usd: this.usd(d.row.minNextBidCents) }))}</p>` +
      `<label>${esc(t('hudChrome.wocMarket.bidLabel'))}` +
      `<input type="number" inputmode="decimal" min="0" step="0.25" data-field="bid-usd" data-focus-key="wm-bid-usd" placeholder="${esc(
        t('hudChrome.wocMarket.bidPlaceholder'),
      )}" /></label>` +
      // Empty until the server has quoted the typed price, so it never claims a
      // rate it does not have.
      (this.bidEquivalentTokens === null
        ? ''
        : `<p class="wm-bid-equiv${overBid ? ' over-balance' : ''}">${esc(
            t('hudChrome.trade.woc.equivalent', {
              tokens: formatNumber(this.bidEquivalentTokens, { maximumFractionDigits: 2 }),
            }),
          )}</p>`) +
      // Never colour alone: the refusal is also stated in words, beside a button
      // that is actually disabled.
      (overBid
        ? `<p class="wm-over-balance">${esc(t('hudChrome.trade.woc.hintInsufficientBalance'))}</p>`
        : '') +
      this.confirmFieldsHtml(model) +
      `<p class="wm-note">${esc(
        // The bond figure is SERVER-computed and shipped on the listing view:
        // the client computes no money (the PRD rule).
        t('hudChrome.wocMarket.bidBondNote', { usd: this.usd(d.row.minNextBidBondCents) }),
      )}</p>` +
      `<p class="wm-note">${esc(t('hudChrome.wocMarket.variableTokenWarning'))}</p>` +
      `<p class="wm-note">${esc(
        t('hudChrome.wocMarket.settlementDeadlineNote', {
          duration: this.countdown(model.settlementWindowSeconds),
        }),
      )}</p>` +
      `<button type="button" class="wm-primary" data-action="place-bid" data-listing="${listingId}" ${disabled} ` +
      `aria-label="${esc(t('hudChrome.wocMarket.bidAria', { item: itemName }))}" data-focus-key="wm-bid-submit">` +
      `${esc(t('hudChrome.wocMarket.bidButton'))}</button></div>`
    );
  }

  /**
   * The field the SERVER demands before it will take money: the terms
   * acceptance. It was two until 2FA came off the Exchange's paying side; the
   * helper stays because the same reasoning applies to whatever the server gates
   * on next, and because both the bid form and the buy-now path still need it.
   *
   * One definition, rendered by whichever action is on screen, because the
   * server's guards do not care which one it was. Both `placeBid` and `buyNow`
   * runs guardTerms, but this input used to live only inside the bid form, which
   * is suppressed for a fixed-price listing: a buyer who had not yet accepted the
   * terms got terms_required with no checkbox to tick, a dead end with no way out
   * of the UI, and one that could not appear on a legacy combined listing, which
   * is the only kind the local database held.
   */
  private confirmFieldsHtml(model: Extract<WocMarketViewModel, { kind: 'ready' }>): string {
    const termsRow = model.activity?.termsAccepted
      ? ''
      : `<label class="wm-terms"><input type="checkbox" data-field="accept-terms" data-focus-key="wm-terms" ${this.acceptTerms ? 'checked' : ''} /> ${esc(
          t('hudChrome.wocMarket.termsLabel'),
        )}</label>`;
    return termsRow;
  }

  private sellHtml(model: Extract<WocMarketViewModel, { kind: 'ready' }>): string {
    if (model.sell.rows.length === 0) {
      return `<div class="wm-status">${esc(t('hudChrome.wocMarket.sellEmpty'))}</div>`;
    }
    // A searchable dropdown, not a grid of buttons: a full bag is 70+ tradable
    // items and the flat list pushed the form off the screen. An empty query
    // matches everything, so focus alone (onFocusIn) shows the whole list and
    // typing only narrows it.
    const query = this.sellSearch.trim().toLowerCase();
    const matches = model.sell.rows.filter(
      (r) => query === '' || this.itemName(r.itemId).toLowerCase().includes(query),
    );
    const selected = model.sell.rows.find((r) => r.index === this.sellIndex) ?? null;
    // An ARIA 1.2 combobox (the social_window typeahead pattern), not a native
    // select: options carry the item ICON, which a native <option> cannot. The
    // options are non-focusable role=option divs on purpose, exactly as that
    // sibling documents: DOM focus stays on the input and aria-activedescendant
    // moves, so focusable options would also be dragged into the window's
    // focus-trap cycle.
    const listId = SELL_LISTBOX_ID;
    const open = this.sellOpen && selected === null;
    const active =
      open && this.sellActive >= 0 && this.sellActive < matches.length ? this.sellActive : -1;
    const optionsHtml =
      matches.length === 0
        ? `<div class="wm-combo-empty" role="option" aria-selected="false" aria-disabled="true">${esc(
            t('hudChrome.wocMarket.sellNoMatches'),
          )}</div>`
        : matches
            .map((r, i) => {
              // The icon carries the same hover stats card as the selected cell,
              // so a seller can compare candidates without picking one first. The
              // NAME deliberately does not: a card following the pointer across
              // every row while scanning a 70-item list is noise, and the icon is
              // the deliberate target. attachItemTooltips resolves the key.
              this.tooltipTargets.set(`opt:${r.index}`, {
                itemId: r.itemId,
                instance: r.instance,
              });
              return (
                `<div class="wm-combo-item${i === active ? ' wm-combo-active' : ''}" ` +
                `id="${listId}-o${i}" role="option" aria-selected="${i === active ? 'true' : 'false'}" ` +
                `data-sell-index="${r.index}" data-opt="${i}">` +
                `<img class="wm-combo-icon" data-tt-key="opt:${r.index}" src="${iconDataUrl('item', r.itemId, 28)}" alt="" />` +
                `<span class="wm-combo-name" style="color: ${
                  QUALITY_COLOR[r.quality] ?? 'var(--color-quality-default)'
                }">${esc(this.itemName(r.itemId))}</span></div>`
              );
            })
            .join('');
    const control = selected
      ? // Selected: the item renders INSIDE the control as a real cell, so the
        // hover stats card still works, with a clear button on the far right.
        `<div class="wm-combo-chosen">` +
        this.itemCellHtml(
          selected.itemId,
          selected.quality,
          `sell:${selected.index}`,
          selected.instance,
        ) +
        `<button type="button" class="x-btn wm-combo-clear" data-action="sell-clear" ` +
        `data-focus-key="wm-sell-clear" aria-label="${esc(
          t('hudChrome.wocMarket.sellClear', { item: this.itemName(selected.itemId) }),
        )}" title="${esc(t('hudChrome.wocMarket.sellClearTitle'))}">${svgIcon('close')}</button>` +
        `</div>`
      : `<input type="text" class="wm-combo-input" id="${listId}-input" role="combobox" ` +
        `aria-autocomplete="list" aria-controls="${listId}" aria-expanded="${open}" ` +
        (active >= 0 ? `aria-activedescendant="${listId}-o${active}" ` : '') +
        `autocomplete="off" spellcheck="false" ` +
        `data-field="sell-search" data-focus-key="wm-sell-search" ` +
        `placeholder="${esc(t('hudChrome.wocMarket.sellSearchPlaceholder'))}" ` +
        `value="${esc(this.sellSearch)}" />`;
    // `for` only while the input exists: once an item is chosen the control is the
    // chosen cell plus its clear button, and a label pointing at a removed id is
    // worse than a plain caption.
    const picker =
      (selected
        ? `<span class="wm-sell-pick">${esc(t('hudChrome.wocMarket.sellChoose'))}</span>`
        : `<label class="wm-sell-pick" for="${listId}-input">${esc(
            t('hudChrome.wocMarket.sellChoose'),
          )}</label>`) +
      `<div class="wm-combo" data-combo>${control}` +
      `<div class="wm-combo-list" id="${listId}" role="listbox" aria-label="${esc(
        // tPlural, not a flat key: "Choose from 1 items" is what a {count}
        // template produces, and the plural category differs per locale.
        tPlural('hudChrome.plurals.wocMarketSellChoose', matches.length, {
          count: formatNumber(matches.length),
        }),
      )}" ${open ? '' : 'hidden'}>${optionsHtml}</div></div>`;
    // Selected BY VALUE from painter state (never by index: a server-side
    // reorder of the allowlist would otherwise silently change the default).
    const chosenDuration =
      this.sellDurationHours ?? model.durationsHours[1] ?? model.durationsHours[0] ?? null;
    const durations = model.durationsHours
      .map(
        (h) =>
          `<option value="${h}" ${h === chosenDuration ? 'selected' : ''}>${esc(
            t('hudChrome.wocMarket.sellDurationHours', { hours: formatNumber(h) }),
          )}</option>`,
      )
      .join('');
    const form = selected
      ? `<div class="wm-sell-form">` +
        `<label>${esc(t('hudChrome.wocMarket.sellFormat'))}` +
        `<select data-field="sell-format" data-focus-key="wm-sell-format">` +
        `<option value="auction" ${this.sellFormat === 'auction' ? 'selected' : ''}>${esc(t('hudChrome.wocMarket.sellFormatAuction'))}</option>` +
        `<option value="buy_now" ${this.sellFormat === 'buy_now' ? 'selected' : ''}>${esc(t('hudChrome.wocMarket.sellFormatBuyNow'))}</option>` +
        `</select></label>` +
        `<label>${esc(t('hudChrome.wocMarket.sellStart'))}<input type="number" inputmode="decimal" min="0" step="0.25" data-field="sell-start" data-focus-key="wm-sell-start" /></label>` +
        `<label>${esc(t('hudChrome.wocMarket.sellReserve'))}<input type="number" inputmode="decimal" min="0" step="0.25" data-field="sell-reserve" data-focus-key="wm-sell-reserve" /></label>` +
        `<p class="wm-note">${esc(t('hudChrome.wocMarket.sellReserveNote'))}</p>` +
        `<label>${esc(t('hudChrome.wocMarket.sellBuyNowPrice'))}<input type="number" inputmode="decimal" min="0" step="0.25" data-field="sell-buy-now" data-focus-key="wm-sell-buy-now" /></label>` +
        `<label>${esc(t('hudChrome.wocMarket.sellDuration'))}<select data-field="sell-duration" data-focus-key="wm-sell-duration">${durations}</select></label>` +
        `<label class="wm-offer-next"><input type="checkbox" data-field="sell-offer-next" data-focus-key="wm-sell-offer-next" ${this.sellOfferNext ? 'checked' : ''} /> ${esc(
          t('hudChrome.wocMarket.sellOfferNext'),
        )}</label>` +
        `<p class="wm-note">${esc(t('hudChrome.wocMarket.sellFeeNote'))}</p>` +
        `<button type="button" class="wm-primary" data-action="sell-submit" ${model.paused || !model.walletLinked || this.busy ? 'disabled' : ''} ` +
        `aria-label="${esc(t('hudChrome.wocMarket.sellSubmitAria', { item: this.itemName(selected.itemId) }))}" data-focus-key="wm-sell-submit">` +
        `${esc(t('hudChrome.wocMarket.sellSubmit'))}</button></div>`
      : '';
    return `<div class="wm-sell"><h3>${esc(t('hudChrome.wocMarket.sellTitle'))}</h3><div class="wm-sell-list">${picker}</div>${form}</div>`;
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
          `<li>${this.itemCellHtml(l.itemId, l.quality, `activity:${l.id}`, l.instance)} ` +
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
            ? ` <span>${esc(t('hudChrome.wocMarket.activityDeadline', { duration: this.countdown(s.deadlineRemainingMs / 1000) }))}</span>`
            : '';
        return `<li><span>${esc(this.usd(s.amountCents))}</span> <span>${esc(t(settlementKey(s.state)))}</span>${deadline}${pay}</li>`;
      })
      .join('');
    const strikes =
      a.strikes > 0
        ? `<p class="wm-strikes">${esc(t('hudChrome.wocMarket.activityStrikes', { count: formatNumber(a.strikes) }))}</p>` +
          (a.suspendedRemainingMs !== null
            ? `<p class="wm-strikes">${esc(t('hudChrome.wocMarket.activitySuspended', { duration: this.countdown(a.suspendedRemainingMs / 1000) }))}</p>`
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
    // With no cached USD label, the token legs below carry the amount rather
    // than a fabricated $0.00.
    const title =
      pending.usdCents === null
        ? t('hudChrome.wocMarket.quoteTitle')
        : pending.kind === 'bond'
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

  /** Typing in the combobox filters and opens the listbox. */
  private onInput(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (target?.getAttribute('data-field') === 'bid-usd') {
      this.onBidPriceInput();
      return;
    }
    if (target?.getAttribute('data-field') !== 'sell-search') return;
    this.sellSearch = (target as HTMLInputElement).value;
    this.sellOpen = true;
    // A fresh query invalidates the highlight: keeping the index would leave it
    // pointing at whatever now happens to sit in that position.
    this.sellActive = -1;
    this.render();
  }

  /**
   * The bid's $WOC preview, on the same terms as the p2p trade's.
   *
   * Written IN PLACE into its own line rather than through render(): a rebuild
   * would replace the input under the caret on every keystroke, which is the
   * bug the trade arm already had to solve.
   *
   * Coalesced WITHOUT a timer, unlike the trade arm's 350ms debounce. This file
   * is a cold window and holds a no-self-scheduling contract that its own suite
   * pins by scanning for the token, so a `setTimeout` debounce is not available
   * here. Keeping at most one request in flight and chasing the latest value on
   * completion gets the same property: typing fast costs about one request per
   * round trip rather than one per character, and it needs no clock at all.
   *
   * The figure is the SERVER's, like every other money number here; the client
   * multiplies nothing.
   */
  private onBidPriceInput(): void {
    const cents = this.numberFieldCents('[data-field="bid-usd"]');
    if (cents === null || cents <= 0) {
      // Nothing to preview, and an emptied field must not keep showing the rate
      // for the number that used to be there.
      this.bidEstimateWanted = null;
      if (this.bidEquivalentTokens !== null) {
        this.bidEquivalentTokens = null;
        this.render();
      }
      return;
    }
    this.bidEstimateWanted = cents;
    this.pumpBidEstimate();
  }

  private pumpBidEstimate(): void {
    const cents = this.bidEstimateWanted;
    const hooks = this.deps.hooks();
    if (cents === null || this.bidEstimateInFlight || !hooks) return;
    this.bidEstimateInFlight = true;
    void hooks.client.estimate(cents).then((est) => {
      this.bidEstimateInFlight = false;
      // Stale: the player typed on while this was out. Leave the line alone and
      // chase the number they actually have now.
      if (this.bidEstimateWanted !== cents) {
        this.pumpBidEstimate();
        return;
      }
      this.bidEstimateWanted = null;
      this.bidEquivalentTokens = est?.amount?.tokens ?? null;
      // Through render(), not a raw write into the line. This window rebuilds
      // its whole subtree and already carries the caret and the typed value
      // across with captureFormDraft/captureFocusKey, so the price being typed
      // survives; poking textContent directly would dodge the file's own
      // no-raw-write rule for no benefit.
      this.render();
    });
  }

  /**
   * Combobox keyboard handling, delegated to the shared dropdownKeyNav core.
   *
   * Space is deliberately NOT passed through. That core was written for a
   * button-triggered listbox where Space means activate; in a text combobox Space
   * is content, and routing it would make the space bar select an item instead of
   * typing. Every other key (arrows, Home, End, Enter, Escape, Tab) keeps the
   * shared semantics rather than a second hand-rolled copy of them.
   */
  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target?.getAttribute('data-field') !== 'sell-search') return;
    if (e.key === ' ') return;
    const matches = this.sellMatches();
    const action = dropdownKeyNav(e.key, this.sellOpen, this.sellActive, matches.length);
    switch (action.kind) {
      case 'open':
        e.preventDefault();
        this.sellOpen = true;
        this.sellActive = action.index;
        this.render();
        return;
      case 'move':
        e.preventDefault();
        this.sellActive = action.index;
        // In place, not a rebuild: see paintSellActive. Arrowing does not change
        // which options exist, only which one is highlighted.
        this.paintSellActive(this.deps.root());
        return;
      case 'select': {
        e.preventDefault();
        const pick = matches[this.sellActive];
        // Enter with nothing highlighted is a no-op, not a silent pick of the
        // first row: the seller has not chosen anything yet.
        if (pick) this.commitSellPick(pick.index);
        return;
      }
      case 'close':
        e.preventDefault();
        this.sellOpen = false;
        this.sellActive = -1;
        this.render();
        return;
      case 'tab':
        // No preventDefault: let Tab move on natively (the shared core's note).
        this.sellOpen = false;
        this.sellActive = -1;
        this.render();
        return;
      default:
        return;
    }
  }

  private onComboMouseDown(e: MouseEvent): void {
    const option = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-sell-index]');
    if (!option) return;
    e.preventDefault();
    const index = Number(option.dataset.sellIndex);
    if (Number.isInteger(index)) this.commitSellPick(index);
  }

  private onComboMouseMove(e: MouseEvent): void {
    if (!this.sellOpen) return;
    const option = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-opt]');
    if (!option) return;
    const next = Number(option.dataset.opt);
    // Repaint only on a real change: the pointer fires mousemove continuously.
    if (!Number.isInteger(next) || next === this.sellActive) return;
    this.sellActive = next;
    // In place, and here it is a CORRECTNESS requirement rather than a saving: a
    // rebuild would destroy the very option being hovered and take its stats card
    // with it. See paintSellActive.
    this.paintSellActive(this.deps.root());
  }

  /**
   * Open the full list the moment the control takes focus, before any typing.
   *
   * With an empty query every eligible row matches, so this is the whole scrollable
   * inventory rather than a teaser: the picker behaves like a dropdown you open,
   * not a search box you have to guess at. A player who does not know what is
   * listable should not have to type to find out.
   *
   * The `rendering` guard is the same one onFocusOut needs and load-bearing for the
   * same reason: renderInner's focus restore is itself a focus movement into this
   * input, so without it Escape would close the list and the rebuild it triggers
   * would immediately reopen it.
   */
  private onFocusIn(e: FocusEvent): void {
    if (this.rendering || this.sellOpen) return;
    const target = e.target as HTMLElement | null;
    if (target?.getAttribute('data-field') !== 'sell-search') return;
    this.sellOpen = true;
    this.sellActive = -1;
    this.render();
  }

  /**
   * Move the highlight IN PLACE, without a rebuild.
   *
   * The sibling this copies is social_window's highlightSuggest, and the reason is
   * not only cost. A rebuild replaces the option the pointer is resting on, and a
   * removed node fires no mouseleave, so the hover stats card would be hidden and
   * then never re-shown: mouseenter does not fire again on the replacement while
   * the pointer sits still. Repainting the highlight instead leaves the hovered
   * option, and its tooltip binding, alive.
   *
   * scrollIntoView is a scroll COMMAND, not one of the forced-reflow reads the
   * cold contract counts, and it is what the sibling combobox uses for exactly
   * this case. It is needed here: the list opens at full length, so arrowing down
   * leaves the visible 240px almost immediately.
   */
  private paintSellActive(root: HTMLElement): void {
    const input = root.querySelector<HTMLElement>('[data-field="sell-search"]');
    for (const option of root.querySelectorAll<HTMLElement>('[data-opt]')) {
      const on = Number(option.dataset.opt) === this.sellActive;
      option.classList.toggle('wm-combo-active', on);
      option.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) option.scrollIntoView({ block: 'nearest' });
    }
    // aria-activedescendant is what a screen reader follows while DOM focus stays
    // on the input, so it has to move with the class or the two disagree.
    if (this.sellActive >= 0) {
      input?.setAttribute('aria-activedescendant', `${SELL_LISTBOX_ID}-o${this.sellActive}`);
    } else input?.removeAttribute('aria-activedescendant');
  }

  /**
   * Close the listbox when focus genuinely leaves the combobox.
   *
   * The `rendering` guard is load-bearing, not defensive. Every render() replaces
   * this subtree, and the browser moves focus off the input as part of removing
   * it, firing focusout with a null relatedTarget: indistinguishable from the user
   * clicking away. Checking isConnected does NOT separate them, which cost real
   * debugging time here: the node is still attached at the moment the event fires,
   * so the guard passed and the rebuild closed its own listbox. The symptom looked
   * nothing like the cause, because each keystroke re-rendered, the rebuild
   * cleared sellOpen, and the NEXT key therefore read the list as closed, so Enter
   * and Escape silently fell through to dropdownKeyNav's collapsed branch.
   */
  private onFocusOut(e: FocusEvent): void {
    if (this.rendering || !this.sellOpen) return;
    const target = e.target as HTMLElement | null;
    const combo = target?.closest('[data-combo]');
    if (!combo) return;
    const next = e.relatedTarget as Node | null;
    if (next && combo.contains(next)) return;
    this.sellOpen = false;
    this.sellActive = -1;
    this.render();
  }

  /** What each preserved scroll offset currently refers to. The detail key folds
   *  in the selected listing as well as the tab, because an offset taken in one
   *  listing's pane means nothing in another's. */
  private scrollKeys(model: WocMarketViewModel): WocMarketScrollKeys {
    const listing = model.kind === 'ready' ? model.browse.detail?.row.id : undefined;
    return { body: this.tab, detail: `${this.tab}:${listing ?? ''}` };
  }

  /** The rows the current query matches. One definition, used by the markup and
   *  by the keyboard handler, so the highlight index can never mean two things. */
  private sellMatches(): WocSellRowModel[] {
    const model = this.lastModel;
    if (!model || model.kind !== 'ready') return [];
    const query = this.sellSearch.trim().toLowerCase();
    return model.sell.rows.filter(
      (r) => query === '' || this.itemName(r.itemId).toLowerCase().includes(query),
    );
  }

  private commitSellPick(index: number): void {
    this.sellIndex = index;
    this.sellOpen = false;
    this.sellActive = -1;
    this.sellSearch = '';
    this.render();
  }

  private onChange(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const field = target.getAttribute('data-field');
    if (field === 'sell-format') {
      const value = (target as HTMLSelectElement).value;
      // 'auction_buy_now' is deliberately absent: a combined listing is no
      // longer creatable (existing ones still render and settle).
      if (value === 'auction' || value === 'buy_now') {
        this.sellFormat = value;
        this.render();
      }
      return;
    }
    if (field === 'sell-duration') {
      const value = Number((target as HTMLSelectElement).value);
      if (Number.isFinite(value)) this.sellDurationHours = value;
      return;
    }
    if (field === 'sell-offer-next') {
      this.sellOfferNext = (target as HTMLInputElement).checked;
      return;
    }
    if (field === 'accept-terms') {
      this.acceptTerms = (target as HTMLInputElement).checked;
      return;
    }
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
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-action], [data-close], .wm-row-open, .wm-row',
    );
    if (!target) return;
    const action = target.getAttribute('data-action');
    // data-close is the family's close marker (social/bank/report all use it);
    // the action arm stays for any future explicitly-actioned close.
    if (action === 'close' || target.hasAttribute('data-close')) {
      this.close();
      return;
    }
    if (
      !action &&
      (target.classList.contains('wm-row-open') || target.classList.contains('wm-row'))
    ) {
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
      case 'sell-clear':
        // Back to search mode with an empty query, so the seller can pick again
        // without first clearing the box themselves.
        this.sellIndex = null;
        this.sellSearch = '';
        this.sellOpen = false;
        this.sellActive = -1;
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
        void this.cancelPendingQuote();
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
    return this.acceptTerms;
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
    let quoted = false;
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.placeBid({
        listingId,
        characterId: hooks.characterId(),
        amountCents,
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
      quoted = true;
    });
    // Straight on into the wallet. The bond is not a second decision the player
    // makes, it is what placing a bid COSTS, and stopping to ask again left them
    // holding a listing lock they had not realised they had taken.
    //
    // OUTSIDE the withBusy above, not inside it: withBusy refuses to re-enter
    // while busy, so a nested call would be silently swallowed and the player
    // would be left staring at the quote panel after all.
    //
    // The signature itself cannot be skipped, and is not being skipped here:
    // this service holds no buyer key by design. What goes is the extra click
    // between deciding to bid and being asked to pay for it. A declined wallet
    // still lands on the quote panel, which is now the RETRY surface rather than
    // the happy path, with its own abandon.
    if (quoted) await this.signPendingQuote();
  }

  private async buyNow(listingId: number): Promise<void> {
    const hooks = this.deps.hooks();
    if (!hooks || !Number.isFinite(listingId)) return;
    const itemId = this.detail?.itemId ?? '';
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.buyNow({
        listingId,
        characterId: hooks.characterId(),
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
    if (format !== 'auction' && format !== 'buy_now') return;
    // The buy-now price has to beat the starting bid, and the reserve if one is
    // set. Checked here so the seller is told which field is wrong before a round
    // trip; validListingParams re-checks it server-side, which is the authority.
    if (buyNowCents !== null) {
      const floor = Math.max(startCents, reserveCents ?? 0);
      if (buyNowCents <= floor) {
        this.notice = { text: t('hudChrome.wocMarket.sellBuyNowAboveStart'), error: true };
        this.render();
        return;
      }
    }
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
      this.pendingQuote = {
        kind: 'bond',
        bidId,
        // The quote's own amount is authoritative; the cached row is only a
        // label hint, so never render a fabricated $0.00 for a real charge.
        usdCents: bid?.bondCents ?? null,
        quote: out.bond,
      };
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
        usdCents: settlement?.amountCents ?? null,
        quote: out.quote,
      };
    });
  }

  /**
   * "Not now", meaning it on the server too.
   *
   * A BOND quote holds a listing-wide lock: the bid exists as pending_bond, and
   * every further bid on that listing is refused until it resolves. Dropping
   * only the client's copy left the player locked out of the auction they were
   * trying to enter, told to abandon a bid through a control that did not
   * exist, for the whole five-minute TTL.
   *
   * A SETTLEMENT quote is not the same and is deliberately left alone: the item
   * is already theirs to pay for, the Activity tab offers Pay now, and there is
   * a deadline rather than a lock. Cancelling that would throw away a purchase.
   */
  private async cancelPendingQuote(): Promise<void> {
    const pending = this.pendingQuote;
    const hooks = this.deps.hooks();
    this.pendingQuote = null;
    if (!hooks || pending?.kind !== 'bond') {
      this.render();
      return;
    }
    await this.withBusy('hudChrome.wocMarket.confirming', async () => {
      const out = await hooks.client.abandonBid(pending.bidId);
      // A failure here is worth saying out loud rather than swallowing: the bid
      // is still holding the lock, and the player needs to know why their next
      // bid is refused. The TTL remains the backstop either way.
      if (!out.ok) this.fail(out.code);
      await this.reload();
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
        signature = await hooks.signAndSendTransactionBase64(pending.quote.transactionBase64 ?? '');
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
        // Three outcomes, not two. "Not standing" used to cover both being
        // outbid and the chain simply not having decided yet, which told a
        // player their good payment had lost.
        this.ok(
          out.pending
            ? 'hudChrome.wocMarket.bidBondConfirming'
            : out.standing
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
