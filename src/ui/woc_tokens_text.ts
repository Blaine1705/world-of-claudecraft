// One spelling for a $WOC token figure, everywhere the client prints one.
//
// The Exchange window, the trade window's $WOC arm, and the bag and Claudium
// balance readouts each formatted tokens on their own (two of them at four
// fraction digits, the rest at two), so the same quote read differently
// across two surfaces of one deal. Two fraction digits is the game's $WOC
// balance spelling (bags, Claudium) and the Exchange's; the arm joins it.
// Locale-bound grouping and decimal marks through formatNumber; the caller
// owns the number, nothing economic is derived here (the usd_text.ts twin).
//
// DOM-free (registered in tests/architecture.test.ts UI_PURE_CORES).

import { formatNumber } from './i18n';

/** Fraction digits every $WOC token readout keeps: enough for a rate or a
 *  fee leg at the token's real magnitude, never a nine-decimal base figure. */
export const WOC_TOKEN_FRACTION_DIGITS = 2;

export function wocTokensText(tokens: number): string {
  return formatNumber(tokens, { maximumFractionDigits: WOC_TOKEN_FRACTION_DIGITS });
}
