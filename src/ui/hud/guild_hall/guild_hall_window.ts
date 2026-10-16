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
import { t } from '../../i18n';
import { svgIcon } from '../../ui_icons';
import {
  buildGuildHallView,
  type GuildContractCardView,
  type GuildHallTab,
  type GuildOfferRowView,
  lanternSeals,
} from './guild_hall_view';

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
    this.lastSig = '';
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

  // The repaint signature: the board and progress, the seals, the titles owned, the tab; the
  // countdown repaints on its own minute cadence below, so it stays out of the signature.
  private sig(): string {
    const world = this.deps.world();
    const owned = [
      'feat_guild_writ_runner',
      'feat_guild_hallsworn',
      'feat_guild_of_lantern_hall',
    ].map((id) => world.deedsEarned.has(id));
    return JSON.stringify([
      world.guildContracts,
      lanternSeals(world.inventory),
      owned,
      world.weeklyQuestResetAtMs,
      this.tab,
    ]);
  }

  /** Language fan-out arm: the sheet is signature-gated on locale-free data, so a switch
   *  rebuilds it once here; render() re-latches the signature. */
  relocalize(): void {
    if (!this.opened) return;
    this.lastSig = '';
    this.render(null);
  }

  /** Slow-band refresh: repaint when the board, the bags or the Book change, or every minute
   *  for the clock. */
  refreshIfChanged(): void {
    if (!this.opened) return;
    const sig = `${this.sig()}:${Math.floor(Date.now() / 60_000)}`;
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.render(null);
  }

  private render(focus: 'open' | null): void {
    const root = this.deps.root();
    const world = this.deps.world();
    const view = buildGuildHallView(world, Date.now(), this.tab);
    markDialogRoot(root, { labelledBy: 'guild-hall-title' });
    const tabs = view.tabs
      .map(
        (tab) =>
          `<button type="button" class="gh-tab${tab.selected ? ' gh-tab-on' : ''}" role="tab" aria-selected="${tab.selected}" data-gh-tab="${esc(tab.id)}">${esc(tab.label)}</button>`,
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
      `<div class="gh-tabs" role="tablist">${tabs}</div>` +
      `<div class="gh-sub"><span class="gh-seals">${esc(view.sealsText)}</span><span class="gh-reset">${esc(view.resetText)}</span></div>` +
      `<p class="gh-intro">${esc(view.intro)}</p>` +
      body;
    root.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    root.querySelectorAll<HTMLButtonElement>('[data-gh-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.ghTab === 'quartermaster' ? 'quartermaster' : 'contracts';
        if (next === this.tab) return;
        this.tab = next;
        this.lastSig = '';
        this.render(null);
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-gh-buy]').forEach((button) => {
      button.addEventListener('click', () => {
        const offerId = button.dataset.ghBuy;
        if (offerId) world.buyGuildCosmetic(offerId);
      });
    });
    if (focus === 'open') (root.querySelector('[data-close]') as HTMLElement | null)?.focus();
  }

  private cardHtml(card: GuildContractCardView): string {
    return (
      `<section class="gh-card gh-card-${esc(card.kind)}${card.done ? ' gh-card-done' : ''}" data-gh-card="${esc(card.id)}">` +
      `<div class="gh-kind">${esc(card.kindLabel)}</div>` +
      `<div class="gh-dungeon">${esc(card.dungeon)}</div>` +
      `<p class="gh-goal">${esc(card.goal)}</p>` +
      `<div class="gh-reward">${esc(card.reward)}</div>` +
      `<div class="gh-state">${esc(card.stateLabel)}</div>` +
      `</section>`
    );
  }

  private offerHtml(row: GuildOfferRowView): string {
    const disabled = row.owned || !row.affordable;
    return (
      `<section class="gh-offer${row.owned ? ' gh-offer-owned' : ''}" data-gh-offer="${esc(row.id)}">` +
      `<div class="gh-offer-text"><div class="gh-offer-title">${esc(row.title)}</div>` +
      `<div class="gh-offer-preview">${esc(row.preview)}</div></div>` +
      `<div class="gh-offer-price">${esc(row.price)}</div>` +
      `<button type="button" class="gh-btn" data-gh-buy="${esc(row.id)}"${disabled ? ' disabled' : ''}>${esc(row.action)}</button>` +
      `</section>`
    );
  }
}
