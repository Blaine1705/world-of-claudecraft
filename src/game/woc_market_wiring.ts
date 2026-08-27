// One-call composition of the $WOC Exchange attach (docs/prd/woc/marketplace.md):
// browser web plus the WEBSITE-distributed Electron desktop shell. Steam and
// Epic desktop builds and Capacitor native stay fail-closed (tradeable-token
// UI is against both stores' terms), and so does any desktop shell that
// cannot prove the website distribution: the shell's main process answers the
// wocExchangeSupported probe from its packaged stamp, so a missing bridge, a
// missing method (an older shell), an absent or unknown stamp, or a probe
// failure all deny. The server additionally answers woc_market.disabled until
// WOC_MARKET_ENABLED=1. src/main.ts calls this once from its online entry
// (main.ts is a firewall, not a home), and the shell flags default to the
// live NATIVE_APP / DESKTOP_APP constants plus the live desktop bridge while
// staying injectable so the gate is unit-testable without a Capacitor or
// Electron host.
import { DESKTOP_APP, NATIVE_APP } from '../client_origin';
import { WocMarketClient } from '../net/woc_market_sdk';
import { desktopBridge } from '../runtime';
import type { WocMarketHooks } from '../ui/woc_market_window';

/** The one desktop-bridge probe the gate reads (src/runtime.ts DesktopBridge). */
export interface WocMarketShellBridge {
  wocExchangeSupported?(): Promise<boolean>;
}

export interface WocMarketShell {
  nativeApp: boolean;
  desktopApp: boolean;
  /** The desktop shell bridge, or null outside the desktop shell. */
  bridge: WocMarketShellBridge | null;
}

export interface WocMarketWiringDeps {
  hud: { attachWocMarket(hooks: WocMarketHooks): void };
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

/** True for browser web, and for a desktop shell whose main process proves the
 *  website distribution; every other shell (Capacitor native, Steam, Epic, a
 *  desktop shell whose probe is absent, false, or failing) stays fail-closed. */
export async function wocMarketAttachAllowed(shell: WocMarketShell): Promise<boolean> {
  if (shell.nativeApp) return false;
  if (!shell.desktopApp) return true;
  try {
    return (await shell.bridge?.wocExchangeSupported?.()) === true;
  } catch {
    return false;
  }
}

/** Attach the $WOC Exchange hooks on browser web and website-distributed
 *  desktop only. Resolves to whether it attached. */
export async function attachWocMarketExchange(
  deps: WocMarketWiringDeps,
  shell: WocMarketShell = {
    nativeApp: NATIVE_APP,
    desktopApp: DESKTOP_APP,
    bridge: desktopBridge(),
  },
): Promise<boolean> {
  if (!(await wocMarketAttachAllowed(shell))) return false;
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
