// The Exchange's status chrome (src/ui/woc_market_chrome.ts) was extracted to
// bring the window's ceiling down, and a faithful move is exactly when the
// cheap direct pin is worth adding: nothing else would notice a face quietly
// changing shape (the same reasoning that earned woc_balance_chip.ts a test).
// Before this file, the deadline tooltip's only automated coverage was a
// toContain('UTC') in the window rig, which passes with the local reading
// dropped, the two readings collapsed, or the timestamp wrong.

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { formatDateTime, setLanguage, t } from '../src/ui/i18n';
import {
  wocEndsAtText,
  wocErrorStatusHtml,
  wocLoadingStatusHtml,
  wocSpinnerHtml,
} from '../src/ui/woc_market_chrome';

afterEach(() => {
  setLanguage('en');
});

describe('woc_market_chrome: the status builders', () => {
  it('the spinner is the one shared ring, decoration only', () => {
    expect(wocSpinnerHtml()).toBe('<span class="woc-spinner" aria-hidden="true"></span>');
  });

  it('the loading line announces, carries the ring, and reads from the catalog', () => {
    setLanguage('en');
    const html = wocLoadingStatusHtml();
    expect(html).toContain('role="status"');
    expect(html).toContain('class="wm-status wm-status-loading"');
    expect(html).toContain(wocSpinnerHtml());
    expect(html).toContain(t('hudChrome.wocMarket.loading'));
  });

  it('the error line announces in the error voice and ESCAPES its text', () => {
    const html = wocErrorStatusHtml('failed <b>"badly"</b> & loudly');
    expect(html).toContain('role="status"');
    expect(html).toContain('class="wm-status wm-status-error"');
    // The hostile text lands entity-encoded, never as live markup.
    expect(html).toContain('failed &lt;b&gt;&quot;badly&quot;&lt;/b&gt; &amp; loudly');
    expect(html).not.toContain('<b>"badly"</b>');
  });
});

describe('woc_market_chrome: the exact end time', () => {
  // A fixed instant: 2026-01-15 23:30 UTC. The UTC reading is pinned to the
  // literal en spelling, so a wrong timestamp or a dropped UTC override reds
  // here regardless of the machine's own zone.
  const ENDS_MS = Date.UTC(2026, 0, 15, 23, 30);

  it('spells the UTC reading literally and fills both template slots', () => {
    setLanguage('en');
    const text = wocEndsAtText(ENDS_MS);
    expect(text).toContain('Jan 15, 2026, 11:30 PM');
    expect(text).toContain('UTC');
    // The whole line equals the template with BOTH slots filled: an empty or
    // unfilled {local} slot cannot reproduce this string.
    expect(text).toBe(
      t('hudChrome.wocMarket.detailEndsAt', {
        utc: formatDateTime(ENDS_MS, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }),
        local: formatDateTime(ENDS_MS, { dateStyle: 'medium', timeStyle: 'short' }),
      }),
    );
  });

  it('keeps the two readings genuinely distinct: one UTC override, one host clock', () => {
    // A CI box in UTC renders both readings identically, so the collapsed-to-
    // one regression is invisible to the rendered string there. Pin the
    // structure instead: exactly one of the two formatDateTime calls carries
    // the UTC override, on the utc slot.
    const src = readFileSync(
      new URL('../src/ui/woc_market_chrome.ts', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const calls = src.match(/formatDateTime\([^)]*\)/g) ?? [];
    expect(calls.length, 'both readings come from the shared formatter').toBe(2);
    expect(calls.filter((c) => c.includes("timeZone: 'UTC'")).length).toBe(1);
    expect(src).toMatch(/utc:\s*formatDateTime\([^)]*timeZone: 'UTC'/);
  });
});
