// The shared $WOC token spelling (src/ui/woc_tokens_text.ts): every token
// readout (the Exchange, the trade arm, the bag balance chip) prints the same
// digits through the locale-bound formatter. The source pins at the bottom
// keep the callers on it: a surface that hand-formats tokens again is the
// drift this module exists to end (four digits on one face, two on another).

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/ui/i18n';
import { WOC_TOKEN_FRACTION_DIGITS, wocTokensText } from '../src/ui/woc_tokens_text';
import { stripComments } from './helpers/strip_comments';

afterEach(() => {
  setLanguage('en');
});

describe('formatting', () => {
  it('keeps two fraction digits at most and groups thousands in English', () => {
    setLanguage('en');
    expect(WOC_TOKEN_FRACTION_DIGITS).toBe(2);
    expect(wocTokensText(7812.5)).toBe('7,812.5');
    expect(wocTokensText(1234.5678)).toBe('1,234.57');
    expect(wocTokensText(0.004)).toBe('0');
    expect(wocTokensText(78)).toBe('78');
  });

  it('follows the locale grouping and decimal marks', () => {
    setLanguage('de_DE');
    expect(wocTokensText(7812.5)).toBe('7.812,5');
  });
});

describe('every $WOC readout spells its tokens through this module', () => {
  const read = (rel: string) => stripComments(readFileSync(rel, 'utf8'));
  const CALLERS = [
    'src/ui/woc_market_window.ts',
    'src/ui/trade_woc_arm_painter.ts',
    'src/ui/hud/woc_trade/woc_trade_controller.ts',
    'src/ui/woc_balance_chip.ts',
  ];
  it('imports wocTokensText on every token surface, and none re-spells the digits', () => {
    for (const rel of CALLERS) {
      const src = read(rel);
      expect(src, `${rel} must spell tokens through woc_tokens_text`).toContain('wocTokensText');
      // A maximumFractionDigits option beside a token figure is the drift:
      // only the two-digit constant lives in the shared module.
      const hits = src.match(/formatNumber\([^)]*tokens[^)]*maximumFractionDigits/gi) ?? [];
      expect(hits, `${rel} hand-formats a token figure: ${hits.join(' | ')}`).toEqual([]);
    }
  });
});
