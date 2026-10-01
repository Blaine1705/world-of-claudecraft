// The Weekly Vault sheet's fit to the screen, measured in a REAL browser.
//
// The bug: on a wide desktop the vault takes over #bank-window with a
// near-full-screen box, but that rule sized it in raw vw/vh. #bank-window
// lives inside #ui, which carries `zoom: var(--ui-scale)`, so at any UI scale
// above 1 the zoom re-multiplied the box and the vault ran off the right and
// bottom of the screen. The fix divides every viewport length by
// --window-scale, as the base vault rule (and the shared .window clamp)
// already did. A second arm covers a short screen at a high UI scale: the
// vault art is sized from the track grid's height, so the grid keeps a floor
// and the panel scrolls instead of shrinking every vault to a sliver.
//
// jsdom and happy-dom implement no layout and no zoom, so only a real browser
// can see either defect. Viewport recipe: tests/browser/window_resize_fill.

import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { emptyWeeklyRewards } from '../../src/sim/weekly_rewards';
import type { PainterHostPresentation } from '../../src/ui/painter_host';
import { WeeklyRewardsTab } from '../../src/ui/weekly_rewards_window';
import type { IWorld } from '../../src/world_api';
import { cleanup } from './_harness';

// Sub-pixel slack for the zoom's rounding; the regression overshot by hundreds.
const SLACK = 1;
// The smallest vault illustration (CSS px on screen) the sheet may paint.
const MIN_ART = 100;

async function mountVault(width: number, height: number, uiScale: number) {
  await page.viewport(width, height);
  const root = document.documentElement.style;
  root.setProperty('--app-vw', `${width}px`);
  root.setProperty('--app-vh', `${height}px`);
  root.setProperty('--ui-scale', String(uiScale));
  document.body.classList.add('weekly-vault-open');
  const ui = document.createElement('div');
  ui.id = 'ui';
  const win = document.createElement('div');
  win.id = 'bank-window';
  win.className = 'window panel';
  win.style.display = 'flex';
  ui.appendChild(win);
  document.body.appendChild(ui);

  const state = emptyWeeklyRewards(604800000);
  state.world = 8;
  const pane = new WeeklyRewardsTab({
    world: () =>
      ({
        cfg: { playerClass: 'mage' },
        weeklyRewardInfo: {
          state,
          nowMs: 1000,
          playerLevel: 20,
          canClaim: true,
          worldQuestsAvailable: true,
          readyWeeks: 0,
        },
      }) as IWorld,
    presentation: {
      itemIcon: () => '',
      attachTooltip: () => undefined,
    } as unknown as PainterHostPresentation,
    onInventoryChanged: () => undefined,
  });
  pane.renderInto(win);
  return { win, pane };
}

afterEach(() => {
  cleanup();
  document.body.classList.remove('weekly-vault-open');
  for (const prop of ['--app-vw', '--app-vh', '--ui-scale'])
    document.documentElement.style.removeProperty(prop);
});

describe('weekly vault sheet scales with the screen', () => {
  it.each([
    [1920, 1080, 1],
    [1920, 1080, 1.25],
    [1920, 1080, 1.5],
    [2560, 1440, 2],
    [1280, 720, 1.25],
  ])('at %ix%i and UI scale %s the vault stays fully on screen', async (w, h, scale) => {
    const { win, pane } = await mountVault(w, h, scale);
    const box = win.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(-SLACK);
    expect(box.top).toBeGreaterThanOrEqual(-SLACK);
    expect(box.right).toBeLessThanOrEqual(w + SLACK);
    expect(box.bottom).toBeLessThanOrEqual(h + SLACK);
    // Still the near-full-screen sheet, not merely clamped small: 96% of the
    // width at every scale, and 96% of the height until the 1080px author cap.
    expect(box.width).toBeCloseTo(w * 0.96, 0);
    expect(box.height).toBeCloseTo(Math.min(h * 0.96, 1080 * scale), 0);
    pane.close();
  });

  it('keeps every vault legible on a short screen at a high UI scale', async () => {
    // 1366x768 passes the desktop sheet gate, but at UI scale 1.5 the zoomed
    // space is only ~911x512 author px.
    const { win, pane } = await mountVault(1366, 768, 1.5);
    const arts = [...win.querySelectorAll<HTMLElement>('.weekly-vault-illustration')];
    expect(arts.length).toBe(12);
    for (const art of arts) {
      const r = art.getBoundingClientRect();
      expect(r.width).toBeGreaterThanOrEqual(MIN_ART);
      expect(r.height).toBeCloseTo(r.width, 0);
    }
    // The extra height scrolls inside the panel; the window itself stays put.
    const box = win.getBoundingClientRect();
    expect(box.bottom).toBeLessThanOrEqual(768 + SLACK);
    const panel = win.querySelector<HTMLElement>('#weekly-rewards-panel');
    expect(panel).not.toBeNull();
    expect(panel?.scrollHeight).toBeGreaterThan(panel?.clientHeight ?? Infinity);
    pane.close();
  });
});
