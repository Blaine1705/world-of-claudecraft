// Coordinator behind the "Unlock interface" Interface option: one flag, one
// registry of MovableFrame instances, and the body class the stylesheet reads.
//
// It owns no geometry of its own. Every frame it governs is an ordinary
// MovableFrame (movable_frame.ts) that already knows how to drag, scale, clamp
// and persist itself; this module only decides WHICH of them are loose right
// now, which is the whole feature: a single press unlocks every live frame and a
// second press locks them all back. The eligibility rule and the frame table are
// pure (interface_unlock_core.ts) so a Vitest pins them without a DOM.
//
// Desktop only, like every frame gesture in this HUD: MovableFrame refuses a
// gesture on the mobile layout and the stylesheet hides the chrome there, so an
// unlocked interface on a phone is inert rather than half-working.

import { framesToLock, type HudFrameSpec, type UnlockCandidate } from './interface_unlock_core';
import type { MovableFrame } from './movable_frame';

/** Where a re-homed frame came from, so locking can put it back exactly. */
interface FrameHome {
  parent: Node;
  next: Node | null;
}

export interface UnlockEntry {
  id: string;
  mover: MovableFrame;
  /** Live for this character right now (a pet is out, the bar is enabled). */
  isActive(): boolean;
}

export interface InterfaceUnlockDeps {
  document: Document;
}

/** Body class the stylesheet gates the unlocked affordances on (the frame
 *  outline, the corner button, the resize grip, the cast-bar preview). */
export const INTERFACE_UNLOCKED_BODY_CLASS = 'interface-unlocked';

export class InterfaceUnlock {
  private unlocked = false;
  private readonly entries: UnlockEntry[] = [];

  constructor(private readonly deps: InterfaceUnlockDeps) {}

  /** Join a frame to the global toggle. Order is the registration order, which
   *  is the frame-table order for the HUD frames and then the unit frames. */
  register(entry: UnlockEntry): void {
    this.entries.push(entry);
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Flip every registered frame at once. Returns the new state so the caller
   *  can repaint its own label without re-reading. */
  toggle(): boolean {
    this.setUnlocked(!this.unlocked);
    return this.unlocked;
  }

  setUnlocked(unlocked: boolean): void {
    this.unlocked = unlocked;
    const candidates: UnlockCandidate[] = this.entries.map((e) => ({
      id: e.id,
      isActive: e.isActive,
    }));
    const decisions = new Map(framesToLock(candidates, unlocked).map((d) => [d.id, d.unlocked]));
    for (const entry of this.entries) {
      entry.mover.setLockState(decisions.get(entry.id) ?? false);
    }
    this.deps.document.body.classList.toggle(INTERFACE_UNLOCKED_BODY_CLASS, unlocked);
  }

  /** Lock everything and forget every saved box. Wired to the existing
   *  "Reset Frame Positions" option so one button still undoes every drag. */
  resetAll(): void {
    this.setUnlocked(false);
    for (const entry of this.entries) entry.mover.reset();
  }

  /** Repaint every saved visual-space box after a live UI Scale change. */
  reapplyAll(): void {
    for (const entry of this.entries) entry.mover.reapplyPosition();
  }

  /** Re-resolve every frame's t() labels in place (language switch). This is the
   *  ONE fan-out arm for every MovableFrame in the HUD: the three unit frames
   *  register here too, so their corner-button labels ride the same call. */
  relocalize(): void {
    for (const entry of this.entries) entry.mover.relocalize();
  }
}

/**
 * Re-home a frame onto #ui while a custom position applies, and back to its
 * stock slot when it stops. A frame inside #bottom-bar (the action bars, the pet
 * frame) sits under a centering transform, and a transformed ancestor becomes
 * the containing block for absolute positioning, so its saved left/top would
 * resolve in the wrong coordinates. This is the same move Hud already makes for
 * the player frame, generalized so every table row can share it: the element
 * refs the painters hold are live nodes, so they survive the reparent.
 */
export function makeUiRootDetacher(
  doc: Document,
  spec: HudFrameSpec,
  frame: HTMLElement,
): (active: boolean) => void {
  let home: FrameHome | null = null;
  return (active: boolean) => {
    frame.classList.toggle('hud-frame-detached', active);
    if (!spec.detachToUiRoot) return;
    if (active) {
      const uiRoot = doc.getElementById('ui');
      if (!uiRoot || frame.parentNode === uiRoot) return;
      home ??= { parent: frame.parentNode as Node, next: frame.nextSibling };
      uiRoot.appendChild(frame);
      return;
    }
    if (!home || frame.parentNode === home.parent) return;
    home.parent.insertBefore(frame, home.next);
  };
}
