// Thin, poll-based consumer that turns a connected gamepad into game input.
// All the deterministic math lives in the pure core (gamepad_map.ts); this file
// owns the side effects: polling navigator.getGamepads() each frame, driving the
// Input instance (movement / camera / jump), dispatching edge-button actions via
// the host's onAction callback, the virtual-cursor UI-navigation mode, and
// haptic rumble. Modeled structurally on MobileControls.

import type { NavDirection } from '../ui/dpad_nav_core';
import {
  type CrossHotbarLayer,
  type CrossHotbarTriggerState,
  crossHotbarActiveSet,
  INITIAL_CROSS_HOTBAR_TRIGGER_STATE,
  isCrossHotbarButton,
  nextCrossHotbarTriggerState,
} from './cross_hotbar';
import type { CrossHotbarBindings } from './cross_hotbar_bindings';
import { moveDpadFocus, pressDpadFocus } from './dpad_focus_nav';
import type { GamepadBindings } from './gamepad_bindings';
import {
  AXIS,
  detectGamepadKind,
  GAMEPAD_NONE,
  GAMEPAD_ZOOM_IN,
  GAMEPAD_ZOOM_OUT,
  GAMEPAD_ZOOM_STEP,
  type GamepadKind,
  GP,
  risingEdges,
  STANDARD_BUTTON_COUNT,
  stickToLook,
  stickToMoveFlags,
  TRIGGER_THRESHOLD,
} from './gamepad_map';
import type { Input } from './input';

export interface GamepadCallbacks {
  // Record one physical button rising edge for the HUD's APM readout.
  onInputEdge(): void;
  // Dispatch a bound action id (slotN / target / interact / bags / escape / ...).
  // Reuses the host's existing keybind/UI dispatch; jump & autorun are handled
  // here against Input directly and never reach this.
  onAction(id: string): void;
  // True while any interactive HUD window is open, switching the pad into the
  // virtual-cursor UI-navigation mode (movement/camera/abilities are suspended).
  isPointerMode(): boolean;
  // Current local-player health, for rumble-on-damage. Optional.
  getPlayerHealth?(): number;
  // A pad connected or disconnected, so the detected brand (and thus the button
  // glyphs shown in the Controller options panel) may have changed. Optional.
  onConnectionChange?(): void;
  // The player actually moved something this frame (a button edge, either
  // stick, or the UI cursor), at most once per poll. The desktop shell uses it
  // to keep the OS from sleeping the display during a pad-only session, which
  // the OS cannot see: pad input never reaches the window as an event. A held
  // still pad, a connection, and an unfocused window are all silent. Optional.
  onActivity?(): void;
  // The cross hotbar opened, closed, or swapped sets. `layer` is null once no
  // trigger is held, which is the overlay's cue to hide. Fired only on a CHANGE,
  // never per poll. Optional.
  onCrossHotbar?(layer: CrossHotbarLayer | null, set: number): void;
}

const CURSOR_SPEED = 900; // px/sec at full stick deflection in UI cursor mode
const CURSOR_DPAD_STEP = 48; // px per d-pad press when there is nothing to focus

// Which way each d-pad button steps focus while a window is open.
const DPAD_NAV_DIRECTIONS: Record<number, NavDirection> = {
  [GP.DPAD_UP]: 'up',
  [GP.DPAD_DOWN]: 'down',
  [GP.DPAD_LEFT]: 'left',
  [GP.DPAD_RIGHT]: 'right',
};

export class GamepadManager {
  private index: number | null = null;
  private kind: GamepadKind = 'generic';
  private prevPressed: boolean[] = new Array(STANDARD_BUTTON_COUNT).fill(false);
  private deadzone = 0.18;
  private camSpeed = 2.4;
  private invertY = false;
  private vibration = 1;
  private lastHealth: number | null = null;
  private crossHotbar = false;
  private crossHotbarExpand = true;
  private triggerState: CrossHotbarTriggerState = INITIAL_CROSS_HOTBAR_TRIGGER_STATE;
  private cursorEl: HTMLDivElement | null = null;
  private cursorX = 0;
  private cursorY = 0;
  private cursorInit = false;
  private boundConnect = (e: GamepadEvent) => this.onConnect(e);
  private boundDisconnect = (e: GamepadEvent) => this.onDisconnect(e);

  private crossHotbarBindings: CrossHotbarBindings | undefined;

  constructor(
    private input: Input,
    private bindings: GamepadBindings,
    private cb: GamepadCallbacks,
  ) {}

  /** Supply the persisted cross-hotbar layout a held trigger resolves against.
   *  Without it the cross hotbar stays inert even when the setting is on. */
  setCrossHotbarBindings(bindings: CrossHotbarBindings): void {
    this.crossHotbarBindings = bindings;
  }

  start(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    window.addEventListener('gamepadconnected', this.boundConnect);
    window.addEventListener('gamepaddisconnected', this.boundDisconnect);
    // Pick up a pad that was already connected before we started listening (e.g.
    // the Controller setting toggled on while a pad is plugged in). Notify so an
    // open Controller panel re-labels to the detected brand; a no-op otherwise.
    for (const pad of navigator.getGamepads()) {
      if (pad?.connected) {
        this.acquire(pad);
        this.cb.onConnectionChange?.();
        break;
      }
    }
  }

  stop(): void {
    window.removeEventListener('gamepadconnected', this.boundConnect);
    window.removeEventListener('gamepaddisconnected', this.boundDisconnect);
    // Fully release the pad (mirror onDisconnect), not just the listeners: poll()
    // runs unconditionally from the main loop and activePad() keys off this.index,
    // so leaving index set would keep a still-connected pad driving movement,
    // camera, and edge buttons after the Controller setting is turned off. start()
    // re-acquires an already-connected pad on re-enable.
    this.index = null;
    this.kind = 'generic';
    this.prevPressed.fill(false);
    this.input.clearGamepadMove();
    this.input.setGamepadLookActive(false);
    this.releaseCrossHotbar();
    this.hideCursor();
  }

  setDeadzone(v: number): void {
    this.deadzone = Math.min(0.4, Math.max(0.05, v));
  }
  setCameraSpeed(v: number): void {
    this.camSpeed = Math.max(0.1, v);
  }
  setInvertY(on: boolean): void {
    this.invertY = on;
  }
  setVibration(v: number): void {
    this.vibration = Math.min(1, Math.max(0, v));
  }
  /** Turn the trigger-modifier cross hotbar on or off. Off restores the flat
   *  one-action-per-button layout exactly, triggers included. */
  setCrossHotbar(on: boolean): void {
    if (this.crossHotbar === on) return;
    this.crossHotbar = on;
    this.releaseCrossHotbar();
  }
  /** Whether tapping the opposite trigger swaps to the second set. */
  setCrossHotbarExpand(on: boolean): void {
    this.crossHotbarExpand = on;
    if (!on && this.triggerState.expanded) {
      this.triggerState = { ...this.triggerState, expanded: false };
      this.notifyCrossHotbar();
    }
  }

  // Drop any held trigger and tell the overlay to hide. Shared by every path
  // that stops feeding the pad: disable, blur, disconnect, pointer mode, stop().
  private releaseCrossHotbar(): void {
    if (this.triggerState.hold === null && !this.triggerState.expanded) {
      this.triggerState = INITIAL_CROSS_HOTBAR_TRIGGER_STATE;
      return;
    }
    this.triggerState = INITIAL_CROSS_HOTBAR_TRIGGER_STATE;
    this.notifyCrossHotbar();
  }

  private notifyCrossHotbar(): void {
    this.cb.onCrossHotbar?.(this.triggerState.hold, crossHotbarActiveSet(this.triggerState));
  }

  isConnected(): boolean {
    return this.index !== null;
  }

  /** Detected brand of the connected pad, for glyph labeling; 'generic' when
   *  none is connected or the pad's id is unrecognized. */
  getKind(): GamepadKind {
    return this.index === null ? 'generic' : this.kind;
  }

  // Latch a pad as the active one and classify its brand from the id string.
  private acquire(pad: Gamepad): void {
    this.index = pad.index;
    this.kind = detectGamepadKind(pad.id);
  }

  private onConnect(e: GamepadEvent): void {
    if (this.index === null) {
      this.acquire(e.gamepad);
      this.cb.onConnectionChange?.();
    }
  }

  private onDisconnect(e: GamepadEvent): void {
    if (this.index === e.gamepad.index) {
      this.index = null;
      this.kind = 'generic';
      this.prevPressed.fill(false);
      this.input.clearGamepadMove();
      this.input.setGamepadLookActive(false);
      this.releaseCrossHotbar();
      this.hideCursor();
      this.cb.onConnectionChange?.();
    }
  }

  private windowFocused(): boolean {
    try {
      return typeof document === 'undefined' || document.hasFocus();
    } catch {
      return true;
    }
  }

  private activePad(): Gamepad | null {
    if (this.index === null || typeof navigator === 'undefined') return null;
    const pad = navigator.getGamepads()[this.index];
    return pad && pad.connected ? pad : null;
  }

  /** Called once per animation frame from the main loop. */
  poll(dt: number): void {
    const pad = this.activePad();
    if (!pad) return;
    const buttons = pad.buttons;
    const pressed = (i: number): boolean => {
      const b = buttons[i];
      if (!b) return false;
      // LT/RT are analog; everything else is a clean digital button.
      if (i === GP.LT || i === GP.RT) return b.value > TRIGGER_THRESHOLD;
      return b.pressed;
    };
    const cur: boolean[] = [];
    for (let i = 0; i < STANDARD_BUTTON_COUNT; i++) cur[i] = pressed(i);

    // Match keyboard and mouse, which the browser only delivers to a focused
    // window: an unfocused window takes no pad input. Consume the button state
    // without dispatching so a button held across a refocus does not fire a
    // stale edge on return.
    if (!this.windowFocused()) {
      this.input.clearGamepadMove();
      this.input.setGamepadLookActive(false);
      this.releaseCrossHotbar();
      this.hideCursor();
      this.prevPressed = cur;
      return;
    }

    this.checkRumble();

    if (this.cb.isPointerMode()) {
      // UI-navigation cursor mode: stick drives a software pointer. Clear any
      // lingering stick movement (a non-modal window like bags doesn't freeze
      // movement on its own) and skip camera/ability dispatch.
      this.input.clearGamepadMove();
      this.input.setGamepadLookActive(false);
      this.releaseCrossHotbar();
      if (this.updateCursor(pad, cur, dt)) this.cb.onActivity?.();
      this.prevPressed = cur;
      return;
    }
    this.hideCursor();

    // The cross hotbar's trigger state advances BEFORE this poll's edges are
    // dispatched, so a trigger and a face button pressed in the same poll cast
    // the cross-hotbar slot rather than the button's flat binding.
    this.updateCrossHotbarTriggers(cur);

    // Movement: left stick.
    const lx = pad.axes[AXIS.LEFT_X] ?? 0;
    const ly = pad.axes[AXIS.LEFT_Y] ?? 0;
    const move = stickToMoveFlags(lx, ly, this.deadzone);
    this.input.setGamepadMove(move);

    // Camera: right stick. A non-centered stick also turns the player, the
    // same way the touch camera joystick does (setGamepadLookActive folds into
    // Input.isMouselookActive()); without this a gamepad-only player could
    // orbit the free camera but never actually turn to face a new direction.
    const rx = pad.axes[AXIS.RIGHT_X] ?? 0;
    const ry = pad.axes[AXIS.RIGHT_Y] ?? 0;
    const look = stickToLook(rx, ry, this.deadzone, this.camSpeed, this.invertY, dt);
    this.input.applyGamepadLook(look.yaw, look.pitch);
    this.input.setGamepadLookActive(look.active);

    // Real input this frame, for the activity notify below: either stick past
    // its deadzone (the flags and look.active are already the deadzone verdict,
    // so this costs four reads, not another hypot) or a button edge. A pad
    // sitting connected and still leaves every one of them false.
    let acted = move.forward || move.back || move.strafeLeft || move.strafeRight || look.active;

    // Edge actions: one-shot on each button's rising edge.
    for (const idx of risingEdges(this.prevPressed, cur)) {
      acted = true;
      this.cb.onInputEdge();
      this.dispatch(idx);
    }
    // Once per poll, never once per edge: the shell only needs to hear that the
    // player is there, and the notifier throttles anyway.
    if (acted) this.cb.onActivity?.();

    this.prevPressed = cur;
  }

  // Advance the trigger reducer from this poll's button snapshot and tell the
  // overlay when the held trigger or the active set actually changed.
  private updateCrossHotbarTriggers(cur: readonly boolean[]): void {
    if (!this.crossHotbar) {
      this.releaseCrossHotbar();
      return;
    }
    const prev = this.triggerState;
    this.triggerState = nextCrossHotbarTriggerState(
      prev,
      cur[GP.LT] ?? false,
      cur[GP.RT] ?? false,
      this.crossHotbarExpand,
    );
    if (this.triggerState.hold !== prev.hold || this.triggerState.expanded !== prev.expanded) {
      this.notifyCrossHotbar();
    }
  }

  /** The action-bar slot a button press casts through the cross hotbar right now,
   *  or null when the cross hotbar does not claim this press. */
  private crossHotbarSlotFor(buttonIndex: number): number | null {
    const layer = this.triggerState.hold;
    if (!this.crossHotbar || layer === null || !this.crossHotbarBindings) return null;
    return this.crossHotbarBindings.actionBarSlot(
      crossHotbarActiveSet(this.triggerState),
      layer,
      buttonIndex,
    );
  }

  private dispatch(buttonIndex: number): void {
    if (this.crossHotbar) {
      // The triggers are the modifier while the cross hotbar is on: they never
      // fire their own flat binding, the way a Shift key does not type.
      if (buttonIndex === GP.LT || buttonIndex === GP.RT) return;
      const slot = this.crossHotbarSlotFor(buttonIndex);
      if (slot !== null) {
        this.cb.onAction(`slot${slot}`);
        return;
      }
      // A claimed button pressed with a trigger held but no slot mapped stays
      // swallowed: falling through to the flat binding would cast the wrong
      // thing at the exact moment the player is reading the cross hotbar.
      if (this.triggerState.hold !== null && isCrossHotbarButton(buttonIndex)) return;
      // No trigger held: the diamond buttons keep their SYSTEM verbs (jump,
      // interact, target) but never their action-bar slot. A button that casts an
      // ability bare AND a different one under a trigger is the "random cast"
      // problem, and the whole set is already a trigger away. Checked at dispatch
      // rather than only in the defaults so a remap cannot reintroduce it.
      if (
        isCrossHotbarButton(buttonIndex) &&
        this.bindings.actionFor(buttonIndex).startsWith('slot')
      )
        return;
    }
    const action = this.bindings.actionFor(buttonIndex);
    if (action === GAMEPAD_NONE) return;
    if (action === 'jump') {
      this.input.triggerGamepadJump();
      return;
    }
    if (action === 'autorun') {
      this.input.toggleAutorun();
      return;
    }
    // Negative delta pulls the camera closer (zoom in), positive pushes it away
    // (zoom out), matching Input's wheel handler's Math.sign(deltaY) convention.
    if (action === GAMEPAD_ZOOM_IN) {
      this.input.zoomBy(-GAMEPAD_ZOOM_STEP);
      return;
    }
    if (action === GAMEPAD_ZOOM_OUT) {
      this.input.zoomBy(GAMEPAD_ZOOM_STEP);
      return;
    }
    this.cb.onAction(action);
  }

  // --- Haptics -------------------------------------------------------------
  private checkRumble(): void {
    if (this.vibration <= 0 || !this.cb.getPlayerHealth) {
      this.lastHealth = null;
      return;
    }
    const hp = this.cb.getPlayerHealth();
    if (this.lastHealth !== null && hp < this.lastHealth) {
      const dmgFrac = Math.min(1, (this.lastHealth - hp) / Math.max(1, this.lastHealth));
      this.rumble(0.25 + 0.65 * dmgFrac, Math.round(120 + 180 * dmgFrac));
    }
    this.lastHealth = hp;
  }

  /** Fire a dual-rumble effect scaled by the vibration setting (best-effort). */
  rumble(strength: number, durationMs: number): void {
    const pad = this.activePad();
    const actuator = (
      pad as unknown as {
        vibrationActuator?: { playEffect(type: string, opts: object): Promise<unknown> };
      }
    )?.vibrationActuator;
    if (!actuator?.playEffect) return;
    const mag = Math.min(1, Math.max(0, strength)) * this.vibration;
    try {
      void actuator.playEffect('dual-rumble', {
        duration: durationMs,
        strongMagnitude: mag,
        weakMagnitude: mag * 0.6,
      });
    } catch {
      /* unsupported actuator type */
    }
  }

  // --- UI-navigation virtual cursor ---------------------------------------
  private ensureCursor(): HTMLDivElement {
    if (!this.cursorEl) {
      const el = document.createElement('div');
      el.className = 'gamepad-cursor';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      this.cursorEl = el;
    }
    return this.cursorEl;
  }

  /** Drives the virtual pointer; answers whether the player moved it or pressed
   *  something this frame, which is the pointer-mode half of onActivity. */
  private updateCursor(pad: Gamepad, cur: boolean[], dt: number): boolean {
    const el = this.ensureCursor();
    if (!this.cursorInit) {
      this.cursorX = window.innerWidth / 2;
      this.cursorY = window.innerHeight / 2;
      this.cursorInit = true;
    }
    el.style.display = 'block';
    // Left stick (or d-pad) moves the pointer.
    let mx = pad.axes[AXIS.LEFT_X] ?? 0;
    let my = pad.axes[AXIS.LEFT_Y] ?? 0;
    if (Math.hypot(mx, my) < this.deadzone) {
      mx = 0;
      my = 0;
    }
    this.cursorX = Math.min(window.innerWidth, Math.max(0, this.cursorX + mx * CURSOR_SPEED * dt));
    this.cursorY = Math.min(window.innerHeight, Math.max(0, this.cursorY + my * CURSOR_SPEED * dt));
    el.style.left = `${this.cursorX}px`;
    el.style.top = `${this.cursorY}px`;

    // The post-deadzone stick (and the d-pad overrides above) are the cursor's
    // own movement verdict, so activity here costs one comparison.
    let acted = mx !== 0 || my !== 0;
    for (const idx of risingEdges(this.prevPressed, cur)) {
      acted = true;
      this.cb.onInputEdge();
      // The d-pad steps between the open window's controls rather than nudging the
      // cursor a few pixels: a cursor has to be steered to a button, focus lands on
      // it. The stick keeps the free cursor for what focus order cannot reach (an
      // item drag, a spot on the map), so nothing is lost.
      const dir = DPAD_NAV_DIRECTIONS[idx];
      if (dir !== undefined) {
        // Snap the cursor onto whatever took focus: focus alone is invisible on a
        // pad, so without this the screen does not move and the press appears to
        // do nothing. Falls back to nudging the cursor when the open surface has
        // nothing focusable to step between.
        const focused = moveDpadFocus(dir);
        if (focused) this.moveCursorTo(focused.x, focused.y);
        else this.nudgeCursor(dir);
        continue;
      }
      // A presses the focused control, falling back to the cursor when the d-pad
      // has not focused anything the navigation owns.
      if (idx === GP.A) {
        if (!pressDpadFocus()) this.clickAtCursor();
      } else if (idx === GP.B || idx === GP.START) this.cb.onAction('escape');
    }
    return acted;
  }

  // Park the cursor at a point (the centre of a newly focused control).
  private moveCursorTo(x: number, y: number): void {
    this.cursorX = x;
    this.cursorY = y;
    if (this.cursorEl) {
      this.cursorEl.style.left = `${x}px`;
      this.cursorEl.style.top = `${y}px`;
    }
  }

  // One d-pad step of the free cursor, for a surface with no focusable controls.
  private nudgeCursor(dir: NavDirection): void {
    const step = CURSOR_DPAD_STEP;
    if (dir === 'left') this.cursorX = Math.max(0, this.cursorX - step);
    else if (dir === 'right') this.cursorX = Math.min(window.innerWidth, this.cursorX + step);
    else if (dir === 'up') this.cursorY = Math.max(0, this.cursorY - step);
    else this.cursorY = Math.min(window.innerHeight, this.cursorY + step);
    if (this.cursorEl) {
      this.cursorEl.style.left = `${this.cursorX}px`;
      this.cursorEl.style.top = `${this.cursorY}px`;
    }
  }

  // Synthesizes mousedown/mouseup/click at the cursor, reusing every existing DOM
  // click handler (use/equip/sell/trade/feed). Native HTML5 drag-to-rearrange the
  // action bar is the one interaction this cannot reach; clicks cover the rest.
  private clickAtCursor(): void {
    const target = document.elementFromPoint(this.cursorX, this.cursorY) as HTMLElement | null;
    if (!target) return;
    const opts = { bubbles: true, cancelable: true, clientX: this.cursorX, clientY: this.cursorY };
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.click();
  }

  private hideCursor(): void {
    if (this.cursorEl) this.cursorEl.style.display = 'none';
    this.cursorInit = false;
  }
}
