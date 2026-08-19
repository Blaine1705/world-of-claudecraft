// stale_chrome_focus.ts: which focused element counts as stale HUD chrome when
// a blocking surface owns the keyboard (the Layer 2 guard input.ts runs in its
// blocked-state path). Plain-Node suite over hand-rolled fakes modeling only
// the contract: BUTTON tag, and containment in a dialog root
// ([role="dialog"] / [aria-modal="true"]).

import { describe, expect, it } from 'vitest';
import { isStaleChromeButton } from '../src/game/stale_chrome_focus';

const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"]';

function el(
  tagName: string,
  insideDialog: boolean,
): {
  tagName: string;
  closest(selector: string): unknown;
} {
  return {
    tagName,
    closest: (selector: string) => (insideDialog && selector === DIALOG_SELECTOR ? {} : null),
  };
}

describe('isStaleChromeButton', () => {
  it('flags a focused button outside every dialog root (the stale micromenu case)', () => {
    expect(isStaleChromeButton(el('BUTTON', false))).toBe(true);
  });

  it('spares a button inside a dialog root (prompt dialogs, options window, player card)', () => {
    expect(isStaleChromeButton(el('BUTTON', true))).toBe(false);
  });

  it('spares non-button focus targets: native Space activation only applies to buttons', () => {
    expect(isStaleChromeButton(el('INPUT', false))).toBe(false);
    expect(isStaleChromeButton(el('DIV', false))).toBe(false);
    expect(isStaleChromeButton(el('BODY', false))).toBe(false);
  });

  it('spares a missing active element', () => {
    expect(isStaleChromeButton(null)).toBe(false);
    expect(isStaleChromeButton(undefined)).toBe(false);
  });
});
