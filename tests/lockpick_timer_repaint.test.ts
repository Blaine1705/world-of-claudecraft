// @vitest-environment jsdom

// The lockpick countdown's repaint contract (#2498).
//
// `paintTimer` runs 10 times a second for the length of an attempt, and used to re-resolve
// all three of its element refs on every tick. That is the shape `src/ui/CLAUDE.md` bans
// ("Resolve element refs ONCE into a field at construction, never `$()`/`querySelector` from
// a per-frame path"), and no gate could see it: `querySelector` is not in the painter gate's
// vocabulary, and the cold bucket's `setInterval` allowance says a module repaints on a
// cadence without implying anything about what runs inside the callback.
//
// THE LITERAL FORM OF THAT RULE WOULD HAVE BROKEN THIS WINDOW, which is why the invariant is
// pinned here rather than left to review. `renderBoard()` replaces the panel subtree, and it
// fires on `lockpickRenderSig` (which covers `row` and `visible.length`) while the interval
// restarts on `lockpickTimerKey` (`sessionId:page:tries:col`, covering neither). So moving
// the pick up a row rebuilds the three countdown nodes and does NOT restart the clock. Refs
// taken once at construction, or at `startTimer()`, would paint into a detached subtree from
// there on and the bar would freeze for the rest of the attempt. The refs must be re-resolved
// at the rebuild, and the case below is the one that fails if they are not.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lockpickRenderSig, lockpickTimerKey } from '../src/ui/hud/delve/lockpick_panel';
import { LockpickWindow } from '../src/ui/hud/delve/lockpick_window';
import type { LockpickView } from '../src/world_api';

const VIEW: LockpickView = {
  sessionId: 'lp_1_0',
  objectId: 1,
  w: 4,
  h: 4,
  col: 0,
  row: 2,
  page: 1,
  pageCount: 2,
  tries: 2,
  triesTotal: 2,
  lootTier: 'premium',
  allowed: ['set', 'up', 'down'],
  visible: [],
  stepTimeoutMs: 15000,
};

function harness(initial: LockpickView | null = VIEW) {
  document.body.innerHTML = '<div id="lockpick-panel" style="display:block"></div>';
  const panel = document.getElementById('lockpick-panel') as HTMLElement;
  let state: LockpickView | null = initial;
  const win = new LockpickWindow({
    panel: () => panel,
    getState: () => state,
    tierName: (tier) => tier,
    onEngage: () => {},
    onAction: () => {},
    onAbort: () => {},
    onClose: () => {},
  });
  return {
    win,
    panel,
    set(next: LockpickView | null): void {
      state = next;
    },
    bar: () => panel.querySelector<HTMLElement>('#lp-timer-bar'),
    value: () => panel.querySelector<HTMLElement>('#lp-timer-value'),
    wrap: () => panel.querySelector<HTMLElement>('.lp-timer'),
  };
}

/** Run the countdown interval's callback exactly `ticks` times. */
function tick(ticks: number): void {
  for (let i = 0; i < ticks; i++) vi.advanceTimersByTime(100);
}

describe('lockpick countdown repaint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it('paints the bar without re-querying the panel on every tick', () => {
    const h = harness();
    h.win.openBoard();
    const spy = vi.spyOn(h.panel, 'querySelector');
    tick(5);
    // The three walks per tick this fix removes. The refs come from the board paint, so a
    // steady-state tick resolves nothing at all.
    expect(spy).not.toHaveBeenCalled();
    expect(h.bar()?.style.width).not.toBe('');
    spy.mockRestore();
  });

  it('keeps painting the LIVE nodes after a rebuild that does not restart the clock', () => {
    // The correctness case. A row move changes the render signature but not the timer key,
    // so renderBoard() replaces the countdown nodes while the same interval keeps running.
    const moved = { ...VIEW, row: 3 };
    expect(lockpickRenderSig(moved)).not.toBe(lockpickRenderSig(VIEW));
    expect(lockpickTimerKey(moved)).toBe(lockpickTimerKey(VIEW));

    const h = harness();
    h.win.openBoard();
    const before = h.bar();
    tick(20); // 2s in
    const midWidth = before?.style.width;

    h.set(moved);
    h.win.repaintIfChanged();
    const after = h.bar();
    expect(after, 'the rebuild should have replaced the timer nodes').not.toBe(before);
    expect(after?.style.width, 'a fresh board starts the bar full').toBe('100%');

    tick(20); // 2 more seconds, on the SAME interval
    expect(after?.style.width).not.toBe('100%');
    expect(after?.style.width).not.toBe(midWidth);
    // ...and the stale node is not being written any more.
    expect(before?.style.width).toBe(midWidth);
  });

  it('writes the urgent class only when it flips', () => {
    const h = harness();
    h.win.openBoard();
    const wrap = h.wrap() as HTMLElement;
    const toggle = vi.spyOn(wrap.classList, 'toggle');
    tick(20); // 13s remaining, nowhere near urgent
    expect(toggle).not.toHaveBeenCalled();
    expect(wrap.classList.contains('lp-timer-urgent')).toBe(false);

    tick(110); // past the 3s threshold
    expect(wrap.classList.contains('lp-timer-urgent')).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);

    tick(10); // still urgent: no second write
    expect(toggle).toHaveBeenCalledTimes(1);
    toggle.mockRestore();
  });

  it('drops its refs when the ante selector replaces the board, and when the panel closes', () => {
    const h = harness();
    h.win.openBoard();
    expect(h.bar()).not.toBeNull();

    h.win.renderAnte(1, false);
    expect(h.bar(), 'the ante markup carries no countdown').toBeNull();
    // The interval is still armed here (renderAnte does not stop it), so a tick must be a
    // no-op rather than a throw on a ref into the replaced subtree.
    expect(() => tick(5)).not.toThrow();

    h.win.close();
    expect(() => tick(5)).not.toThrow();
  });

  it('paints nothing when the board carries no per-step budget', () => {
    const h = harness({ ...VIEW, stepTimeoutMs: null });
    h.win.openBoard();
    expect(h.wrap()).toBeNull();
    expect(() => tick(5)).not.toThrow();
  });
});
