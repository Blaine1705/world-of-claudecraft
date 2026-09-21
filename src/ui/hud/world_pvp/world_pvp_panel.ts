// Thin DOM painter for the World PvP tab of the merged PvP window: renders the
// pure view (world_pvp_window_view.ts) as localized markup and wires the one
// action (raise, with its confirm step; lower; keep up) back through IWorld.
// Owns no state: the confirm step lives on the window (arena_window.ts) beside
// the active tab, and every string is a t() key from hudChrome.worldPvp with
// the stakes numbers resolved from the sim rules. The class families are the
// window's existing ones (arena-layout, ui-card, pvp-queue, bg-note), so the
// tab reads as a sibling of the Thornhollow Fields panel, not a new dialect.

import { audio } from '../../../game/audio';
import type { IWorld } from '../../../world_api';
import { esc } from '../../esc';
import { formatMoney, formatNumber, t } from '../../i18n';
import { svgIcon } from '../../ui_icons';
import { formatDisarmClock, type WorldPvpWindowView } from './world_pvp_window_view';

const num = (n: number): string => formatNumber(n, { maximumFractionDigits: 0 });

/** The panel body under the title and tab strip. */
export function worldPvpBodyHtml(view: WorldPvpWindowView): string {
  if (view.kind === 'pending') {
    return `<div class="bg-note">${esc(t('hudChrome.worldPvp.pending'))}</div>`;
  }
  const blurb = `<div class="bg-blurb">${esc(t('hudChrome.worldPvp.blurb'))}</div>`;
  const statusClass = view.flagged
    ? view.disarmRemaining === null
      ? 'is-on'
      : 'is-disarming'
    : 'is-off';
  const statusText = view.flagged
    ? view.disarmRemaining === null
      ? t('hudChrome.worldPvp.statusOn')
      : t('hudChrome.worldPvp.statusDisarming', { time: formatDisarmClock(view.disarmRemaining) })
    : t('hudChrome.worldPvp.statusOff');
  const status =
    `<div class="wpvp-status ui-card ${statusClass}"><span aria-hidden="true">${svgIcon('battleground')}</span>` +
    `<span>${esc(statusText)}</span></div>`;
  const stats =
    `<div class="pvp-stat-grid">` +
    `<div class="ui-card">${esc(t('hudChrome.worldPvp.record', { kills: num(view.kills), deaths: num(view.deaths) }))}</div>` +
    `<div class="ui-card">${esc(t('hudChrome.warfare.balance', { amount: num(view.honor) }))}</div>` +
    `</div>`;
  const stakes = view.stakes;
  const stakeRows = [
    t('hudChrome.worldPvp.stakeLine', {
      cap: formatMoney(stakes.stakeCapCopper),
      percent: `${num(stakes.stakePercent)}%`,
    }),
    t('hudChrome.worldPvp.honorLine', { honor: num(stakes.killHonor) }),
    t('hudChrome.worldPvp.splitLine'),
    t('hudChrome.worldPvp.disarmLine', { minutes: num(stakes.disarmMinutes) }),
    t('hudChrome.worldPvp.groupLine'),
    t('hudChrome.worldPvp.greyLine', { levels: num(stakes.greyLevelGap) }),
  ]
    .map((line) => `<li>${esc(line)}</li>`)
    .join('');
  return (
    `<div class="arena-layout"><section class="arena-overview">` +
    blurb +
    status +
    stats +
    actionHtml(view) +
    `</section><section class="arena-ladders">` +
    `<div class="bg-sub">${esc(t('hudChrome.worldPvp.title'))}</div>` +
    `<ul class="wpvp-stakes">${stakeRows}</ul>` +
    `</section></div>`
  );
}

function actionHtml(view: Extract<WorldPvpWindowView, { kind: 'live' }>): string {
  const hint = `<div class="bg-note">${esc(t('hudChrome.worldPvp.commandHint'))}</div>`;
  if (view.action === 'locked') {
    return (
      `<div class="pvp-queue ui-card"><button class="btn ui-btn ui-btn--red" data-act="pvp-enable" disabled aria-disabled="true">${esc(t('hudChrome.worldPvp.enable'))}</button>` +
      `<div class="bg-note bg-level-req">${esc(t('hudChrome.worldPvp.levelReq', { level: num(view.stakes.minLevel) }))}</div>${hint}</div>`
    );
  }
  if (view.action === 'enable') {
    if (view.confirming) {
      return (
        `<div class="pvp-queue ui-card"><div class="bg-note">${esc(
          t('hudChrome.worldPvp.confirmBody', {
            cap: formatMoney(view.stakes.stakeCapCopper),
            minutes: num(view.stakes.disarmMinutes),
          }),
        )}</div><div class="pvp-queue-actions">` +
        `<button class="btn leave ui-btn" data-act="pvp-cancel">${esc(t('hudChrome.worldPvp.confirmCancel'))}</button>` +
        `<button class="btn ui-btn ui-btn--red" data-act="pvp-confirm">${esc(t('hudChrome.worldPvp.confirmAccept'))}</button>` +
        `</div></div>`
      );
    }
    return `<div class="pvp-queue ui-card"><button class="btn ui-btn ui-btn--red" data-act="pvp-enable">${esc(t('hudChrome.worldPvp.enable'))}</button>${hint}</div>`;
  }
  if (view.action === 'keepUp') {
    return `<div class="pvp-queue ui-card"><button class="btn ui-btn ui-btn--red" data-act="pvp-keep">${esc(t('hudChrome.worldPvp.keepUp'))}</button>${hint}</div>`;
  }
  return `<div class="pvp-queue ui-card"><button class="btn leave ui-btn" data-act="pvp-disable">${esc(t('hudChrome.worldPvp.disable'))}</button>${hint}</div>`;
}

/** Window-supplied glue: the world to act on and the confirm-step setter. */
export interface WorldPvpPanelDeps {
  world(): IWorld;
  setConfirming(confirming: boolean): void;
}

/** Wire the rendered panel's buttons. The confirm step is window state: a
 *  press flips it and the window re-renders (its signature carries the flag). */
export function wireWorldPvpPanel(el: HTMLElement, deps: WorldPvpPanelDeps): void {
  const on = (act: string, fn: () => void) => {
    el.querySelector(`[data-act="${act}"]:not([disabled])`)?.addEventListener('click', () => {
      fn();
      audio.click();
    });
  };
  on('pvp-enable', () => deps.setConfirming(true));
  on('pvp-cancel', () => deps.setConfirming(false));
  on('pvp-confirm', () => {
    deps.setConfirming(false);
    deps.world().setWorldPvpFlag(true);
  });
  on('pvp-keep', () => deps.world().setWorldPvpFlag(true));
  on('pvp-disable', () => deps.world().setWorldPvpFlag(false));
}
