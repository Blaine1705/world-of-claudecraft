// The composition seam for the cross hotbar: it owns the persisted layout and
// hands the client the four small surfaces that need wiring (the pad's hold
// callback, the pad constructor argument, the settings arm, and the options
// panel's rebind hooks). It lives here rather than in main.ts because main.ts is
// a firewall, not a home (src/game/CLAUDE.md): the client carries calls, not the
// shape of a feature.

import { CROSS_HOTBAR_EXPANDED_SET, type CrossHotbarLayer } from './cross_hotbar';
import { CrossHotbarBindings } from './cross_hotbar_bindings';

export interface CrossHotbarHoldInfo {
  layer: CrossHotbarLayer;
  slots: readonly number[];
  expanded: boolean;
}

/** The HUD surface the overlay is driven through. */
export interface CrossHotbarOverlayHost {
  setCrossHotbar(hold: CrossHotbarHoldInfo | null): void;
}

/** The live pad the settings arm pushes to. */
export interface CrossHotbarPad {
  setCrossHotbar(on: boolean): void;
  setCrossHotbarExpand(on: boolean): void;
}

/** The persisted-settings store the arm writes through. */
export interface CrossHotbarSettingsStore {
  set(key: 'gamepadCrossHotbar' | 'gamepadCrossHotbarExpand', value: boolean): boolean;
}

/** The rebind surface the Controller options panel consumes. */
export interface CrossHotbarPanelHooks {
  crossHotbarSets(): readonly (readonly number[])[];
  bindCrossHotbar(set: number, position: number, actionBarSlot: number): void;
  resetCrossHotbar(): void;
}

export interface CrossHotbarWiring {
  /** Passed to the GamepadManager so a held trigger resolves against this layout. */
  bindings: CrossHotbarBindings;
  /** The pad's onCrossHotbar callback: opens, swaps, and closes the overlay. */
  onHold(layer: CrossHotbarLayer | null, set: number): void;
  /** The two cross-hotbar settings. Answers whether the key was one of them, so
   *  the caller's settings chain can return on a match. */
  applySetting(
    pad: CrossHotbarPad,
    store: CrossHotbarSettingsStore,
    key: string,
    value: number | boolean,
  ): boolean;
  hooks: CrossHotbarPanelHooks;
}

/** The overlay payload for a held trigger, or null once none is held. */
export function crossHotbarHold(
  bindings: CrossHotbarBindings,
  layer: CrossHotbarLayer | null,
  set: number,
): CrossHotbarHoldInfo | null {
  if (layer === null) return null;
  return {
    layer,
    slots: bindings.layerSlots(set, layer),
    expanded: set === CROSS_HOTBAR_EXPANDED_SET,
  };
}

/**
 * Build the whole cross-hotbar wiring. The host arrives as a THUNK because the
 * pad is constructed before the HUD in the client's boot order; resolving it per
 * call keeps the wiring independent of that order instead of pinning it.
 */
export function createCrossHotbar(host: () => CrossHotbarOverlayHost): CrossHotbarWiring {
  const bindings = new CrossHotbarBindings();
  return {
    bindings,
    onHold: (layer, set) => host().setCrossHotbar(crossHotbarHold(bindings, layer, set)),
    applySetting: (pad, store, key, value) => {
      if (key === 'gamepadCrossHotbar') {
        pad.setCrossHotbar(store.set(key, !!value));
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
      bindCrossHotbar: (set, position, slot) => bindings.bind(set, position, slot),
      resetCrossHotbar: () => bindings.reset(),
    },
  };
}
