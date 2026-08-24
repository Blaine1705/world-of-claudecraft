// Cold DOM painter for the raid guide opened from the party-frame footer.
// Selection and rows come from raid_boss_guide_view.ts; this class owns only
// localization, focus return, and the stable opener button.

import { markDialogRoot } from './dialog_root';
import { tEntity } from './entity_i18n';
import { esc } from './esc';
import { type TranslationKey, t } from './i18n';
import {
  type RaidBossGuideBoss,
  raidBossGuideBossForDungeon,
  raidBossGuideView,
} from './raid_boss_guide_view';
import { svgIcon } from './ui_icons';

export interface RaidBossGuideWindowDeps {
  root(): HTMLElement;
  closeOthers(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
  contextFallback(): HTMLElement | null;
}

export function raidBossGuideContextFallback(doc: Document, mobile: boolean): HTMLElement | null {
  return doc.querySelector<HTMLElement>(mobile ? '#mobile-more' : '#mm-char');
}

export class RaidBossGuideWindow {
  readonly button: HTMLButtonElement;
  private readonly buttonLabel: HTMLSpanElement;
  private boss: RaidBossGuideBoss | null = null;
  private openerFocus: HTMLElement | null = null;

  constructor(
    private readonly deps: RaidBossGuideWindowDeps,
    doc: Document = document,
  ) {
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'party-boss-guide-button';
    this.button.insertAdjacentHTML('beforeend', svgIcon('book'));
    this.buttonLabel = doc.createElement('span');
    this.button.append(this.buttonLabel);
    this.button.addEventListener('click', () => this.toggle());
  }

  get isOpen(): boolean {
    return this.deps.root().style.display === 'block';
  }

  syncAvailability(dungeonId: string | null): HTMLButtonElement | null {
    const boss = raidBossGuideBossForDungeon(dungeonId);
    if (!boss) {
      if (this.isOpen) this.close(this.deps.contextFallback());
      this.boss = null;
      return null;
    }
    const changed = boss !== this.boss;
    this.boss = boss;
    if (changed) this.paintButton();
    if (changed && this.isOpen) this.render();
    return this.button;
  }

  toggle(): void {
    if (!this.boss) return;
    if (this.isOpen) {
      this.close();
      return;
    }
    this.deps.closeOthers();
    this.openerFocus = this.deps.captureFocus() ?? this.button;
    const root = this.deps.root();
    markDialogRoot(root, { labelledBy: 'raid-boss-guide-title' });
    root.style.display = 'block';
    this.render();
    root.querySelector<HTMLElement>('.rbg-list')?.focus();
  }

  close(focusFallback: HTMLElement | null = null): void {
    const root = this.deps.root();
    if (root.style.display !== 'block') return;
    root.style.display = 'none';
    this.deps.restoreFocus(focusFallback ?? this.openerFocus);
    this.openerFocus = null;
  }

  relocalize(): void {
    if (this.boss) this.paintButton();
    if (this.isOpen) this.render();
  }

  render(): void {
    if (!this.boss) return;
    const root = this.deps.root();
    const focusedControl =
      root.querySelector('[data-close]') === root.ownerDocument.activeElement
        ? 'close'
        : root.querySelector('.rbg-list') === root.ownerDocument.activeElement
          ? 'list'
          : null;
    const view = raidBossGuideView(this.boss);
    const bossName = tEntity({ kind: 'mob', id: view.bossId, field: 'name' });
    root.innerHTML =
      `<div class="rbg-head panel-title">` +
      `<div><div id="raid-boss-guide-title">${esc(t('hudChrome.raidBossGuide.title'))}</div>` +
      `<div class="rbg-subtitle">${esc(
        t('hudChrome.raidBossGuide.subtitle', { boss: bossName }),
      )}</div></div>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(
        t('hudChrome.raidBossGuide.close'),
      )}">${svgIcon('close')}</button></div>` +
      `<ol class="rbg-list" tabindex="0" aria-label="${esc(bossName)}">${view.mechanicKeys
        .map((key) => `<li>${esc(t(key as TranslationKey))}</li>`)
        .join('')}</ol>`;
    const closeButton = root.querySelector<HTMLElement>('[data-close]');
    const list = root.querySelector<HTMLElement>('.rbg-list');
    closeButton?.addEventListener('click', () => this.close());
    if (focusedControl === 'close') closeButton?.focus();
    if (focusedControl === 'list') list?.focus();
  }

  private paintButton(): void {
    if (!this.boss) return;
    const view = raidBossGuideView(this.boss);
    const bossName = tEntity({ kind: 'mob', id: view.bossId, field: 'name' });
    const text = t('hudChrome.raidBossGuide.button', { boss: bossName });
    this.buttonLabel.textContent = text;
    this.button.title = text;
    this.button.setAttribute('aria-label', text);
  }
}
