// MovableFrame (src/ui/movable_frame.ts): the shared movable / lockable
// unit-frame controller behind the target AND player frames. These pin the
// contract the player-frame instance leans on: the corner button toggles the
// unlocked state (aria-pressed + tf-unlocked), a drag only works unlocked and
// on the desktop layout, a completed drag persists the clamped spot, and the
// onPositioned hook fires true while a custom position applies on desktop and
// false on the mobile layout (which also clears the inline position). The second
// describe covers the `scalable` config the "Unlock interface" frames use, whose
// SE grip is a real button carrying the arrow-key resize (the keyboard path that
// pairs with the move button's arrow-key positioning). Per the repo testing
// convention this drives a small hand-rolled fake DOM stubbed on globalThis (no
// jsdom).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FRAME_SCALE_KEY_FINE_STEP,
  FRAME_SCALE_KEY_STEP,
  FRAME_SCALE_MAX,
  FRAME_SCALE_MIN,
} from '../src/ui/target_frame_pos';

type Listener = (ev: unknown) => void;

class FakeClassList {
  private set = new Set<string>();
  add(c: string): void {
    this.set.add(c);
  }
  remove(c: string): void {
    this.set.delete(c);
  }
  toggle(c: string, force?: boolean): boolean {
    const on = force ?? !this.set.has(c);
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
  contains(c: string): boolean {
    return this.set.has(c);
  }
}

class FakeStyle {
  props = new Map<string, string>();
  removeProperty(p: string): void {
    this.props.delete(p);
  }
  set left(v: string) {
    this.props.set('left', v);
  }
  get left(): string {
    return this.props.get('left') ?? '';
  }
  set top(v: string) {
    this.props.set('top', v);
  }
  get top(): string {
    return this.props.get('top') ?? '';
  }
  set right(v: string) {
    this.props.set('right', v);
  }
  get right(): string {
    return this.props.get('right') ?? '';
  }
  set bottom(v: string) {
    this.props.set('bottom', v);
  }
  get bottom(): string {
    return this.props.get('bottom') ?? '';
  }
  // The scale half of a `scalable` frame: the controller writes both of these
  // whenever a position applies, and reset() removes them by name.
  set transform(v: string) {
    this.props.set('transform', v);
  }
  get transform(): string {
    return this.props.get('transform') ?? '';
  }
  set transformOrigin(v: string) {
    this.props.set('transform-origin', v);
  }
  get transformOrigin(): string {
    return this.props.get('transform-origin') ?? '';
  }
}

class FakeEl {
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  classList = new FakeClassList();
  style = new FakeStyle();
  attrs = new Map<string, string>();
  title = '';
  type = '';
  className = '';
  hidden = false;
  rect = { left: 40, top: 500, width: 612, height: 84 };
  private listeners = new Map<string, Listener[]>();

  appendChild(c: FakeEl): void {
    c.parentElement = this;
    this.children.push(c);
  }
  addEventListener(type: string, fn: Listener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  dispatch(type: string, ev: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  getBoundingClientRect() {
    const r = this.rect;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
  }
  setPointerCapture(): void {}
  closest(): null {
    // event targets in these tests are never inside a button
    return null;
  }
}

const fakeDocument = {
  body: new FakeEl(),
  createElement: () => new FakeEl(),
  addEventListener: (type: string, fn: Listener) => fakeDocument.body.addEventListener(type, fn),
};
const fakeWindow = {
  innerWidth: 1600,
  innerHeight: 900,
  addEventListener: () => {},
};
const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

// The live UI Scale getUiScale() reads back through getComputedStyle('--ui-scale').
// Default 1 keeps every existing assertion (scale is a no-op); one test drives it
// to 1.25 to prove the drag write is divided into #ui author space.
let uiScaleStub = 1;

// biome-ignore lint/suspicious/noExplicitAny: module handle loaded after the globals exist
let MovableFrame: any;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).document = fakeDocument;
  (globalThis as Record<string, unknown>).window = fakeWindow;
  (globalThis as Record<string, unknown>).localStorage = fakeStorage;
  (globalThis as Record<string, unknown>).getComputedStyle = () => ({
    getPropertyValue: (p: string) => (p === '--ui-scale' ? String(uiScaleStub) : ''),
  });
  ({ MovableFrame } = await import('../src/ui/movable_frame'));
}, 30_000);

beforeEach(() => {
  store.clear();
  uiScaleStub = 1;
  fakeDocument.body = new FakeEl();
});

const KEY = 'woc_test_frame_pos';

function makeFrame(opts: { mobile?: boolean; positioned?: Array<boolean> } = {}) {
  const frame = new FakeEl();
  const positioned: boolean[] = opts.positioned ?? [];
  const mover = new MovableFrame({
    frame,
    storageKey: KEY,
    unlockLabelKey: 'hudChrome.playerFrame.unlock',
    lockLabelKey: 'hudChrome.playerFrame.lock',
    draggingBodyClass: 'player-frame-dragging',
    fallbackSize: { w: 260, h: 84 },
    isMobileLayout: () => opts.mobile ?? false,
    onPositioned: (active: boolean) => positioned.push(active),
  });
  const btn = frame.children[0];
  return { frame, btn, mover, positioned };
}

// A frame in the "Unlock interface" shape: no permanent chrome, and the SE grip
// that carries BOTH resize gestures (pointer drag and arrow keys).
function makeScalableFrame(opts: { mobile?: boolean } = {}) {
  const frame = new FakeEl();
  const mover = new MovableFrame({
    frame,
    storageKey: KEY,
    unlockLabelKey: 'hudChrome.interfaceUnlock.unlockFrame',
    lockLabelKey: 'hudChrome.interfaceUnlock.lockFrame',
    resizeLabelKey: 'hudChrome.interfaceUnlock.resizeFrame',
    draggingBodyClass: 'hud-frame-dragging',
    fallbackSize: { w: 260, h: 84 },
    isMobileLayout: () => opts.mobile ?? false,
    scalable: true,
    buttonOnlyWhenUnlocked: true,
  });
  const btn = frame.children[0];
  const grip = frame.children[1];
  return { frame, btn, grip, mover };
}

function key(k: string, overrides: Record<string, unknown> = {}) {
  return { key: k, shiftKey: false, preventDefault() {}, stopPropagation() {}, ...overrides };
}

function scaleOf(frame: FakeEl): number {
  const m = /scale\(([-\d.]+)\)/.exec(frame.style.transform);
  return m ? Number(m[1]) : Number.NaN;
}

function pointer(overrides: Record<string, unknown> = {}) {
  return {
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 520,
    target: new FakeEl(),
    preventDefault() {},
    stopPropagation() {},
    ...overrides,
  };
}

describe('MovableFrame', () => {
  it('builds the corner button locked, and a click toggles unlock + aria-pressed', () => {
    const { frame, btn } = makeFrame();
    expect(btn.className).toBe('tf-move-btn');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('ArrowUp ArrowDown ArrowLeft ArrowRight');
    expect(frame.classList.contains('tf-unlocked')).toBe(false);

    btn.dispatch('click', pointer());
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.classList.contains('active')).toBe(true);
    expect(frame.classList.contains('tf-unlocked')).toBe(true);
    // the labels resolve through t() and swap with the state
    expect(btn.title.length).toBeGreaterThan(0);

    btn.dispatch('click', pointer());
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(frame.classList.contains('tf-unlocked')).toBe(false);
  });

  it('moves and persists with arrow keys while unlocked', () => {
    const { frame, btn, positioned } = makeFrame();
    btn.dispatch('click', pointer());

    let prevented = false;
    btn.dispatch('keydown', {
      key: 'ArrowRight',
      shiftKey: false,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation() {},
    });

    expect(prevented).toBe(true);
    expect(frame.style.left).toBe('50px');
    expect(frame.style.top).toBe('500px');
    expect(positioned).toContain(true);
    expect(JSON.parse(store.get(KEY) ?? '{}')).toEqual({ left: 50, top: 500 });

    btn.dispatch('keydown', {
      key: 'ArrowUp',
      shiftKey: true,
      preventDefault() {},
      stopPropagation() {},
    });
    expect(frame.style.top).toBe('499px');
    expect(JSON.parse(store.get(KEY) ?? '{}')).toEqual({ left: 50, top: 499 });
  });

  it('ignores a drag while locked, and on the mobile layout even when unlocked', () => {
    const locked = makeFrame();
    locked.frame.dispatch('pointerdown', pointer());
    fakeDocument.body.dispatch('pointermove', pointer({ clientX: 300, clientY: 300 }));
    expect(locked.frame.style.props.has('left')).toBe(false);
    expect(locked.positioned).toEqual([]);

    const mobile = makeFrame({ mobile: true });
    mobile.btn.dispatch('click', pointer()); // unlock
    mobile.frame.dispatch('pointerdown', pointer());
    fakeDocument.body.dispatch('pointermove', pointer({ clientX: 300, clientY: 300 }));
    expect(mobile.frame.style.props.has('left')).toBe(false);
    expect(mobile.positioned).toEqual([]);
  });

  it('unlocked drag applies + persists the clamped spot and fires onPositioned(true)', () => {
    const { frame, btn, positioned } = makeFrame();
    btn.dispatch('click', pointer()); // unlock
    frame.dispatch('pointerdown', pointer({ clientX: 100, clientY: 520 }));
    expect(fakeDocument.body.classList.contains('player-frame-dragging')).toBe(true);
    // grab offset = pointer - frame rect (40,500) = (60,20); move to (500,320)
    fakeDocument.body.dispatch('pointermove', pointer({ clientX: 500, clientY: 320 }));
    expect(frame.style.left).toBe('440px');
    expect(frame.style.top).toBe('300px');
    expect(frame.style.right).toBe('auto');
    expect(positioned).toContain(true);
    fakeDocument.body.dispatch('pointerup', pointer());
    expect(fakeDocument.body.classList.contains('player-frame-dragging')).toBe(false);
    expect(JSON.parse(store.get(KEY) ?? '{}')).toEqual({ left: 440, top: 300 });
  });

  it('at UI Scale 1.25 the drag write is divided into #ui author space, persisted spot is not', () => {
    uiScaleStub = 1.25;
    const { frame, btn } = makeFrame();
    btn.dispatch('click', pointer()); // unlock
    // rect (40,500) → grab offset (60,20); move the pointer to (500,320) so the
    // frame's VISUAL top-left tracks to (440,300) under the cursor.
    frame.dispatch('pointerdown', pointer({ clientX: 100, clientY: 520 }));
    fakeDocument.body.dispatch('pointermove', pointer({ clientX: 500, clientY: 320 }));
    // style.left/top are author lengths #ui's zoom re-multiplies: 440/1.25, 300/1.25.
    expect(frame.style.left).toBe('352px');
    expect(frame.style.top).toBe('240px');
    // The persisted spot stays in visual space (unchanged vs scale 1) so it renders
    // at the same visual place after a reload at any UI Scale.
    fakeDocument.body.dispatch('pointerup', pointer());
    expect(JSON.parse(store.get(KEY) ?? '{}')).toEqual({ left: 440, top: 300 });
  });

  it('reapplies a persisted visual position immediately when UI Scale changes live', () => {
    store.set(KEY, JSON.stringify({ left: 300, top: 200 }));
    const { frame, mover } = makeFrame();
    expect(frame.style.left).toBe('300px');
    expect(frame.style.top).toBe('200px');

    uiScaleStub = 1.25;
    mover.reapplyPosition();

    expect(frame.style.left).toBe('240px');
    expect(frame.style.top).toBe('160px');
    expect(JSON.parse(store.get(KEY) ?? '{}')).toEqual({ left: 300, top: 200 });
  });

  it('a drag is clamped inside the viewport margin', () => {
    const { frame, btn } = makeFrame();
    btn.dispatch('click', pointer());
    frame.dispatch('pointerdown', pointer({ clientX: 100, clientY: 520 }));
    fakeDocument.body.dispatch('pointermove', pointer({ clientX: -500, clientY: -500 }));
    // clamped to the 8px margin, never negative / off-screen
    expect(frame.style.left).toBe('8px');
    expect(frame.style.top).toBe('8px');
  });

  it('restores a saved desktop spot at construction (onPositioned(true) + inline px)', () => {
    store.set(KEY, JSON.stringify({ left: 300, top: 200 }));
    const { frame, positioned } = makeFrame();
    expect(frame.style.left).toBe('300px');
    expect(frame.style.top).toBe('200px');
    expect(positioned).toEqual([true]);
  });

  it('on the mobile layout a saved spot clears the inline position and re-docks', () => {
    store.set(KEY, JSON.stringify({ left: 300, top: 200 }));
    const { frame, positioned } = makeFrame({ mobile: true });
    // the mobile branch strips any inline position so the mobile stylesheet owns
    // the frame again, and tells the host to re-dock (onPositioned(false))
    expect(frame.style.props.has('left')).toBe(false);
    expect(frame.style.props.has('top')).toBe(false);
    expect(positioned).toEqual([false]);
  });

  it('reset() forgets the saved spot, clears inline styles, re-docks, and locks', () => {
    const { frame, btn, mover, positioned } = makeFrame();
    btn.dispatch('click', pointer()); // unlock
    frame.dispatch('pointerdown', pointer({ clientX: 100, clientY: 520 }));
    fakeDocument.body.dispatch('pointermove', pointer({ clientX: 500, clientY: 320 }));
    fakeDocument.body.dispatch('pointerup', pointer());
    expect(store.has(KEY)).toBe(true);

    mover.reset();
    expect(store.has(KEY)).toBe(false);
    expect(frame.style.props.size).toBe(0); // inline left/top/right/bottom gone
    expect(positioned.at(-1)).toBe(false); // the host re-docked the frame
    expect(btn.getAttribute('aria-pressed')).toBe('false'); // locked again
    expect(frame.classList.contains('tf-unlocked')).toBe(false);

    // and a stale drag gesture cannot resurrect the old spot after a reset
    fakeDocument.body.dispatch('pointermove', pointer({ clientX: 900, clientY: 700 }));
    expect(frame.style.props.size).toBe(0);
  });

  it('falls back to the CSS default on corrupt saved data', () => {
    store.set(KEY, '{not json');
    const { frame, positioned } = makeFrame();
    expect(frame.style.props.size).toBe(0);
    expect(positioned).toEqual([]);
  });
});

// The resize grip on a `scalable` frame is the ONLY route to a frame's size, so
// it holds the same keyboard contract the move button does: a real named button,
// out of the tab order while locked, and arrow-key operable while unlocked. It
// shipped pointer-only and aria-hidden, which left a keyboard-only or
// screen-reader player able to unlock and move every HUD frame but resize none.
describe('MovableFrame resize grip', () => {
  it('is a real named button, never an aria-hidden pointer-only affordance', () => {
    const { grip } = makeScalableFrame();
    expect(grip.className).toBe('panel-resize-grip mf-resize-grip');
    expect(grip.type).toBe('button');
    expect(grip.getAttribute('aria-hidden')).toBe(null);
    // it is announced by a real accessible name, not by the tooltip alone
    expect(grip.getAttribute('aria-label')).toBe(grip.title);
    expect((grip.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
    expect(grip.getAttribute('aria-keyshortcuts')).toBe('ArrowUp ArrowDown ArrowLeft ArrowRight');
  });

  it('leaves the tab order while the frame is locked and rejoins it when unlocked', () => {
    const { btn, grip } = makeScalableFrame();
    expect(grip.hidden).toBe(true);
    btn.dispatch('click', pointer());
    expect(grip.hidden).toBe(false);
    btn.dispatch('click', pointer());
    expect(grip.hidden).toBe(true);
  });

  it('resizes and persists with arrow keys while unlocked, Shift for the fine step', () => {
    const { frame, btn, grip } = makeScalableFrame();
    btn.dispatch('click', pointer());

    let prevented = false;
    grip.dispatch(
      'keydown',
      key('ArrowRight', {
        preventDefault: () => {
          prevented = true;
        },
      }),
    );
    expect(prevented).toBe(true);
    expect(scaleOf(frame)).toBeCloseTo(1 + FRAME_SCALE_KEY_STEP, 9);
    expect(frame.style.transformOrigin).toBe('top left');
    expect(JSON.parse(store.get(KEY) ?? '{}').scale).toBeCloseTo(1 + FRAME_SCALE_KEY_STEP, 9);

    // ArrowDown grows too (the grip travels down-right to grow), ArrowUp/Left shrink
    grip.dispatch('keydown', key('ArrowDown'));
    expect(scaleOf(frame)).toBeCloseTo(1 + 2 * FRAME_SCALE_KEY_STEP, 9);
    grip.dispatch('keydown', key('ArrowLeft'));
    grip.dispatch('keydown', key('ArrowUp'));
    expect(scaleOf(frame)).toBeCloseTo(1, 9);

    grip.dispatch('keydown', key('ArrowRight', { shiftKey: true }));
    expect(scaleOf(frame)).toBeCloseTo(1 + FRAME_SCALE_KEY_FINE_STEP, 9);
    expect(JSON.parse(store.get(KEY) ?? '{}').scale).toBeCloseTo(1 + FRAME_SCALE_KEY_FINE_STEP, 9);
  });

  it('keeps the frame position while resizing, and its size while moving', () => {
    const { frame, btn, grip } = makeScalableFrame();
    btn.dispatch('click', pointer());
    btn.dispatch('keydown', key('ArrowRight'));
    expect(frame.style.left).toBe('50px');

    grip.dispatch('keydown', key('ArrowRight'));
    // resizing does not walk the frame away from where it was put
    expect(JSON.parse(store.get(KEY) ?? '{}')).toEqual({
      left: 50,
      top: 500,
      scale: 1 + FRAME_SCALE_KEY_STEP,
    });

    // and a later move keeps the chosen size rather than resetting it
    btn.dispatch('keydown', key('ArrowDown'));
    expect(JSON.parse(store.get(KEY) ?? '{}')).toEqual({
      left: 50,
      top: 510,
      scale: 1 + FRAME_SCALE_KEY_STEP,
    });
  });

  it('ignores an arrow key while locked, and on the mobile layout even when unlocked', () => {
    const locked = makeScalableFrame();
    locked.grip.dispatch('keydown', key('ArrowRight'));
    expect(locked.frame.style.props.has('transform')).toBe(false);
    expect(store.has(KEY)).toBe(false);

    const mobile = makeScalableFrame({ mobile: true });
    mobile.btn.dispatch('click', pointer()); // unlock
    mobile.grip.dispatch('keydown', key('ArrowRight'));
    expect(mobile.frame.style.props.has('transform')).toBe(false);
    expect(store.has(KEY)).toBe(false);
  });

  it('ignores a key it does not own, so Tab and Escape still reach the browser', () => {
    const { frame, btn, grip } = makeScalableFrame();
    btn.dispatch('click', pointer());
    for (const k of ['Tab', 'Escape', 'Enter', ' ']) {
      let prevented = false;
      grip.dispatch(
        'keydown',
        key(k, {
          preventDefault: () => {
            prevented = true;
          },
        }),
      );
      expect(prevented).toBe(false);
    }
    expect(frame.style.props.has('transform')).toBe(false);
  });

  it('a key resize is clamped into the legal band at both ends', () => {
    const { frame, btn, grip } = makeScalableFrame();
    btn.dispatch('click', pointer());
    for (let i = 0; i < 60; i++) grip.dispatch('keydown', key('ArrowRight'));
    expect(scaleOf(frame)).toBe(FRAME_SCALE_MAX);
    for (let i = 0; i < 60; i++) grip.dispatch('keydown', key('ArrowLeft'));
    expect(scaleOf(frame)).toBe(FRAME_SCALE_MIN);
  });

  it('relocalize() re-resolves the grip name, not only the move button', () => {
    const { grip, mover } = makeScalableFrame();
    grip.setAttribute('aria-label', 'stale');
    grip.title = 'stale';
    mover.relocalize();
    expect(grip.getAttribute('aria-label')).not.toBe('stale');
    expect(grip.title).toBe(grip.getAttribute('aria-label'));
  });

  it('reset() clears the chosen size along with the position', () => {
    const { frame, btn, grip, mover } = makeScalableFrame();
    btn.dispatch('click', pointer());
    grip.dispatch('keydown', key('ArrowRight'));
    expect(frame.style.props.has('transform')).toBe(true);

    mover.reset();
    expect(frame.style.props.size).toBe(0);
    expect(store.has(KEY)).toBe(false);
    expect(grip.hidden).toBe(true);
  });
});
