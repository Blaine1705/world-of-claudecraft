// @vitest-environment jsdom
//
// The on-bar key-binding banner's placement and drag. The banner is a HUD-root
// element placed clear of EVERY visible bar (the second and third bars stack
// above the primary one, and a banner over them left their slots unbindable),
// and its plate is a drag handle so the player can move it off anything it
// still covers. Pins the regression where the placement code was lost in a
// merge and the banner fell back to an unplaced #actionbar-stack child.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_BAR_BIND_BANNER_ANCHORS,
  bindActionBarBindBannerDrag,
  mountActionBarBindBanner,
  placeActionBarBindBanner,
} from '../src/ui/hud/action_bar/action_bar_bind_banner';
import {
  ACTION_BAR_BIND_BANNER_FALLBACK_LIFT,
  actionBarBindBannerPlacement,
} from '../src/ui/hud/action_bar/action_bar_bind_core';

vi.mock('../src/game/audio', () => ({ audio: { click: vi.fn() } }));
vi.mock('../src/ui/i18n', () => ({ t: (key: string) => key }));
vi.mock('../src/ui/ui_scale', () => ({ getUiScale: () => 2 }));

const banner = { width: 350, height: 92 };
const viewport = { width: 1600, height: 900 };

describe('actionBarBindBannerPlacement', () => {
  it('centres on the primary bar and lifts above the TOPMOST visible bar', () => {
    const bars = [
      { left: 502, top: 828, width: 596, height: 46 },
      { left: 502, top: 776, width: 596, height: 46 },
      { left: 502, top: 724, width: 596, height: 46 },
      { left: 502, top: 678, width: 40, height: 40 },
    ];
    const placed = actionBarBindBannerPlacement({ bars, banner, viewport });
    expect(placed).toEqual({ left: 625, top: 678 - 8 - 92 });
    // Above every bar: no slot of any bar is under the banner's box.
    for (const bar of bars) expect(placed.top + banner.height).toBeLessThanOrEqual(bar.top);
  });

  it('a single docked bar keeps the classic seat directly above it', () => {
    const placed = actionBarBindBannerPlacement({
      bars: [{ left: 502, top: 828, width: 596, height: 46 }],
      banner,
      viewport,
    });
    expect(placed).toEqual({ left: 625, top: 828 - 8 - 92 });
  });

  it('drops below the LOWEST bar when there is no room above', () => {
    const bars = [
      { left: 100, top: 60, width: 596, height: 46 },
      { left: 100, top: 8, width: 596, height: 46 },
    ];
    const placed = actionBarBindBannerPlacement({ bars, banner, viewport });
    expect(placed.top).toBe(60 + 46 + 8);
  });

  it('with no bar box at all takes the stock bottom-centre seat', () => {
    expect(actionBarBindBannerPlacement({ bars: [], banner, viewport })).toEqual({
      left: (1600 - 350) / 2,
      top: 900 - 92 - ACTION_BAR_BIND_BANNER_FALLBACK_LIFT,
    });
  });

  it('is clamped inside the viewport on every edge', () => {
    const placed = actionBarBindBannerPlacement({
      bars: [{ left: -300, top: 5, width: 100, height: 46 }],
      banner,
      viewport: { width: 400, height: 300 },
    });
    expect(placed.left).toBe(8);
    // No room above a bar at the top edge: it drops below the bar instead.
    expect(placed.top).toBe(5 + 46 + 8);
    const low = actionBarBindBannerPlacement({
      bars: [{ left: 10, top: 290, width: 100, height: 46 }],
      banner,
      viewport: { width: 400, height: 300 },
    });
    expect(low.top).toBe(290 - 8 - 92);
    expect(low.left).toBe(8);
  });
});

/** Give an element a fixed VISUAL box (jsdom lays nothing out). */
function box(el: Element, r: { x: number; y: number; w: number; h: number }): void {
  el.getBoundingClientRect = () =>
    ({
      left: r.x,
      top: r.y,
      right: r.x + r.w,
      bottom: r.y + r.h,
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
    }) as DOMRect;
}

function size(el: HTMLElement, w: number, h: number): void {
  Object.defineProperty(el, 'offsetWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: h, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: h, configurable: true });
}

describe('placeActionBarBindBanner', () => {
  let ui: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="ui"><div id="actionbar-stack"><div id="actionbar3"></div><div id="actionbar2"></div><div id="actionbar"></div></div></div>';
    ui = document.getElementById('ui') as HTMLElement;
    size(ui, 1600, 900);
  });

  it('lists the primary bar first, then every stacked bar', () => {
    expect(ACTION_BAR_BIND_BANNER_ANCHORS[0]).toBe('#actionbar');
    expect(ACTION_BAR_BIND_BANNER_ANCHORS).toContain('#actionbar2');
    expect(ACTION_BAR_BIND_BANNER_ANCHORS).toContain('#actionbar3');
  });

  it('mounts on the HUD root and places the banner above the topmost bar in author px', () => {
    // Visual boxes under a 2x UI zoom: author px are half of these.
    box(document.getElementById('actionbar')!, { x: 1004, y: 1656, w: 1192, h: 92 });
    box(document.getElementById('actionbar2')!, { x: 1004, y: 1552, w: 1192, h: 92 });
    // A bar with no box (display:none) anchors nothing.
    box(document.getElementById('actionbar3')!, { x: 0, y: 0, w: 0, h: 0 });
    const el = mountActionBarBindBanner(ui, { onReset: () => {}, onDone: () => {} });
    expect(el.parentElement).toBe(ui);
    size(el, 350, 92);
    placeActionBarBindBanner(el, ui);
    expect(el.style.left).toBe(`${502 + 298 - 175}px`);
    expect(el.style.top).toBe(`${776 - 8 - 92}px`);
  });

  it('a bar Interface Unlock reparented to #ui still counts', () => {
    const bar2 = document.getElementById('actionbar2')!;
    ui.appendChild(bar2);
    box(document.getElementById('actionbar')!, { x: 1004, y: 1656, w: 1192, h: 92 });
    box(bar2, { x: 200, y: 400, w: 1192, h: 92 });
    const el = document.createElement('div');
    ui.appendChild(el);
    size(el, 350, 92);
    placeActionBarBindBanner(el, ui);
    expect(el.style.top).toBe(`${200 - 8 - 92}px`);
  });
});

describe('bindActionBarBindBannerDrag', () => {
  let ui: HTMLElement;
  let el: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui"></div>';
    ui = document.getElementById('ui') as HTMLElement;
    size(ui, 1600, 900);
    el = mountActionBarBindBanner(ui, { onReset: () => {}, onDone: () => {} });
    size(el, 350, 92);
    box(el, { x: 1250, y: 1156, w: 700, h: 184 });
    el.setPointerCapture = () => {};
  });

  function pointer(type: string, x: number, y: number, target: Element = el, button = 0) {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    target.dispatchEvent(e);
    return e;
  }

  it('drags by the plate, converting visual px to author px under the UI zoom', () => {
    pointer('pointerdown', 1260, 1166);
    pointer('pointermove', 1460, 966);
    // Grab offset (10,10) visual; new visual origin (1450,956) is (725,478) author px.
    expect(el.style.left).toBe('725px');
    expect(el.style.top).toBe('478px');
    pointer('pointerup', 1460, 966);
    pointer('pointermove', 100, 100);
    expect(el.style.left).toBe('725px');
  });

  it('never drags from Reset or Done, and ignores non-primary buttons', () => {
    const placedLeft = el.style.left;
    const done = el.querySelectorAll('button')[1]!;
    pointer('pointerdown', 1260, 1166, done);
    pointer('pointermove', 1460, 966);
    expect(el.style.left).toBe(placedLeft);
    pointer('pointerdown', 1260, 1166, el, 2);
    pointer('pointermove', 1460, 966);
    expect(el.style.left).toBe(placedLeft);
  });

  it('stays inside the HUD root', () => {
    pointer('pointerdown', 1260, 1166);
    pointer('pointermove', -5000, -5000);
    expect(el.style.left).toBe('8px');
    expect(el.style.top).toBe('8px');
  });

  it('is installed by the mount, once, on the mounted root', () => {
    // bindActionBarBindBannerDrag is exported for the mount; a second bind is harmless.
    bindActionBarBindBannerDrag(el, ui);
    pointer('pointerdown', 1260, 1166);
    pointer('pointermove', 1460, 966);
    expect(el.style.left).toBe('725px');
  });
});
