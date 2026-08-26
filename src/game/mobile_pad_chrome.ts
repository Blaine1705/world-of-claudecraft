// Stands the touch-driven movement/camera/action-ring chrome down whenever a
// gamepad is connected: pairing a controller to a phone puts the player's
// hands on the pad, not the glass, so drawing both control schemes at once is
// redundant chrome a controller player never asked for (the mirror case of
// the cross-hotbar overlay standing down on body.mobile-touch, which keeps
// the OVERLAY from covering the touch chrome; this is the touch chrome
// standing down for the pad in turn).
//
// Keyed off raw pad CONNECTION (GamepadManager.isConnected()), not the
// cross-hotbar overlay's own setting (crossHotbarEnabled): a player who
// turns that overlay off still moves, looks and attacks through the pad's
// base bindings (src/game/gamepad_map.ts), which are unconditional, so the
// touch chrome should still stand down for them. The CSS side lives in
// src/styles/hud.mobile.css under body.mobile-touch.pad-connected.
//
// document access is guarded exactly like input_hint_mode.ts: this runs from
// GamepadManager's connection-change callback in a plain-Node Vitest context
// too (tests/gamepad.test.ts constructs GamepadManager without a DOM), so a
// missing document/body must stay a silent no-op rather than throw.

export const PAD_CONNECTED_CLASS = 'pad-connected';

const hasDom = (): boolean =>
  typeof document !== 'undefined' && typeof document.body?.classList?.toggle === 'function';

/** Apply (or clear) the pad-connected body class. Call whenever the pad's
 *  connection state might have changed: on GamepadManager's onConnectionChange
 *  callback and after any settings change that starts/stops it. */
export function applyPadConnectedClass(connected: boolean): void {
  if (!hasDom()) return;
  document.body.classList.toggle(PAD_CONNECTED_CLASS, connected);
}
