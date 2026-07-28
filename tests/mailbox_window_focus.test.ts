// @vitest-environment jsdom
//
// The mailbox parcel list's rebuild-refocus ladder, behaviorally.
//
// renderParcels is a full wipe of #mail-parcels, and a +/- click is what triggers it, so
// a keyboard player who pressed + had the button destroyed under them mid-adjustment.
// The window has carried focus across that wipe since #1444, but only through source
// pins in tests/mailbox_window.test.ts (that the focus keys are written at all), never
// behaviorally. #2528 moved the two mechanical halves of the idiom into
// src/ui/focus_restore.ts, and a source pin cannot tell whether that migration preserved
// the LADDER, which is the part the window still owns. So this drives the real
// MailboxWindow through the real stepper buttons, on the tests/mailbox_compose_preserved
// harness, and asserts where focus actually lands.
//
// The rungs, in the window's order: the same control, then the quantity input, then `-`,
// then `+`, then Remove. Each case below lands on a different one.

import { afterEach, describe, expect, it } from 'vitest';
import type { InvSlot } from '../src/sim/types';
import { MailboxWindow, type MailboxWindowDeps } from '../src/ui/mailbox_window';
import type { IWorld } from '../src/world_api';

afterEach(() => {
  document.body.innerHTML = '';
});

function fakeWorld(inventory: InvSlot[]): IWorld {
  return {
    inventory,
    mailInfo: { unread: 0, messages: [], postage: 30, maxAttachments: 3, deliverySeconds: 60 },
    mailMarkRead: () => {},
  } as unknown as IWorld;
}

/** A real MailboxWindow on the Send tab with `itemId` staged as a parcel. */
function stagedParcel(itemId: string, owned: number): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const noop = (): void => {};
  const deps: MailboxWindowDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () => fakeWorld([{ itemId, count: owned }]),
    closeOthers: noop,
    hideTooltip: noop,
    captureFocus: () => null,
    restoreFocus: noop,
    showError: noop,
    syncBags: noop,
  };
  const win = new MailboxWindow(deps);
  win.open();
  (root.querySelector('[data-tab="send"]') as HTMLElement).click();
  win.stageParcel(itemId);
  return root;
}

const FANG = 'wolf_fang';
const control = <T extends HTMLElement>(root: HTMLElement, role: string): T =>
  root.querySelector<T>(`[data-focus-key="${FANG}:${role}"]`) as T;

describe('the mailbox parcel list carries keyboard focus across its own rebuild', () => {
  it('hands focus back to the rebuilt equivalent of the stepper that was pressed', () => {
    // Owned 4, staged at 4, so pressing `-` goes 4 -> 3 and `-` is still enabled on the
    // way back: the plain case, and the one that reds if the capture is dropped.
    const root = stagedParcel(FANG, 4);
    const minus = control<HTMLButtonElement>(root, 'minus');
    minus.focus();
    minus.click();
    const rebuilt = control<HTMLButtonElement>(root, 'minus');
    expect(rebuilt).not.toBe(minus); // really a fresh node, so this is a rebuild
    expect(rebuilt.disabled).toBe(false);
    expect(document.activeElement).toBe(rebuilt);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('degrades to the quantity input when the pressed stepper comes back DISABLED', () => {
    // Owned 2, staged at 2: pressing `-` drops the count to 1, which is the floor, so
    // the rebuilt `-` is disabled and cannot take focus. The qty input is the next rung
    // and the one that matters most: a number input fires `change` WITHOUT blurring, so
    // falling through to Remove instead would turn the player's next Enter into
    // deleting the parcel mid-adjustment.
    const root = stagedParcel(FANG, 2);
    control<HTMLButtonElement>(root, 'minus').focus();
    control<HTMLButtonElement>(root, 'minus').click();
    expect(control<HTMLButtonElement>(root, 'minus').disabled).toBe(true);
    expect(document.activeElement).toBe(control<HTMLInputElement>(root, 'qty'));
  });

  it('keeps the quantity input when the typed field had focus', () => {
    const root = stagedParcel(FANG, 4);
    const qty = control<HTMLInputElement>(root, 'qty');
    qty.focus();
    qty.value = '2';
    qty.dispatchEvent(new Event('change'));
    const rebuilt = control<HTMLInputElement>(root, 'qty');
    expect(rebuilt).not.toBe(qty);
    expect(rebuilt.value).toBe('2');
    expect(document.activeElement).toBe(rebuilt);
  });

  it('takes focus from NOBODY when the player was not in the parcel list', () => {
    // The containment check, in the real window. Focus sits on the compose recipient
    // field, outside #mail-parcels; a parcel repaint must leave it there.
    const root = stagedParcel(FANG, 4);
    const to = root.querySelector<HTMLInputElement>('#mail-to') as HTMLInputElement;
    to.focus();
    control<HTMLButtonElement>(root, 'plus').click();
    expect(document.activeElement).toBe(to);
  });

  it('never reads a focus key off a control OUTSIDE the window', () => {
    // The shared namespace hazard the extraction is about: town_focus_window keys its
    // allocation steppers with the SAME data-focus-key attribute in the same
    // <id>:<role> shape. Plant one of those outside the mailbox, focus it, and repaint:
    // the parcel list must not pull focus into itself.
    const root = stagedParcel(FANG, 4);
    const outside = document.createElement('button');
    outside.dataset.focusKey = `${FANG}:plus`;
    document.body.appendChild(outside);
    outside.focus();
    control<HTMLButtonElement>(root, 'plus').click();
    expect(document.activeElement).toBe(outside);
  });
});
