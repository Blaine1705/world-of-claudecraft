// Thin DOM painter for Lantern Hall's guild window (#guild-hall-window).
//
// The consumer half of the pure-core + thin-painter split: guild_hall_view.ts decides what
// every card and row says; this module owns the window lifecycle (open on a resident's event,
// on the tab that resident keeps; close; focus return), the tab switch, the one wall-clock
// read (the reset countdown), and the click that sends a purchase through IWorld. It holds no
// Sim reference and reaches Hud only through its deps.
import { audio } from '../../../game/audio';
import type { IWorld } from '../../../world_api';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import { focusedWithin, restoreFirstEnabled } from '../../focus_restore';
import { t } from '../../i18n';
import { svgIcon } from '../../ui_icons';
import {
  buildGuildHallView,
  type GuildContractCardView,
  type GuildHallTab,
  type GuildOfferRowView,
  guildOfferOwnedFlags,
  guildResetText,
  lanternSeals,
} from './guild_hall_view';

const PANEL_ID = 'guild-hall-panel';
const TABS: readonly GuildHallTab[] = ['contracts', 'quartermaster'];

export interface GuildHallWindowDeps {
  root(): HTMLElement;
  world(): IWorld;
  closeOthers(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
}

export class GuildHallWindow {
  private opened = false;
  private tab: GuildHallTab = 'contracts';
  private lastSig = '';
  private lastMinute = -1;
  private openerFocus: HTMLElement | null = null;

  constructor(private readonly deps: GuildHallWindowDeps) {}

  get isOpen(): boolean {
    return this.opened;
  }

  /** A resident's talk event: open (or repaint) the window on that resident's tab. */
  open(tab: GuildHallTab = 'contracts'): void {
    if (!this.opened) {
      this.deps.closeOthers();
      this.openerFocus = this.deps.captureFocus();
      this.opened = true;
      audio.bagOpen();
    }
    this.tab = tab;
    this.lastSig = this.sig();
    this.render('open');
    this.deps.root().style.display = 'flex';
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.deps.root().style.display = 'none';
    this.deps.restoreFocus(this.openerFocus);
    this.openerFocus = null;
  }

  // The repaint signature: the board and progress, the seals, the offers owned, the tab; the
  // countdown updates its own text on its minute cadence below, so it stays out of it.
  private sig(): string {
    const world = this.deps.world();
    const owned = guildOfferOwnedFlags(world);
    return JSON.stringify([
      world.guildContracts,
      lanternSeals(world.inventory),
      owned,
      world.weeklyQuestResetAtMs,
      this.tab,
    ]);
  }

  /** Language fan-out arm: the sheet is signature-gated on locale-free data, so a switch
   *  rebuilds it once here and re-latches the signature. */
  relocalize(): void {
    if (!this.opened) return;
    this.lastSig = this.sig();
    this.render(null);
  }

  /** Slow-band refresh: rebuild when the board, the bags or the Book change; once a minute
   *  only the countdown's text moves, so focus and the rest of the sheet stay put. */
  refreshIfChanged(): void {
    if (!this.opened) return;
    this.tickClock();
    const sig = this.sig();
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.render(null);
  }

  /** The countdown's own minute cadence: rewrite its text node, nothing else. */
  private tickClock(): void {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    if (minute === this.lastMinute) return;
    this.lastMinute = minute;
    const reset = this.deps.root().querySelector('.gh-reset');
    if (reset) reset.textContent = guildResetText(this.deps.world().weeklyQuestResetAtMs, now);
  }

  private switchTab(next: GuildHallTab): void {
    if (next === this.tab) return;
    this.tab = next;
    this.lastSig = this.sig();
    this.render('tab');
  }

  /** The key of the control holding focus, so a rebuild can hand focus back to its twin. */
  private focusedKey(root: HTMLElement): string | null {
    // focusedWithin refuses a parked dialog root, so a parked sheet resolves nothing
    const active = focusedWithin(root);
    if (!active) return null;
    if (active.dataset.ghTab) return `[data-gh-tab="${active.dataset.ghTab}"]`;
    if (active.dataset.ghBuy) return `[data-gh-buy="${active.dataset.ghBuy}"]`;
    if (active.hasAttribute('data-close')) return '[data-close]';
    return null;
  }

  private render(focus: 'open' | 'tab' | null): void {
    const root = this.deps.root();
    const world = this.deps.world();
    const keep = focus === null ? this.focusedKey(root) : null;
    const now = Date.now();
    this.lastMinute = Math.floor(now / 60_000);
    const view = buildGuildHallView(world, now, this.tab);
    markDialogRoot(root, { labelledBy: 'guild-hall-title' });
    // a WAI-ARIA tablist with roving tabindex, controlling the one tabpanel below
    const tabs = view.tabs
      .map(
        (tab) =>
          `<button type="button" class="gh-tab" role="tab" id="guild-hall-tab-${esc(tab.id)}" aria-selected="${tab.selected}" tabindex="${tab.selected ? '0' : '-1'}" aria-controls="${PANEL_ID}" data-gh-tab="${esc(tab.id)}">${esc(tab.label)}</button>`,
      )
      .join('');
    const body =
      this.tab === 'contracts'
        ? `<div class="gh-cards">${view.contracts.map((card) => this.cardHtml(card)).join('')}</div>` +
          (view.emptyText ? `<p class="gh-empty">${esc(view.emptyText)}</p>` : '') +
          `<div class="gh-foot">${esc(view.lifetimeText)}</div>`
        : `<div class="gh-offers">${view.offers.map((row) => this.offerHtml(row)).join('')}</div>`;
    root.innerHTML =
      `<div class="panel-title gh-title"><span id="guild-hall-title">${esc(view.title)}</span>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.guildHall.close'))}">${svgIcon('close')}</button></div>` +
      `<div class="gh-tabs" role="tablist" aria-label="${esc(t('hudChrome.guildHall.tabsLabel'))}">${tabs}</div>` +
      `<div class="gh-panel" role="tabpanel" id="${PANEL_ID}" aria-labelledby="guild-hall-tab-${esc(this.tab)}">` +
      `<div class="gh-sub"><span class="gh-seals">${esc(view.sealsText)}</span><span class="gh-reset">${esc(view.resetText)}</span></div>` +
      `<p class="gh-intro">${esc(view.intro)}</p>` +
      body +
      `</div>`;
    root.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    root.querySelectorAll<HTMLButtonElement>('[data-gh-tab]').forEach((button) => {
      const own: GuildHallTab =
        button.dataset.ghTab === 'quartermaster' ? 'quartermaster' : 'contracts';
      button.addEventListener('click', () => this.switchTab(own));
      // roving focus: the arrows, Home and End move along the strip (selection follows focus)
      button.addEventListener('keydown', (event) => {
        const at = TABS.indexOf(own);
        let next = -1;
        if (event.key === 'ArrowRight') next = (at + 1) % TABS.length;
        else if (event.key === 'ArrowLeft') next = (at - 1 + TABS.length) % TABS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = TABS.length - 1;
        if (next < 0) return;
        event.preventDefault();
        this.switchTab(TABS[next]);
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-gh-buy]').forEach((button) => {
      button.addEventListener('click', () => {
        const offerId = button.dataset.ghBuy;
        if (offerId) world.buyGuildCosmetic(offerId);
      });
    });
    const target =
      focus === 'open' ? '[data-close]' : focus === 'tab' ? `[data-gh-tab="${this.tab}"]` : keep;
    // a control the rebuild disabled (a title just bought) hands focus to Close
    if (target)
      restoreFirstEnabled([
        root.querySelector<HTMLButtonElement>(target),
        root.querySelector<HTMLButtonElement>('[data-close]'),
      ]);
  }

  private cardHtml(card: GuildContractCardView): string {
    return (
      `<section class="gh-card gh-card-${esc(card.kind)}${card.done ? ' gh-card-done' : ''}" data-gh-card="${esc(card.id)}">` +
      `<div class="gh-kind">${esc(card.kindLabel)}</div>` +
      `<div class="gh-dungeon">${esc(card.dungeon)}</div>` +
      `<p class="gh-goal">${esc(card.goal)}</p>` +
      (card.detail ? `<p class="gh-detail">${esc(card.detail)}</p>` : '') +
      `<div class="gh-reward">${esc(card.reward)}</div>` +
      `<div class="gh-state">${esc(card.stateLabel)}</div>` +
      `</section>`
    );
  }

  private offerHtml(row: GuildOfferRowView): string {
    const disabled = row.owned || !row.affordable;
    return (
      `<section class="gh-offer${row.icon ? ' gh-offer-art' : ''}${row.owned ? ' gh-offer-owned' : ''}" data-gh-offer="${esc(row.id)}">` +
      (row.icon ? `<img class="gh-offer-icon" src="${esc(row.icon)}" alt="" loading="lazy">` : '') +
      `<div class="gh-offer-text"><div class="gh-offer-title">${esc(row.title)}</div>` +
      `<div class="gh-offer-preview">${esc(row.preview)}</div></div>` +
      `<div class="gh-offer-price">${esc(row.price)}</div>` +
      `<button type="button" class="gh-btn" data-gh-buy="${esc(row.id)}"${disabled ? ' disabled' : ''}>${esc(row.action)}</button>` +
      `</section>`
    );
  }
}
