// The Exchange window's small status chrome, as pure builders.
//
// A spinner, a loading line, a failed-reach line and the exact end time a
// countdown cell carries as its tooltip: none of them read the window's state,
// so none of them belong to the window's class. They live here so the window
// stays a coordinator over its own faces and this markup can be asserted
// directly, which is the same split unit_portrait/unit_portrait_painter uses.
//
// DOM-free and deterministic apart from the caller's own timestamps
// (registered in tests/architecture.test.ts UI_PURE_CORES).

import { esc } from './esc';
import { formatDateTime, t } from './i18n';
import { svgIcon } from './ui_icons';

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
