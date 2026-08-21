// Real-browser regression for the radial action ring and the consumables seat
// that shares its arc. Composes the shipped markup shape, the real mobile
// stylesheet, the placement cores and both overlay painters, so the things a
// unit test cannot see are pinned against real layout: the ring shows FOUR action
// buttons PLUS the consumables seat, a revealed radial keeps every petal fully on
// screen at the corner the ring actually sits in, the consumables row opens
// leftward and stays on screen with its cancel X sitting on the seat, and the
// page toggle reports the two pages the radial mapping needs.

import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import type { ActionBarSlotElements } from '../../src/ui/hud/action_bar/action_bar_painter';
import type {
  ActionBarSlotState,
  ActionBarState,
} from '../../src/ui/hud/action_bar/action_bar_view';
import { CONSUMABLE_BAR_SLOTS } from '../../src/ui/hud/action_bar/consumable_bar_view';
import { resolveConsumableStripDirection } from '../../src/ui/hud/action_bar/consumable_strip_core';
import { ConsumableStripPainter } from '../../src/ui/hud/action_bar/consumable_strip_painter';
import {
  MOBILE_ACTION_BUTTONS,
  mobilePageCount,
} from '../../src/ui/hud/action_bar/mobile_action_page_view';
import { MobileActionRingPainter } from '../../src/ui/hud/action_bar/mobile_action_ring_painter';
import {
  placeConsumableStrip,
  placeRadial,
  type StripDirection,
} from '../../src/ui/hud/action_bar/radial_action_core';
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

  const strip = document.createElement('div');
  strip.id = 'mobile-consumable-strip';
  const stripItems = Array.from({ length: CONSUMABLE_BAR_SLOTS }, (_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-consumable-item';
    btn.dataset.consumableIndex = String(i);
    btn.tabIndex = -1;
    return btn;
  });
  const stripCancel = document.createElement('button');
  stripCancel.type = 'button';
  stripCancel.id = 'mobile-consumable-cancel';
  stripCancel.tabIndex = -1;
  strip.append(...stripItems, stripCancel);

  controls.append(ring, overlay, strip);
  document.body.appendChild(controls);
  return {
    ring,
    slotBtns,
    seat,
    attack,
    pageToggle,
    pageIndicator,
    overlay,
    petalBtns,
    cancel,
    strip,
    stripItems,
    stripCancel,
  };
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

  it('shows FOUR action buttons plus the consumables seat, all above the touch floor', async () => {
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
    // The fifth arc position is the consumables seat and now RENDERS: it shows
    // the first carried consumable rather than reserving space for nothing.
    const seatBox = rig.seat.getBoundingClientRect();
    expect(getComputedStyle(rig.seat).display).not.toBe('none');
    expect(seatBox.width, 'the consumables seat must render').toBeGreaterThan(0);
    // Same rendered size as the action buttons: one --menu-btn-size per tier.
    expect(seatBox.width).toBeCloseTo(visible[0].getBoundingClientRect().width, 1);
    // A true CIRCLE, not the 58x54 top row's oval.
    expect(seatBox.width).toBeCloseTo(seatBox.height, 1);
    // Every rendered action button, and the seat, clears the 40x40 touch floor.
    for (const btn of [...visible, rig.seat]) {
      const box = btn.getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    // The seat stays fully on screen at both tiers (it is the top of the arc, so
    // it is the seat closest to running off the top edge).
    expect(seatBox.top).toBeGreaterThan(-EDGE_TOLERANCE_PX);
    expect(seatBox.right).toBeLessThanOrEqual(window.innerWidth + EDGE_TOLERANCE_PX);
  });

  it('opens the consumables row LEFTWARD and keeps every item on screen', async () => {
    const rig = await setup();
    const painter = new ConsumableStripPainter(
      writers(),
      {
        strip: rig.strip,
        cancel: rig.stripCancel,
        seat: slotElements(rig.seat),
        items: rig.stripItems.map(slotElements),
      },
      () => '',
    );
    const state: ActionBarState = {
      slots: Array.from({ length: CONSUMABLE_BAR_SLOTS + 1 }, () => emptySlotState('item')),
      manySpells: false,
    };

    // Closed is the steady state and the row must not render at all.
    painter.paint(state, null);
    expect(getComputedStyle(rig.strip).display).toBe('none');
    expect(rig.stripItems[0].getBoundingClientRect().width).toBe(0);

    // The two geometry numbers the gesture reads back off this overlay are
    // authored as LITERALS; a calc() would come back unresolved and misplace the
    // whole row. Parse them the same way the gesture does.
    const stripStyle = getComputedStyle(rig.strip);
    const gap = Number.parseFloat(stripStyle.getPropertyValue('--strip-gap'));
    const margin = Number.parseFloat(stripStyle.getPropertyValue('--strip-margin'));
    expect(gap).toBeGreaterThan(0);
    expect(margin).toBeGreaterThan(0);

    // Lay the row out exactly as the strip gesture controller does: off the seat's
    // own measured box, so an item is the same rendered size as the seat.
    const seatBox = rig.seat.getBoundingClientRect();
    const anchorX = seatBox.x + seatBox.width / 2;
    const anchorY = seatBox.y + seatBox.height / 2;
    const shared = {
      anchorX,
      count: CONSUMABLE_BAR_SLOTS,
      itemSize: seatBox.width,
      gap,
      viewportWidth: window.innerWidth,
      margin,
    };
    const direction = resolveConsumableStripDirection(shared);
    expect(direction, 'the shipped right-handed seat grows the row leftward').toBe('left');
    const placement = placeConsumableStrip({ ...shared, anchorY, direction });
    painter.paint(state, {
      placement,
      anchorX,
      anchorY,
      count: CONSUMABLE_BAR_SLOTS,
      live: 2,
      cancelLive: false,
      itemSize: seatBox.width,
    });

    expect(getComputedStyle(rig.strip).display).toBe('block');
    // The row must never eat touches: the gesture owns the pointer through
    // capture, and everything under it stays reachable.
    expect(getComputedStyle(rig.strip).pointerEvents).toBe('none');
    let previousLeft = Number.POSITIVE_INFINITY;
    for (const [i, btn] of rig.stripItems.entries()) {
      const box = btn.getBoundingClientRect();
      expect(box.width, `item ${i} has no box`).toBeGreaterThan(0);
      // Circles the size of the ring buttons, not the top row's oval.
      expect(box.width).toBeCloseTo(seatBox.width, 1);
      expect(box.height).toBeCloseTo(box.width, 1);
      // Leftward, in order, and fully on screen.
      expect(box.right, `item ${i} is not left of the seat`).toBeLessThanOrEqual(seatBox.left + 1);
      expect(box.left, `item ${i} is not left of item ${i - 1}`).toBeLessThan(previousLeft);
      previousLeft = box.left;
      expect(box.left, `item ${i} overruns the left edge`).toBeGreaterThan(-EDGE_TOLERANCE_PX);
      expect(box.top, `item ${i} overruns the top edge`).toBeGreaterThan(-EDGE_TOLERANCE_PX);
      expect(box.bottom, `item ${i} overruns the bottom edge`).toBeLessThanOrEqual(
        window.innerHeight + EDGE_TOLERANCE_PX,
      );
    }
    // Teeth for the DIRECTION: the same row grown rightward from this seat would
    // have run off the screen, which is exactly why the seat grows leftward. So
    // 'left' above is a real decision, not a constant that happens to hold.
    const naiveFarRight =
      anchorX + (seatBox.width + gap) * CONSUMABLE_BAR_SLOTS + seatBox.width / 2;
    expect(
      naiveFarRight,
      'a rightward row would have fit, so direction proves nothing',
    ).toBeGreaterThan(window.innerWidth - margin);
    // Leftward it fits WITHOUT clamping, so the swipe distance to item N stays
    // exactly what the gesture pitch promises.
    expect(placement.clamped, 'the row should not need shifting at this viewport').toBe(false);
    // And it really is a full row, not a degenerate one the pins above would pass
    // over: the far item sits most of a thumb arc away from the seat.
    expect(anchorX - Math.min(...placement.centers)).toBeGreaterThan(280);
    // The live item is the one marked, and only that one.
    expect(rig.stripItems.filter((b) => b.classList.contains('live'))).toEqual([rig.stripItems[2]]);
  });

  it('sits the cancel X directly on top of the seat, right of the whole row', async () => {
    const rig = await setup();
    const painter = new ConsumableStripPainter(
      writers(),
      {
        strip: rig.strip,
        cancel: rig.stripCancel,
        seat: slotElements(rig.seat),
        items: rig.stripItems.map(slotElements),
      },
      () => '',
    );
    const state: ActionBarState = {
      slots: Array.from({ length: CONSUMABLE_BAR_SLOTS + 1 }, () => emptySlotState('item')),
      manySpells: false,
    };
    const seatBox = rig.seat.getBoundingClientRect();
    const anchorX = seatBox.x + seatBox.width / 2;
    const anchorY = seatBox.y + seatBox.height / 2;
    const stripStyle = getComputedStyle(rig.strip);
    const placement = placeConsumableStrip({
      anchorX,
      anchorY,
      count: CONSUMABLE_BAR_SLOTS,
      itemSize: seatBox.width,
      gap: Number.parseFloat(stripStyle.getPropertyValue('--strip-gap')),
      viewportWidth: window.innerWidth,
      margin: Number.parseFloat(stripStyle.getPropertyValue('--strip-margin')),
      direction: 'left',
    });
    // live -1 is the cancel target: the finger came back to the band it started
    // in, which is the whole point of putting the X on the seat.
    painter.paint(state, {
      placement,
      anchorX,
      anchorY,
      count: CONSUMABLE_BAR_SLOTS,
      live: -1,
      cancelLive: true,
      itemSize: seatBox.width,
    });

    const cancelBox = rig.stripCancel.getBoundingClientRect();
    expect(cancelBox.width).toBeGreaterThan(0);
    // Concentric with the seat: the X IS the seat's position, so releasing where
    // the gesture started cancels without the thumb travelling anywhere.
    expect(cancelBox.x + cancelBox.width / 2).toBeCloseTo(anchorX, 1);
    expect(cancelBox.y + cancelBox.height / 2).toBeCloseTo(anchorY, 1);
    // Overlapping boxes, not merely nearby ones.
    expect(cancelBox.left).toBeLessThan(seatBox.right);
    expect(cancelBox.right).toBeGreaterThan(seatBox.left);
    expect(cancelBox.top).toBeLessThan(seatBox.bottom);
    expect(cancelBox.bottom).toBeGreaterThan(seatBox.top);
    // And therefore right of every item in the row.
    for (const btn of rig.stripItems) {
      expect(btn.getBoundingClientRect().right).toBeLessThanOrEqual(cancelBox.left + 1);
    }
    expect(rig.stripCancel.classList.contains('live')).toBe(true);
    // The X clears the 40x40 touch floor too: it is a real release target.
    expect(cancelBox.width).toBeGreaterThanOrEqual(40);
    expect(cancelBox.height).toBeGreaterThanOrEqual(40);
    // The dim's own shape is pinned by the row-dim test below.
  });

  it('runs the local dim ALONG the row instead of circling the seat', async () => {
    const rig = await setup();
    const painter = new ConsumableStripPainter(
      writers(),
      {
        strip: rig.strip,
        cancel: rig.stripCancel,
        seat: slotElements(rig.seat),
        items: rig.stripItems.map(slotElements),
      },
      () => '',
    );
    const state: ActionBarState = {
      slots: Array.from({ length: CONSUMABLE_BAR_SLOTS + 1 }, () => emptySlotState('item')),
      manySpells: false,
    };
    const stripStyle = getComputedStyle(rig.strip);
    const gap = Number.parseFloat(stripStyle.getPropertyValue('--strip-gap'));
    const margin = Number.parseFloat(stripStyle.getPropertyValue('--strip-margin'));
    const seatBox = rig.seat.getBoundingClientRect();
    const anchorX = seatBox.x + seatBox.width / 2;
    const anchorY = seatBox.y + seatBox.height / 2;
    const itemSize = seatBox.width;

    const openAt = (count: number, direction: StripDirection) => {
      const placement = placeConsumableStrip({
        anchorX,
        anchorY,
        count,
        itemSize,
        gap,
        viewportWidth: window.innerWidth,
        margin,
        direction,
      });
      painter.paint(state, {
        placement,
        anchorX,
        anchorY,
        count,
        live: -1,
        cancelLive: false,
        itemSize,
      });
      const dim = getComputedStyle(rig.strip, '::before');
      return {
        placement,
        left: Number.parseFloat(dim.left),
        width: Number.parseFloat(dim.width),
        top: Number.parseFloat(dim.top),
        height: Number.parseFloat(dim.height),
      };
    };

    // The shipped right-handed seat: the row grows LEFT, so the band runs from
    // the seat leftward and ENDS at the seat, never past it.
    const full = openAt(CONSUMABLE_BAR_SLOTS, 'left');
    const lastCenter = full.placement.centers[CONSUMABLE_BAR_SLOTS - 1];
    expect(full.left + full.width).toBeCloseTo(anchorX, 0);
    // Just past the last item's centre: one item size beyond it, so the fade
    // lands clear of the item rather than on top of it.
    expect(full.left).toBeCloseTo(lastCenter - itemSize, 0);
    expect(full.left).toBeLessThan(lastCenter);
    // LOCAL, not a screen wash: the band covers the row and no more. A circle
    // wide enough to reach the far item would have covered far more than this.
    expect(full.width).toBeLessThan(window.innerWidth * 0.6);
    expect(full.left).toBeGreaterThan(-EDGE_TOLERANCE_PX);
    // The band stays inside the row's own vertical band: it is a line, not a blob.
    expect(full.height).toBeLessThanOrEqual(itemSize * 2 + 1);
    expect(full.top).toBeLessThanOrEqual(anchorY - seatBox.height / 2);
    expect(full.top + full.height).toBeGreaterThanOrEqual(anchorY + seatBox.height / 2);
    // The fade starts at the seat end, which is the right edge on a leftward row.
    expect(rig.strip.classList.contains('dim-flip')).toBe(true);
    expect(getComputedStyle(rig.strip, '::before').transform).toBe('matrix(-1, 0, 0, 1, 0, 0)');

    // The extent is a function of the OPEN item count, which is the whole point
    // of measuring it rather than hard-coding a radius.
    const short = openAt(2, 'left');
    expect(short.width).toBeLessThan(full.width);
    expect(short.left + short.width).toBeCloseTo(anchorX, 0);

    // The left-handed mirror seats the ring against the opposite edge, so the row
    // grows RIGHT and the band has to flip with it.
    document.body.classList.add('mobile-left-handed');
    const mirroredSeat = rig.seat.getBoundingClientRect();
    const mirroredAnchorX = mirroredSeat.x + mirroredSeat.width / 2;
    expect(mirroredAnchorX).toBeLessThan(anchorX);
    const mirroredDirection = resolveConsumableStripDirection({
      anchorX: mirroredAnchorX,
      count: CONSUMABLE_BAR_SLOTS,
      itemSize,
      gap,
      viewportWidth: window.innerWidth,
      margin,
    });
    expect(mirroredDirection, 'the mirrored seat has no room to grow leftward').toBe('right');
    const mirroredPlacement = placeConsumableStrip({
      anchorX: mirroredAnchorX,
      anchorY: mirroredSeat.y + mirroredSeat.height / 2,
      count: CONSUMABLE_BAR_SLOTS,
      itemSize,
      gap,
      viewportWidth: window.innerWidth,
      margin,
      direction: mirroredDirection,
    });
    painter.paint(state, {
      placement: mirroredPlacement,
      anchorX: mirroredAnchorX,
      anchorY: mirroredSeat.y + mirroredSeat.height / 2,
      count: CONSUMABLE_BAR_SLOTS,
      live: -1,
      cancelLive: false,
      itemSize,
    });
    const mirroredDim = getComputedStyle(rig.strip, '::before');
    expect(Number.parseFloat(mirroredDim.left)).toBeCloseTo(mirroredAnchorX, 0);
    expect(Number.parseFloat(mirroredDim.left) + Number.parseFloat(mirroredDim.width)).toBeCloseTo(
      mirroredPlacement.centers[CONSUMABLE_BAR_SLOTS - 1] + itemSize,
      0,
    );
    expect(rig.strip.classList.contains('dim-flip')).toBe(false);
    expect(mirroredDim.transform).toBe('none');
    expect(mirroredDim.backgroundImage).toContain('to right');
    document.body.classList.remove('mobile-left-handed');
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
      petalPainter.paint(petalState, placement, 'center', true);

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
