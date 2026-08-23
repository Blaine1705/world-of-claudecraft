// The Exchange window's small status chrome, as pure builders.
//
// A spinner, a loading line, a failed-reach line, the browse faces' control
// row and the exact end time a countdown cell carries as its tooltip: none of
// them read the window's state, so none of them belong to the window's class.
// They live here so the window stays a coordinator over its own faces and
// this markup can be asserted directly, which is the same split
// unit_portrait/unit_portrait_painter uses.
//
// DOM-free and deterministic apart from the caller's own timestamps
// (registered in tests/architecture.test.ts UI_PURE_CORES).

import { esc } from './esc';
import { FOCUS_KEY_ATTR } from './focus_restore';
import { formatDateTime, formatNumber, t } from './i18n';
import { ITEM_QUALITY_LABEL_KEYS, itemQualityLabel } from './item_kind_label';
import { svgIcon } from './ui_icons';

/** The browse faces' control row: the sort control LEADS the row (the 15 QA
 *  sign-off note), the pager follows. Pure over its inputs like every builder
 *  here; the focus keys and data hooks are the ones the window's restore
 *  ladder and click handler already own. It renders on EVERY browse face so
 *  an empty page or a failed reach still leaves a way back and a live sort. */
export function wocBrowseStripHtml(opts: { page: number; hasMore: boolean; sort: string }): string {
  const option = (value: string, label: string): string =>
    `<option value="${value}" ${opts.sort === value ? 'selected' : ''}>${esc(label)}</option>`;
  return (
    `<div class="wm-pager">` +
    `<label class="wm-sort">${esc(t('hudChrome.wocMarket.sortLabel'))}` +
    `<select data-field="sort" ${FOCUS_KEY_ATTR}="wm-sort">` +
    option('ending', t('hudChrome.wocMarket.sortEnding')) +
    option('newest', t('hudChrome.wocMarket.sortNewest')) +
    option('price_asc', t('hudChrome.wocMarket.sortPriceAsc')) +
    option('price_desc', t('hudChrome.wocMarket.sortPriceDesc')) +
    `</select></label>` +
    `<button type="button" data-action="page-prev" ${FOCUS_KEY_ATTR}="wm-page-prev" ${opts.page <= 0 ? 'disabled' : ''} aria-label="${esc(t('hudChrome.wocMarket.pagePrev'))}">${svgIcon('prev')}</button>` +
    `<span>${esc(t('hudChrome.wocMarket.pageNumber', { current: formatNumber(opts.page + 1) }))}</span>` +
    `<button type="button" data-action="page-next" ${FOCUS_KEY_ATTR}="wm-page-next" ${opts.hasMore ? '' : 'disabled'} aria-label="${esc(t('hudChrome.wocMarket.pageNext'))}">${svgIcon('next')}</button>` +
    `</div>`
  );
}

/** The one shared ring, sized and coloured by .woc-spinner in the stylesheet. */
export function wocSpinnerHtml(): string {
  return `<span class="woc-spinner" aria-hidden="true"></span>`;
}

/** A reach in progress: the ring plus the announced sentence. */
export function wocLoadingStatusHtml(): string {
  return `<div class="wm-status wm-status-loading" role="status">${wocSpinnerHtml()}<span>${esc(
    t('hudChrome.wocMarket.loading'),
  )}</span></div>`;
}

/** A failed reach reads as an error: the glyph, the error voice, announced. */
export function wocErrorStatusHtml(text: string): string {
  return `<div class="wm-status wm-status-error" role="status">${svgIcon('alert')}<span>${esc(
    text,
  )}</span></div>`;
}

/**
 * The exact end time of a listing, UTC and local, the way the detail pane
 * spells it (the countdown cells carry it as their tooltip).
 *
 * Both readings, because a listing closes at an instant that is the same for
 * everyone: the UTC stamp is the one two players in different places can
 * compare, and the local one is the clock they will actually look at.
 */
export function wocEndsAtText(endsAtMs: number): string {
  return t('hudChrome.wocMarket.detailEndsAt', {
    utc: formatDateTime(endsAtMs, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }),
    local: formatDateTime(endsAtMs, { dateStyle: 'medium', timeStyle: 'short' }),
  });
}

/** The known quality vocabulary, DERIVED from the exhaustive label record so
 *  a new quality flows here in the same change that names it; the /status
 *  floor word resolves to its localized name, and an unrecognized future
 *  policy word renders verbatim rather than mislabeling (the server
 *  validated it, the client just cannot name it yet). */
const QUALITY_WORDS = new Set<string>(Object.keys(ITEM_QUALITY_LABEL_KEYS));

/**
 * The empty Sell tab, with the realm's OWN policy resolved into the copy:
 * the live quality floor (localized through the shared quality-label family)
 * and a collectible sentence chosen from the realm's category switches, one
 * key per combination so no locale composes a list in code. The old caption
 * said "the realm's quality floor" and "on some realms" while the figures
 * sat one field away on /status; named figures come off the wire.
 */
export function wocSellEmptyHtml(
  policy: { qualityFloor: string; allowMounts: boolean; allowMechChromas: boolean },
  lockedNoteHtml: string,
): string {
  const floor = QUALITY_WORDS.has(policy.qualityFloor)
    ? itemQualityLabel(policy.qualityFloor as Parameters<typeof itemQualityLabel>[0])
    : policy.qualityFloor;
  const collectibles =
    policy.allowMounts && policy.allowMechChromas
      ? t('hudChrome.wocMarket.sellCollectiblesBoth')
      : policy.allowMounts
        ? t('hudChrome.wocMarket.sellCollectiblesMounts')
        : policy.allowMechChromas
          ? t('hudChrome.wocMarket.sellCollectiblesChromas')
          : null;
  return (
    `<div class="wm-sell"><div class="wm-status" role="status">` +
    `<p>${esc(t('hudChrome.wocMarket.sellEmptyFloor', { floor }))}</p>` +
    (collectibles === null ? '' : `<p>${esc(collectibles)}</p>`) +
    `</div>${lockedNoteHtml}</div>`
  );
}

/**
 * The general bond disclosures resolved from the /status figures: the
 * schedule for an arbitrary typed bid and the payment window whose lapse
 * kills the bid. Rendered only when the server sent the figures (the caller
 * gates on them), so an older server keeps the figure-free listing-specific
 * note alone.
 */
export function wocBondScheduleNotesHtml(args: {
  rateBps: number;
  minCents: number;
  maxCents: number;
  /** The pre-localized payment window (the window's countdown formatter). */
  payWindowText: string;
  /** The window's own money formatter, so both surfaces spell USD one way. */
  usd(cents: number): string;
}): string {
  return (
    `<p class="wm-note">${esc(
      t('hudChrome.wocMarket.bidBondSchedule', {
        rate: formatNumber(args.rateBps / 100),
        min: args.usd(args.minCents),
        max: args.usd(args.maxCents),
      }),
    )}</p>` +
    `<p class="wm-note">${esc(
      t('hudChrome.wocMarket.bidBondPayWindow', { duration: args.payWindowText }),
    )}</p>`
  );
}

/**
 * The two standing banners under the tab strip (a paused realm, an unlinked
 * wallet): they change on an operator action or a wallet link, never on a
 * click, so the tab panel does not shift under the pointer. The wallet banner
 * carries its own way in: the same shared connect flow the store and daily
 * rewards buttons open (the window's connect-wallet click action), one click
 * from where the player was told to link.
 */
export function wocMarketBannersHtml(args: { paused: boolean; walletLinked: boolean }): string {
  const banners =
    (args.paused
      ? `<div class="wm-banner wm-banner-paused">${esc(t('hudChrome.wocMarket.pausedBanner'))}</div>`
      : '') +
    (args.walletLinked
      ? ''
      : `<div class="wm-banner wm-banner-wallet"><span>${esc(t('hudChrome.wocMarket.walletBanner'))}</span>` +
        `<button type="button" data-action="connect-wallet" ${FOCUS_KEY_ATTR}="wm-connect-wallet">${esc(
          t('hudChrome.wocMarket.walletBannerCta'),
        )}</button></div>`);
  return banners === '' ? '' : `<div class="wm-strip">${banners}</div>`;
}

/**
 * The footer status bar: the rate note rests there, and the toast strip (a
 * mutation in flight, its outcome) joins it in the SAME slot, so a notice
 * that comes and goes never moves the rows or the form above it. Under the
 * paused banner the rate reads as the last KNOWN print, with its date, never
 * a live rate. The busy line moves (the shared ring): a signed transaction
 * awaiting the chain used to be indistinguishable from a wedged panel.
 */
export function wocMarketFootHtml(args: {
  paused: boolean;
  tokensPerUsd: number | null;
  priceAsOfMs: number | null;
  /** The window's token formatter, so every surface spells $WOC one way. */
  tokens(value: number): string;
  /** The ALREADY-RESOLVED notice sentence (the window's resolveNotice), so a
   *  runtime language switch never leaves a stale-locale sentence here. */
  notice: { text: string; error: boolean } | null;
  busyText: string | null;
}): string {
  const rate =
    args.tokensPerUsd !== null && args.priceAsOfMs !== null
      ? `<div class="wm-rate">${esc(
          args.paused
            ? t('hudChrome.wocMarket.rateNotePaused', {
                tokens: args.tokens(args.tokensPerUsd),
                time: formatDateTime(args.priceAsOfMs, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })
            : t('hudChrome.wocMarket.rateNote', {
                tokens: args.tokens(args.tokensPerUsd),
                time: formatDateTime(args.priceAsOfMs, { timeStyle: 'short' }),
              }),
        )}</div>`
      : '';
  const notice = args.notice
    ? `<div class="wm-notice ${args.notice.error ? 'wm-notice-error' : ''}" role="status">${
        args.notice.error ? svgIcon('alert') : ''
      }<span>${esc(args.notice.text)}</span></div>`
    : '';
  const busy =
    args.busyText === null
      ? ''
      : `<div class="wm-busy" role="status">${wocSpinnerHtml()}<span>${esc(args.busyText)}</span></div>`;
  return `<div class="wm-foot">${rate}${notice}${busy}</div>`;
}

/**
 * The bid form's commitment disclosures, BEFORE the first bond charge,
 * grouped as one well: the bond schedule for THIS listing (both figures are
 * server-computed and shipped on the row: the client computes no money, the
 * PRD rule), the binding rule with its forfeit and strike (stated once,
 * here), the closing rule, the second-chance cascade with the resolved
 * settlement window, the variable-token warning, and the payment deadline
 * (H13's pre-bid disclosure gap).
 *
 * Collapsed by default behind the toggle, never removed: the well is always
 * composed (resolved figures and all) and precedes Place bid in DOM order,
 * but eight always-open paragraphs pushed the commit control below the fold
 * on every screen (the PRD's collapsed-by-default presentation). The hidden
 * attribute needs its own CSS arm: .wm-disclosures sets display:flex, which
 * outranks the UA's [hidden] rule.
 */
export function wocBidDisclosuresHtml(args: {
  open: boolean;
  /** The bond for the minimum next bid, and that bid, both off the row. */
  bondCents: number;
  bidCents: number;
  /** The /status schedule figures, or null on an older server (the
   *  figure-free bidBondNote then stands alone). */
  schedule: {
    rateBps: number;
    minCents: number;
    maxCents: number;
    payWindowText: string;
  } | null;
  offerNext: boolean;
  /** The pre-localized settlement window (the window's countdown formatter). */
  settlementWindowText: string;
  usd(cents: number): string;
}): string {
  return (
    `<button type="button" class="wm-terms-toggle" data-action="toggle-bid-terms" ` +
    `aria-expanded="${args.open ? 'true' : 'false'}" aria-controls="wm-bid-terms" ` +
    `${FOCUS_KEY_ATTR}="wm-bid-terms-toggle">${esc(t('hudChrome.wocMarket.bidTermsToggle'))}</button>` +
    `<div class="wm-disclosures" id="wm-bid-terms"${args.open ? '' : ' hidden'}>` +
    `<p class="wm-note">${esc(
      t('hudChrome.wocMarket.bidBondNote', {
        bond: args.usd(args.bondCents),
        bid: args.usd(args.bidCents),
      }),
    )}</p>` +
    (args.schedule === null ? '' : wocBondScheduleNotesHtml({ ...args.schedule, usd: args.usd })) +
    `<p class="wm-note">${esc(t('hudChrome.wocMarket.bidBindingNote'))}</p>` +
    `<p class="wm-note">${esc(t('hudChrome.wocMarket.bidCloseNote'))}</p>` +
    (args.offerNext
      ? `<p class="wm-note">${esc(
          t('hudChrome.wocMarket.offerNextNote', { duration: args.settlementWindowText }),
        )}</p>`
      : '') +
    `<p class="wm-note">${esc(t('hudChrome.wocMarket.variableTokenWarning'))}</p>` +
    `<p class="wm-note">${esc(
      t('hudChrome.wocMarket.settlementDeadlineNote', { duration: args.settlementWindowText }),
    )}</p>` +
    `</div>`
  );
}

/**
 * The detail pane's buy-now face: the walk-away-cost disclosure (the re-claim
 * cooldown and the hourly cap) said BEFORE the button, like the bid form's
 * disclosures precede Place bid; a locked listing says WHY its button is
 * disabled (the badge lives in the table, which a phone has scrolled away);
 * then the price in tokens off buy-now's own quote, and the refusal in words
 * beside a button that is actually disabled (never colour alone).
 */
export function wocBuyNowHtml(args: {
  listingId: number;
  itemName: string;
  buyNowCents: number;
  locked: boolean;
  disabled: boolean;
  /** The buy-now price in tokens (the window's formatter), or null until its
   *  own quote lands: the detail's estimate priced the current bid, not this. */
  tokensText: string | null;
  overBalance: boolean;
  usd(cents: number): string;
}): string {
  return (
    `<div class="wm-disclosures">` +
    `<p class="wm-note">${esc(t('hudChrome.wocMarket.buyNowNote'))}</p>` +
    (args.locked ? `<p class="wm-note">${esc(t('hudChrome.wocMarket.buyNowLockedTip'))}</p>` : '') +
    `</div>` +
    `<button type="button" class="wm-primary" data-action="buy-now" data-listing="${args.listingId}" ` +
    `${args.disabled ? 'disabled' : ''} ` +
    `aria-label="${esc(
      t('hudChrome.wocMarket.buyNowAria', {
        item: args.itemName,
        usd: args.usd(args.buyNowCents),
      }),
    )}" ${FOCUS_KEY_ATTR}="wm-buy-now">` +
    `${esc(t('hudChrome.wocMarket.buyNowButton', { usd: args.usd(args.buyNowCents) }))}</button>` +
    (args.tokensText === null
      ? ''
      : `<p class="wm-bid-equiv${args.overBalance ? ' over-balance' : ''}">${esc(
          t('hudChrome.trade.woc.equivalent', { tokens: args.tokensText }),
        )}</p>`) +
    (args.overBalance
      ? `<p class="wm-over-balance">${esc(t('hudChrome.trade.woc.hintInsufficientBalance'))}</p>`
      : '')
  );
}

/**
 * The detail pane's recent-sales list. Null sales means the history round
 * trip is still out: 'still loading', never 'no recorded sales', which
 * would assert what the client does not know.
 */
export function wocSalesHistoryHtml(
  sales:
    | readonly { atMs: number; priceCents: number; sellerName: string; buyerName: string }[]
    | null,
  usd: (cents: number) => string,
): string {
  if (sales === null) {
    return `<p class="wm-sales-empty">${esc(t('hudChrome.wocMarket.detailSalesLoading'))}</p>`;
  }
  if (sales.length === 0) {
    return `<p class="wm-sales-empty">${esc(t('hudChrome.wocMarket.detailNoSales'))}</p>`;
  }
  return `<ul class="wm-sales">${sales
    .map(
      (s) =>
        `<li>${esc(
          t('hudChrome.wocMarket.detailSaleRow', {
            time: formatDateTime(s.atMs, { dateStyle: 'medium' }),
            usd: usd(s.priceCents),
            seller: s.sellerName,
            buyer: s.buyerName,
          }),
        )}</li>`,
    )
    .join('')}</ul>`;
}
