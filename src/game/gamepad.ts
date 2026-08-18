// Thin, poll-based consumer that turns a connected gamepad into game input.
// All the deterministic math lives in the pure core (gamepad_map.ts); this file
// owns the side effects: polling navigator.getGamepads() each frame, driving the
// Input instance (movement / camera / jump), dispatching edge-button actions via
// the host's onAction callback, the focus-driven UI-navigation mode, and
// haptic rumble. Modeled structurally on MobileControls.

import type { NavDirection } from '../ui/dpad_nav_core';
import {
  type CrossHotbarAction,
  type CrossHotbarLayer,
  type CrossHotbarTriggerState,
  crossHotbarActiveSet,
  INITIAL_CROSS_HOTBAR_TRIGGER_STATE,
  isCrossHotbarButton,
  nextCrossHotbarTriggerState,
} from './cross_hotbar';
import type { CrossHotbarBindings } from './cross_hotbar_bindings';
import {
  type CrossHotbarEditState,
  clearCell,
  confirmCell,
  IDLE_EDIT_STATE,
  pickUpAction,
  toggleEdit,
} from './cross_hotbar_edit';
import {
  clearPadFocus,
  focusFirstInWindow,
  moveDpadFocus,
  pressDpadFocus,
  restorePadFocus,
  syncWindowFocus,
} from './dpad_focus_nav';
import type { GamepadBindings } from './gamepad_bindings';
import {
  AXIS,
  applyRadialDeadzone,
  detectGamepadKind,
  GAMEPAD_CONFIRM,
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
import { focusedPadAction } from './pad_focus_action';
import { clickPadMouse, hidePadMouse, updatePadMouse } from './pad_mouse_cursor';

export interface GamepadCallbacks {
  // Record one physical button rising edge for the HUD's APM readout.
  onInputEdge(): void;
  // Dispatch a bound action id (slotN / target / interact / bags / escape / ...).
  // Reuses the host's existing keybind/UI dispatch; jump & autorun are handled
  // here against Input directly and never reach this.
  onAction(id: string): void;
  // True while any interactive HUD window is open, switching the pad into the
  // focus-driven UI-navigation mode (movement/camera/abilities are suspended).
  isPointerMode(): boolean;
  // Current local-player health, for rumble-on-damage. Optional.
  getPlayerHealth?(): number;
  // A pad connected or disconnected, so the detected brand (and thus the button
  // glyphs shown in the Controller options panel) may have changed. Optional.
  onConnectionChange?(): void;
  // The player actually moved something this frame (a button edge, either
  // stick, or a UI navigation step), at most once per poll. The desktop shell uses it
  // to keep the OS from sleeping the display during a pad-only session, which
  // the OS cannot see: pad input never reaches the window as an event. A held
  // still pad, a connection, and an unfocused window are all silent. Optional.
  onActivity?(): void;
  // The cross hotbar opened, closed, or swapped sets. `layer` is null once no
  // trigger is held, which is the overlay's cue to hide. Fired only on a CHANGE,
  // never per poll. Optional.
  onCrossHotbar?(layer: CrossHotbarLayer | null, set: number): void;
  // Cast what a cross-hotbar cell holds. The bar owns its own actions, so this is
  // an ability or item id rather than an action-bar slot: IWorld.castAbility is
  // deliberately id-based so the client never depends on slot semantics.
  onCrossHotbarCast?(action: { type: 'ability' | 'item'; id: string }): void;
  // Edit mode opened, closed, or picked something up. `carriedFrom` is the cell an
  // action was lifted off, for the gap the bar draws where it used to be.
  onCrossHotbarEdit?(active: boolean, carriedFrom: number | null): void;
  // Which cell the bar has focused, so a press can act on it. Answered by the HUD
  // because focus lives in the DOM.
  focusedCrossHotbarCell?(): number | null;
}

// Which way each d-pad button steps focus while a window is open.
const DPAD_NAV_DIRECTIONS: Record<number, NavDirection> = {
  [GP.DPAD_UP]: 'up',
  [GP.DPAD_DOWN]: 'down',
  [GP.DPAD_LEFT]: 'left',
  [GP.DPAD_RIGHT]: 'right',
};

// How long to wait for a closing window to hand focus back before the pad drops
// its selection. A handful of frames: long enough for a return dispatched a tick
// after the close, short enough that a genuine exit does not leave a stale
// highlight on screen.
const FOCUS_RETURN_FRAMES = 12;

export class GamepadManager {
  private index: number | null = null;
  private kind: GamepadKind = 'generic';
  private prevPressed: boolean[] = new Array(STANDARD_BUTTON_COUNT).fill(false);
  private deadzone = 0.18;
  private camSpeed = 2.4;
  private invertY = false;
  private vibration = 1;
  private lastHealth: number | null = null;
  // The player has opened UI navigation from the world with the d-pad. Pointer
  // mode is otherwise gated on a HUD window being open, which leaves a pad with
  // no way IN: the d-pad claims nothing in the world, so it read as dead.
  // Edge-detects a window opening and closing, so focus lands inside it exactly
  // once and the pointer leaves with it.
  private prevPointerMode = false;
  // A press can open a window over the one the pad is already in, and that has no
  // open/close edge to catch. Re-check the top surface on the poll AFTER any
  // press rather than every frame: activeRoot() reads layout, which is not
  // something to do 60 times a second for a check that only matters after input.
  private resyncFocus = false;
  // The opt-in virtual mouse (FFXIV's LB + right-stick-click). Off by default:
  // stepping onto a control beats steering a pointer at it, so this is the escape
  // hatch for what the focus order cannot reach, not the everyday path.
  private mouseMode = false;
  // Arranging the bar on the bar itself. While it is on, confirm and cancel act on
  // the focused CELL rather than casting, so a player cannot fire an ability by
  // trying to move it.
  private edit: CrossHotbarEditState = IDLE_EDIT_STATE;
  // Frames left to wait for a closing window's focus return before giving up on it.
  private restoreFocusFrames = 0;
  private crossHotbar = false;
  private crossHotbarExpand = true;
  private triggerState: CrossHotbarTriggerState = INITIAL_CROSS_HOTBAR_TRIGGER_STATE;
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
    this.exitNavMode();
    this.mouseMode = false;
    hidePadMouse();
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
      this.prevPressed = cur;
      return;
    }

    // A pad is usually connected before the character's action bar has loaded, so
    // the first seed attempt has nothing to copy. Re-ask until it takes; the check
    // is an in-memory scan of the layout and stops the moment the bar is seeded.
    if (this.crossHotbar && this.crossHotbarBindings?.isSeeded() === false) {
      this.cb.onConnectionChange?.();
    }

    this.checkRumble();

    // FFXIV's toggle for the virtual mouse: LB + right-stick-click. Checked as a
    // CHORD (either button rising while the other is held) so the order the two
    // are pressed in does not matter.
    // A chord's completing button must not ALSO fire its own binding, or opening
    // arrange mode jumps and toggling the pointer targets something. The trigger
    // modifiers already work this way; this is the same rule for a chord.
    let chordButton: number | null = null;
    const chordRise =
      (cur[GP.LB] && !this.prevPressed[GP.LB] && cur[GP.R3]) ||
      (cur[GP.R3] && !this.prevPressed[GP.R3] && cur[GP.LB]);
    // Arrange mode, the same shape of chord: LB plus the top face button. On the
    // bar rather than in a menu, because a pad player is looking at the bar.
    const editChord =
      (cur[GP.LB] && !this.prevPressed[GP.LB] && cur[GP.Y]) ||
      (cur[GP.Y] && !this.prevPressed[GP.Y] && cur[GP.LB]);
    if (editChord && this.crossHotbar) {
      chordButton = cur[GP.Y] && !this.prevPressed[GP.Y] ? GP.Y : GP.LB;
      const toggled = toggleEdit(this.edit);
      this.edit = toggled.state;
      if (toggled.restore) {
        this.crossHotbarBindings?.bind(
          toggled.restore.cell.set,
          toggled.restore.cell.position,
          toggled.restore.action,
        );
      }
      this.announceEdit();
    }

    if (chordRise) {
      chordButton = cur[GP.R3] && !this.prevPressed[GP.R3] ? GP.R3 : GP.LB;
      this.mouseMode = !this.mouseMode;
      if (this.mouseMode) clearPadFocus();
      else hidePadMouse();
    }

    if (this.mouseMode) {
      // The pointer owns the pad: the right stick drives it and the triggers
      // click, so neither the camera nor the cross hotbar may also read them.
      this.input.clearGamepadMove();
      this.input.setGamepadLookActive(false);
      this.releaseCrossHotbar();
      const mv = applyRadialDeadzone(
        pad.axes[AXIS.RIGHT_X] ?? 0,
        pad.axes[AXIS.RIGHT_Y] ?? 0,
        this.deadzone,
      );
      let acted = updatePadMouse(mv.x, mv.y, dt);
      for (const idx of risingEdges(this.prevPressed, cur)) {
        acted = true;
        this.cb.onInputEdge();
        if (idx === GP.LT) clickPadMouse(0);
        else if (idx === GP.RT) clickPadMouse(2);
        else if (idx === GP.B || idx === GP.START) this.cb.onAction('escape');
      }
      if (acted) this.cb.onActivity?.();
      this.prevPressed = cur;
      return;
    }

    // A window just opened while a pad is driving: put focus on its first control
    // so the player is already inside it. This runs only from the pad's own poll
    // with a live pad, so a keyboard-and-mouse session never reaches it.
    const pointerMode = this.cb.isPointerMode();
    if (pointerMode && !this.prevPointerMode) focusFirstInWindow();
    // The window closed: put the selection back where the player opened it from,
    // or drop the highlight and the pointer when there is nothing to go back to,
    // rather than leaving them over a surface that is no longer there.
    if (!pointerMode && this.prevPointerMode) this.exitNavMode();
    else if (this.restoreFocusFrames > 0) {
      this.restoreFocusFrames--;
      if (restorePadFocus()) this.restoreFocusFrames = 0;
      else if (this.restoreFocusFrames === 0) clearPadFocus();
    }
    this.prevPointerMode = pointerMode;

    if (pointerMode && this.resyncFocus) {
      this.resyncFocus = false;
      syncWindowFocus();
    }

    if (pointerMode) {
      // A modal surface owns the pad: clear any lingering stick movement (a
      // non-modal window like bags doesn't freeze movement on its own) and skip
      // camera/ability dispatch.
      this.input.clearGamepadMove();
      this.input.setGamepadLookActive(false);
      this.releaseCrossHotbar();
      if (this.updateNavigation(cur)) this.cb.onActivity?.();
      this.prevPressed = cur;
      return;
    }

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
      if (idx === chordButton) continue;
      // The d-pad steps through the HUD WHILE the world keeps running: movement,
      // camera and the cross hotbar are all still live above and below this. Only
      // a press that would otherwise do nothing is taken, so nothing is stolen.
      const dir = DPAD_NAV_DIRECTIONS[idx];
      if (dir !== undefined && this.triggerState.hold === null && this.pressWouldDoNothing(idx)) {
        moveDpadFocus(dir);
        continue;
      }
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

  /** The action a button press casts through the cross hotbar right now, or null
   *  when the cross hotbar does not claim this press. */
  private crossHotbarActionFor(buttonIndex: number): CrossHotbarAction {
    const layer = this.triggerState.hold;
    if (!this.crossHotbar || layer === null || !this.crossHotbarBindings) return null;
    return this.crossHotbarBindings.actionFor(
      crossHotbarActiveSet(this.triggerState),
      layer,
      buttonIndex,
    );
  }

  /** Confirm and cancel arrange the focused cell while editing. Answers whether the
   *  press was consumed, so anything else still reaches its ordinary binding. */
  private editPress(buttonIndex: number): boolean {
    const store = this.crossHotbarBindings;
    if (!store) return false;
    const action = this.bindings.actionFor(buttonIndex);
    const isConfirm = action === GAMEPAD_CONFIRM;
    const isCancel = buttonIndex === GP.B;
    if (!isConfirm && !isCancel) return false;
    // Picking an ability up out of the spellbook is how something NEW reaches the
    // bar; only when empty-handed, so a carry in progress is never overwritten.
    if (isConfirm && this.edit.carried === null) {
      const picked = pickUpAction(this.edit, focusedPadAction());
      if (picked !== this.edit) {
        this.edit = picked;
        this.announceEdit();
        return true;
      }
    }
    // Cancelling a carry needs no cell: putting it down is the whole act.
    if (!isConfirm && this.edit.carried !== null) {
      const r = clearCell(this.edit, { set: 0, position: 0 });
      this.edit = r.state;
      if (r.restore) store.bind(r.restore.cell.set, r.restore.cell.position, r.restore.action);
      this.announceEdit();
      return true;
    }
    const index = this.cb.focusedCrossHotbarCell?.() ?? null;
    if (index === null) return false;
    // The focused index addresses the ACTIVE set: the bar shows one set at a time.
    const cell = { set: crossHotbarActiveSet(this.triggerState), position: index };
    if (isConfirm) {
      const r = confirmCell(this.edit, cell, (c) => store.setActions(c.set)[c.position] ?? null);
      this.edit = r.state;
      if (r.swap)
        store.swap(r.swap.from.set, r.swap.from.position, r.swap.to.set, r.swap.to.position);
      if (r.place) store.bind(r.place.cell.set, r.place.cell.position, r.place.action);
    } else {
      const r = clearCell(this.edit, cell);
      this.edit = r.state;
      if (r.clear) store.bind(r.clear.set, r.clear.position, null);
    }
    this.announceEdit();
    return true;
  }

  // Push the arrange state out: what the bar draws (the gap under a carried
  // action) and the freshly written cells.
  private announceEdit(): void {
    this.cb.onCrossHotbarEdit?.(this.edit.active, this.edit.from?.position ?? null);
    this.notifyCrossHotbar();
  }

  // Whether a bare press of this button would fall through without doing
  // anything: either the cross hotbar has claimed it (and swallows it with no
  // trigger held) or it simply carries no binding. Only such a press may be
  // repurposed for UI navigation; one that still fires a real action keeps it.
  private pressWouldDoNothing(buttonIndex: number): boolean {
    const action = this.bindings.actionFor(buttonIndex);
    if (action === GAMEPAD_NONE) return true;
    // Mirrors dispatch(): with the cross hotbar on, a claimed button's SLOT
    // binding is swallowed, but its system verb (target, interact) still fires.
    return this.crossHotbar && isCrossHotbarButton(buttonIndex) && action.startsWith('slot');
  }

  private dispatch(buttonIndex: number): void {
    if (this.edit.active && this.editPress(buttonIndex)) return;
    if (this.crossHotbar) {
      // The triggers are the modifier while the cross hotbar is on: they never
      // fire their own flat binding, the way a Shift key does not type.
      if (buttonIndex === GP.LT || buttonIndex === GP.RT) return;
      // Arranging is not playing: nothing on the bar fires while a cell is being
      // moved, or the player casts the very thing they are trying to relocate.
      if (this.edit.active && isCrossHotbarButton(buttonIndex)) return;
      const action = this.crossHotbarActionFor(buttonIndex);
      if (action !== null) {
        this.cb.onCrossHotbarCast?.(action);
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
    if (action === GAMEPAD_CONFIRM) {
      pressDpadFocus();
      return;
    }
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

  // --- UI navigation (focus-driven; no software cursor) --------------------
  /**
   * UI navigation, the pad's answer to a mouse. There is deliberately NO software
   * cursor: a page cannot move the OS pointer, and a fake one has to be steered
   * pixel by pixel to reach a button. Console MMOs navigate by FOCUS instead, so
   * the d-pad steps between the open surface's controls, the focused one is
   * highlighted, and confirm presses it. The player's real mouse is untouched and
   * keeps working alongside this.
   *
   * Answers whether the player did anything this frame (the activity signal).
   */
  private updateNavigation(cur: boolean[]): boolean {
    let acted = false;
    for (const idx of risingEdges(this.prevPressed, cur)) {
      acted = true;
      // Whatever this press does may swap the surface under us (accepting a quest
      // opens its window over the dialogue), so look again next poll.
      this.resyncFocus = true;
      this.cb.onInputEdge();
      const dir = DPAD_NAV_DIRECTIONS[idx];
      if (dir !== undefined) {
        moveDpadFocus(dir);
        continue;
      }
      if (this.bindings.actionFor(idx) === GAMEPAD_CONFIRM) {
        pressDpadFocus();
      } else if (idx === GP.B || idx === GP.START) {
        this.cb.onAction('escape');
      }
    }
    return acted;
  }

  // Follow the focus the closing window restored; drop the highlight and the pad
  // pointer only once it is clear nothing is coming back.
  //
  // Retried across frames rather than decided on the closing one: the window's
  // focus return does not always land before the poll that first sees the window
  // gone, and answering on that single frame threw the selection away a moment
  // before the thing to return to appeared.
  private exitNavMode(): void {
    if (restorePadFocus()) return;
    this.restoreFocusFrames = FOCUS_RETURN_FRAMES;
  }
}
