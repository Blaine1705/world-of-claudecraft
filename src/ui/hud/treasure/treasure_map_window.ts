// Treasure map window (#treasure-map-window): the parchment a read treasure map
// opens (src/sim/treasure_vault.ts emits treasureMapRead). A thin DOM consumer of
// treasure_map_view.ts: the cropped terrain plate with the X, the digging hint,
// and the faction-currency offer to raise the map a rarity. Self-mounting: the
// panel is created beside the other windows on first open, so the static HTML
// entries stay untouched. Cold chrome, painted only on open and on a click.

import { TREASURE_MAP_ITEM_IDS } from '../../../sim/content/treasure_maps';
import { ITEMS } from '../../../sim/data';
import type { FactionId } from '../../../sim/factions';
import type { IWorld } from '../../../world_api';
import { markDialogRoot } from '../../dialog_root';
import { itemDisplayName, zoneDisplayName } from '../../entity_i18n';
import { esc } from '../../esc';
import { formatNumber, type TranslationKey, t } from '../../i18n';
import { ownEntry } from '../../known_item';
import { svgIcon } from '../../ui_icons';
import { treasureMapModel } from './treasure_map_view';

export interface TreasureMapWindowDeps {
  world(): Pick<IWorld, 'treasureMap' | 'factionCurrencies' | 'upgradeTreasureMap'>;
}

const NUM0 = { maximumFractionDigits: 0 } as const;
const CURRENCY_KEY: Record<FactionId, TranslationKey> = {
  rift_watch: 'hudChrome.currencies.riftWatchMark',
  church_order: 'hudChrome.currencies.churchOrderCrest',
  automatons: 'hudChrome.currencies.automatonCog',
};
const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

export class TreasureMapWindow {
  private el: HTMLElement | null = null;

  constructor(private readonly deps: TreasureMapWindowDeps) {}

  private panel(): HTMLElement {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.id = 'treasure-map-window';
    el.className = 'window panel';
    el.style.display = 'none';
    (document.getElementById('delve-rite-panel')?.parentElement ?? document.body).appendChild(el);
    this.el = el;
    return el;
  }

  get isOpen(): boolean {
    return this.el !== null && this.el.style.display === 'block';
  }

  open(): void {
    this.render();
  }

  close(): void {
    if (this.el) this.el.style.display = 'none';
  }

  /** Repaint if open (a currency or rarity change); closes once the map is gone. */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    const model = treasureMapModel(this.deps.world());
    const el = this.panel();
    if (!model) {
      this.close();
      return;
    }
    const mapDef = ownEntry(ITEMS, TREASURE_MAP_ITEM_IDS[model.rarity]);
    const title = mapDef ? itemDisplayName(mapDef) : '';
    // The plate is laid out larger than the parchment and shifted so only the
    // crop shows; the parchment clips the rest.
    const plate =
      `background-image:url('${model.plateUrl}');` +
      `width:${pct(model.plateScaleX)};height:${pct(model.plateScaleY)};` +
      `left:${pct(model.plateOffsetX)};top:${pct(model.plateOffsetY)};`;
    const upgrade = model.upgrade
      ? `<div class="tmap-upgrade"><div class="tmap-upgrade-head">${esc(
          t('hudChrome.treasureMap.upgradeHeading', {
            rarity: t(`hudChrome.treasureMap.rarity.${model.upgrade.next}` as TranslationKey),
          }),
        )}</div><div class="tmap-upgrade-row">${model.upgrade.factions
          .map(
            (f) =>
              `<button type="button" class="tmap-upgrade-btn" data-faction="${f.factionId}"${
                f.affordable ? '' : ' disabled'
              }><span class="tmap-cost">${esc(
                t('hudChrome.treasureMap.upgradeCost', {
                  cost: formatNumber(model.upgrade?.cost ?? 0, NUM0),
                  currency: t(CURRENCY_KEY[f.factionId]),
                }),
              )}</span><span class="tmap-balance">${esc(
                t('hudChrome.treasureMap.balance', { amount: formatNumber(f.balance, NUM0) }),
              )}</span></button>`,
          )
          .join('')}</div></div>`
      : `<div class="tmap-upgrade tmap-maxed">${esc(t('hudChrome.treasureMap.upgradeMaxed'))}</div>`;
    markDialogRoot(el, { label: title });
    el.dataset.rarity = model.rarity;
    el.innerHTML =
      `<div class="panel-title"><span class="tmap-title">${esc(title)}</span>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(
        t('hudChrome.treasureMap.close'),
      )}">${svgIcon('close')}</button></div>` +
      `<div class="tmap-parchment"><div class="tmap-plate" style="${plate}"></div>` +
      `<span class="tmap-mark" style="left:${pct(model.markX)};top:${pct(model.markY)}" aria-hidden="true">X</span></div>` +
      `<div class="tmap-zone">${esc(
        t('hudChrome.treasureMap.zone', { zone: zoneDisplayName(model.zoneId) }),
      )}</div>` +
      `<div class="tmap-hint">${esc(t('hudChrome.treasureMap.hint'))}</div>` +
      upgrade;
    el.style.display = 'block';
    el.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    el.querySelectorAll<HTMLElement>('[data-faction]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.deps.world().upgradeTreasureMap(btn.dataset.faction as FactionId);
      });
    });
  }
}
