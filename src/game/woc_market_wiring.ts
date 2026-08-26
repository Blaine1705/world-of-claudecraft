// One-call composition of the $WOC Exchange attach (docs/prd/woc/marketplace.md):
// browser web ONLY. Electron desktop, Steam, and Capacitor native stay
// fail-closed, tighter than the wallet-link gate, per the PRD's browser-only
// scope; the server additionally answers woc_market.disabled until
// WOC_MARKET_ENABLED=1. src/main.ts calls this once from its online entry
// (main.ts is a firewall, not a home), and the shell flags default to the live
// NATIVE_APP / DESKTOP_APP constants while staying injectable so the gate is
// unit-testable without a Capacitor or Electron host.
//
// A wrapped DESKTOP shell (Electron, Steam, the packaged website build) still
// gets a launcher: attachWocMarketBrowserOnlyNotice reveals the SAME menu icon
// wired to the browser hand-off (src/ui/woc_market_link.ts) instead of
// leaving it silently hidden, which used to read as a missing feature rather
// than an out-of-scope one. Capacitor NATIVE (iOS/Android) gets neither the
// real Exchange nor the hand-off notice and stays exactly as silent as
// before: steering a mobile-app-store build to an external real-money
// marketplace is the anti-steering shape those stores restrict, and the
// PRD's counsel-gated scope (docs/prd/woc/marketplace.md "Platforms, realms,
// configuration") has not signed off on that. No Exchange UI, wallet code, or
// trading flow attaches on either wrapped-shell path.
import { DESKTOP_APP, NATIVE_APP } from '../client_origin';
import { WocMarketClient } from '../net/woc_market_sdk';
import type { WocMarketHooks } from '../ui/woc_market_window';

export interface WocMarketShell {
  nativeApp: boolean;
  desktopApp: boolean;
}

export interface WocMarketWiringDeps {
  hud: {
    attachWocMarket(hooks: WocMarketHooks): void;
    /** Reveal the launcher on a wrapped DESKTOP shell, wired to the browser hand-off. */
    attachWocMarketBrowserOnlyNotice(): void;
  };
  /** The live REST session: `token` is read at request time, `base` once. */
  api: { readonly token: string | null; readonly base: string };
  online: { readonly characterId: number };
  wallet: {
    linkedPubkey(): string | null;
    /** The lazily loaded wallet bridge (src/net/wallet.ts), loaded on first sign. */
    load(): Promise<{
      signAndSendTransactionBase64(transactionBase64: string): Promise<string>;
      signMessageBase58(message: string): Promise<string>;
    }>;
  };
}

/** True only for the plain browser web build; every wrapped shell stays fail-closed. */
export function wocMarketAttachAllowed(shell: WocMarketShell): boolean {
  return !shell.nativeApp && !shell.desktopApp;
}

/** True for a wrapped DESKTOP shell only (Electron, Steam, the packaged
 *  website build): the platform the reported bug covers. Capacitor native
 *  (iOS/Android) gets neither the real Exchange NOR this hand-off launcher
 *  (see the module header); a shell that is somehow both stays on the
 *  conservative, fully-silent native side. */
export function wocMarketBrowserHandoffAllowed(shell: WocMarketShell): boolean {
  return shell.desktopApp && !shell.nativeApp;
}

/** Attach the $WOC Exchange hooks on browser web; reveal the browser-hand-off
 *  launcher on a wrapped DESKTOP shell only. Returns whether the real
 *  Exchange attached. */
export function attachWocMarketExchange(
  deps: WocMarketWiringDeps,
  shell: WocMarketShell = { nativeApp: NATIVE_APP, desktopApp: DESKTOP_APP },
): boolean {
  if (!wocMarketAttachAllowed(shell)) {
    if (wocMarketBrowserHandoffAllowed(shell)) deps.hud.attachWocMarketBrowserOnlyNotice();
    return false;
  }
  const { api, online, wallet } = deps;
  deps.hud.attachWocMarket({
    client: new WocMarketClient({ token: () => api.token, base: api.base }),
    characterId: () => online.characterId,
    walletLinked: () => wallet.linkedPubkey() !== null,
    signAndSendTransactionBase64: async (transactionBase64) =>
      (await wallet.load()).signAndSendTransactionBase64(transactionBase64),
    // The step-up prompt's signer (B6/R1): same lazy bridge, loaded on first
    // sign, so attaching the Exchange still costs no wallet code.
    signMessageBase58: async (message) => (await wallet.load()).signMessageBase58(message),
  });
  return true;
}
