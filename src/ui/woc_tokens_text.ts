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

/** Digits a figure too small to show at the standard precision falls back to,
 *  so a real amount never prints as a flat zero. */
export const WOC_TOKEN_SMALL_FRACTION_DIGITS = 6;

export function wocTokensText(tokens: number): string {
  // A NON-ZERO amount must never render as "0": at two digits a fee leg under
  // half a hundredth of a token (a burn leg once $WOC is worth enough) rounds
  // flat, and a player reading a quote's legs would see a zero the server never
  // sent. Below that threshold the figure keeps enough digits to stay true; at
  // and above it, every surface shares the one two-digit spelling.
  const small = tokens !== 0 && Math.abs(tokens) < 0.5 * 10 ** -WOC_TOKEN_FRACTION_DIGITS;
  return formatNumber(tokens, {
    maximumFractionDigits: small ? WOC_TOKEN_SMALL_FRACTION_DIGITS : WOC_TOKEN_FRACTION_DIGITS,
  });
}
