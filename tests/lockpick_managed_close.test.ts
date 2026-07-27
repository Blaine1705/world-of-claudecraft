// @vitest-environment jsdom

// The lockpick panel's managed-window close path (#2517).
//
// `#lockpick-panel` is a `.window .panel`, so `Hud.closeAll()` picks it up through
// `topmostOpenWindow()` and hands it to `closeManagedWindow`. With no `case` for its id it
// fell to the `default:` arm, which is `el.style.display = 'none'` and nothing else: the
// 100ms countdown interval kept firing into a hidden subtree for the rest of the attempt,
// the focus trap stayed armed on an invisible panel, and the live session was never
// withdrawn (the server kept burning the per-step clock on a board the player could not see).
//
// The keyboard Escape never showed this. `LockpickController` installs a capture-phase
// window keydown handler that calls `stopImmediatePropagation`, so Escape is handled by the
// controller and never reaches `src/game/input.ts`'s bubble listener at all. The GAMEPAD
// escape is the reachable path: `dispatchGamepadAction('escape')` in `src/main.ts` calls
// `hud.closeAll()` directly, with no DOM event for that capture handler to intercept.
//
// So these cases drive `closeAll()` (not a synthetic key event) over a REAL controller and a
// REAL window, and pin that the two dismissal paths produce the same observable teardown.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusTrapHandle } from '../src/ui/focus_manager';
import { Hud } from '../src/ui/hud';
import { LockpickController } from '../src/ui/hud/delve/lockpick_controller';
import type { LockpickView } from '../src/world_api';

const LIVE: LockpickView = {
  sessionId: 'lp_9_0',
  objectId: 9,
  w: 4,
  h: 4,
  col: 0,
  row: 2,
  page: 1,
  pageCount: 2,
  tries: 2,
  triesTotal: 2,
  lootTier: 'premium',
  allowed: ['set', 'steady', 'ease'],
  visible: [],
  stepTimeoutMs: 15000,
};

// Only the members closeAll -> closeManagedWindow actually read; closeManagedWindow is
// private, so the bare-prototype harness is the hud_confirm_gates / profession_tutorial
// precedent. `windowDragController` is deliberately left undefined: the real field is
// optional-chained, and Object.create skips field initializers.
interface CloseAllHarness {
  lockpickController: LockpickController;
  lootWindow: { hasOpenChest: boolean };
  playerCard: { isOpen: boolean };
  emoteWheelOpen: boolean;
  syncAnyWindowOpenState(): void;
  hideTooltip(): void;
  closeAll(): boolean;
  topmostOpenWindow(): HTMLElement | null;
}

// Every controller a case builds, so afterEach can drop its capture-phase window keydown
// listener. Without this a controller left OPEN by one case (which is exactly what the bug
// under test does) keeps a live handler on the shared jsdom window, and its
// stopImmediatePropagation eats the next case's Escape before the new controller sees it.
const built: LockpickController[] = [];

function harness(initial: LockpickView | null) {
  // closeAll reads #ctx-menu and #delve-rite-panel before it ever reaches the topmost
  // scan, and `$` returns null for a missing id, so both must exist.
  document.body.innerHTML =
    '<div id="ctx-menu" style="display:none"></div>' +
    '<div id="delve-rite-panel" class="window panel" style="display:none"></div>' +
    '<div id="lockpick-panel" class="window panel" style="display:none"></div>';
  const panel = document.getElementById('lockpick-panel') as HTMLElement;
  const release = vi.fn();
  const trap: FocusTrapHandle = { focusFirst: vi.fn(), release };
  const abort = vi.fn();
  const hideTooltip = vi.fn();
  let state: LockpickView | null = initial;
  const controller = new LockpickController({
    panel,
    keyboardTarget: window,
    openFocusTrap: () => trap,
    getState: () => state,
    engage: vi.fn(),
    act: vi.fn(),
    abort,
    drainEvents: () => null,
    handleEvents: vi.fn(),
    showBanner: vi.fn(),
    log: vi.fn(),
    hideTooltip,
  });
  built.push(controller);
  const hud = Object.create(Hud.prototype) as unknown as CloseAllHarness;
  hud.lockpickController = controller;
  hud.lootWindow = { hasOpenChest: false };
  hud.playerCard = { isOpen: false };
  hud.emoteWheelOpen = false;
  hud.syncAnyWindowOpenState = vi.fn();
  hud.hideTooltip = hideTooltip;
  return {
    controller,
    hud,
    panel,
    release,
    abort,
    bar: () => panel.querySelector<HTMLElement>('.lp-timer-bar'),
    setState(next: LockpickView | null): void {
      state = next;
    },
  };
}

function tick(ticks: number): void {
  for (let i = 0; i < ticks; i++) vi.advanceTimersByTime(100);
}

/** The observable teardown a dismissal must produce, whichever path asked for it. */
function teardown(h: ReturnType<typeof harness>) {
  return {
    aborts: h.abort.mock.calls.length,
    releases: h.release.mock.calls.length,
    timers: vi.getTimerCount(),
    display: h.panel.style.display,
  };
}

describe('lockpick panel: Hud.closeAll (the gamepad escape path)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    for (const controller of built.splice(0)) controller.close(false);
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('is the topmost scan hit while the board is up', () => {
    // If the scan did not select it, every other case below would pass vacuously by
    // closing something else (or nothing).
    const h = harness(LIVE);
    h.controller.openBoard();
    expect(h.hud.topmostOpenWindow()).toBe(h.panel);
  });

  it('withdraws from the live session and stops the 100ms countdown', () => {
    const h = harness(LIVE);
    h.controller.openBoard();
    // Exactly one pending timer: the countdown startTimer armed.
    expect(vi.getTimerCount(), 'the board arms its countdown').toBe(1);
    const bar = h.bar() as HTMLElement;
    tick(20);
    const frozen = bar.style.width;
    expect(frozen).not.toBe('100%');

    expect(h.hud.closeAll(), 'closeAll reports it closed something').toBe(true);

    // The server is told to withdraw, so the attempt is preserved instead of being
    // burned down by a per-step clock the player can no longer see.
    expect(h.abort).toHaveBeenCalledTimes(1);
    // Asserted as "the clock is GONE", not "nothing throws": painting a detached or
    // hidden subtree throws nothing at all, so a no-throw assertion passes with the
    // whole fix reverted.
    expect(vi.getTimerCount(), 'the countdown interval is cleared').toBe(0);
    tick(20);
    expect(bar.style.width, 'the hidden subtree stops being repainted').toBe(frozen);
  });

  it('dismisses the ante selector outright, releasing the trap and returning focus', () => {
    // No live session to withdraw from, so this is the arm that must reach close():
    // the trap release (and with it the WCAG 2.4.3 focus return) has no other route.
    const h = harness(null);
    h.controller.openAnte(9);
    expect(h.panel.style.display).toBe('block');

    expect(h.hud.closeAll()).toBe(true);

    expect(h.abort, 'nothing live to abort').not.toHaveBeenCalled();
    // release(true), the FocusManager's restoreFocus flag: focus goes back to the opener
    // (WCAG 2.4.3). A release(false) regression, or the default arm's bare hide, fails here.
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledWith(true);
    expect(h.panel.style.display).toBe('none');
  });

  it('drops the capture-phase key handler, so a later Escape cannot re-fire on a closed panel', () => {
    const h = harness(null);
    h.controller.openAnte(9);
    h.hud.closeAll();
    h.release.mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(h.release, 'the listener was removed with the panel').not.toHaveBeenCalled();
  });

  it('produces the same teardown as the Escape key, live board and ante selector alike', () => {
    // The two paths are the same funnel or they drift: the keyboard one aborts a live
    // session and closes an idle one, and the pad must not do something else.
    for (const initial of [LIVE, null]) {
      const viaKey = harness(initial);
      if (initial) viaKey.controller.openBoard();
      else viaKey.controller.openAnte(9);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      const keyResult = teardown(viaKey);
      viaKey.controller.close();

      const viaPad = harness(initial);
      if (initial) viaPad.controller.openBoard();
      else viaPad.controller.openAnte(9);
      viaPad.hud.closeAll();
      const padResult = teardown(viaPad);
      viaPad.controller.close();

      expect(padResult, `gamepad and keyboard must agree (live=${initial !== null})`).toEqual(
        keyResult,
      );
      // Guard against both paths being vacuously identical no-ops.
      expect(keyResult.aborts + keyResult.releases).toBeGreaterThan(0);
    }
  });
});
