// One-call composition for the character-select read-only $WOC Exchange
// panel (src/ui/charselect_woc_market_panel.ts, docs/prd/woc/marketplace.md
// "Character-select browsing"): gates on the SAME platform capability the
// real Exchange uses (wocMarketAttachAllowed, the sibling woc_market_wiring.ts
// this file mirrors) so the browse-only surface never appears on a shell
// where the money-moving Exchange itself would stay fail-closed, then builds
// a plain WocMarketClient off the account's REST session and reveals the
// char-select launcher.
//
// Deliberately NOT a reuse of attachWocMarketExchange: that composition
// builds the two wallet SIGNERS (desktop hand-off + in-renderer wallet) and
// needs `online.characterId`, neither of which exists before a character has
// entered the world. This is the read-only half only: no signer, no
// characterId, no wallet-linked check. src/main.ts calls this once from its
// character-select setup, independent of (and before) the online entry point
// that calls attachWocMarketExchange.

import { WocMarketClient } from '../net/woc_market_sdk';
import type { CharselectMarketClient } from '../ui/charselect_woc_market_panel';
import {
  defaultWocMarketShell,
  type WocMarketShell,
  wocMarketAttachAllowed,
} from './woc_market_wiring';

export interface CharselectWocMarketWiringDeps {
  /** Hand the built client to the char-select panel and reveal its launcher
   *  (src/main.ts wires this to CharselectWocMarketPanel's attach point). */
  attach(client: CharselectMarketClient): void;
  /** The live REST session: `token` is read at request time, `base` once. */
  api: { readonly token: string | null; readonly base: string };
}

/** Resolves to whether the read-only panel attached. */
export async function attachCharselectWocMarket(
  deps: CharselectWocMarketWiringDeps,
  shell: WocMarketShell = defaultWocMarketShell(),
): Promise<boolean> {
  if (!(await wocMarketAttachAllowed(shell))) return false;
  deps.attach(new WocMarketClient({ token: () => deps.api.token, base: deps.api.base }));
  return true;
}
