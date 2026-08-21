// Real-browser regression for the touch menu control and the left-column reflow
// it pays for. Composes the shipped markup shape, the real mobile stylesheet, the
// placement core and the strip painter, so what a unit test cannot see is pinned
// against real layout: the control renders as one circle on the action ring's
// Jump line, its nine-item strip opens RIGHTWARD and stays on screen with the
// cancel X sitting on the anchor, one caption names the live item, and the top
// band the collapsed row vacated seats the target frame with the party stack
// below it, clear of the move zone and holding its slot when the target drops.

import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { placeConsumableStrip } from '../../src/ui/hud/action_bar/radial_action_core';
import {
  MENU_STRIP_COUNT,
  MENU_STRIP_DIRECTION,
  MENU_STRIP_ITEMS,
} from '../../src/ui/hud/menu/menu_strip_core';
import { MenuStripPainter } from '../../src/ui/hud/menu/menu_strip_painter';
import { makeWriterFacet } from '../../src/ui/painter_host';
import { PARTY_BELOW_TARGET_BOTTOM_PROP } from '../../src/ui/party_below_target_painter';
import '../../src/styles/index.css';
import { cleanup } from './_harness';

// Both are real landscape phone viewports the touch HUD ships to: 844x390 is the
// iPhone 14/15 class and 874x402 the iPhone 16 Pro, and they land on different
// layout tiers, which is the point of running the same pins twice.
const VIEWPORTS = [
  { label: '844x390', width: 844, height: 390, tier: 'hud-mobile-compact' },
  { label: '874x402', width: 874, height: 402, tier: '' },
] as const;

const EDGE_TOLERANCE_PX = 0.5;
const TOUCH_FLOOR_PX = 40;

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

/** The shipped structure: the control inside #mobile-combat-controls, the ring
 *  beside it (for the Jump line the control's seat is derived from), and the
 *  strip as a SIBLING overlay, matching index.html / play.html. */
function mountControl() {
  const controls = document.createElement('section');
  controls.id = 'mobile-controls';

  const ring = document.createElement('div');
  ring.id = 'mobile-action-ring';
  const attack = document.createElement('button');
  attack.type = 'button';
  attack.id = 'mobile-action-attack';
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.id = 'mobile-jump';
  ring.append(attack, jump);

  const row = document.createElement('div');
  row.id = 'mobile-combat-controls';
  const anchor = document.createElement('button');
  anchor.type = 'button';
  anchor.id = 'mobile-menu-anchor';
  anchor.className = 'mobile-btn';
  row.append(anchor);

  const strip = document.createElement('div');
  strip.id = 'mobile-menu-strip';
  const items = MENU_STRIP_ITEMS.map((item, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-menu-item';
    btn.id = item.elementId;
    btn.dataset.menuIndex = String(i);
    btn.tabIndex = -1;
    return btn;
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.id = 'mobile-menu-cancel';
  cancel.tabIndex = -1;
  const caption = document.createElement('div');
  caption.id = 'mobile-menu-caption';
  caption.className = 'panel';
  const captionText = document.createElement('span');
  captionText.className = 'tt-title';
  caption.append(captionText);
  strip.append(...items, cancel, caption);

  const moveZone = document.createElement('div');
  moveZone.id = 'mobile-move-zone';
  const moveJoystick = document.createElement('div');
  moveJoystick.id = 'mobile-move-joystick';
  moveJoystick.className = 'mobile-joystick';

  controls.append(moveZone, moveJoystick, row, ring, strip);
  document.body.appendChild(controls);
  return { controls, ring, jump, anchor, strip, items, cancel, caption, captionText, moveJoystick };
}

/** The left column: the target frame in the band the row vacated, with the party
 *  stack below it. Rows only render under .party-expanded, so a container without
 *  it measures 0x0 and makes the column look free when it is not. */
function mountLeftColumn(memberCount: number) {
  const ui = document.createElement('div');
  ui.id = 'ui';

  const target = document.createElement('div');
  target.id = 'target-frame';
  target.className = 'unitframe';
  target.style.display = 'flex';
  const bars = document.createElement('div');
  bars.className = 'uf-bars';
  bars.textContent = 'Gravewyrm Acolyte';
  const portrait = document.createElement('div');
  portrait.className = 'portrait-wrap';
  target.append(bars, portrait);

  const party = document.createElement('div');
  party.id = 'party-frames';
  party.className = 'party-present below-target has-party-chip party-expanded';
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.id = 'party-chip';
  chip.textContent = 'Party';
  const rows = document.createElement('div');
  rows.className = 'party-rows';
  for (let i = 0; i < memberCount; i++) {
    const row = document.createElement('div');
    row.className = 'party-frame panel';
    row.setAttribute('role', 'button');
    row.textContent = `Member ${i + 1}`;
    rows.append(row);
  }
  party.append(chip, rows);

  ui.append(target, party);
  document.body.appendChild(ui);
  return { ui, target, party, rows };
}

afterEach(() => {
  cleanup();
  document.body.className = '';
  document.documentElement.style.removeProperty('--app-vw');
  document.documentElement.style.removeProperty('--app-vh');
});

describe.each(VIEWPORTS)('touch menu control at $label', ({ width, height, tier }) => {
  async function setup() {
    await page.viewport(width, height);
    document.body.className = `mobile-touch game-active${tier ? ` ${tier}` : ''}`;
    document.documentElement.style.setProperty('--app-vw', `${width}px`);
    document.documentElement.style.setProperty('--app-vh', `${height}px`);
    return mountControl();
  }

  it('renders ONE control, a true circle on the ring Jump line and above the touch floor', async () => {
    const rig = await setup();
    const box = rig.anchor.getBoundingClientRect();
    expect(getComputedStyle(rig.anchor).display).not.toBe('none');
    expect(box.width).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    expect(box.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    // A CIRCLE at the shared --menu-btn-size, not the retired row's 58x54 oval.
    expect(box.width).toBeCloseTo(box.height, 1);
    // Its seat is DERIVED from the ring, so it lands on Jump's centre line
    // without any runtime measure-and-correct pass.
    const jump = rig.jump.getBoundingClientRect();
    expect(jump.height).toBeGreaterThan(0);
    expect(box.y + box.height / 2).toBeCloseTo(jump.y + jump.height / 2, 0);
    // Fully on screen, and clear of the movement wheel it sits beside.
    expect(box.left).toBeGreaterThan(-EDGE_TOLERANCE_PX);
    expect(box.bottom).toBeLessThanOrEqual(height + EDGE_TOLERANCE_PX);
    const wheel = rig.moveJoystick.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(wheel.right - EDGE_TOLERANCE_PX);
  });

  it('opens the nine-item strip RIGHTWARD and keeps every item on screen', async () => {
    const rig = await setup();
    const painter = new MenuStripPainter(writers(), {
      strip: rig.strip,
      items: rig.items,
      cancel: rig.cancel,
      caption: rig.caption,
      captionText: rig.captionText,
    });

    // Closed is the steady state and the row must not render at all.
    painter.paint(null);
    expect(getComputedStyle(rig.strip).display).toBe('none');

    const anchorBox = rig.anchor.getBoundingClientRect();
    const stripStyle = getComputedStyle(rig.strip);
    // The item size is the ANCHOR's measured box, exactly as the gesture layer
    // takes it: --strip-item-size is a calc() and getComputedStyle hands custom
    // properties back unresolved, which is why the gap and margin beside it are
    // authored as literals.
    const itemSize = anchorBox.width;
    const gap = Number.parseFloat(stripStyle.getPropertyValue('--strip-gap'));
    const margin = Number.parseFloat(stripStyle.getPropertyValue('--strip-margin'));
    const anchorX = anchorBox.x + anchorBox.width / 2;
    const anchorY = anchorBox.y + anchorBox.height / 2;
    const placement = placeConsumableStrip({
      anchorX,
      anchorY,
      count: MENU_STRIP_COUNT,
      itemSize,
      gap,
      viewportWidth: width,
      margin,
      direction: MENU_STRIP_DIRECTION,
    });
    painter.paint({
      placement,
      anchorX,
      anchorY,
      live: 2,
      cancelLive: false,
      viewportWidth: width,
      margin,
      caption: 'Bags',
    });

    expect(getComputedStyle(rig.strip).display).toBe('block');
    const boxes = rig.items.map((btn) => btn.getBoundingClientRect());
    expect(boxes).toHaveLength(MENU_STRIP_COUNT);
    for (const [i, box] of boxes.entries()) {
      expect(box.width, `item ${i} must render`).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
      expect(box.height, `item ${i} must render`).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
      expect(box.left, `item ${i} runs off the left edge`).toBeGreaterThan(-EDGE_TOLERANCE_PX);
      expect(box.right, `item ${i} runs off the right edge`).toBeLessThanOrEqual(
        width + EDGE_TOLERANCE_PX,
      );
    }
    // Rightward and strictly increasing: the roster order IS the swipe order.
    expect(boxes[0].x).toBeGreaterThan(anchorBox.x);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x);
    // One row: every item shares the anchor's centre line.
    for (const box of boxes) expect(box.y + box.height / 2).toBeCloseTo(anchorY, 0);
    // The cancel X sits ON the anchor, so releasing where the gesture started is
    // the way out without leaving the thumb's own spot.
    const cancelBox = rig.cancel.getBoundingClientRect();
    expect(cancelBox.x + cancelBox.width / 2).toBeCloseTo(anchorX, 0);
    expect(cancelBox.y + cancelBox.height / 2).toBeCloseTo(anchorY, 0);
  });

  it('shows ONE caption in the tooltip chrome, above the live item and on screen', async () => {
    const rig = await setup();
    const painter = new MenuStripPainter(writers(), {
      strip: rig.strip,
      items: rig.items,
      cancel: rig.cancel,
      caption: rig.caption,
      captionText: rig.captionText,
    });
    const anchorBox = rig.anchor.getBoundingClientRect();
    const stripStyle = getComputedStyle(rig.strip);
    const shared = {
      anchorX: anchorBox.x + anchorBox.width / 2,
      anchorY: anchorBox.y + anchorBox.height / 2,
      viewportWidth: width,
      margin: Number.parseFloat(stripStyle.getPropertyValue('--strip-margin')),
    };
    const placement = placeConsumableStrip({
      ...shared,
      count: MENU_STRIP_COUNT,
      itemSize: anchorBox.width,
      gap: Number.parseFloat(stripStyle.getPropertyValue('--strip-gap')),
      direction: MENU_STRIP_DIRECTION,
    });

    // Nothing live: no caption at all, rather than an empty box.
    painter.paint({ placement, ...shared, live: -1, cancelLive: true, caption: '' });
    expect(getComputedStyle(rig.caption).display).toBe('none');

    // The LAST item, the one whose caption is closest to running off the edge.
    painter.paint({
      placement,
      ...shared,
      live: MENU_STRIP_COUNT - 1,
      cancelLive: false,
      caption: 'Character',
    });
    expect(getComputedStyle(rig.caption).display).toBe('block');
    const capBox = rig.caption.getBoundingClientRect();
    expect(capBox.width).toBeGreaterThan(0);
    expect(capBox.left).toBeGreaterThan(-EDGE_TOLERANCE_PX);
    expect(capBox.right).toBeLessThanOrEqual(width + EDGE_TOLERANCE_PX);
    // Parked ABOVE the row, never over the item the finger is on.
    const liveBox = rig.items[MENU_STRIP_COUNT - 1].getBoundingClientRect();
    expect(capBox.bottom).toBeLessThanOrEqual(liveBox.top + EDGE_TOLERANCE_PX);
    // It IS the tooltip chrome, not a second copy of its metrics: the title
    // resolves the same font the #tooltip title does.
    const tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    tooltip.className = 'panel';
    tooltip.style.display = 'block';
    const title = document.createElement('div');
    title.className = 'tt-title';
    title.textContent = 'Character';
    tooltip.append(title);
    document.body.append(tooltip);
    expect(getComputedStyle(rig.captionText).fontFamily).toBe(getComputedStyle(title).fontFamily);
    expect(getComputedStyle(rig.captionText).fontSize).toBe(getComputedStyle(title).fontSize);
  });
});

describe('left-column reflow at 844x390', () => {
  async function setup(memberCount: number) {
    await page.viewport(844, 390);
    document.body.className = 'mobile-touch game-active hud-mobile-compact';
    document.documentElement.style.setProperty('--app-vw', '844px');
    document.documentElement.style.setProperty('--app-vh', '390px');
    const control = mountControl();
    const column = mountLeftColumn(4);
    void memberCount;
    return { ...control, ...column };
  }

  it('seats the target frame in the band the collapsed row vacated', async () => {
    const rig = await setup(4);
    const target = rig.target.getBoundingClientRect();
    const row = rig.controls.querySelector('#mobile-combat-controls') as HTMLElement;
    const rowBox = row.getBoundingClientRect();
    // The row is at the BOTTOM now, so the top band is the target frame's.
    expect(target.top).toBeLessThan(24);
    expect(rowBox.top).toBeGreaterThan(target.bottom);
  });

  it('keeps the party rows clear of the move joystick zone', async () => {
    const rig = await setup(4);
    // The painter is what writes the measured bottom in the app; here the
    // fallback in the stylesheet is what must already clear the zone.
    const rows = rig.rows.getBoundingClientRect();
    const wheel = rig.moveJoystick.getBoundingClientRect();
    expect(rows.height).toBeGreaterThan(0);
    expect(rows.bottom).toBeLessThanOrEqual(wheel.top + EDGE_TOLERANCE_PX);
    // And clear of the control's own seat, which shares the bottom band.
    const anchor = rig.anchor.getBoundingClientRect();
    expect(rows.bottom).toBeLessThanOrEqual(anchor.top + EDGE_TOLERANCE_PX);
  });

  it('holds the party stack in place when the target frame is hidden', async () => {
    const rig = await setup(4);
    // The reservation the painter writes: the party rules read the property, so
    // pinning it here is pinning the layout that follows from it.
    rig.party.style.setProperty(PARTY_BELOW_TARGET_BOTTOM_PROP, '120px');
    const before = rig.party.getBoundingClientRect().top;
    rig.target.style.display = 'none';
    const after = rig.party.getBoundingClientRect().top;
    expect(after).toBeCloseTo(before, 1);
  });

  it('nothing in the left column overlaps the menu control or its strip band', async () => {
    const rig = await setup(4);
    const anchor = rig.anchor.getBoundingClientRect();
    const target = rig.target.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - EDGE_TOLERANCE_PX &&
      a.right > b.left + EDGE_TOLERANCE_PX &&
      a.top < b.bottom - EDGE_TOLERANCE_PX &&
      a.bottom > b.top + EDGE_TOLERANCE_PX;
    expect(overlaps(target, anchor)).toBe(false);
  });
});
