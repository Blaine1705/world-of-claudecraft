// The on-bar action-bar key-binding mode's banner (issue #1238): the hint, the
// status line and the Reset / Done buttons shown while the mode is active. A
// HUD-ROOT element (mounted on #ui, never in #actionbar-stack: a bar moved with
// Interface Unlock is reparented to #ui and painted over a stack-anchored
// banner, eating its Done click), placed against the LIVE bars through the
// DOM-free actionBarBindBannerPlacement core so it clears every visible bar,
// and draggable by its plate so the player can move it off anything it still
// covers. Owns only that DOM; the mode's state machine is the pure
// action_bar_bind_core.ts and action_bar_bind_controller.ts owns the slot
// clicks, the key capture and the confirm dialogs. Registered in
// tests/architecture.test.ts UI_DOM_MODULES.

import { audio } from '../../../game/audio';
import { t } from '../../i18n';
import { getUiScale } from '../../ui_scale';
import { draggedWindowPosition } from '../../window_drag_core';
import {
  type ActionBarBindBox,
  type ActionBarBindState,
  actionBarBindBannerPlacement,
  actionBarBindStatus,
} from './action_bar_bind_core';

const ACTION_BAR_BIND_BANNER_ID = 'actionbar-bind-banner';

/** The bars the banner must clear, primary first (the placement centres on it).
 *  Looked up by id so a bar Interface Unlock reparented to #ui still counts. */
export const ACTION_BAR_BIND_BANNER_ANCHORS: readonly string[] = [
  '#actionbar',
  '#actionbar2',
  '#actionbar3',
  '#cross-hotbar',
  '#stancebar',
  '#petbar',
];

/** Build the banner, append it to `parent` (the HUD root), place it clear of
 *  the live bars and make it draggable. Returns the banner root. */
export function mountActionBarBindBanner(
  parent: HTMLElement | null,
  handlers: { onReset: () => void; onDone: () => void },
): HTMLElement {
  const el = document.createElement('div');
  el.id = ACTION_BAR_BIND_BANNER_ID;
  // The banner is a plated surface (the library's strong panel), like every
  // other chrome plate the redesign put under the bar.
  el.className = 'ui-panel-strong';
  el.setAttribute('role', 'status');
  const hint = document.createElement('div');
  hint.className = 'actionbar-bind-hint';
  hint.textContent = t('hudChrome.actionBar.bannerHint');
  const status = document.createElement('div');
  status.className = 'actionbar-bind-status';
  const actions = document.createElement('div');
  actions.className = 'actionbar-bind-actions';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn ui-btn';
  resetBtn.textContent = t('hudChrome.actionBar.reset');
  resetBtn.addEventListener('click', () => {
    audio.click();
    handlers.onReset();
  });
  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'btn ui-btn';
  doneBtn.textContent = t('hudChrome.actionBar.done');
  doneBtn.addEventListener('click', () => {
    audio.click();
    handlers.onDone();
  });
  actions.append(resetBtn, doneBtn);
  el.append(hint, status, actions);
  if (!parent) return el;
  parent.appendChild(el);
  placeActionBarBindBanner(el, parent);
  bindActionBarBindBannerDrag(el, parent);
  return el;
}

/** The live box of one anchor in HUD author px, or null when it has no box
 *  (display:none, or hidden under the cross hotbar). getBoundingClientRect
 *  reports VISUAL px (the #ui zoom applied), so it is divided by the scale. */
function anchorBox(root: HTMLElement, selector: string, scale: number): ActionBarBindBox | null {
  const r = root.ownerDocument.querySelector(selector)?.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return null;
  return {
    left: r.left / scale,
    top: r.top / scale,
    width: r.width / scale,
    height: r.height / scale,
  };
}

/** Position a connected banner against the live bars (inline left/top in HUD
 *  author px, the same space the banner's own offset size and the #ui client
 *  box are already in). */
export function placeActionBarBindBanner(el: HTMLElement, uiRoot: HTMLElement): void {
  const scale = getUiScale() > 0 ? getUiScale() : 1;
  const bars: ActionBarBindBox[] = [];
  for (const sel of ACTION_BAR_BIND_BANNER_ANCHORS) {
    const box = anchorBox(uiRoot, sel, scale);
    if (box) bars.push(box);
  }
  const placed = actionBarBindBannerPlacement({
    bars,
    banner: { width: el.offsetWidth, height: el.offsetHeight },
    viewport: { width: uiRoot.clientWidth, height: uiRoot.clientHeight },
  });
  el.style.left = `${placed.left}px`;
  el.style.top = `${placed.top}px`;
}

/** Drag the banner by its plate (never by its buttons): the player can move it
 *  off any slot it still covers. Pointer coordinates are visual px; the shared
 *  window-drag geometry converts them to author px and keeps the banner inside
 *  the HUD root. */
export function bindActionBarBindBannerDrag(el: HTMLElement, uiRoot: HTMLElement): void {
  let grab: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return;
    const r = el.getBoundingClientRect();
    grab = { x: e.clientX - r.left, y: e.clientY - r.top };
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!grab) return;
    const pos = draggedWindowPosition(
      { pointerX: e.clientX, pointerY: e.clientY, grabOffsetX: grab.x, grabOffsetY: grab.y },
      {
        scale: getUiScale(),
        viewportWidth: uiRoot.clientWidth,
        viewportHeight: uiRoot.clientHeight,
        windowWidth: el.offsetWidth,
        windowHeight: el.offsetHeight,
      },
    );
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
  });
  const drop = () => {
    grab = null;
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
}

/** Paint the status line for the mode's current state. */
export function setActionBarBindBannerStatus(banner: HTMLElement, state: ActionBarBindState): void {
  const el = banner.querySelector<HTMLElement>('.actionbar-bind-status');
  if (!el) return;
  const status = actionBarBindStatus(state);
  el.textContent =
    status === 'capturing'
      ? t('hudChrome.actionBar.bannerCapturing')
      : status === 'bound'
        ? t('hudChrome.actionBar.boundToKey', { key: state.lastBoundKeyLabel ?? '' })
        : '';
}
