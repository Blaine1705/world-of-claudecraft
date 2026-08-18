// The composition seam for the cross hotbar: it owns the persisted layout and
// hands the client the four small surfaces that need wiring (the pad's hold
// callback, the pad constructor argument, the settings arm, and the options
// panel's rebind hooks). It lives here rather than in main.ts because main.ts is
// a firewall, not a home (src/game/CLAUDE.md): the client carries calls, not the
// shape of a feature.

import {
  CROSS_HOTBAR_DPAD_GLYPHS,
  CROSS_HOTBAR_EXPANDED_SET,
  CROSS_HOTBAR_LAYER_BUTTONS,
  CROSS_HOTBAR_PRIMARY_SET,
  CROSS_HOTBAR_TRIGGERS,
  type CrossHotbarAction,
  type CrossHotbarLayer,
} from './cross_hotbar';
import { CrossHotbarBindings } from './cross_hotbar_bindings';
import { type GamepadKind, gamepadButtonLabel } from './gamepad_map';

export interface CrossHotbarHoldInfo {
  /** The armed half, or null for the resting bar (which still shows). */
  layer: CrossHotbarLayer | null;
  slots: readonly CrossHotbarAction[];
  expanded: boolean;
  /** The hardware glyph under each cell, for the connected pad's brand. */
  buttons: readonly string[];
  /** The two trigger glyphs (LT/RT, L2/R2, ZL/ZR) for the half labels. */
  triggers: { left: string; right: string };
}

/** The HUD surface the overlay is driven through. */
export interface CrossHotbarOverlayHost {
  setCrossHotbar(hold: CrossHotbarHoldInfo | null): void;
  refreshControllerLabels(): void;
  /** What to fill an untouched bar from: the player's action bar, plus the class
   *  abilities a pad needs that the bar does not carry (a stance is known at
   *  level one yet unbound, so a pad player could never otherwise reach it). */
  crossHotbarSeed(): { bar: readonly CrossHotbarAction[]; extras: readonly string[] };
}

/** The live pad, for the connection-driven half of pad mode. */
export interface CrossHotbarPadState {
  isConnected(): boolean;
  getKind(): GamepadKind;
}

/** The live pad the settings arm pushes to. */
export interface CrossHotbarPad extends CrossHotbarPadState {
  setCrossHotbar(on: boolean): void;
  setCrossHotbarExpand(on: boolean): void;
}

/** The persisted-settings store the arm writes through. */
export interface CrossHotbarSettingsStore {
  set(key: 'gamepadCrossHotbar' | 'gamepadCrossHotbarExpand', value: boolean): boolean;
}

/** The rebind surface the Controller options panel consumes. */
export interface CrossHotbarPanelHooks {
  crossHotbarSets(): readonly (readonly CrossHotbarAction[])[];
  bindCrossHotbar(set: number, position: number, action: CrossHotbarAction): void;
  resetCrossHotbar(): void;
}

export interface CrossHotbarWiring {
  /** Passed to the GamepadManager so a held trigger resolves against this layout. */
  bindings: CrossHotbarBindings;
  /** The pad's onCrossHotbar callback: opens, swaps, and closes the overlay. */
  onHold(layer: CrossHotbarLayer | null, set: number, kind: GamepadKind): void;
  /** The two cross-hotbar settings. Answers whether the key was one of them, so
   *  the caller's settings chain can return on a match. */
  applySetting(
    pad: CrossHotbarPad,
    store: CrossHotbarSettingsStore,
    key: string,
    value: number | boolean,
  ): boolean;
  hooks: CrossHotbarPanelHooks;
  /** Re-evaluate pad mode after a connect, disconnect, or settings change. */
  syncPadMode(pad: CrossHotbarPadState): void;
}

/** The overlay payload for a held trigger, or null once none is held. */
export function crossHotbarHold(
  bindings: CrossHotbarBindings,
  layer: CrossHotbarLayer | null,
  set: number,
  kind: GamepadKind,
): CrossHotbarHoldInfo {
  return {
    layer,
    // The WHOLE set: the bar shows both halves and only ARMS one.
    slots: bindings.setActions(set),
    expanded: set === CROSS_HOTBAR_EXPANDED_SET,
    buttons: crossHotbarButtonLabels(kind),
    triggers: {
      left: gamepadButtonLabel(CROSS_HOTBAR_TRIGGERS.left, kind),
      right: gamepadButtonLabel(CROSS_HOTBAR_TRIGGERS.right, kind),
    },
  };
}

/** The bar a pad player sees with no trigger down: the first set's left eight,
 *  shown but not armed. Keeping it on screen is what lets the desktop rows stand
 *  down without leaving the player with no hotbar at all. */
export function crossHotbarResting(
  bindings: CrossHotbarBindings,
  kind: GamepadKind,
): CrossHotbarHoldInfo {
  return crossHotbarHold(bindings, null, CROSS_HOTBAR_PRIMARY_SET, kind);
}

/** The sixteen hardware glyphs under the cells (the left half's eight then the
 *  right half's, the same buttons twice because the trigger is what separates
 *  them). The d-pad four collapse to bare arrows: the cell already sits in the
 *  position it names, so the full "D-pad up" only crowds a 44px cell. */
export function crossHotbarButtonLabels(kind: GamepadKind): string[] {
  const half = CROSS_HOTBAR_LAYER_BUTTONS.map(
    (button) => CROSS_HOTBAR_DPAD_GLYPHS[button] ?? gamepadButtonLabel(button, kind),
  );
  return [...half, ...half];
}

// Pad mode is the cross hotbar being both enabled AND reachable. A player with no
// pad keeps the desktop rows even though the setting defaults on, which is the
// whole reason this is not just the setting.
const PAD_MODE_CLASS = 'xhb-mode';

function applyPadModeClass(on: boolean): void {
  try {
    document.body.classList.toggle(PAD_MODE_CLASS, on);
  } catch {
    /* no DOM (headless/tests) */
  }
}

/**
 * Build the whole cross-hotbar wiring. The host arrives as a THUNK because the
 * pad is constructed before the HUD in the client's boot order; resolving it per
 * call keeps the wiring independent of that order instead of pinning it.
 */
export function createCrossHotbar(host: () => CrossHotbarOverlayHost): CrossHotbarWiring {
  const bindings = new CrossHotbarBindings();
  let enabled = true;
  const syncPadMode = (pad: CrossHotbarPadState): void => {
    const on = enabled && pad.isConnected();
    applyPadModeClass(on);
    const ui = host();
    ui.refreshControllerLabels();
    // Seed on the first poll where a pad is actually present: the action bar has
    // loaded by then, and seeding earlier would fill from an empty one.
    if (on) {
      const seed = ui.crossHotbarSeed();
      bindings.seedOnce(seed.bar, seed.extras);
    }
    ui.setCrossHotbar(on ? crossHotbarResting(bindings, pad.getKind()) : null);
  };
  return {
    bindings,
    syncPadMode,
    onHold: (layer, set, kind) =>
      host().setCrossHotbar(crossHotbarHold(bindings, layer, set, kind)),
    applySetting: (pad, store, key, value) => {
      if (key === 'gamepadCrossHotbar') {
        enabled = store.set(key, !!value);
        pad.setCrossHotbar(enabled);
        syncPadMode(pad);
        return true;
      }
      if (key === 'gamepadCrossHotbarExpand') {
        pad.setCrossHotbarExpand(store.set(key, !!value));
        return true;
      }
      return false;
    },
    hooks: {
      crossHotbarSets: () => bindings.all(),
      bindCrossHotbar: (set, position, action) => bindings.bind(set, position, action),
      resetCrossHotbar: () => bindings.reset(),
    },
  };
}
