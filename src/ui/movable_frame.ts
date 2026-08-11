// Shared movable / lockable HUD-frame controller: the DOM wiring behind the
// small corner button that toggles a frame between locked (fixed) and unlocked
// (draggable), the pointer drag itself, the optional SE-corner size grip, and
// localStorage persistence of the chosen spot. Extracted from the hud.ts
// target-frame cluster on its second instance (the player frame),
// INSTANCE-PARAMETERIZED per the HUD component recipe: each frame passes its
// element, storage key, labels, and body class.
// The pure position + scale math (clamping, (de)serialization) stays in
// target_frame_pos.ts; the saved spot survives reloads, the lock state does not
// (a frame always loads locked so a stray drag never moves it). Desktop only:
// the button is hidden on mobile-touch by CSS and the drag gate checks
// isMobileLayout(), where the mobile stylesheet owns frame positions.
//
// Two config shapes ride this one class. The three unit frames keep their
// always-visible corner button and move only. The frames the "Unlock interface"
// option governs (interface_unlock.ts) pass `buttonOnlyWhenUnlocked` plus
// `scalable`, so they carry no permanent chrome and gain both gestures the
// moment the coordinator calls setLockState(true).
// Both gestures are pointer AND keyboard operable: the move button takes arrow
// keys to position, and the grip takes arrow keys to size. Neither is a
// pointer-only affordance, because each is the ONLY route to what it changes.

import { t } from './i18n';
import type { TranslationKey } from './i18n.catalog';
import {
  clampFrameScale,
  parseTargetFramePos,
  placeTargetFrame,
  scaleFromGripDrag,
  scaleFromKeyStep,
  serializeTargetFramePos,
  type TargetFramePos,
} from './target_frame_pos';
import { getUiScale } from './ui_scale';

export interface MovableFrameConfig {
  frame: HTMLElement;
  /** localStorage key the chosen top-left persists under. */
  storageKey: string;
  /** aria-label / title while LOCKED (aria-pressed=false): press to move it. */
  unlockLabelKey: TranslationKey;
  /** aria-label / title while UNLOCKED (aria-pressed=true): press to fix it. */
  lockLabelKey: TranslationKey;
  /** Body class set while a drag is live (CSS disables user-select under it). */
  draggingBodyClass: string;
  /** Nominal size used to clamp a saved spot while the frame is display:none. */
  fallbackSize: { w: number; h: number };
  isMobileLayout(): boolean;
  /** Fired whenever a custom position starts (true) or stops (false) applying,
   *  e.g. the player frame detaches from the action-bar stack to position:fixed. */
  onPositioned?(active: boolean): void;
  /** Give the frame the shared SE-corner grip (the chat box / meter panel one)
   *  so it can be scaled as well as moved. Off by default: the three unit frames
   *  that shipped this controller are sized by their own Interface sliders. */
  scalable?: boolean;
  /** Accessible name / tooltip on the resize grip. Required when `scalable` is
   *  set: the grip is a real button, so it is never nameless. */
  resizeLabelKey?: TranslationKey;
  /** Hide the corner move button while the frame is LOCKED, so the frame is
   *  movable only through the global "Unlock interface" toggle. The three unit
   *  frames leave this unset and keep their always-visible corner button. */
  buttonOnlyWhenUnlocked?: boolean;
}

type MoveGesture = { kind: 'move'; pointerId: number; grabX: number; grabY: number };
type ScaleGesture = {
  kind: 'scale';
  pointerId: number;
  startX: number;
  startY: number;
  startScale: number;
  startW: number;
  startH: number;
};

export class MovableFrame {
  private pos: TargetFramePos | null = null;
  private unlocked = false;
  private gesture: MoveGesture | ScaleGesture | null = null;
  private readonly btn: HTMLButtonElement;
  private grip: HTMLButtonElement | null = null;

  constructor(private readonly cfg: MovableFrameConfig) {
    // The corner toggle. Built here (like the chat resize grip) so index.html
    // stays untouched; its glyph + position are styled in hud.css.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tf-move-btn';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
    cfg.frame.appendChild(btn);
    this.btn = btn;
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.setUnlocked(!this.unlocked);
    });
    btn.addEventListener('keydown', (ev) => this.onKeyMove(ev));

    // The SE-corner grip, built here like the button (and like the chat box's own
    // grip) so index.html stays untouched. CSS keeps it out of the way while the
    // frame is locked; the pointer gate below refuses a locked gesture anyway.
    // It is a real BUTTON, not the decorative div the chat box uses: this one is
    // the only path to a frame's size, so it carries its own accessible name and
    // the arrow-key resize below, exactly as the move button carries arrow-key
    // positioning. A pointer-only grip would leave a keyboard player able to
    // unlock and move every frame but resize none of them.
    if (cfg.scalable) {
      const grip = document.createElement('button');
      grip.type = 'button';
      // The second class is what scopes the "only while unlocked" CSS gate to
      // this controller's grips, leaving the chat box + meter panel grips alone.
      grip.className = 'panel-resize-grip mf-resize-grip';
      grip.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
      cfg.frame.appendChild(grip);
      this.grip = grip;
      grip.addEventListener('pointerdown', (ev) => this.onScaleStart(ev));
      grip.addEventListener('keydown', (ev) => this.onKeyScale(ev));
    }
    this.refreshChrome();

    // touch-action:none (so a drag is not stolen by browser panning) is scoped to
    // the unlocked state in CSS (.unitframe.tf-unlocked), never applied while
    // locked so it cannot interfere with normal touch behaviour on the frame.
    cfg.frame.addEventListener('pointerdown', (ev) => this.onMoveStart(ev));
    document.addEventListener('pointermove', (ev) => this.onPointerMove(ev));
    const end = (ev: PointerEvent) => this.onPointerEnd(ev);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    // Re-clamp into view when the viewport changes (mirrors the chat box logic).
    window.addEventListener('resize', () => {
      if (this.pos) this.applyPos();
    });

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(cfg.storageKey);
    } catch {
      /* storage unavailable */
    }
    this.pos = parseTargetFramePos(saved);
    if (this.pos) this.applyPos();
  }

  /** Re-resolve the button's + grip's t() labels in place (language switch). */
  relocalize(): void {
    this.refreshChrome();
  }

  /** True while the frame accepts a drag / grip gesture. */
  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Drive the lock state from outside the corner button, which is what the
   *  global "Unlock interface" toggle does. Kept a plain setter (no toggle) so
   *  the coordinator decides the state for every frame at once and one frame can
   *  never fall out of step with the others. */
  setLockState(unlocked: boolean): void {
    this.setUnlocked(unlocked);
  }

  /** Repaint the saved visual-space position against the live UI Scale. */
  reapplyPosition(): void {
    if (this.pos) this.applyPos();
  }

  /** Snap the frame back to its stock CSS spot: forget the saved position,
   *  clear the inline styles, undo any detach (onPositioned(false)), and lock
   *  the frame. Wired to the "Reset Frame Positions" interface option. */
  reset(): void {
    if (this.gesture) {
      this.gesture = null;
      document.body.classList.remove(this.cfg.draggingBodyClass);
    }
    this.pos = null;
    try {
      localStorage.removeItem(this.cfg.storageKey);
    } catch {
      /* storage unavailable */
    }
    // `transform` and `transform-origin` are cleared too: a scaled frame that
    // kept its multiplier after a reset would come back the wrong size, and the
    // cast bar's own translateX centering must go back to owning the property.
    for (const prop of ['left', 'top', 'right', 'bottom', 'transform', 'transform-origin'])
      this.cfg.frame.style.removeProperty(prop);
    this.cfg.onPositioned?.(false);
    this.setUnlocked(false);
  }

  // The move button's accessible name / tooltip and pressed state track whether the
  // frame is unlocked; the frame gets a class so the cursor + drag affordance show.
  private refreshChrome(): void {
    const label = this.unlocked ? t(this.cfg.lockLabelKey) : t(this.cfg.unlockLabelKey);
    this.btn.setAttribute('aria-pressed', this.unlocked ? 'true' : 'false');
    this.btn.setAttribute('aria-label', label);
    this.btn.title = label;
    this.btn.classList.toggle('active', this.unlocked);
    // A frame driven only by the global toggle keeps no permanent chrome: its
    // button is hidden (and taken out of the tab order) until the interface is
    // unlocked, so the stock HUD looks exactly as it did.
    if (this.cfg.buttonOnlyWhenUnlocked) {
      this.btn.classList.toggle('tf-move-btn-hidden', !this.unlocked);
      this.btn.hidden = !this.unlocked;
    }
    this.cfg.frame.classList.toggle('tf-unlocked', this.unlocked);
    // The grip is a real control too, so it follows the button out of the tab
    // order while the frame is locked. CSS already hides it (it is styled off a
    // .tf-unlocked parent), but `hidden` is what keeps a locked frame's grip
    // unreachable to a keyboard even before the stylesheet has a say.
    if (this.grip) {
      if (this.cfg.resizeLabelKey) {
        const resizeLabel = t(this.cfg.resizeLabelKey);
        this.grip.setAttribute('aria-label', resizeLabel);
        this.grip.title = resizeLabel;
      }
      this.grip.hidden = !this.unlocked;
    }
  }

  private setUnlocked(unlocked: boolean): void {
    this.unlocked = unlocked;
    this.refreshChrome();
  }

  // Seed the position from the live rect the first time a drag starts, so a frame
  // still on its CSS default converts cleanly to explicit px coordinates.
  private ensurePos(): void {
    if (this.pos) return;
    const rect = this.cfg.frame.getBoundingClientRect();
    this.pos = { left: rect.left, top: rect.top };
  }

  private onMoveStart(ev: PointerEvent): void {
    if (ev.button !== 0 || this.cfg.isMobileLayout() || !this.unlocked) return;
    const target = ev.target as HTMLElement | null;
    // The move button (and any icon buttons inside the frame) keep their own
    // behaviour; only the frame body area initiates a drag.
    if (!target || target.closest('button')) return;
    ev.preventDefault();
    this.ensurePos();
    // Apply the position NOW (converting a CSS-default spot to explicit px and
    // firing any detach side effect) so the grab offsets below are measured
    // against the frame's final dragged size, not its docked one.
    this.applyPos();
    const rect = this.cfg.frame.getBoundingClientRect();
    this.gesture = {
      kind: 'move',
      pointerId: ev.pointerId,
      grabX: ev.clientX - rect.left,
      grabY: ev.clientY - rect.top,
    };
    this.beginGesture(ev);
  }

  // The SE grip resizes rather than moves. It sits inside the frame, so its own
  // pointerdown would otherwise also start a move: stopping propagation here is
  // what keeps the two gestures apart (the frame listener runs on the bubble).
  private onScaleStart(ev: PointerEvent): void {
    if (ev.button !== 0 || this.cfg.isMobileLayout() || !this.unlocked) return;
    ev.stopPropagation();
    this.ensurePos();
    this.applyPos();
    const rect = this.cfg.frame.getBoundingClientRect();
    this.gesture = {
      kind: 'scale',
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      startScale: this.pos?.scale ?? 1,
      startW: rect.width,
      startH: rect.height,
    };
    this.beginGesture(ev);
  }

  private beginGesture(ev: PointerEvent): void {
    ev.preventDefault();
    document.body.classList.add(this.cfg.draggingBodyClass);
    try {
      this.cfg.frame.setPointerCapture?.(ev.pointerId);
    } catch {
      /* synthetic pointer */
    }
  }

  private onPointerMove(ev: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointerId !== ev.pointerId) return;
    ev.preventDefault();
    if (g.kind === 'move') {
      this.pos = {
        left: ev.clientX - g.grabX,
        top: ev.clientY - g.grabY,
        scale: this.pos?.scale,
      };
    } else {
      this.pos = {
        left: this.pos?.left ?? 0,
        top: this.pos?.top ?? 0,
        scale: scaleFromGripDrag(
          g.startScale,
          { w: g.startW, h: g.startH },
          ev.clientX - g.startX,
          ev.clientY - g.startY,
        ),
      };
    }
    this.applyPos();
  }

  private onPointerEnd(ev: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointerId !== ev.pointerId) return;
    this.gesture = null;
    document.body.classList.remove(this.cfg.draggingBodyClass);
    this.persistPos();
  }

  // Once unlocked, arrow keys provide the same persisted positioning path as a
  // pointer drag. This keeps the move toggle useful to keyboard-only players;
  // Shift gives a one-pixel fine adjustment instead of the default ten pixels.
  private onKeyMove(ev: KeyboardEvent): void {
    if (!this.unlocked || this.cfg.isMobileLayout()) return;
    const directions: Partial<Record<string, TargetFramePos>> = {
      ArrowLeft: { left: -1, top: 0 },
      ArrowRight: { left: 1, top: 0 },
      ArrowUp: { left: 0, top: -1 },
      ArrowDown: { left: 0, top: 1 },
    };
    const direction = directions[ev.key];
    if (!direction) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.ensurePos();
    const step = ev.shiftKey ? 1 : 10;
    this.pos = {
      left: (this.pos?.left ?? 0) + direction.left * step,
      top: (this.pos?.top ?? 0) + direction.top * step,
      scale: this.pos?.scale,
    };
    this.applyPos();
    this.persistPos();
  }

  // The grip's keyboard half, the exact mirror of onKeyMove: arrow keys walk the
  // size multiplier the pointer drag writes, Shift gives the fine step, and the
  // result persists like any other grip gesture. Right/Down grow and Left/Up
  // shrink, matching which way the SE grip travels for the same change.
  private onKeyScale(ev: KeyboardEvent): void {
    if (!this.unlocked || this.cfg.isMobileLayout()) return;
    const directions: Partial<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowUp: -1,
      ArrowRight: 1,
      ArrowDown: 1,
    };
    const direction = directions[ev.key];
    if (direction === undefined) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.ensurePos();
    this.pos = {
      left: this.pos?.left ?? 0,
      top: this.pos?.top ?? 0,
      scale: scaleFromKeyStep(this.pos?.scale ?? 1, direction, ev.shiftKey),
    };
    this.applyPos();
    this.persistPos();
  }

  private applyPos(): void {
    if (!this.pos) return;
    const frame = this.cfg.frame;
    // On the mobile layout the desktop-saved position must not apply. Clear any
    // inline left/top/right/bottom (e.g. left over after a live desktop-to-mobile
    // viewport shrink) so the mobile stylesheet owns the frame's position again.
    if (this.cfg.isMobileLayout()) {
      for (const prop of ['left', 'top', 'right', 'bottom', 'transform', 'transform-origin'])
        frame.style.removeProperty(prop);
      this.cfg.onPositioned?.(false);
      return;
    }
    // Write the multiplier BEFORE measuring, so the rect the clamp sees is the
    // frame at its chosen size. `scale()` deliberately REPLACES whatever the
    // stylesheet had (the cast bar's translateX(-50%) centering): once the frame
    // carries an explicit left/top, that centering would double-offset it.
    if (this.cfg.scalable) {
      const scale = clampFrameScale(this.pos.scale ?? 1);
      frame.style.transformOrigin = 'top left';
      frame.style.transform = `scale(${scale})`;
    }
    // Detach BEFORE measuring: a docked frame (the player frame in the action-bar
    // stack) changes size when its detached style kicks in, and the clamp must see
    // the size the frame will actually have at the applied position.
    this.cfg.onPositioned?.(true);
    const rect = frame.getBoundingClientRect();
    // The frame may be display:none (target frame with no target; rect is 0x0);
    // fall back to a nominal size so a saved spot still clamps sensibly.
    const size = {
      w: rect.width || this.cfg.fallbackSize.w,
      h: rect.height || this.cfg.fallbackSize.h,
    };
    // this.pos, the rect, and the viewport are all in visual (post-zoom) space; the
    // frame lives inside #ui (`zoom: var(--ui-scale)`), so the style write divides by
    // the live UI scale into author space (placeTargetFrame). The clamped VISUAL spot
    // is what we keep + persist, so a saved position renders at the same visual place
    // at any UI Scale.
    const placement = placeTargetFrame(
      this.pos,
      { w: window.innerWidth, h: window.innerHeight },
      size,
      getUiScale(),
    );
    this.pos = placement.pos;
    frame.style.left = `${placement.css.left}px`;
    frame.style.top = `${placement.css.top}px`;
    frame.style.right = 'auto';
    frame.style.bottom = 'auto';
  }

  private persistPos(): void {
    if (!this.pos) return;
    try {
      localStorage.setItem(this.cfg.storageKey, serializeTargetFramePos(this.pos));
    } catch {
      /* storage unavailable */
    }
  }
}
