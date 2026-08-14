// Pure builder for the World Market row price: a single-unit, coinless price
// block built for fast price COMPARISON down a column. DOM-free; returns an HTML
// string the painter drops into the row (the `marketArmorPips` pattern).
//
// Why the market paints its own price instead of the shared moneyHtml:
//  - single-unit     ONE number in the largest denomination present, to one
//                    decimal: "1.5g", "10.5s", "80c". A shopper compares one
//                    magnitude per row instead of parsing "1 51 20", and the
//                    price lane stays narrow so the item NAME keeps its width.
//  - truncate-down   the decimal is TRUNCATED, never rounded up, so the shown
//                    price is never larger than the real one (48,500g 99s 99c
//                    reads "48,500g", 1g 51s 20c reads "1.5g"). The exact,
//                    fully localized amount rides the block's aria-label (and the
//                    row tooltip), so nothing is hidden from a buyer or from
//                    assistive tech: the compact number is a scan aid, the
//                    precise figure is one hover/read away.
//  - coinless        the denomination is carried by the number's COLOR class
//                    (gold/silver/copper) plus a small unit letter, not an 11px
//                    coin circle.
// This is market-scoped ON PURPOSE: it does not touch moneyHtml, so bags, bank,
// vendor, loot and trade keep the shipped coin display.
import { formatNumber } from './i18n';

export const MKT_COPPER_PER_GOLD = 10000;
export const MKT_COPPER_PER_SILVER = 100;

export interface MarketPriceParts {
  gold: number;
  silver: number;
  copper: number;
}

export function marketPriceParts(copper: number): MarketPriceParts {
  const total = Math.max(0, Math.floor(copper));
  return {
    gold: Math.floor(total / MKT_COPPER_PER_GOLD),
    silver: Math.floor((total % MKT_COPPER_PER_GOLD) / MKT_COPPER_PER_SILVER),
    copper: total % MKT_COPPER_PER_SILVER,
  };
}

const num = (n: number): string => formatNumber(n, { maximumFractionDigits: 0 });

export type MarketPriceTone = 'gold' | 'silver' | 'copper';

export interface MarketPriceDisplay {
  /** Integer part of the headline number, already grouped ("48,500", "1"). */
  whole: string;
  /** Truncated one-decimal fraction INCLUDING the dot (".5"), or '' when clean. */
  frac: string;
  /** Unit letter for the chosen denomination. */
  unit: 'g' | 's' | 'c';
  /** Color tone / denomination the number is shown in. */
  tone: MarketPriceTone;
}

/**
 * Reduce a copper total to the single-unit display value: the largest
 * denomination present, truncated to one decimal so the shown price is NEVER
 * greater than the real price.
 *   >= 1 gold   -> gold, one decimal ("1.5g", "48,500g")
 *   >= 1 silver -> silver, one decimal ("10.5s")
 *   else        -> copper, whole ("80c", "0c") — copper is the smallest unit,
 *                  so there is nothing to put after a decimal point.
 */
export function marketPriceDisplay(copper: number): MarketPriceDisplay {
  const total = Math.max(0, Math.floor(copper));
  if (total >= MKT_COPPER_PER_GOLD) {
    // tenths of a gold, TRUNCATED (floor), so we never round a price upward.
    const tenths = Math.floor((total * 10) / MKT_COPPER_PER_GOLD);
    const whole = Math.floor(tenths / 10);
    const f = tenths % 10;
    return { whole: num(whole), frac: f ? `.${f}` : '', unit: 'g', tone: 'gold' };
  }
  if (total >= MKT_COPPER_PER_SILVER) {
    const tenths = Math.floor((total * 10) / MKT_COPPER_PER_SILVER);
    const whole = Math.floor(tenths / 10);
    const f = tenths % 10;
    return { whole: num(whole), frac: f ? `.${f}` : '', unit: 's', tone: 'silver' };
  }
  return { whole: num(total), frac: '', unit: 'c', tone: 'copper' };
}

/**
 * Build the market row's price HTML: one single-unit, truncated-down number.
 * @param copper total price in copper
 * @param ariaLabel the caller's already-localized FULL, exact money string (e.g.
 *   formatMoney(copper, 'long')); becomes the block's accessible name AND the
 *   row's precise figure, so the compact truncated number never hides the real
 *   value from a buyer (tooltip) or a screen reader.
 */
export function marketPriceHtml(copper: number, ariaLabel: string): string {
  const { whole, frac, unit, tone } = marketPriceDisplay(copper);
  const fracHtml = frac ? `<span class="mkt-price-frac">${frac}</span>` : '';
  return (
    `<span class="mkt-price-stack" role="text" aria-label="${ariaLabel}">` +
    `<span class="mkt-price-main mkt-price-main--${tone}">` +
    `<b class="mkt-price-num">${whole}${fracHtml}</b><i class="mkt-price-unit">${unit}</i>` +
    `</span></span>`
  );
}
