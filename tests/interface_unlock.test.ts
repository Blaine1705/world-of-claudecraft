// The "Unlock interface" coordinator (src/ui/interface_unlock.ts): one press
// loosens every LIVE frame at once, a second press locks them all back
// (including any that went inactive meanwhile), the body class the stylesheet
// gates on tracks the flag, and the reset path locks first and then clears every
// registered frame. Per the repo testing convention this drives hand-rolled
// fakes rather than jsdom: the coordinator only ever calls setLockState / reset
// / reapplyPosition / relocalize on a mover, which is exactly what is faked.
import { describe, expect, it } from 'vitest';
import {
  type FramesMenuSelect,
  type FramesMenuToggle,
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
  label = 'Frame';
  hidden = false;
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
  labelText(): string {
    return this.label;
  }
  get isUserHidden(): boolean {
    return this.hidden;
  }
  setUserHidden(hidden: boolean): void {
    this.hidden = hidden;
  }
  get last(): boolean | undefined {
    return this.locked.at(-1);
  }
}

// A minimal element for the coordinator's minted chrome (the edit-controls bar,
// its two buttons, and the frames dropdown's checkbox rows): children, a
// handler map an assertion can fire, and the few properties the code writes.
class FakeEl {
  tag: string;
  type = '';
  id = '';
  className = '';
  textContent = '';
  title = '';
  hidden = false;
  checked = false;
  open = false;
  // The select rows: an option's value/selected, and the select's live value.
  value = '';
  selected = false;
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  handlers = new Map<string, Array<() => void>>();
  constructor(tag: string) {
    this.tag = tag;
  }
  appendChild(child: FakeEl): void {
    this.children.push(child);
  }
  removeChild(child: FakeEl): void {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
  }
  get firstChild(): FakeEl | null {
    return this.children[0] ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  addEventListener(type: string, handler: () => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }
  fire(type: string): void {
    for (const handler of this.handlers.get(type) ?? []) handler();
  }
}

function fakeDocument() {
  const classes = new Set<string>();
  // The coordinator also mints the floating edit controls into #ui, so the
  // fake carries just enough of that host to accept them.
  const uiRoot = new FakeEl('div');
  const made: FakeEl[] = [];
  return {
    classes,
    uiRoot,
    made,
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
      getElementById: (id: string) => (id === 'ui' ? uiRoot : null),
      createElement: (tag: string) => {
        const el = new FakeEl(tag);
        made.push(el);
        return el;
      },
    } as unknown as Document,
  };
}

function harness(
  active: Record<string, boolean>,
  toggles: FramesMenuToggle[] = [],
  selects: FramesMenuSelect[] = [],
) {
  const { classes, doc, made, uiRoot } = fakeDocument();
  const unlock = new InterfaceUnlock({
    document: doc,
    framesMenuLabel: () => 'Frames Settings',
    framesMenuTitle: () => 'Show or hide frames',
    framesSubmenuLabel: () => 'Show or Hide Frames',
    settingToggles: () => toggles,
    settingSelects: () => selects,
  });
  const movers = new Map<string, FakeMover>();
  for (const id of Object.keys(active)) {
    const mover = new FakeMover();
    mover.label = id;
    movers.set(id, mover);
    unlock.register({
      id,
      mover: mover as unknown as MovableFrame,
      isActive: () => active[id] ?? false,
    });
  }
  const byId = (id: string) => made.find((el) => el.id === id);
  // The show/hide rows live inside the details sub-menu's rows container:
  // menu > details(.frames-menu-sub) > [summary, div.frames-menu-rows].
  const frameRows = () => byId('interface-frames-menu')?.children[0]?.children[1]?.children ?? [];
  const settingRows = () =>
    byId('interface-frames-menu')?.children.find((c) => c.className === 'frames-menu-settings')
      ?.children ?? [];
  return { unlock, movers, classes, active, made, uiRoot, byId, frameRows, settingRows };
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

describe('InterfaceUnlock frames menu', () => {
  it('mints the edit controls once: the exit and the menu button share one bar in #ui', () => {
    const { unlock, uiRoot, byId } = harness({ actionBar1: true });
    unlock.setUnlocked(true);
    const bar = byId('interface-edit-controls');
    expect(bar).toBeTruthy();
    expect(uiRoot.children).toContain(bar);
    expect(bar?.children.map((c) => c.id)).toEqual([
      'interface-lock-all',
      'interface-frames-toggle',
      'interface-frames-menu',
    ]);
    // Collapsed until the button opens it.
    expect(byId('interface-frames-menu')?.hidden).toBe(true);
    expect(byId('interface-frames-toggle')?.attrs.get('aria-expanded')).toBe('false');
    // A second unlock reuses the same bar rather than minting a twin.
    unlock.setUnlocked(false);
    unlock.setUnlocked(true);
    expect(uiRoot.children.filter((c) => c.id === 'interface-edit-controls')).toHaveLength(1);
  });

  it('lists a ticked row per live frame in the sub-menu, keeps a hidden frame listed, skips inactive', () => {
    const { unlock, movers, byId, frameRows } = harness({
      actionBar1: true,
      minimap: true,
      petFrame: false,
    });
    movers.get('minimap')?.setUserHidden(true);
    unlock.setUnlocked(true);
    byId('interface-frames-toggle')?.fire('click');
    const menu = byId('interface-frames-menu');
    expect(menu?.hidden).toBe(false);
    expect(byId('interface-frames-toggle')?.attrs.get('aria-expanded')).toBe('true');
    // The show/hide list folds into a details sub-menu with its own summary.
    const sub = menu?.children[0];
    expect(sub?.tag).toBe('details');
    expect(sub?.children[0]?.tag).toBe('summary');
    expect(sub?.children[0]?.textContent).toBe('Show or Hide Frames');
    const rows = frameRows();
    expect(rows.map((r) => r.children[1]?.textContent)).toEqual(['actionBar1', 'minimap']);
    // The checkbox state mirrors the mover: hidden rides unticked, which is the
    // way back to showing the frame again.
    expect(rows[0]?.children[0]?.checked).toBe(true);
    expect(rows[1]?.children[0]?.checked).toBe(false);
  });

  it('toggling a row drives the mover hidden state both ways', () => {
    const { unlock, movers, byId, frameRows } = harness({ actionBar1: true });
    unlock.setUnlocked(true);
    byId('interface-frames-toggle')?.fire('click');
    const box = frameRows()[0]?.children[0];
    expect(box).toBeTruthy();
    if (!box) return;
    box.checked = false;
    box.fire('change');
    expect(movers.get('actionBar1')?.hidden).toBe(true);
    box.checked = true;
    box.fire('change');
    expect(movers.get('actionBar1')?.hidden).toBe(false);
  });

  it('renders the frame-behavior setting toggles below the sub-menu and drives set()', () => {
    const seen: Array<[string, boolean]> = [];
    const toggles: FramesMenuToggle[] = [
      {
        id: 'combineActionBars',
        label: 'Combine Action Bars',
        value: false,
        set: (v) => seen.push(['combineActionBars', v]),
      },
      {
        id: 'lockActionBars',
        label: 'Lock Action Bars',
        value: true,
        set: (v) => seen.push(['lockActionBars', v]),
      },
    ];
    const { unlock, byId, settingRows } = harness({ actionBar1: true }, toggles);
    unlock.setUnlocked(true);
    byId('interface-frames-toggle')?.fire('click');
    const rows = settingRows();
    expect(rows.map((r) => r.children[1]?.textContent)).toEqual([
      'Combine Action Bars',
      'Lock Action Bars',
    ]);
    expect(rows[0]?.children[0]?.checked).toBe(false);
    expect(rows[1]?.children[0]?.checked).toBe(true);
    const box = rows[0]?.children[0];
    if (!box) return;
    box.checked = true;
    box.fire('change');
    expect(seen).toEqual([['combineActionBars', true]]);
  });

  it('renders a label + select row for a discrete setting and drives set() with the number', () => {
    const seen: number[] = [];
    const selects: FramesMenuSelect[] = [
      {
        id: 'partyFrameColumns',
        label: 'Raid Columns',
        value: 2,
        options: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) })),
        set: (v) => seen.push(v),
      },
    ];
    const { unlock, byId, settingRows } = harness({ actionBar1: true }, [], selects);
    unlock.setUnlocked(true);
    byId('interface-frames-toggle')?.fire('click');
    const row = settingRows().at(-1);
    expect(row?.className).toBe('frames-menu-row frames-menu-select');
    expect(row?.children[0]?.textContent).toBe('Raid Columns');
    const picker = row?.children[1];
    expect(picker?.tag).toBe('select');
    expect(picker?.children.map((o) => o.value)).toEqual(['1', '2', '3', '4', '5']);
    // Only the current value's option is pre-selected.
    expect(picker?.children.map((o) => o.selected)).toEqual([false, true, false, false, false]);
    if (!picker) return;
    picker.value = '4';
    picker.fire('change');
    expect(seen).toEqual([4]);
  });

  it('keeps the sub-menu expanded state across a rebuild (a mid-session refresh)', () => {
    const { unlock, byId, active } = harness({ actionBar1: true, actionBar2: false });
    unlock.setUnlocked(true);
    byId('interface-frames-toggle')?.fire('click');
    const sub = byId('interface-frames-menu')?.children[0];
    expect(sub?.open).toBe(false);
    if (!sub) return;
    sub.open = true;
    sub.fire('toggle');
    // A bar enabled mid-unlock refreshes the coordinator, which rebuilds the
    // open menu; the fold the player just opened must not snap shut.
    active.actionBar2 = true;
    unlock.refresh();
    const rebuilt = byId('interface-frames-menu')?.children[0];
    expect(rebuilt).not.toBe(sub);
    expect(rebuilt?.open).toBe(true);
  });

  it('a rowOverride entry lists on listed(), reads value(), writes set(), never the hidden flag', () => {
    const { unlock, movers, byId } = harness({ actionBar1: true, actionBar2: false });
    // The optional-bar shape: listed even while INACTIVE (the bar is off), the
    // checkbox mirroring an external enabled state rather than the hidden flag.
    let barsSplit = true;
    let enabled = false;
    const sets: boolean[] = [];
    const entries = (unlock as unknown as { entries: Array<{ id: string; rowOverride?: object }> })
      .entries;
    const bar2 = entries.find((e) => e.id === 'actionBar2');
    if (bar2) {
      bar2.rowOverride = {
        listed: () => barsSplit,
        value: () => enabled,
        set: (checked: boolean) => {
          sets.push(checked);
          enabled = checked;
        },
      };
    }
    unlock.setUnlocked(true);
    byId('interface-frames-toggle')?.fire('click');
    const rowsOf = () => byId('interface-frames-menu')?.children[0]?.children[1]?.children ?? [];
    let row = rowsOf().find((r) => r.children[1]?.textContent === 'actionBar2');
    expect(row, 'inactive overridden bar still listed').toBeTruthy();
    expect(row?.children[0]?.checked).toBe(false);
    // Ticking drives set(), not the mover's hidden flag.
    const box = row?.children[0];
    if (box) {
      box.checked = true;
      box.fire('change');
    }
    expect(sets).toEqual([true]);
    expect(movers.get('actionBar2')?.hidden).toBe(false);
    // Combined (listed() false): the row folds away on the next rebuild.
    barsSplit = false;
    unlock.refresh();
    row = rowsOf().find((r) => r.children[1]?.textContent === 'actionBar2');
    expect(row).toBeUndefined();
  });

  it('locking the interface folds the menu so re-entering starts clean', () => {
    const { unlock, byId } = harness({ actionBar1: true });
    unlock.setUnlocked(true);
    byId('interface-frames-toggle')?.fire('click');
    expect(byId('interface-frames-menu')?.hidden).toBe(false);
    unlock.setUnlocked(false);
    expect(byId('interface-frames-menu')?.hidden).toBe(true);
    expect(byId('interface-frames-toggle')?.attrs.get('aria-expanded')).toBe('false');
    expect(byId('interface-edit-controls')?.hidden).toBe(true);
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
  labelKey: 'hudChrome.interfaceUnlock.frameNames.actionBar1',
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
