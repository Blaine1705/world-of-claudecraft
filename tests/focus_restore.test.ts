// @vitest-environment jsdom
//
// The shared rebuild-refocus helper (#2528), extracted from about ten hand-rolled
// copies in src/ui. Two halves, tested here against the shapes the real callers hand
// it rather than against invented ones:
//
//  - captureFocusKey: the activeElement narrowing, the containment check, and the
//    dataset read. The containment check is the acceptance criterion of the extraction:
//    mailbox_window and town_focus_window key their steppers under the SAME
//    `data-focus-key` attribute in the same `<id>:<role>` shape, so ONE flat namespace
//    is shared across windows and a copy that forgot the check would let its own
//    repaint pull focus out of the other window. That is what the cross-window case
//    below plants.
//  - restoreFirstEnabled: the walk and the disabled skip. Every rung the two migrated
//    callers actually pass is represented: a button (both), an `<input type=number>`
//    (mailbox's quantity field), a `null` hole (town focus's `querySelector` miss) and
//    an `undefined` one (mailbox's `Map.get` / optional-field miss).
//
// jsdom rather than the fake-element harness tests/dialog_root.test.ts uses:
// captureFocusKey's whole job is `document.activeElement` plus a real
// `instanceof HTMLElement`, and a fake document cannot pin either.

import { afterEach, describe, expect, it } from 'vitest';
import { captureFocusKey, restoreFirstEnabled } from '../src/ui/focus_restore';

afterEach(() => {
  document.body.innerHTML = '';
  restoreActiveElement();
});

/** A window root holding one keyed, focusable button. */
function windowWithKeyedButton(key: string): { root: HTMLElement; btn: HTMLButtonElement } {
  const root = document.createElement('div');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.focusKey = key;
  root.appendChild(btn);
  document.body.appendChild(root);
  return { root, btn };
}

// Overriding document.activeElement is the only way to reach the non-HTMLElement
// branch: jsdom will not put focus on an element that has no focus() of its own, and
// the point of the branch is precisely an activeElement the DOM handed back that is not
// an HTMLElement. Restored after every test so no later case inherits the stub.
let activeElementStubbed = false;
function stubActiveElement(value: Element | null): void {
  Object.defineProperty(document, 'activeElement', { get: () => value, configurable: true });
  activeElementStubbed = true;
}
function restoreActiveElement(): void {
  if (!activeElementStubbed) return;
  activeElementStubbed = false;
  // The own property has to be GONE, not undefined, or the native prototype getter
  // stays shadowed and every later case reads `undefined` as its activeElement.
  delete (document as unknown as Record<string, unknown>).activeElement;
}

/** A candidate that records its focus() calls, for the order and stop-at-first pins. */
function fakeCandidate(disabled?: boolean): { disabled?: boolean; focus(): void; calls: number } {
  return {
    disabled,
    calls: 0,
    focus() {
      this.calls++;
    },
  };
}

describe('captureFocusKey', () => {
  it('carries the key of the focused control inside the root', () => {
    const { root, btn } = windowWithKeyedButton('mail_wolf_fang:plus');
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(captureFocusKey(root)).toBe('mail_wolf_fang:plus');
  });

  it('refuses a keyed control in ANOTHER window, even with the identical key', () => {
    // The extraction's acceptance criterion. Two windows, one shared key namespace:
    // the mailbox parcel stepper and the town focus stepper really are both
    // `<id>:<role>` under `data-focus-key`. Focus is in window B; window A repaints.
    // A returns null, so A's ladder never runs and focus stays where the player put
    // it. Note the key is the SAME string in both, which is what makes this a refusal
    // by CONTAINMENT and not by key mismatch.
    const a = windowWithKeyedButton('hide:inc');
    const b = windowWithKeyedButton('hide:inc');
    b.btn.focus();
    expect(captureFocusKey(a.root)).toBeNull();
    // ...and the window that DOES contain it still gets it, so the refusal above is
    // not simply "this helper never returns anything in a two-window document".
    expect(captureFocusKey(b.root)).toBe('hide:inc');
  });

  it('carries nothing when the focused control inside the root has no key', () => {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    root.appendChild(btn);
    document.body.appendChild(root);
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(captureFocusKey(root)).toBeNull();
  });

  it('carries nothing when focus is on <body> (nothing in the window was focused)', () => {
    const { root } = windowWithKeyedButton('save');
    expect(document.activeElement).toBe(document.body);
    expect(captureFocusKey(root)).toBeNull();
  });

  it('carries nothing when activeElement is null, as WebKit can report', () => {
    const { root } = windowWithKeyedButton('save');
    stubActiveElement(null);
    expect(captureFocusKey(root)).toBeNull();
  });

  it('carries nothing from a non-HTMLElement, even one inside the root carrying a key', () => {
    // The narrowing, and the one case a plain `as HTMLElement` cast (what most of the
    // hand-rolled copies did, mailbox_window included) got wrong: an SVGElement is
    // contained, is not an HTMLElement, and still answers `dataset`. So the cast would
    // read a key here and the ladder would run off it.
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-focus-key', 'wolf_fang:remove');
    root.appendChild(svg);
    document.body.appendChild(root);
    // Proof the case is the one described: contained, keyed, and NOT an HTMLElement.
    expect(root.contains(svg)).toBe(true);
    expect(svg.getAttribute('data-focus-key')).toBe('wolf_fang:remove');
    expect(svg instanceof HTMLElement).toBe(false);
    stubActiveElement(svg);
    expect(captureFocusKey(root)).toBeNull();
  });
});

describe('restoreFirstEnabled', () => {
  it('focuses the first candidate when it is enabled', () => {
    const { btn } = windowWithKeyedButton('a');
    restoreFirstEnabled([btn]);
    expect(document.activeElement).toBe(btn);
  });

  it('skips a candidate that came back DISABLED and takes the next one', () => {
    // The whole reason a bare `candidates[0]?.focus()` will not do: the control the
    // player just activated is exactly the one the rebuild can disable.
    const first = windowWithKeyedButton('inc').btn;
    const second = windowWithKeyedButton('dec').btn;
    first.disabled = true;
    restoreFirstEnabled([first, second]);
    expect(document.activeElement).toBe(second);
  });

  it('skips null AND undefined holes, both of which the real callers pass', () => {
    const btn = windowWithKeyedButton('save').btn;
    restoreFirstEnabled([null, undefined, btn]);
    expect(document.activeElement).toBe(btn);
  });

  it('focuses an <input>, the rung mailbox_window most wants to keep', () => {
    // Not every candidate is a button: mailbox's ladder falls back to the parcel's
    // typed quantity field, because a number input fires `change` WITHOUT blurring,
    // so the repaint runs while the input is focused.
    const root = document.createElement('div');
    const qty = document.createElement('input');
    qty.type = 'number';
    root.appendChild(qty);
    document.body.appendChild(root);
    restoreFirstEnabled([qty]);
    expect(document.activeElement).toBe(qty);
  });

  it('treats a candidate with no `disabled` property at all as enabled', () => {
    // A focusable non-form node (mailbox's tabIndex = 0 item-name chip) reads
    // `disabled === undefined`, which must not be mistaken for disabled.
    const root = document.createElement('div');
    const chip = document.createElement('span');
    chip.tabIndex = 0;
    root.appendChild(chip);
    document.body.appendChild(root);
    expect((chip as unknown as { disabled?: boolean }).disabled).toBeUndefined();
    restoreFirstEnabled([chip]);
    expect(document.activeElement).toBe(chip);
  });

  it('focuses NOBODY when every candidate is absent or disabled', () => {
    const disabled = windowWithKeyedButton('inc').btn;
    disabled.disabled = true;
    restoreFirstEnabled([null, disabled, undefined]);
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses nothing at all on an empty candidate list', () => {
    restoreFirstEnabled([]);
    expect(document.activeElement).toBe(document.body);
  });

  it('stops at the first enabled candidate and never touches a later one', () => {
    // Order is the caller's degradation ladder, so "first" has to mean first and the
    // walk has to stop: focusing every candidate would leave the player on the LAST
    // rung (Close) instead of the one their key resolved to.
    const first = fakeCandidate();
    const second = fakeCandidate();
    restoreFirstEnabled([first, second]);
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(0);
  });

  it('walks the ladder in the given order, skipping only the disabled rungs', () => {
    const rungs = [fakeCandidate(true), fakeCandidate(true), fakeCandidate(), fakeCandidate()];
    restoreFirstEnabled(rungs);
    expect(rungs.map((r) => r.calls)).toEqual([0, 0, 1, 0]);
  });
});
