// The wallet-bridge failure classifier (src/ui/wallet_bridge_reason_text.ts):
// raw bridge/provider English must never render on a money surface, so every
// classification arm gets a behavioral case, and the byte-exact message map
// gets a DRIFT PIN against the bridge sources: a reworded bridge string with
// no map update would silently strand its mapping on the generic arm.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { t } from '../src/ui/i18n';
import {
  claudiumCheckoutErrorText,
  WALLET_BRIDGE_MESSAGE_REASONS,
  walletBridgeErrorText,
  walletBridgeReason,
} from '../src/ui/wallet_bridge_reason_text';

describe('classification', () => {
  it('classifies the two cancel NAMES structurally, whatever the message says', () => {
    for (const name of ['WalletSelectionCancelled', 'WalletConnectionCancelled']) {
      const err = new Error('anything at all');
      err.name = name;
      expect(walletBridgeReason(err), name).toBe('cancelled');
    }
  });

  it('classifies every bridge-authored message in the map', () => {
    for (const [message, reason] of Object.entries(WALLET_BRIDGE_MESSAGE_REASONS)) {
      expect(walletBridgeReason(new Error(message)), message).toBe(reason);
    }
  });

  it("classifies the deeplink's missing-field family by prefix", () => {
    expect(walletBridgeReason(new Error('wallet response is missing nonce'))).toBe('bad_response');
    expect(walletBridgeReason(new Error('wallet response is missing session'))).toBe(
      'bad_response',
    );
  });

  it('reads unambiguous provider decline prose as a cancel (the Phantom shape)', () => {
    expect(walletBridgeReason(new Error('User rejected the request.'))).toBe('cancelled');
    expect(walletBridgeReason(new Error('Transaction was declined by user'))).toBe('cancelled');
  });

  it('answers unknown for everything else, including non-Errors and empties', () => {
    expect(walletBridgeReason(new Error('some provider diagnostic'))).toBe('unknown');
    expect(walletBridgeReason(new Error(''))).toBe('unknown');
    expect(walletBridgeReason(undefined)).toBe('unknown');
    expect(walletBridgeReason({ message: 'not an Error instance' })).toBe('unknown');
  });
});

describe('resolution', () => {
  it('every classified reason resolves to its catalog line, never the raw message', () => {
    const cases: Array<[string, string]> = [
      ['wallet app did not return in time', t('hudChrome.walletBridge.timeout')],
      ['connect a wallet first', t('hudChrome.walletBridge.notConnected')],
      ['wallet cannot sign and send transactions', t('hudChrome.walletBridge.unsupported')],
      ['wallet is not available', t('hudChrome.walletBridge.unavailable')],
      ['wallet returned an invalid signature', t('hudChrome.walletBridge.badResponse')],
      ['wallet selection cancelled', t('hudChrome.walletBridge.cancelled')],
    ];
    for (const [message, expected] of cases) {
      const line = walletBridgeErrorText(new Error(message), 'sign');
      expect(line, message).toBe(expected);
      expect(line, message).not.toContain(message);
    }
  });

  it('the generic arm is FLAVORED: a failed signature never says payment', () => {
    const err = new Error('some provider diagnostic');
    expect(walletBridgeErrorText(err, 'sign')).toBe(t('hudChrome.wocMarket.signFailedConfirm'));
    expect(walletBridgeErrorText(err, 'payment')).toBe(t('hudChrome.wocMarket.signFailed'));
    expect(walletBridgeErrorText(err, 'sign')).not.toContain('payment');
  });
});

describe('the Claudium checkout channel', () => {
  it('keeps the two store-flavored classes, classifies the rest of the bridge set', () => {
    expect(claudiumCheckoutErrorText(new Error('connect a wallet first'))).toBe(
      t('hudChrome.claudium.checkoutWalletRequired'),
    );
    expect(claudiumCheckoutErrorText(new Error('wallet cannot sign and send transactions'))).toBe(
      t('hudChrome.claudium.checkoutWalletUnsupported'),
    );
    expect(claudiumCheckoutErrorText(new Error('wallet app did not return in time'))).toBe(
      t('hudChrome.walletBridge.timeout'),
    );
  });

  it('passes an UNKNOWN message through: the channel mixes in the checkout own t() throws', () => {
    const localized = t('hudChrome.claudium.checkoutNotSettled');
    expect(claudiumCheckoutErrorText(new Error(localized))).toBe(localized);
    expect(claudiumCheckoutErrorText(new Error(''))).toBe(t('hudChrome.claudium.checkoutFailed'));
  });
});

describe('the drift pin: every mapped literal exists verbatim in a bridge source', () => {
  // The map is a byte-exact contract with the bridge's own throw sites; a
  // bridge reword must update the map in the same change or the mapping is
  // stranded prose that classifies nothing.
  const sources = [
    'src/net/wallet.ts',
    'src/net/mobile_wallet_deeplink.ts',
    'src/net/wallet_connect.ts',
    'src/net/native_solana_mobile.ts',
    // The launcher modal's rejections propagate through the deeplink request.
    'src/ui/mobile_wallet_launcher.ts',
  ];
  const corpus = sources.map((p) => readFileSync(p, 'utf8')).join('\n');

  it('finds each mapped message in the bridge corpus', () => {
    for (const message of Object.keys(WALLET_BRIDGE_MESSAGE_REASONS)) {
      expect(corpus.includes(`'${message}'`), `stranded mapping: ${message}`).toBe(true);
    }
  });

  it('positive control: a fabricated message is NOT in the corpus', () => {
    expect(corpus.includes("'wallet grew legs and left'")).toBe(false);
  });

  it('the missing-field prefix family exists at its throw site', () => {
    expect(corpus).toContain('wallet response is missing ${');
  });
});
