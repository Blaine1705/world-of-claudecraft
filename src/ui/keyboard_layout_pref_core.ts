// The persisted keyboard size the Key Bindings panel's keyboard overview draws
// (full size, tenkeyless, 75%, 60%) and which legends it prints when the OS
// layout is not QWERTY (that layout's characters, or the QWERTY caps that are
// physically on the board). A tiny DOM-free, deterministic state helper
// (the guild_hide_offline.ts shape): the localStorage key plus load/save, driven
// over an injected Storage in Node tests. Registered in
// tests/architecture.test.ts UI_PURE_CORES; both keys are listed by literal in
// the full settings export allowlist (settings_transfer_core.ts FULL_KEYS).
//
// A browser cannot tell what physical keyboard is plugged in (key events carry
// only codes), so the player picks the form factor once and the overview hides
// the blocks that board does not have.

import { isKeyboardLayoutId, type KeyboardLayoutId } from './keyboard_layout_convert_core';
import type { KeyboardFormFactor, KeyboardLegendSource } from './keyboard_map_core';
import { KEYBOARD_FORM_FACTORS, KEYBOARD_LEGEND_SOURCES } from './keyboard_map_core';
import { safeLocalStorage } from './safe_local_storage';

export const KEYBOARD_LAYOUT_STORE_KEY = 'woc_keyboard_layout';
export const KEYBOARD_LEGENDS_STORE_KEY = 'woc_keyboard_legends';
const DEFAULT_FORM_FACTOR: KeyboardFormFactor = 'full';
/** The OS layout's own characters, since that is what the player types. */
const DEFAULT_LEGEND_SOURCE: KeyboardLegendSource = 'layout';

/** Read the persisted form factor; full size when unset, unknown, or unreadable. */
export function loadKeyboardFormFactor(
  storage: Pick<Storage, 'getItem'> | null = safeLocalStorage(),
): KeyboardFormFactor {
  if (!storage) return DEFAULT_FORM_FACTOR;
  try {
    const raw = storage.getItem(KEYBOARD_LAYOUT_STORE_KEY);
    return KEYBOARD_FORM_FACTORS.some((f) => f.id === raw)
      ? (raw as KeyboardFormFactor)
      : DEFAULT_FORM_FACTOR;
  } catch {
    return DEFAULT_FORM_FACTOR;
  }
}

/** Persist the form factor; silently no-ops when storage is unavailable. */
export function saveKeyboardFormFactor(
  formFactor: KeyboardFormFactor,
  storage: Pick<Storage, 'setItem'> | null = safeLocalStorage(),
): void {
  try {
    storage?.setItem(KEYBOARD_LAYOUT_STORE_KEY, formFactor);
  } catch {
    /* storage unavailable */
  }
}

/** Read the persisted legend source; the OS layout's characters when unset,
 *  unknown, or unreadable. */
export function loadKeyboardLegendSource(
  storage: Pick<Storage, 'getItem'> | null = safeLocalStorage(),
): KeyboardLegendSource {
  if (!storage) return DEFAULT_LEGEND_SOURCE;
  try {
    const raw = storage.getItem(KEYBOARD_LEGENDS_STORE_KEY);
    return KEYBOARD_LEGEND_SOURCES.some((f) => f.id === raw)
      ? (raw as KeyboardLegendSource)
      : DEFAULT_LEGEND_SOURCE;
  } catch {
    return DEFAULT_LEGEND_SOURCE;
  }
}

/** The layout converter's last target per keybind profile (Keybinds.profileKey),
 *  so the next conversion starts from the layout the hotkeys now follow and a
 *  second Convert never re-scrambles an already-converted setup. One JSON map
 *  keyed by profile: keybinds are per character, so this is too. */
export const KEYBIND_SOURCE_LAYOUT_STORE_KEY = 'woc_keybind_source_layout';

function readSourceLayouts(storage: Pick<Storage, 'getItem'> | null): Map<string, unknown> {
  try {
    const raw = storage?.getItem(KEYBIND_SOURCE_LAYOUT_STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? new Map(Object.entries(parsed))
      : new Map();
  } catch {
    return new Map();
  }
}

/** The layout this profile's hotkeys were last converted to, or null. */
export function loadKeybindSourceLayout(
  profile: string,
  storage: Pick<Storage, 'getItem'> | null = safeLocalStorage(),
): KeyboardLayoutId | null {
  const value = readSourceLayouts(storage).get(profile);
  return typeof value === 'string' && isKeyboardLayoutId(value) ? value : null;
}

/** Record the layout this profile's hotkeys were just converted to. */
export function saveKeybindSourceLayout(
  profile: string,
  layout: KeyboardLayoutId,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage(),
): void {
  const all = readSourceLayouts(storage);
  all.set(profile, layout);
  try {
    storage?.setItem(KEYBIND_SOURCE_LAYOUT_STORE_KEY, JSON.stringify(Object.fromEntries(all)));
  } catch {
    /* storage unavailable */
  }
}

/** Persist the legend source; silently no-ops when storage is unavailable. */
export function saveKeyboardLegendSource(
  source: KeyboardLegendSource,
  storage: Pick<Storage, 'setItem'> | null = safeLocalStorage(),
): void {
  try {
    storage?.setItem(KEYBOARD_LEGENDS_STORE_KEY, source);
  } catch {
    /* storage unavailable */
  }
}
