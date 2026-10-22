import { apiUrl } from '../../../client_origin';
import type { CourierDispatchRequest, CourierInfo } from '../../../sim/courier/types';
import { courierSelectionCount } from '../../../sim/courier/types';
import { ITEMS } from '../../../sim/data';
import { isItemLocked } from '../../../sim/item_lock_flag';
import type { InvSlot } from '../../../sim/types';
import { bagCornerMark, bagRimClasses } from '../../bag_corner_mark_view';
import { bagFineMark } from '../../bag_fine_mark_view';
import { bagInstanceGlyphKind } from '../../bag_instance_glyph_view';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import {
  captureFocusKey,
  findFocusKey,
  focusKeyAttr,
  restoreFirstEnabled,
} from '../../focus_restore';
import { formatNumber, t } from '../../i18n';
import { QUALITY_COLOR } from '../../icons';
import {
  cornerMarkHtml,
  INSTANCE_GLYPH_ARIA_KEYS,
  lockMarkHtml,
} from '../../item_instance_glyph_mark';
import { knownItemDef } from '../../known_item';
import type { PainterHostPresentation } from '../../painter_host';
import { wireTabStrip } from '../../tab_strip_painter';
import { tabStripHtml, tabStripModel } from '../../tab_strip_view';
import { svgIcon } from '../../ui_icons';
import { unknownItemIconHtml } from '../../unknown_item_icon';
import { wornItemCellParts } from '../../worn_item_cell_view';
import {
  COURIER_SELECTION_LIMIT,
  type CourierStackSide,
  type CourierVaultRow,
  canDispatchCourier,
  courierDispatchRequest,
  courierSelectionMatches,
  courierStackSelectable,
  courierVaultRowSelected,
  courierVaultRows,
  courierVaultStackSelectable,
  emptyCourierDraft,
  reconcileCourierDraft,
  toggleCourierStack,
  toggleCourierVaultRow,
} from './courier_core';

/** Which store the left column shows and the bags send to. */
type CourierStore = 'bank' | 'vault';

export interface CourierWindowDeps
  extends Pick<PainterHostPresentation, 'itemIcon' | 'itemTooltip' | 'attachTooltip'> {
  info(): CourierInfo | null;
  inventory(): readonly InvSlot[];
  inventoryCapacity?(): number;
  hideTooltip(): void;
  dispatch(request: CourierDispatchRequest): void;
  closeOthers(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
  onClosed?(): void;
}

/** Cold, signature-gated window. All custody and travel are authoritative. */
export class CourierWindow {
  private draft = emptyCourierDraft();
  private store: CourierStore = 'bank';
  private lastSignature = '';
  private cheapSignature = '';
  private opened = false;
  private opener: HTMLElement | null = null;
  constructor(
    private el: HTMLElement,
    private deps: CourierWindowDeps,
  ) {}
  isOpen(): boolean {
    return this.opened;
  }
  open(): void {
    if (this.opened) {
      this.render(true);
      return;
    }
    this.deps.closeOthers();
    this.opener = this.deps.captureFocus();
    this.opened = true;
    this.el.style.display = 'flex';
    this.render(true);
    this.el.querySelector<HTMLButtonElement>('.x-btn')?.focus({ preventScroll: true });
  }
  /** Closing without a delivery sends a waiting, empty courier away (an empty
   * dispatch); the Send button closes with `dismiss` false. */
  close(dismiss = true): void {
    if (!this.opened) return;
    this.opened = false;
    const info = this.deps.info();
    if (dismiss && info?.phase === 'ready' && info.cargo.length === 0)
      this.deps.dispatch(courierDispatchRequest(emptyCourierDraft()));
    this.deps.hideTooltip();
    this.el.style.display = 'none';
    this.reset();
    this.deps.restoreFocus(this.opener);
    this.opener = null;
    this.deps.onClosed?.();
  }
  refreshIfChanged(): void {
    if (this.opened) this.render();
  }
  reset(): void {
    this.draft = emptyCourierDraft();
    this.store = 'bank';
    this.lastSignature = '';
    this.cheapSignature = '';
  }
  render(force = false): void {
    const info = this.deps.info();
    // The vault rides its own frame (no revision of its own on the mirror), so it
    // joins the cheap signature whole; it is a few dozen rows at most.
    const cheapSignature = `${info?.phase}:${info?.active}:${info?.revision}:${info?.inventoryRevision}:${info?.bankRevision}:${info?.bankCapacity}:${this.deps.inventoryCapacity?.()}:${this.store}:${JSON.stringify(info?.vault ?? null)}`;
    if (!force && cheapSignature === this.cheapSignature) return;
    this.cheapSignature = cheapSignature;
    const inventory = info?.phase === 'ready' ? this.deps.inventory() : [];
    const ready = info?.phase === 'ready';
    const inventoryCapacity = this.deps.inventoryCapacity?.() ?? inventory.length;
    const vault = ready ? (info.vault ?? null) : null;
    // A courier from an older server (or a vault gone missing) has only the bank.
    if (!vault) this.store = 'bank';
    this.draft = ready
      ? reconcileCourierDraft(this.draft, inventory, info.bankSlots, vault)
      : emptyCourierDraft();
    // Pose is deliberately absent: moving the donkey never rebuilds this window.
    const signature = JSON.stringify([
      info?.phase,
      info?.active,
      info?.revision,
      info?.cargo,
      ready ? inventory : null,
      ready ? info.bankSlots : null,
      ready ? info.bankCapacity : null,
      vault,
      this.store,
      inventoryCapacity,
      this.draft,
    ]);
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.deps.hideTooltip();
    const focus = captureFocusKey(this.el);
    const scroll = this.el.querySelector('.ui-win-body')?.scrollTop ?? 0;
    const gridScroll = new Map(
      [...this.el.querySelectorAll<HTMLElement>('[data-courier-storage]')].map((pane) => [
        pane.dataset.courierStorage,
        pane.querySelector('.courier-grid')?.scrollTop ?? 0,
      ]),
    );
    markDialogRoot(this.el, { labelledBy: 'courier-title' });
    const count = courierSelectionCount(this.draft);
    const bagSide: CourierStackSide = this.store === 'vault' ? 'vaultDeposits' : 'deposits';
    const status = info ? t(`hudChrome.courier.${info.phase}`) : t('hudChrome.courier.unavailable');
    this.el.innerHTML = `<div class="panel-title ui-win-head"><span id="courier-title" class="ui-win-title">${esc(t('hudChrome.courier.title'))}</span><button type="button" class="x-btn ui-x-btn" aria-label="${esc(t('hudChrome.courier.close'))}"${focusKeyAttr('close')}>×</button></div>
      <div class="ui-win-body"><p role="status">${esc(status)}</p>
      ${info && !info.active ? `<p class="ui-muted">${esc(t('hudChrome.courier.membership'))}</p>` : ''}
      ${ready ? `<p class="ui-muted courier-instructions">${esc(t('hudChrome.courier.instructions'))}</p><div class="courier-columns">${this.storeColumn(info.bankSlots, info.bankCapacity, vault, !!info.active)}${this.portrait()}${this.rows(bagSide, inventory, !!info.active, inventoryCapacity)}</div>` : this.portrait()}
      ${info && !ready ? `<section><h3>${esc(t('hudChrome.courier.cargo'))}</h3>${this.cargo(info.cargo)}<p class="ui-muted">${esc(t('hudChrome.courier.cargoSafe'))}</p></section>` : ''}</div>
      ${ready ? `<div class="ui-win-foot"><span>${esc(t('hudChrome.courier.selected', { count: formatNumber(count), limit: formatNumber(COURIER_SELECTION_LIMIT) }))}</span><button class="ui-btn ui-btn--gold courier-send" type="button"${focusKeyAttr('send')} ${canDispatchCourier(info, this.draft) ? '' : 'disabled'}>${esc(t('hudChrome.courier.send'))}</button></div>` : ''}`;
    this.el.querySelector<HTMLButtonElement>('.x-btn')!.onclick = () => this.close();
    for (const button of this.el.querySelectorAll<HTMLButtonElement>('[data-courier-side]')) {
      button.onclick = () => {
        const live = this.deps.info();
        if (!live?.active || live.phase !== 'ready') return;
        const side = button.dataset.courierSide as CourierStackSide;
        const fromBags = side !== 'withdrawals';
        const slots = fromBags ? this.deps.inventory() : live.bankSlots;
        // Refresh before applying a stale row click; never silently select its replacement.
        const index = Number(button.dataset.courierIndex);
        if (!courierStackSelectable(slots[index])) return;
        const previous = fromBags ? inventory : info!.bankSlots;
        if (JSON.stringify(previous[index]) !== JSON.stringify(slots[index])) {
          this.render(true);
          return;
        }
        this.draft = toggleCourierStack(this.draft, side, index, slots);
        this.render(true);
      };
    }
    const rows = courierVaultRows(vault);
    for (const button of this.el.querySelectorAll<HTMLButtonElement>('[data-courier-vault-row]')) {
      button.onclick = () => {
        const live = this.deps.info();
        if (!live?.active || live.phase !== 'ready') return;
        const row = rows[Number(button.dataset.courierVaultRow)];
        // A vault row that changed since this paint re-renders instead of selecting.
        const current = courierVaultRows(live.vault ?? null);
        if (!row || !current.some((r) => JSON.stringify(r) === JSON.stringify(row))) {
          this.render(true);
          return;
        }
        this.draft = toggleCourierVaultRow(this.draft, row);
        this.render(true);
      };
      const row = rows[Number(button.dataset.courierVaultRow)];
      const item = row && ITEMS[row.itemId];
      if (item)
        this.deps.attachTooltip(button, () =>
          this.deps.itemTooltip(
            item,
            row.special?.slot.instance,
            row.special?.slot.materialSources,
          ),
        );
    }
    if (vault)
      wireTabStrip(this.el, 'courier-store-tab', (id, focusFollow) => {
        if ((id !== 'bank' && id !== 'vault') || id === this.store) return;
        this.store = id;
        this.render(true);
        if (focusFollow) findFocusKey(this.el, `store-${id}`)?.focus();
      });
    for (const tab of this.el.querySelectorAll<HTMLElement>('.courier-store-tab'))
      tab.dataset.focusKey = `store-${tab.dataset.tab}`;
    for (const cell of this.el.querySelectorAll<HTMLElement>('[data-courier-item]')) {
      const side = cell.dataset.courierItem;
      const slots =
        side === 'deposits' || side === 'vaultDeposits'
          ? inventory
          : side === 'withdrawals'
            ? (info?.bankSlots ?? [])
            : (info?.cargo ?? []);
      const slot = slots[Number(cell.dataset.courierSlot)];
      const item = slot && ITEMS[slot.itemId];
      if (item)
        this.deps.attachTooltip(cell, () =>
          this.deps.itemTooltip(item, slot.instance, slot.materialSources),
        );
    }
    const send = this.el.querySelector<HTMLButtonElement>('.courier-send');
    if (send)
      send.onclick = () => {
        const live = this.deps.info();
        this.draft = reconcileCourierDraft(
          this.draft,
          this.deps.inventory(),
          live?.bankSlots ?? [],
          live?.vault ?? null,
        );
        if (canDispatchCourier(live, this.draft)) {
          this.deps.dispatch(courierDispatchRequest(this.draft));
          // The courier is on its way: get the window out of the player's view.
          this.close(false);
          return;
        }
        this.render(true);
      };
    const body = this.el.querySelector('.ui-win-body');
    if (body) body.scrollTop = scroll;
    for (const pane of this.el.querySelectorAll<HTMLElement>('[data-courier-storage]')) {
      const grid = pane.querySelector('.courier-grid');
      if (grid) grid.scrollTop = gridScroll.get(pane.dataset.courierStorage) ?? 0;
    }
    if (focus)
      restoreFirstEnabled([
        findFocusKey(this.el, focus),
        this.el.querySelector<HTMLButtonElement>('.x-btn'),
      ]);
  }
  private rows(
    side: CourierStackSide,
    slots: readonly InvSlot[],
    active: boolean,
    capacity: number,
  ): string {
    const fromBags = side !== 'withdrawals';
    const title = t(fromBags ? 'hudChrome.courier.inventory' : 'hudChrome.courier.bankTitle');
    const hint = t(
      side === 'vaultDeposits'
        ? 'hudChrome.courier.bagsVault'
        : side === 'deposits'
          ? 'hudChrome.courier.bags'
          : 'hudChrome.courier.bank',
    );
    const atLimit = courierSelectionCount(this.draft) >= COURIER_SELECTION_LIMIT;
    const picked = (list: CourierStackSide, index: number) =>
      this.draft[list].some((s) => s.index === index && courierSelectionMatches(s, slots));
    const cells = slots.map((slot, index) => {
      const selected = picked(side, index);
      // A carried stack already bound for the other store keeps its mark, so a
      // pick on one tab is visible from the other.
      const elsewhere =
        side === 'deposits'
          ? picked('vaultDeposits', index)
          : side === 'vaultDeposits'
            ? picked('deposits', index)
            : false;
      const vaultBound = side === 'vaultDeposits' ? selected : elsewhere;
      const mark = selected || elsewhere;
      const def = knownItemDef(ITEMS, slot.itemId);
      const parts = def ? wornItemCellParts(def, slot.instance) : null;
      const item = parts?.ariaName ?? slot.itemId;
      const selectable =
        side === 'vaultDeposits' ? courierVaultStackSelectable(slot) : courierStackSelectable(slot);
      const fine = bagFineMark(slot.itemId);
      const quest = def?.kind === 'quest' ? 'quest' : null;
      const glyph = bagInstanceGlyphKind(slot.instance);
      const corner = bagCornerMark(glyph, quest, fine);
      const description = isItemLocked(slot.instance)
        ? t('hudChrome.bags.itemAriaLocked', { item, count: formatNumber(slot.count) })
        : glyph
          ? t(INSTANCE_GLYPH_ARIA_KEYS[glyph], { item, count: formatNumber(slot.count) })
          : '';
      const quality = parts?.quality ?? 'common';
      return `<button type="button" class="bank-item ${fromBags ? 'bag-item' : ''} ui-socket ui-socket--bag courier-item q-${quality}${bagRimClasses(quest, fine)}" style="--bank-slot-quality:${QUALITY_COLOR[quality]}" data-courier-side="${side}" data-courier-index="${index}" data-courier-item="${side}" data-courier-slot="${index}" aria-pressed="${selected}" aria-description="${esc(elsewhere ? t(vaultBound ? 'hudChrome.courier.boundVault' : 'hudChrome.courier.boundBank') : description)}" aria-label="${esc(t(selected ? 'hudChrome.courier.selectedItem' : 'hudChrome.courier.select', { item, count: formatNumber(slot.count) }))}"${focusKeyAttr(`${side}-${index}`)} ${!active || !selectable || (atLimit && !selected) ? 'disabled' : ''}>${def && parts ? this.deps.itemIcon(def, parts.quality) : unknownItemIconHtml(slot.itemId)}${parts?.qualityBadge ?? ''}${cornerMarkHtml(corner)}${lockMarkHtml(isItemLocked(slot.instance))}<span class="bank-count">${slot.count > 1 ? esc(formatNumber(slot.count)) : ''}</span>${mark ? `<span class="courier-selected${vaultBound ? ' courier-selected--vault' : ''}" aria-hidden="true">${svgIcon(vaultBound ? 'chest' : 'check')}</span>` : ''}</button>`;
    });
    for (let index = slots.length; index < capacity; index++)
      cells.push(
        '<span class="bank-item empty ui-socket ui-socket--bag" aria-hidden="true"></span>',
      );
    return `<section class="courier-storage" data-courier-storage="${side}" aria-labelledby="courier-${side}-title"><div class="courier-storage-head"><h3 id="courier-${side}-title">${esc(title)}</h3><span class="ui-num ui-muted">${esc(t('hudChrome.courier.capacity', { used: formatNumber(slots.length), capacity: formatNumber(capacity) }))}</span></div><p class="ui-muted courier-storage-hint">${esc(hint)}</p><div class="bank-grid courier-grid">${cells.join('')}</div></section>`;
  }
  /** The left column: the bank, or with a vault a Bank / Materials Vault strip. */
  private storeColumn(
    bankSlots: readonly InvSlot[],
    bankCapacity: number,
    vault: CourierInfo['vault'],
    active: boolean,
  ): string {
    const pane =
      this.store === 'vault' && vault
        ? this.vaultRows(vault, active)
        : this.rows('withdrawals', bankSlots, active, bankCapacity);
    if (!vault) return pane;
    const strip = tabStripHtml(
      tabStripModel({
        ariaLabel: t('hudChrome.courier.storeTabs'),
        stripClass: 'bank-tabs ui-tabs courier-store-tabs',
        tabClass: 'courier-store-tab ui-tab',
        selectedClass: 'on is-on',
        selected: this.store,
        tabs: [
          { id: 'bank', label: t('hudChrome.courier.bankTitle') },
          { id: 'vault', label: t('hudChrome.courier.vaultTitle') },
        ],
      }),
    );
    return `<div class="courier-store">${strip}${pane}</div>`;
  }
  private vaultRows(vault: NonNullable<CourierInfo['vault']>, active: boolean): string {
    const head = (detail: string) =>
      `<div class="courier-storage-head"><h3 id="courier-vault-title">${esc(t('hudChrome.courier.vaultTitle'))}</h3>${detail}</div>`;
    if (vault.upgrades <= 0)
      return `<section class="courier-storage" data-courier-storage="vault" aria-labelledby="courier-vault-title">${head('')}<p class="ui-muted courier-storage-hint">${esc(t('hudChrome.courier.vaultLocked'))}</p></section>`;
    const atLimit = courierSelectionCount(this.draft) >= COURIER_SELECTION_LIMIT;
    const rows = courierVaultRows(vault);
    const cells = rows.map((row: CourierVaultRow, index) => {
      const selected = courierVaultRowSelected(this.draft, row);
      const instance = row.special?.slot.instance;
      const def = knownItemDef(ITEMS, row.itemId);
      const parts = def ? wornItemCellParts(def, instance) : null;
      const item = parts?.ariaName ?? row.itemId;
      const quality = parts?.quality ?? 'common';
      const fine = bagFineMark(row.itemId);
      const corner = bagCornerMark(bagInstanceGlyphKind(instance), null, fine);
      return `<button type="button" class="bank-item ui-socket ui-socket--bag courier-item q-${quality}${bagRimClasses(null, fine)}" style="--bank-slot-quality:${QUALITY_COLOR[quality]}" data-courier-vault-row="${index}" aria-pressed="${selected}" aria-label="${esc(t(selected ? 'hudChrome.courier.selectedItem' : 'hudChrome.courier.select', { item, count: formatNumber(row.count) }))}"${focusKeyAttr(`vault-${row.special ? `s${row.special.index}` : row.itemId}`)} ${!active || (atLimit && !selected) ? 'disabled' : ''}>${def && parts ? this.deps.itemIcon(def, parts.quality) : unknownItemIconHtml(row.itemId)}${cornerMarkHtml(corner)}${lockMarkHtml(isItemLocked(instance))}<span class="bank-count">${row.count > 1 ? esc(formatNumber(row.count)) : ''}</span>${selected ? `<span class="courier-selected" aria-hidden="true">${svgIcon('check')}</span>` : ''}</button>`;
    });
    const body = cells.length
      ? `<div class="bank-grid courier-grid">${cells.join('')}</div>`
      : `<p class="ui-muted courier-storage-hint">${esc(t('hudChrome.courier.vaultEmpty'))}</p>`;
    return `<section class="courier-storage" data-courier-storage="vault" aria-labelledby="courier-vault-title">${head(`<span class="ui-num ui-muted">${esc(t('hudChrome.courier.vaultCap', { cap: formatNumber(vault.perMaterialCap) }))}</span>`)}<p class="ui-muted courier-storage-hint">${esc(t('hudChrome.courier.vault'))}</p>${body}</section>`;
  }
  private portrait(): string {
    return `<section class="courier-companion"><div class="courier-portrait"><img src="${esc(apiUrl('/ui/courier/donkey.webp'))}" alt="" draggable="false"></div><span class="courier-emblem" aria-hidden="true">${svgIcon('mail')}</span><strong>${esc(t('hudChrome.courier.title'))}</strong></section>`;
  }
  private cargo(slots: readonly InvSlot[]): string {
    if (!slots.length) return `<p class="ui-muted">${esc(t('hudChrome.courier.empty'))}</p>`;
    return `<ul class="courier-cargo">${slots
      .map((slot, index) => {
        const item = knownItemDef(ITEMS, slot.itemId);
        const parts = item ? wornItemCellParts(item, slot.instance) : null;
        const fine = bagFineMark(slot.itemId);
        const glyph = bagInstanceGlyphKind(slot.instance);
        const mark = bagCornerMark(glyph, null, fine);
        const quality = parts?.quality ?? 'common';
        const label = t(
          isItemLocked(slot.instance)
            ? 'hudChrome.bags.itemAriaLocked'
            : glyph
              ? INSTANCE_GLYPH_ARIA_KEYS[glyph]
              : 'itemUi.bags.itemAria',
          { item: parts?.ariaName ?? slot.itemId, count: formatNumber(slot.count) },
        );
        return `<li data-courier-item="cargo" data-courier-slot="${index}" tabindex="0" aria-label="${esc(label)}"${focusKeyAttr(`cargo-${index}`)}><span class="courier-item-label"><span class="bank-item ui-socket ui-socket--bag courier-cargo-icon q-${quality}${bagRimClasses(null, fine)}" style="--bank-slot-quality:${QUALITY_COLOR[quality]}">${item && parts ? this.deps.itemIcon(item, parts.quality) : unknownItemIconHtml(slot.itemId)}${cornerMarkHtml(mark)}${lockMarkHtml(isItemLocked(slot.instance))}</span><span>${esc(parts?.name ?? slot.itemId)}${parts?.qualityBadgeLabelled ?? ''}</span></span><span class="ui-num">${esc(formatNumber(slot.count))}</span></li>`;
      })
      .join('')}</ul>`;
  }
}
