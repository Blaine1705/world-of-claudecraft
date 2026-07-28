// Preserve what a player has TYPED across a forced window rebuild.
//
// The `woc:languagechange` fan-out (Hud.refreshLocalizedDynamicUi) forces one
// full repaint of every open window so its t() text lands in the new locale.
// Three of those windows build their text fields with innerHTML and emit them
// empty every time (the calendar's guild-event booking form, the mailbox Send
// tab, the social window's typeahead and guild billboard), so the repaint that
// fixes the language would wipe a half-written letter. Those windows capture the
// live values first, rebuild, and write them back.
//
// This is the same hazard the mailbox already ruled on for a different trigger:
// attaching a parcel used to run the full render and wiped the compose form
// (#1695), which is why stageParcel repaints only the parcels row. A language
// switch cannot narrow that way, since every label in the window is what moved.
//
// KEYED ON THE FIELD'S OWN IDENTITY, its `id` or its `data-field`, never its
// position. A rebuild in another language reorders nothing, but the social
// window's footer markup differs per tab, and an index-keyed restore would put a
// half-typed guild name into the friend field the moment a tab was involved. A
// field carrying neither key is skipped rather than guessed at.
//
// FOCUS IS RESTORED ONLY IF IT WAS ALREADY INSIDE THIS ROOT. The language picker
// lives in the Options window, so at the moment of a switch the player is
// normally focused there; re-focusing a mailbox field would yank the caret out
// from under them. Capturing the caret is still worth it because the two windows
// CAN both be open (opening a window no longer closes its siblings).

/** The `<input>` types whose `.value` is the text a player typed. A checkbox or
 *  radio carries its state in `.checked`, and a file/color/range input has no
 *  draft to lose, so none of them belong in a draft. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'number']);

type DraftField = HTMLInputElement | HTMLTextAreaElement;

/** A window's live text, captured before a rebuild and written back after it. */
export interface FormDraft {
  /** Field key (`#id` or `[data-field="..."]`) to the value it held. */
  readonly values: ReadonlyMap<string, string>;
  /** The key of the field that held focus, or null when focus was elsewhere. */
  readonly focusKey: string | null;
  /** The caret/selection of the focused field, when it exposes one. */
  readonly selection: readonly [start: number, end: number] | null;
}

function isDraftField(el: Element): el is DraftField {
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
}

/** The selector that finds this field again in the rebuilt DOM, or null when it
 *  carries no stable identity to find it by. */
function draftKey(el: DraftField): string | null {
  if (el.id) return `#${el.id}`;
  const field = el.dataset.field;
  return field ? `[data-field="${field}"]` : null;
}

/** `selectionStart`/`setSelectionRange` throw on a number input in Chromium and
 *  Firefox (the spec forbids a selection on a non-text input), and the coin
 *  fields and the calendar's hour field are exactly that. Losing the caret is
 *  acceptable there; throwing out of a language switch is not. */
function readSelection(el: DraftField): readonly [number, number] | null {
  try {
    const { selectionStart, selectionEnd } = el;
    if (selectionStart === null || selectionEnd === null) return null;
    return [selectionStart, selectionEnd];
  } catch {
    return null;
  }
}

/**
 * Snapshot every text field under `root`, plus the caret, if focus is currently
 * inside `root`.
 */
export function captureFormDraft(root: ParentNode): FormDraft {
  const values = new Map<string, string>();
  const active = typeof document === 'undefined' ? null : document.activeElement;
  let focusKey: string | null = null;
  let selection: readonly [number, number] | null = null;
  for (const el of root.querySelectorAll('input, textarea')) {
    if (!isDraftField(el)) continue;
    const key = draftKey(el);
    // First writer wins: a duplicate id restores through one querySelector
    // anyway, so recording the later one would write the wrong value back.
    if (key === null || values.has(key)) continue;
    values.set(key, el.value);
    if (el === active) {
      focusKey = key;
      selection = readSelection(el);
    }
  }
  return { values, focusKey, selection };
}

/**
 * Write a captured draft back into the rebuilt DOM. Fields the rebuild dropped
 * (a tab switched, a form went read-only) are skipped, never recreated.
 */
export function restoreFormDraft(root: ParentNode, draft: FormDraft): void {
  for (const [key, value] of draft.values) {
    const el = root.querySelector(key);
    if (el && isDraftField(el)) el.value = value;
  }
  if (draft.focusKey === null) return;
  const target = root.querySelector(draft.focusKey);
  if (!target || !isDraftField(target)) return;
  target.focus();
  if (draft.selection === null) return;
  try {
    target.setSelectionRange(draft.selection[0], draft.selection[1]);
  } catch {
    // A number input refuses a selection range; the value is already restored.
  }
}
