// The marketplace disclosures that spell a server rule in plain words (the
// anti-snipe window, the Buy Now hold and its cooldowns, the strike ladder)
// are pinned to the constants they describe: a rule retune must reword the
// English (and its five non-Latin fills) in the same change, or this reds.
// The figures are not on the /status wire (recorded as a follow-up), which
// is exactly why the source pin exists: the copy is the client's only
// statement of them.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  strikeSuspensionMs,
  WOC_MARKET_ANTI_SNIPE_CAP_SECONDS,
  WOC_MARKET_ANTI_SNIPE_EXTENSION_SECONDS,
  WOC_MARKET_ANTI_SNIPE_WINDOW_SECONDS,
  WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS,
  WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR,
  WOC_MARKET_BUY_NOW_LOCK_SECONDS,
  WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS,
} from '../server/woc_market_rules';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';

const market = hudChromeStrings.wocMarket;
const DAY_MS = 86_400_000;

describe('marketplace copy names the live rule figures', () => {
  it('bidCloseNote spells the anti-snipe window, extension and cap', () => {
    expect(WOC_MARKET_ANTI_SNIPE_WINDOW_SECONDS).toBe(120);
    expect(WOC_MARKET_ANTI_SNIPE_EXTENSION_SECONDS).toBe(120);
    expect(WOC_MARKET_ANTI_SNIPE_CAP_SECONDS).toBe(1800);
    expect(market.bidCloseNote).toContain('last 2 minutes');
    expect(market.bidCloseNote).toContain('2 minutes after that bid');
    expect(market.bidCloseNote).toContain('30 minutes past the listed end');
  });

  it('buyNowNote spells the hold, the per-listing cooldown and the hourly cap', () => {
    // 270 seconds: "about four and a half minutes" is the honest rounding.
    expect(WOC_MARKET_BUY_NOW_LOCK_SECONDS).toBe(270);
    expect(WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS).toBe(1800);
    expect(WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR).toBe(3);
    expect(WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS).toBe(3600);
    expect(market.buyNowNote).toContain('four and a half minutes');
    expect(market.buyNowNote).toContain('30 minutes');
    expect(market.buyNowNote).toContain('three unpaid Buy Nows within an hour');
  });

  it('strikesTip spells the suspension ladder', () => {
    // No suspension on the first strike, then 3, 14, 90 days, then a year.
    expect(strikeSuspensionMs(1)).toBe(0);
    expect(strikeSuspensionMs(2)).toBe(3 * DAY_MS);
    expect(strikeSuspensionMs(3)).toBe(14 * DAY_MS);
    expect(strikeSuspensionMs(4)).toBe(90 * DAY_MS);
    expect(strikeSuspensionMs(5)).toBe(365 * DAY_MS);
    expect(market.strikesTip).toContain('After the first');
    expect(market.strikesTip).toContain('3 days, then 14, then 90, then a year');
  });

  it('the fee note names no percentage (the schedule is service configuration, off the wire)', () => {
    // A retuned service must not be contradicted by the client's English; the
    // resolved fee for a typed price renders beside the note from the estimate.
    expect(market.sellFeeNote).not.toMatch(/\d+ percent|\d+%/);
    expect(market.sellFeeNote).toContain('shown here');
  });

  it('the pause and suspension banners name every refused action', () => {
    for (const text of [market.pausedBanner, market.activitySuspended]) {
      expect(text).toContain('listings');
      expect(text).toContain('bids');
    }
    expect(market.pausedBanner).not.toContain('pricing');
    expect(market.activitySuspended).toContain('$WOC trades');
  });

  it('the five non-Latin fills carry the same figures as the English source', () => {
    // The header's claim, made real: reading only hudChromeStrings would let a
    // rule retune reword the English and leave a stale figure standing in every
    // fill, which is the one place a player of that locale would read it. The
    // digits survive translation (they are digits in all five), so each fill is
    // checked for the numbers its English twin spells.
    // The expected figures are DERIVED from the English value, never a second
    // hard-coded copy: with a literal list here, a rule retune that updates
    // the constants and the English would leave this test green over five
    // stale fills (each still contains the OLD digit). Deriving means the
    // fills red until they are refilled to match the new English.
    const FILLS: Array<[string, readonly string[]]> = (
      [
        ['hudChrome.wocMarket.bidCloseNote', market.bidCloseNote],
        ['hudChrome.wocMarket.buyNowNote', market.buyNowNote],
        ['hudChrome.wocMarket.strikesTip', market.strikesTip],
      ] as const
    ).map(([key, english]) => {
      const figures = [...new Set(english.match(/\d+/g) ?? [])];
      expect(figures.length, `${key}'s English spells at least one digit figure`).toBeGreaterThan(
        0,
      );
      return [key, figures];
    });
    for (const locale of ['zh_CN', 'zh_TW', 'ja_JP', 'ko_KR', 'ru_RU']) {
      const src = readFileSync(`src/ui/i18n.locales/${locale}.ts`, 'utf8');
      for (const [key, figures] of FILLS) {
        const at = src.indexOf(`'${key}':`);
        expect(at, `${locale} carries a fill for ${key}`).toBeGreaterThan(-1);
        // The value runs to the next quoted key at this indent, which is where
        // the overlay's flat rows end. The end has to be FOUND: for the last
        // row in a file, indexOf returns -1 and slice(at, -1) would hand back
        // the rest of the file, so a figure anywhere later would satisfy the
        // check and the pin would be quietly vacuous.
        const end = src.indexOf("\n  '", at + 1);
        expect(end, `${locale} ${key} is followed by another row`).toBeGreaterThan(at);
        const value = src.slice(at, end);
        for (const figure of figures) {
          expect(value, `${locale} ${key} still spells ${figure}`).toContain(figure);
        }
      }
    }
  });

  it('the capture rigs seed the LOWEST graphics preset before the document loads', () => {
    // The standing capture rule: window shots are evidence about the DOM, and
    // tier 1 is what SwiftShader should pay for on a shared box. graphicsPreset 1
    // is PRESET_LOW; graphicsDefaultApplied keeps the first-run probe from
    // persisting its own tier over the seed. No rig may boot ?gfx=ultra.
    for (const rig of [
      'scripts/woc_market_shot.mjs',
      'scripts/woc_trade_mobile_shot.mjs',
      'scripts/trade_money_shot.mjs',
    ]) {
      const src = readFileSync(rig, 'utf8');
      expect(src, `${rig} seeds the low preset`).toContain('evaluateOnNewDocument');
      expect(src, `${rig} seeds graphicsPreset = 1`).toContain('s.graphicsPreset = 1');
      expect(src, `${rig} pins the default-applied flag`).toContain(
        's.graphicsDefaultApplied = true',
      );
      expect(src, `${rig} must not force a high tier`).not.toContain('gfx=ultra');
    }
  });
});
