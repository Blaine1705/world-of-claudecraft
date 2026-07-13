// The Mounts window (the stable): pick the stable mount, see each card's
// level gate + specialty numbers, and mount/dismount. Thin DOM painter over
// the pure mounts_view core (the daily-rewards window shape: a window class
// the Hud composes, markDialogRoot + focus capture, esc/close via [data-close]).
// Reads ride IWorld (player level + entity mountKey + selectedMount); writes
// are the two IWorldMounts commands, re-validated server-side.

import { MOUNTS } from '../sim/content/mounts';
import type { IWorld } from '../world_api';
import { markDialogRoot } from './dialog_root';
import { esc } from './esc';
import { type TranslationKey, t } from './i18n';
import { QUALITY_COLOR } from './icons';
import { buildMountsView, type MountRowView, type MountsView } from './mounts_view';
import { svgIcon } from './ui_icons';

export interface MountsWindowDeps {
  root(): HTMLElement;
  world(): IWorld;
  closeOthers(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
  onVisibilityChange?(): void;
}

const NAME_KEYS: Record<string, TranslationKey> = {
  valorsteed: 'hudChrome.mounts.name_valorsteed',
  grag_bear: 'hudChrome.mounts.name_grag_bear',
  stalkglider_snail: 'hudChrome.mounts.name_stalkglider_snail',
  aether_hover_cycle: 'hudChrome.mounts.name_aether_hover_cycle',
  shadowjump_toad: 'hudChrome.mounts.name_shadowjump_toad',
  stormfeather_griffin: 'hudChrome.mounts.name_stormfeather_griffin',
};

const DESC_KEYS: Record<string, TranslationKey> = {
  valorsteed: 'hudChrome.mounts.desc_valorsteed',
  grag_bear: 'hudChrome.mounts.desc_grag_bear',
  stalkglider_snail: 'hudChrome.mounts.desc_stalkglider_snail',
  aether_hover_cycle: 'hudChrome.mounts.desc_aether_hover_cycle',
  shadowjump_toad: 'hudChrome.mounts.desc_shadowjump_toad',
  stormfeather_griffin: 'hudChrome.mounts.desc_stormfeather_griffin',
};

const RARITY_KEYS: Record<string, TranslationKey> = {
  common: 'hudChrome.mounts.rarity_common',
  rare: 'hudChrome.mounts.rarity_rare',
  epic: 'hudChrome.mounts.rarity_epic',
};

/** Display name for a catalog mount (rows + tooltips); English fallback from
 *  the sim record never renders: every key has a catalog entry. */
export function mountDisplayName(key: string): string {
  const nameKey = NAME_KEYS[key];
  return nameKey ? t(nameKey) : ((MOUNTS as Record<string, { name: string }>)[key]?.name ?? key);
}

export class MountsWindow {
  private openerFocus: HTMLElement | null = null;
  private poll: number | null = null;

  constructor(private readonly deps: MountsWindowDeps) {}

  get isOpen(): boolean {
    return this.deps.root().style.display === 'block';
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.openerFocus = this.deps.captureFocus();
    this.deps.closeOthers();
    const root = this.deps.root();
    root.style.display = 'block';
    this.ensureShell();
    this.render();
    (root.querySelector('[data-close]') as HTMLElement | null)?.focus();
    this.deps.onVisibilityChange?.();
    // Cold window, tiny list: a short poll keeps the Mount/Dismount state and
    // the pick honest online (the server can refuse a toggle in combat).
    this.poll = window.setInterval(() => {
      if (this.isOpen) this.render();
    }, 500);
  }

  close(): void {
    const root = this.deps.root();
    if (root.style.display !== 'block') {
      this.openerFocus = null;
      return;
    }
    if (this.poll !== null) {
      window.clearInterval(this.poll);
      this.poll = null;
    }
    root.style.display = 'none';
    this.deps.restoreFocus(this.openerFocus);
    this.openerFocus = null;
    this.deps.onVisibilityChange?.();
  }

  render(): void {
    const world = this.deps.world();
    const self = world.player;
    const view = buildMountsView(self?.level ?? 1, world.selectedMount(), self?.mountKey ?? '');
    const body = this.deps.root().querySelector<HTMLElement>('.mw-body');
    if (!body) return;
    body.innerHTML = this.rowsHtml(view) + this.footerHtml(view);
    for (const btn of body.querySelectorAll<HTMLButtonElement>('[data-mount-select]')) {
      btn.addEventListener('click', () => {
        const key = btn.dataset.mountSelect ?? '';
        if (key in MOUNTS) this.deps.world().selectMount(key as keyof typeof MOUNTS);
        this.render();
      });
    }
    body.querySelector<HTMLButtonElement>('[data-mount-toggle]')?.addEventListener('click', () => {
      this.deps.world().toggleMounted();
      this.render();
    });
  }

  private ensureShell(): void {
    const root = this.deps.root();
    markDialogRoot(root, { labelledBy: 'mounts-title' });
    if (root.querySelector('.mw-body')) return;
    root.innerHTML =
      `<div class="panel-title"><span id="mounts-title">${esc(t('hudChrome.mounts.title'))}</span>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.mounts.close'))}">${svgIcon('close')}</button></div>` +
      `<div class="mw-body"></div>`;
    root.querySelector('[data-close]')?.addEventListener('click', () => this.close());
  }

  private specialtyHtml(row: MountRowView): string {
    const parts = [esc(t('hudChrome.mounts.spec_speed', { pct: row.speedPct }))];
    if (row.blockPct > 0) parts.push(esc(t('hudChrome.mounts.spec_block', { pct: row.blockPct })));
    if (row.critPct > 0) parts.push(esc(t('hudChrome.mounts.spec_crit', { pct: row.critPct })));
    return parts.map((p) => `<span class="mw-spec">${p}</span>`).join('');
  }

  private rowHtml(row: MountRowView): string {
    const color = QUALITY_COLOR[row.rarity] ?? '#fff';
    const classes = ['mw-row'];
    if (row.locked) classes.push('mw-locked');
    if (row.selected) classes.push('mw-selected');
    const state = row.active
      ? `<span class="mw-state mw-riding">${esc(t('hudChrome.mounts.riding'))}</span>`
      : row.selected
        ? `<span class="mw-state">${esc(t('hudChrome.mounts.selected'))}</span>`
        : '';
    const gate = row.locked
      ? `<div class="mw-lock">${esc(t('hudChrome.mounts.requiresLevel', { level: row.level }))}</div>`
      : '';
    const select = row.selected
      ? ''
      : `<button type="button" class="btn mw-select" data-mount-select="${esc(row.key)}"` +
        `${row.locked ? ' disabled' : ''}>${esc(t('hudChrome.mounts.select'))}</button>`;
    return (
      `<div class="${classes.join(' ')}" role="listitem">` +
      `<div class="mw-info">` +
      `<div class="mw-name" style="color:${color}">${esc(mountDisplayName(row.key))}` +
      ` <span class="mw-rarity">${esc(t(RARITY_KEYS[row.rarity]))}</span>${state}</div>` +
      `<div class="mw-desc">${esc(t(DESC_KEYS[row.key]))}</div>` +
      `<div class="mw-specs">${this.specialtyHtml(row)}</div>` +
      gate +
      `</div>` +
      `<div class="mw-actions">${select}</div>` +
      `</div>`
    );
  }

  private rowsHtml(view: MountsView): string {
    return `<div class="mw-list" role="list">${view.rows.map((r) => this.rowHtml(r)).join('')}</div>`;
  }

  private footerHtml(view: MountsView): string {
    const label =
      view.action === 'dismount' ? t('hudChrome.mounts.dismount') : t('hudChrome.mounts.mount');
    const button =
      view.action === null
        ? `<span class="mw-hint">${esc(t('hudChrome.mounts.pickFirst'))}</span>`
        : `<button type="button" class="btn mw-toggle" data-mount-toggle>${esc(label)}</button>`;
    return `<div class="mw-footer">${button}<span class="mw-hint">${esc(t('hudChrome.mounts.keybindHint'))}</span></div>`;
  }
}
