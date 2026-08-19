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
import { formatDateTime, formatNumber, t } from './i18n';
import { itemQualityLabel } from './item_kind_label';
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
    `<select data-field="sort" data-focus-key="wm-sort">` +
    option('ending', t('hudChrome.wocMarket.sortEnding')) +
    option('newest', t('hudChrome.wocMarket.sortNewest')) +
    option('price_asc', t('hudChrome.wocMarket.sortPriceAsc')) +
    option('price_desc', t('hudChrome.wocMarket.sortPriceDesc')) +
    `</select></label>` +
    `<button type="button" data-action="page-prev" data-focus-key="wm-page-prev" ${opts.page <= 0 ? 'disabled' : ''} aria-label="${esc(t('hudChrome.wocMarket.pagePrev'))}">${svgIcon('prev')}</button>` +
    `<span>${esc(t('hudChrome.wocMarket.pageNumber', { current: formatNumber(opts.page + 1) }))}</span>` +
    `<button type="button" data-action="page-next" data-focus-key="wm-page-next" ${opts.hasMore ? '' : 'disabled'} aria-label="${esc(t('hudChrome.wocMarket.pageNext'))}">${svgIcon('next')}</button>` +
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

/** The known quality vocabulary, for resolving the /status floor word to its
 *  localized name; an unrecognized future policy word renders verbatim
 *  rather than mislabeling (the server validated it, the client just cannot
 *  name it yet). */
const QUALITY_WORDS = new Set(['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary']);

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
