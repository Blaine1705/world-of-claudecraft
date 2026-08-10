// Pure, host-agnostic core for the "Unlock interface" option: the declarative
// table of which HUD frames the toggle governs, and the two decisions the
// coordinator makes on every flip (which label the option row shows, and which
// frames are eligible right now).
//
// DOM-free and game-free: a frame is named by its element id and its storage
// key, both plain strings the DOM adapter (interface_unlock.ts) resolves. Kept
// declarative so adding a frame is a row here plus its `isActive` probe at the
// wiring site, never a new branch in the coordinator. Registered in
// tests/architecture.test.ts UI_PURE_CORES.

import type { TranslationKey } from './i18n.catalog';

/** One movable HUD frame under the global unlock toggle. */
export interface HudFrameSpec {
  /** Stable identifier used by the coordinator's registry and by tests. */
  id: string;
  /** The element id in index.html the adapter looks up. */
  elementId: string;
  /** localStorage key its chosen position + size persist under. */
  storageKey: string;
  /** Nominal size used to clamp a saved spot while the frame is hidden. */
  fallbackSize: { w: number; h: number };
  /**
   * True when the frame lives inside a TRANSFORMED ancestor (#bottom-bar carries
   * a centering transform), which hijacks absolute positioning by becoming the
   * containing block. Those frames are re-homed onto #ui while positioned, the
   * same move the player frame already makes; the rest are already #ui children.
   */
  detachToUiRoot: boolean;
}

/**
 * Every frame the "Unlock interface" option moves and scales, in the order the
 * coordinator registers them. The three unit frames that predate this option
 * (player, target, party) keep their own corner buttons and are joined to the
 * same toggle at the wiring site, so they are deliberately NOT rows here: their
 * storage keys and labels already live in frame_pos_reset.ts.
 */
export const HUD_FRAME_SPECS: readonly HudFrameSpec[] = [
  {
    id: 'actionBar1',
    elementId: 'actionbar',
    storageKey: 'woc_hud_frame_actionbar',
    fallbackSize: { w: 612, h: 46 },
    detachToUiRoot: true,
  },
  {
    id: 'actionBar2',
    elementId: 'actionbar2',
    storageKey: 'woc_hud_frame_actionbar2',
    fallbackSize: { w: 612, h: 46 },
    detachToUiRoot: true,
  },
  {
    id: 'actionBar3',
    elementId: 'actionbar3',
    storageKey: 'woc_hud_frame_actionbar3',
    fallbackSize: { w: 612, h: 46 },
    detachToUiRoot: true,
  },
  {
    id: 'castBar',
    elementId: 'castbar',
    storageKey: 'woc_hud_frame_castbar',
    fallbackSize: { w: 300, h: 24 },
    detachToUiRoot: false,
  },
  {
    id: 'menu',
    elementId: 'side-buttons',
    storageKey: 'woc_hud_frame_side_buttons',
    fallbackSize: { w: 200, h: 220 },
    detachToUiRoot: false,
  },
  {
    id: 'minimap',
    elementId: 'minimap-wrap',
    storageKey: 'woc_hud_frame_minimap',
    fallbackSize: { w: 170, h: 240 },
    detachToUiRoot: false,
  },
  {
    id: 'petFrame',
    elementId: 'pet-frame',
    storageKey: 'woc_hud_frame_pet',
    fallbackSize: { w: 180, h: 54 },
    detachToUiRoot: true,
  },
] as const;

/** Every storage key the option owns, so a reset can clear the whole set. */
export const HUD_FRAME_STORAGE_KEYS: readonly string[] = HUD_FRAME_SPECS.map((s) => s.storageKey);

/** Label the Interface option row shows: it names the ACTION the press performs,
 *  so it reads "Unlock interface" while locked and "Lock interface" once every
 *  frame is loose. */
export function interfaceUnlockLabelKey(unlocked: boolean): TranslationKey {
  return unlocked ? 'hudChrome.interfaceUnlock.lock' : 'hudChrome.interfaceUnlock.unlock';
}

/** A registered frame, reduced to the two things the eligibility rule reads. */
export interface UnlockCandidate {
  id: string;
  /** Whether the frame is live for this character right now: a hunter with no
   *  pet out has no pet frame, and the optional action bars are off by default. */
  isActive(): boolean;
}

/**
 * Which frames a flip to `unlocked` should actually loosen. Unlocking asks each
 * candidate whether it is live, so an absent frame (no pet, a disabled action
 * bar) is never made draggable; LOCKING is unconditional, because a frame that
 * went inactive mid-session (the pet was dismissed while the interface was
 * unlocked) must still be told to lock, or it would keep a live drag gesture
 * armed behind a hidden element.
 */
export function framesToLock(
  candidates: readonly UnlockCandidate[],
  unlocked: boolean,
): { id: string; unlocked: boolean }[] {
  return candidates.map((c) => ({ id: c.id, unlocked: unlocked && c.isActive() }));
}
