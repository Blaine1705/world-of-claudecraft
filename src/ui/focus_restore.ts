// The two mechanical halves of carrying keyboard focus across a full window rebuild.
//
// A painter that wipes its own subtree (`innerHTML = ''`, then a fresh createElement
// pass) destroys every control the player could be standing on. A keyboard player who
// pressed `+` has the button removed from under them and lands on <body>, unable to
// press it again. About a dozen src/ui painters answer that by hand and every copy does
// the same two things: before the wipe, remember WHICH control had focus; after it,
// focus the rebuilt equivalent, skipping any that came back disabled (#2528).
//
// What stays with the CALLER is the interesting half: which fresh control is the
// role-equivalent of the one that had focus, and what to degrade to when that one came
// back disabled. Those ladders are genuinely per-window (mailbox_window prefers the
// quantity input, town_focus_window walks the stepper pair outward before it leaves the
// row) and folding them in here would mean a switch over window identities. So this
// module owns only the parts every copy spells the same way, and the parts a copy can
// get subtly wrong: the activeElement narrowing, the containment check, and the
// disabled skip.
//
// DOM-touching by design (`document.activeElement` and the `instanceof` narrowing), so
// this is NOT a registered pure core and NOT a UI_PAINTER_HELPERS entry either (that
// contract bars `instanceof HTMLElement` outright). It is registered in UI_DOM_MODULES
// in tests/architecture.test.ts, following the src/ui/dialog_root.ts precedent for a
// small DOM-touching micro-pattern lifted out of a dozen painters. Taking the document
// (or the already-read activeElement) as a parameter would keep it out of every list,
// and is deliberately not done: that hands the one line each copy got wrong back to the
// copies.
//
// Deliberately NOT FocusManager's focusability model. That manager's `canFocus` predicate
// is `isConnected && getClientRects().length > 0`, which is both a forced-reflow layout
// read (invisible to the per-file painter gate from in here) and a different question
// from the one the callers ask: they know their candidate is attached, and what they need
// to know is whether the rebuild disabled it. `disabled` it is, exactly as every copy
// spelled it.

/**
 * Anything a caller can hand back focus to. Structural rather than
 * `HTMLButtonElement`, because the two windows this was extracted from already need
 * more than one element type: town_focus_window's ladder is all buttons, but
 * mailbox_window's runs through the parcel's `<input type=number>` quantity field,
 * which is the candidate it most wants to keep. `disabled` is optional so a focusable
 * non-form node (a `tabIndex = 0` chip) is a legal candidate too, and reads as
 * never-disabled.
 */
export interface FocusRestoreCandidate {
  readonly disabled?: boolean;
  focus(): void;
}

/**
 * Remember the identity of the focused control inside `root`, to be handed to the
 * caller's own resolve-and-degrade ladder after the wipe. Returns null when there is
 * nothing to carry, which is the common case: focus is on the world, in another window,
 * or on a control inside `root` that carries no key.
 *
 * `root` is the container that is ABOUT TO BE REBUILT, not necessarily the window root:
 * mailbox_window rebuilds only its `#mail-parcels` list and passes that, so focus
 * elsewhere in the mailbox is correctly left alone.
 *
 * The identity is read off `dataset.focusKey` (`data-focus-key="..."` in markup), ONE
 * flat namespace shared by every window, which is exactly why the containment check
 * lives HERE and not in the caller: mailbox_window keys its parcel steppers
 * `<itemId>:<role>` and town_focus_window keys its allocation steppers
 * `<component>:<role>`, the same shape under the same attribute name. A window that read
 * the key without checking containment would let its own repaint pull focus out of
 * another open window.
 *
 * `instanceof HTMLElement` rather than a cast: `document.activeElement` is typed
 * `Element | null`, and the `dataset` read is only sound on an HTMLElement (an
 * `Element` has no `dataset` at all). focus_manager.ts narrows the same way.
 */
export function captureFocusKey(root: HTMLElement): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (!root.contains(active)) return null;
  return active.dataset.focusKey ?? null;
}

/**
 * Focus the first candidate that is present and not disabled, in the caller's order,
 * and stop there. Focuses nothing when every candidate is absent or disabled.
 *
 * The disabled skip is the load-bearing part, and the reason a bare
 * `candidates[0]?.focus()` will not do: the control the player just activated can
 * legitimately come back DISABLED by the rebuild it caused (stepping the last point off
 * a component disables its `-`, spending the last one disables every `+`), and a
 * disabled control cannot take focus, so a caller that ignored this would silently drop
 * focus to <body> in exactly the case the whole idiom exists for.
 *
 * `null` AND `undefined` are both accepted and skipped, because both spellings of
 * "that control does not exist in the rebuilt tree" are live at the call sites:
 * `querySelector` returns null, a `Map.get` miss and an unset optional field return
 * undefined.
 *
 * A bare `focus()`, deliberately NOT `focus({ preventScroll: true })`, and this is now
 * the ONE place that decision is spelled: every hand-rolled copy already agreed on the
 * bare call, but only town_focus_window recorded why. The reason is that a caller
 * restores its scroll offset before calling here, and `focus()` scrolling its target
 * into view is what lets a DEGRADED target (a rung further down the ladder, which the
 * player may not be looking at) win over that offset. Focus must be visible (WCAG
 * 2.4.11), and the common case cannot conflict: the control being refocused is the one
 * the player was already on, so it is in view and `focus()` scrolls nothing.
 *
 * SYNCHRONOUS on purpose, unlike FocusManager.restore, which defers a tick to win
 * against a browser's own post-close focus move. There is no competing move here: the
 * caller has just finished rebuilding its own subtree, and deferring would let a Tab
 * press in between land on <body>.
 */
export function restoreFirstEnabled(
  candidates: ReadonlyArray<FocusRestoreCandidate | null | undefined>,
): void {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate.disabled) continue;
    candidate.focus();
    return;
  }
}
