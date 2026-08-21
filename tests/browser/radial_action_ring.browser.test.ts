// Real-browser regression for the radial action ring. Composes the shipped
// markup shape, the real mobile stylesheet, the placement core and the petal
// painter, so the three things a unit test cannot see are pinned against real
// layout: the ring shows FOUR action buttons (the fifth arc seat is the reserved
// consumables seat and stays hidden), a revealed radial keeps every petal fully
// on screen at the corner the ring actually sits in, and the page toggle reports
// the two pages the radial mapping needs.

import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import type { ActionBarSlotElements } from '../../src/ui/hud/action_bar/action_bar_painter';
import type {
  ActionBarSlotState,
  ActionBarState,
} from '../../src/ui/hud/action_bar/action_bar_view';
import {
  MOBILE_ACTION_BUTTONS,
  mobilePageCount,
} from '../../src/ui/hud/action_bar/mobile_action_page_view';
import { MobileActionRingPainter } from '../../src/ui/hud/action_bar/mobile_action_ring_painter';
import { placeRadial } from '../../src/ui/hud/action_bar/radial_action_core';
import {
  RADIAL_PETAL_DIRECTIONS,
  RadialPetalPainter,
} from '../../src/ui/hud/action_bar/radial_petal_painter';
import { makeWriterFacet } from '../../src/ui/painter_host';
import '../../src/styles/index.css';
import { cleanup } from './_harness';

// Both are real landscape phone viewports the touch HUD ships to: 844x390 is the
// iPhone 14/15 class and 874x402 the iPhone 16 Pro, and they land on different
// layout tiers, which is the point of running the same pins twice.
const VIEWPORTS = [
  { label: '844x390', width: 844, height: 390, tier: 'hud-mobile-compact' },
  { label: '874x402', width: 874, height: 402, tier: '' },
] as const;

/** Petals must clear the viewport edge by at least this, matching the margin the
 *  stylesheet declares and the gesture reads back. */
const EDGE_TOLERANCE_PX = 0.5;

function emptySlotState(kind: ActionBarSlotState['kind']): ActionBarSlotState {
  return {
    kind,
    abilityId: null,
    itemId: null,
    iconKey: '',
    cooldownRemaining: 0,
    cooldownTotal: 0,
    cooldownPercent: 0,
    cdText: '',
    count: '',
    isCharges: false,
    rechargePercent: 0,
    usable: true,
    outOfRange: false,
    queued: false,
    procGlow: false,
    empowered: false,
    ascensionSpender: false,
    ascensionCostLabel: '',
    fateConsumeReady: false,
    fateSentenceReady: false,
    ariaLabel: kind,
    ariaDescription: '',
    keybindLabel: '',
  };
}

function slotElements(btn: HTMLElement): ActionBarSlotElements {
  const label = document.createElement('span');
  label.className = 'icon-label';
  const countEl = document.createElement('span');
  countEl.className = 'item-count';
  const keybindEl = document.createElement('span');
  keybindEl.className = 'keybind';
  const cdOverlay = document.createElement('div');
  cdOverlay.className = 'cd-overlay';
  const cdText = document.createElement('div');
  cdText.className = 'cdtext';
  const rechargeOverlay = document.createElement('div');
  rechargeOverlay.className = 'recharge-overlay';
  btn.append(label, countEl, keybindEl, cdOverlay, rechargeOverlay, cdText);
  return { btn, label, countEl, keybindEl, cdOverlay, cdText, rechargeOverlay };
}

function writers() {
  return makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {},
    () => {},
  );
}

/** The shipped structure: #mobile-controls carrying the ring plus its sibling
 *  radial overlay, matching index.html / play.html. */
function mountRing() {
  const controls = document.createElement('section');
  controls.id = 'mobile-controls';

  const ring = document.createElement('div');
  ring.id = 'mobile-action-ring';
  const slotBtns = Array.from({ length: MOBILE_ACTION_BUTTONS }, (_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-action-slot';
    btn.dataset.mobileIndex = String(i);
    return btn;
  });
  const seat = document.createElement('button');
  seat.type = 'button';
  seat.id = 'mobile-consumable-seat';
  seat.className = 'mobile-ring-seat';
  seat.dataset.mobileIndex = String(MOBILE_ACTION_BUTTONS);
  seat.hidden = true;
  const attack = document.createElement('button');
  attack.type = 'button';
  attack.id = 'mobile-action-attack';
  const pageToggle = document.createElement('button');
  pageToggle.type = 'button';
  pageToggle.id = 'mobile-action-page-toggle';
  const pageIndicator = document.createElement('span');
  pageIndicator.className = 'mobile-action-page-indicator';
  pageToggle.append(pageIndicator);
  ring.append(...slotBtns, seat, attack, pageToggle);

  const overlay = document.createElement('div');
  overlay.id = 'mobile-action-radial';
  const petalBtns = RADIAL_PETAL_DIRECTIONS.map((direction, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-action-petal';
    btn.dataset.radialDir = direction;
    btn.dataset.mobileIndex = String(i);
    return btn;
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.id = 'mobile-action-radial-cancel';
  overlay.append(...petalBtns, cancel);

  controls.append(ring, overlay);
  document.body.appendChild(controls);
  return { ring, slotBtns, seat, attack, pageToggle, pageIndicator, overlay, petalBtns, cancel };
}

afterEach(() => {
  cleanup();
  document.body.className = '';
  document.documentElement.style.removeProperty('--app-vw');
  document.documentElement.style.removeProperty('--app-vh');
});

describe.each(VIEWPORTS)('radial action ring at $label', ({ width, height, tier }) => {
  async function setup() {
    await page.viewport(width, height);
    document.body.className = `mobile-touch game-active${tier ? ` ${tier}` : ''}`;
    document.documentElement.style.setProperty('--app-vw', `${width}px`);
    document.documentElement.style.setProperty('--app-vh', `${height}px`);
    return mountRing();
  }

  it('shows FOUR action buttons and keeps the reserved consumables seat hidden', async () => {
    const rig = await setup();
    const state: ActionBarState = {
      slots: Array.from({ length: MOBILE_ACTION_BUTTONS + 1 }, () => emptySlotState('empty')),
      manySpells: false,
    };
    const painter = new MobileActionRingPainter(
      writers(),
      {
        bar: {
          container: rig.ring,
          slots: [rig.attack, ...rig.slotBtns].map(slotElements),
        },
        pageToggle: rig.pageToggle,
        pageIndicator: rig.pageIndicator,
      },
      () => '',
      (key) => key,
    );
    painter.paint(state, 0, mobilePageCount(), undefined, true);

    const visible = rig.slotBtns.filter((btn) => btn.getBoundingClientRect().width > 0);
    expect(visible).toHaveLength(4);
    expect(rig.seat.getBoundingClientRect().width, 'the reserved seat must not render').toBe(0);
    expect(getComputedStyle(rig.seat).display).toBe('none');
    // Every rendered action button still clears the 40x40 mobile touch floor.
    for (const btn of visible) {
      const box = btn.getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
  });

  it('reports TWO pages on the toggle for the full 33-slot span', async () => {
    const rig = await setup();
    const painter = new MobileActionRingPainter(
      writers(),
      {
        bar: {
          container: rig.ring,
          slots: [rig.attack, ...rig.slotBtns].map(slotElements),
        },
        pageToggle: rig.pageToggle,
        pageIndicator: rig.pageIndicator,
      },
      () => '',
      (key, values) => (values ? `${key}|${JSON.stringify(values)}` : key),
    );
    const state: ActionBarState = {
      slots: Array.from({ length: MOBILE_ACTION_BUTTONS + 1 }, () => emptySlotState('empty')),
      manySpells: false,
    };

    expect(mobilePageCount()).toBe(2);
    painter.paint(state, 0, mobilePageCount(), undefined, true);
    expect(rig.pageIndicator.textContent).toContain('"count":2');
    expect(rig.pageIndicator.textContent).toContain('"page":1');
    painter.paint(state, 1, mobilePageCount(), undefined, true);
    expect(rig.pageIndicator.textContent).toContain('"page":2');
    expect(rig.pageToggle.getBoundingClientRect().width).toBeGreaterThanOrEqual(40);
  });

  it('keeps every revealed petal fully on screen from every ring button', async () => {
    const rig = await setup();
    const petalPainter = new RadialPetalPainter(
      writers(),
      {
        overlay: rig.overlay,
        cancel: rig.cancel,
        bar: { container: rig.overlay, slots: rig.petalBtns.map(slotElements) },
      },
      () => '',
    );
    const petalState: ActionBarState = {
      slots: RADIAL_PETAL_DIRECTIONS.map(() => emptySlotState('empty')),
      manySpells: false,
    };
    const overlayStyle = getComputedStyle(rig.overlay);
    const ratio = Number.parseFloat(overlayStyle.getPropertyValue('--radial-radius-ratio'));
    const margin = Number.parseFloat(overlayStyle.getPropertyValue('--radial-margin'));
    // Both are authored as literals precisely so this parse works; a calc() here
    // would come back unresolved and silently misplace every petal.
    expect(ratio).toBeGreaterThan(0);
    expect(margin).toBeGreaterThan(0);

    // The bottom-right corner buttons are the whole reason placeRadial clamps:
    // an unclamped radial pushes its right and down petals past the edge.
    let overrunSeen = false;
    for (const btn of rig.slotBtns) {
      const rect = btn.getBoundingClientRect();
      expect(rect.width, 'the ring button must be laid out before it is measured').toBeGreaterThan(
        0,
      );
      const placement = placeRadial({
        buttonCx: rect.x + rect.width / 2,
        buttonCy: rect.y + rect.height / 2,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        radius: rect.width * ratio,
        petalHalf: rect.width / 2,
        margin,
      });
      petalPainter.paint(petalState, placement, 'center');

      for (const petal of rig.petalBtns) {
        const box = petal.getBoundingClientRect();
        expect(box.width, `${petal.dataset.radialDir} petal has no box`).toBeGreaterThan(0);
        expect(box.left, `${petal.dataset.radialDir} petal overruns the left edge`).toBeGreaterThan(
          -EDGE_TOLERANCE_PX,
        );
        expect(box.top, `${petal.dataset.radialDir} petal overruns the top edge`).toBeGreaterThan(
          -EDGE_TOLERANCE_PX,
        );
        expect(
          box.right,
          `${petal.dataset.radialDir} petal overruns the right edge`,
        ).toBeLessThanOrEqual(window.innerWidth + EDGE_TOLERANCE_PX);
        expect(
          box.bottom,
          `${petal.dataset.radialDir} petal overruns the bottom edge`,
        ).toBeLessThanOrEqual(window.innerHeight + EDGE_TOLERANCE_PX);
      }
      // The petal is the same rendered size as the button that revealed it, so
      // the gesture can take its geometry from that one measurement.
      expect(rig.petalBtns[0].getBoundingClientRect().width).toBeCloseTo(rect.width, 1);
      const naiveRight = rect.x + rect.width / 2 + rect.width * ratio + rect.width / 2;
      const naiveBottom = rect.y + rect.height / 2 + rect.width * ratio + rect.width / 2;
      overrunSeen ||=
        naiveRight > window.innerWidth - margin || naiveBottom > window.innerHeight - margin;
    }
    // Teeth: at least one ring seat sits close enough to the corner that an
    // UNCLAMPED radial would push a petal off screen, so the pins above are
    // proving the clamp rather than passing on roomy geometry.
    expect(overrunSeen, 'no seat exercised the edge clamp').toBe(true);
  });

  it('closes the radial by default and dims only its own area when open', async () => {
    const rig = await setup();
    expect(getComputedStyle(rig.overlay).display).toBe('none');
    expect(rig.petalBtns[0].getBoundingClientRect().width).toBe(0);

    rig.overlay.classList.add('open');
    expect(getComputedStyle(rig.overlay).display).toBe('block');
    // The overlay must never eat touches: the gesture owns the pointer through
    // capture, and everything under it stays reachable.
    expect(getComputedStyle(rig.overlay).pointerEvents).toBe('none');
    // The dim is a gradient anchored on the radial, not a flat full-screen wash.
    const scrim = getComputedStyle(rig.overlay, '::before');
    expect(scrim.backgroundImage).toContain('radial-gradient');
  });
});
