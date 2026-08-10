// The "Unlock interface" coordinator (src/ui/interface_unlock.ts): one press
// loosens every LIVE frame at once, a second press locks them all back
// (including any that went inactive meanwhile), the body class the stylesheet
// gates on tracks the flag, and the reset path locks first and then clears every
// registered frame. Per the repo testing convention this drives hand-rolled
// fakes rather than jsdom: the coordinator only ever calls setLockState / reset
// / reapplyPosition / relocalize on a mover, which is exactly what is faked.
import { describe, expect, it } from 'vitest';
import {
  INTERFACE_UNLOCKED_BODY_CLASS,
  InterfaceUnlock,
  makeUiRootDetacher,
} from '../src/ui/interface_unlock';
import type { HudFrameSpec } from '../src/ui/interface_unlock_core';
import type { MovableFrame } from '../src/ui/movable_frame';

class FakeMover {
  locked: boolean[] = [];
  resets = 0;
  reapplies = 0;
  relocalizes = 0;
  setLockState(unlocked: boolean): void {
    this.locked.push(unlocked);
  }
  reset(): void {
    this.resets += 1;
  }
  reapplyPosition(): void {
    this.reapplies += 1;
  }
  relocalize(): void {
    this.relocalizes += 1;
  }
  get last(): boolean | undefined {
    return this.locked.at(-1);
  }
}

function fakeDocument() {
  const classes = new Set<string>();
  return {
    classes,
    doc: {
      body: {
        classList: {
          toggle(name: string, force?: boolean) {
            const on = force ?? !classes.has(name);
            if (on) classes.add(name);
            else classes.delete(name);
            return on;
          },
        },
      },
    } as unknown as Document,
  };
}

function harness(active: Record<string, boolean>) {
  const { classes, doc } = fakeDocument();
  const unlock = new InterfaceUnlock({ document: doc });
  const movers = new Map<string, FakeMover>();
  for (const id of Object.keys(active)) {
    const mover = new FakeMover();
    movers.set(id, mover);
    unlock.register({
      id,
      mover: mover as unknown as MovableFrame,
      isActive: () => active[id] ?? false,
    });
  }
  return { unlock, movers, classes, active };
}

describe('InterfaceUnlock', () => {
  it('starts locked and reports the flag it flips to', () => {
    const { unlock } = harness({ actionBar1: true });
    expect(unlock.isUnlocked).toBe(false);
    expect(unlock.toggle()).toBe(true);
    expect(unlock.isUnlocked).toBe(true);
    expect(unlock.toggle()).toBe(false);
    expect(unlock.isUnlocked).toBe(false);
  });

  it('unlocks only the live frames, and never an inactive one', () => {
    const { unlock, movers } = harness({ actionBar1: true, petFrame: false, castBar: true });
    unlock.setUnlocked(true);
    expect(movers.get('actionBar1')?.last).toBe(true);
    expect(movers.get('castBar')?.last).toBe(true);
    // A warlock with no pet out gets no pet frame to drag.
    expect(movers.get('petFrame')?.last).toBe(false);
  });

  it('locks every frame on the way back, including one that went inactive', () => {
    const { unlock, movers, active } = harness({ actionBar1: true, petFrame: true });
    unlock.setUnlocked(true);
    expect(movers.get('petFrame')?.last).toBe(true);
    // The pet is dismissed while the interface is still unlocked.
    active.petFrame = false;
    unlock.setUnlocked(false);
    expect(movers.get('petFrame')?.last).toBe(false);
    expect(movers.get('actionBar1')?.last).toBe(false);
  });

  it('drives the body class the stylesheet gates the unlocked chrome on', () => {
    const { unlock, classes } = harness({ actionBar1: true });
    expect(classes.has(INTERFACE_UNLOCKED_BODY_CLASS)).toBe(false);
    unlock.setUnlocked(true);
    expect(classes.has(INTERFACE_UNLOCKED_BODY_CLASS)).toBe(true);
    unlock.setUnlocked(false);
    expect(classes.has(INTERFACE_UNLOCKED_BODY_CLASS)).toBe(false);
  });

  it('resetAll locks first, then resets every registered frame', () => {
    const { unlock, movers, classes } = harness({ actionBar1: true, minimap: true });
    unlock.setUnlocked(true);
    unlock.resetAll();
    expect(unlock.isUnlocked).toBe(false);
    expect(classes.has(INTERFACE_UNLOCKED_BODY_CLASS)).toBe(false);
    for (const mover of movers.values()) {
      expect(mover.resets).toBe(1);
      // Locking must land BEFORE the reset, or a live gesture outlives the clear.
      expect(mover.last).toBe(false);
    }
  });

  it('fans reapply and relocalize out to every frame (the single fan-out arm)', () => {
    const { unlock, movers } = harness({ actionBar1: true, petFrame: false });
    unlock.reapplyAll();
    unlock.relocalize();
    for (const mover of movers.values()) {
      // Inactive frames are included: a saved box still has to survive a UI
      // Scale change, and a hidden frame's labels still have to follow a
      // language switch for the next time it appears.
      expect(mover.reapplies).toBe(1);
      expect(mover.relocalizes).toBe(1);
    }
  });

  it('is a no-op with nothing registered', () => {
    const { unlock, classes } = harness({});
    expect(unlock.toggle()).toBe(true);
    expect(classes.has(INTERFACE_UNLOCKED_BODY_CLASS)).toBe(true);
  });
});

// A minimal element/parent graph: enough to prove the reparent goes to #ui and
// comes back to the exact original slot.
class FakeNode {
  children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  id = '';
  classes = new Set<string>();
  classList = {
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classes.has(name);
      if (on) this.classes.add(name);
      else this.classes.delete(name);
      return on;
    },
  };
  appendChild(child: FakeNode): void {
    child.parentNode?.remove(child);
    child.parentNode = this;
    this.children.push(child);
  }
  insertBefore(child: FakeNode, next: FakeNode | null): void {
    child.parentNode?.remove(child);
    child.parentNode = this;
    const at = next ? this.children.indexOf(next) : -1;
    if (at < 0) this.children.push(child);
    else this.children.splice(at, 0, child);
  }
  remove(child: FakeNode): void {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
  }
  get nextSibling(): FakeNode | null {
    const siblings = this.parentNode?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
}

const spec = (detachToUiRoot: boolean): HudFrameSpec => ({
  id: 'actionBar1',
  elementId: 'actionbar',
  storageKey: 'woc_hud_frame_actionbar',
  fallbackSize: { w: 612, h: 46 },
  detachToUiRoot,
});

describe('makeUiRootDetacher', () => {
  function scene() {
    const uiRoot = new FakeNode();
    const stack = new FakeNode();
    const before = new FakeNode();
    const frame = new FakeNode();
    const after = new FakeNode();
    for (const node of [before, frame, after]) stack.appendChild(node);
    const doc = { getElementById: (id: string) => (id === 'ui' ? uiRoot : null) } as Document;
    return { uiRoot, stack, before, frame, after, doc };
  }

  it('re-homes a transformed-ancestor frame onto #ui and back to its exact slot', () => {
    const { uiRoot, stack, frame, after, doc } = scene();
    const detach = makeUiRootDetacher(doc, spec(true), frame as unknown as HTMLElement);

    detach(true);
    expect(frame.parentNode).toBe(uiRoot);
    expect(stack.children).not.toContain(frame);

    detach(false);
    // Back between its original siblings, not appended to the end.
    expect(stack.children.indexOf(frame)).toBe(1);
    expect(frame.nextSibling).toBe(after);
  });

  it('leaves an already-#ui frame where it is, and still stamps the class', () => {
    const { stack, frame, doc } = scene();
    const detach = makeUiRootDetacher(doc, spec(false), frame as unknown as HTMLElement);
    detach(true);
    expect(frame.parentNode).toBe(stack);
    expect(frame.classes.has('hud-frame-detached')).toBe(true);
    detach(false);
    expect(frame.classes.has('hud-frame-detached')).toBe(false);
  });

  it('is idempotent: a repeated detach does not lose the original slot', () => {
    const { uiRoot, stack, frame, after, doc } = scene();
    const detach = makeUiRootDetacher(doc, spec(true), frame as unknown as HTMLElement);
    detach(true);
    detach(true);
    expect(frame.parentNode).toBe(uiRoot);
    detach(false);
    expect(stack.children.indexOf(frame)).toBe(1);
    expect(frame.nextSibling).toBe(after);
  });
});
