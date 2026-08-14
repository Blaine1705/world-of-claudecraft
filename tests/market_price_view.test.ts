import { describe, expect, it } from 'vitest';
import {
  MKT_COPPER_PER_GOLD,
  MKT_COPPER_PER_SILVER,
  marketPriceDisplay,
  marketPriceHtml,
  marketPriceParts,
} from '../src/ui/market_price_view';

const G = MKT_COPPER_PER_GOLD;
const S = MKT_COPPER_PER_SILVER;

describe('marketPriceParts', () => {
  it('splits copper into gold/silver/copper', () => {
    expect(marketPriceParts(138 * G + 60 * S)).toEqual({ gold: 138, silver: 60, copper: 0 });
    expect(marketPriceParts(3 * S + 60)).toEqual({ gold: 0, silver: 3, copper: 60 });
    expect(marketPriceParts(0)).toEqual({ gold: 0, silver: 0, copper: 0 });
  });
  it('floors fractional and clamps negative input', () => {
    expect(marketPriceParts(-5)).toEqual({ gold: 0, silver: 0, copper: 0 });
    expect(marketPriceParts(150.9)).toEqual({ gold: 0, silver: 1, copper: 50 });
  });
});

describe('marketPriceDisplay: single unit, truncated down', () => {
  it('shows the largest denomination present as the single unit', () => {
    expect(marketPriceDisplay(138 * G).unit).toBe('g');
    expect(marketPriceDisplay(10 * S).unit).toBe('s');
    expect(marketPriceDisplay(80).unit).toBe('c');
  });

  it('renders a clean whole price with no fraction (5g, not 5.0g)', () => {
    expect(marketPriceDisplay(5 * G)).toMatchObject({
      whole: '5',
      frac: '',
      unit: 'g',
      tone: 'gold',
    });
    expect(marketPriceDisplay(10 * S)).toMatchObject({
      whole: '10',
      frac: '',
      unit: 's',
      tone: 'silver',
    });
  });

  it('shows one truncated decimal for a mixed price (1g 51s 20c -> 1.5g)', () => {
    // 1.512g truncates to 1.5g: the tenth is floored, never rounded.
    expect(marketPriceDisplay(1 * G + 51 * S + 20)).toMatchObject({
      whole: '1',
      frac: '.5',
      unit: 'g',
    });
    // 10s 50c -> 10.5s
    expect(marketPriceDisplay(10 * S + 50)).toMatchObject({ whole: '10', frac: '.5', unit: 's' });
  });

  it('NEVER rounds a price upward (the shown value is <= the real value)', () => {
    // 38g 60c is 38.006g: the tenth floors to .0, so it shows "38g", not "38.1g".
    expect(marketPriceDisplay(38 * G + 60)).toMatchObject({ whole: '38', frac: '' });
    // 1g 99s 99c is 1.9999g: truncates to 1.9g, never 2.0g.
    expect(marketPriceDisplay(1 * G + 99 * S + 99)).toMatchObject({ whole: '1', frac: '.9' });
    // The six-figure stress case: 48,500g 99s 99c is 48,500.9999g, so it truncates
    // to "48,500.9g" (the floored tenth), never up to 48,501g.
    expect(marketPriceDisplay(48500 * G + 99 * S + 99)).toMatchObject({
      whole: '48,500',
      frac: '.9',
      unit: 'g',
    });
  });

  it('groups the whole part with a thousands separator', () => {
    expect(marketPriceDisplay(999999 * G).whole).toBe('999,999');
  });

  it('copper is whole only (nothing smaller to put after a decimal)', () => {
    expect(marketPriceDisplay(80)).toMatchObject({ whole: '80', frac: '', unit: 'c' });
    expect(marketPriceDisplay(1)).toMatchObject({ whole: '1', frac: '', unit: 'c' });
    expect(marketPriceDisplay(0)).toMatchObject({
      whole: '0',
      frac: '',
      unit: 'c',
      tone: 'copper',
    });
  });

  it('floors fractional and clamps negative copper input', () => {
    expect(marketPriceDisplay(-5)).toMatchObject({ whole: '0', unit: 'c' });
    expect(marketPriceDisplay(5 * G + 0.9)).toMatchObject({ whole: '5', frac: '', unit: 'g' });
  });
});

describe('marketPriceHtml', () => {
  it('renders one single-unit number with its tone class and unit letter', () => {
    const html = marketPriceHtml(138 * G, '138 gold');
    expect(html).toContain('mkt-price-main--gold');
    expect(html).toContain('>138<'); // the whole part
    expect(html).toContain('mkt-price-unit">g<');
  });

  it('shows the truncated decimal in its own frac span (1.5g)', () => {
    const html = marketPriceHtml(1 * G + 51 * S + 20, '1 gold 51 silver 20 copper');
    expect(html).toContain('>1<'); // whole
    expect(html).toContain('mkt-price-frac">.5<'); // truncated tenth
    expect(html).toContain('mkt-price-unit">g<');
  });

  it('emits no frac span for a clean whole price', () => {
    const html = marketPriceHtml(55 * G, '55 gold');
    expect(html).toContain('>55<');
    expect(html).not.toContain('mkt-price-frac');
  });

  it('renders the smallest legal listing (1 copper) as a copper unit', () => {
    // The sim floors every listing at MARKET_MIN_PRICE (1 copper), so a single
    // copper is the true cheapest row the market can paint.
    const html = marketPriceHtml(1, '1 copper');
    expect(html).toContain('mkt-price-main--copper');
    expect(html).toContain('>1<');
    expect(html).toContain('mkt-price-unit">c<');
    expect(html).not.toContain('mkt-price-frac');
  });

  it('renders a zero-total price as 0 copper rather than nothing', () => {
    const html = marketPriceHtml(0, '0 copper');
    expect(html).toContain('mkt-price-main--copper');
    expect(html).toContain('>0<');
  });

  it('carries the caller-localized EXACT amount as the accessible label (the compact number is not lossy)', () => {
    // The visible price truncates to "1.5g" but the aria-label / tooltip keeps the
    // real "1 gold, 51 silver, 20 copper", so a buyer and a screen reader both get
    // the precise figure.
    const html = marketPriceHtml(1 * G + 51 * S + 20, '1 gold, 51 silver, 20 copper');
    expect(html).toContain('aria-label="1 gold, 51 silver, 20 copper"');
    expect(html).toContain('role="text"');
  });

  it('emits no coin-circle markup (color + unit letter carry the denomination)', () => {
    const html = marketPriceHtml(138 * G + 60 * S, 'x');
    expect(html).not.toContain('class="coin ');
  });
});
