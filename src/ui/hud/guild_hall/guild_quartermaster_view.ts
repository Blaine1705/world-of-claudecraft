// Pure view core for Lantern Hall's quartermaster counter (Garrick Holt): the stock as item
// cards (the title's crest, its price in Lantern Seals, owned / affordable / short), the one
// selected card's detail (the nameplate it gives you, how to wear it, the price against the
// seals in the bags, the buy action) and each card's hover lines. DOM-free and canvas-free:
// it names the crest by id (deeds_view.ts deedCrestId) and the painter resolves the art.
//
// The stock is titles only (content/guild_contracts.ts GUILD_QUARTERMASTER_STOCK, cosmetic
// Book of Deeds feats), so no card carries a model to preview: the detail's preview is the
// nameplate the title draws over your head, split around the name the way the target frame
// splits it (deed_i18n.ts titledNameDecoration).

import { DEEDS } from '../../../sim/content/deeds';
import {
  GUILD_QUARTERMASTER_STOCK,
  GUILD_QUARTERMASTER_STOCK_BY_ID,
  LANTERN_SEAL_ITEM_ID,
} from '../../../sim/content/guild_contracts';
import type { InvSlot } from '../../../sim/types';
import { deedTitleText, titledDisplayName, titledNameDecoration } from '../../deed_i18n';
import { deedCrestId } from '../../deeds_view';
import { formatNumber, t, tPlural } from '../../i18n';

const whole = (value: number): string => formatNumber(value, { maximumFractionDigits: 0 });

/** The Lantern Seals in the bags. */
export function lanternSeals(inventory: readonly InvSlot[]): number {
  let total = 0;
  for (const slot of inventory) if (slot?.itemId === LANTERN_SEAL_ITEM_ID) total += slot.count;
  return total;
}

/** "{count} Lantern Seals", in the locale's own plural form. */
export function sealCount(count: number): string {
  return tPlural('hudChrome.guildHall.reward', count, { count: whole(count) });
}

/** Where a card stands against the bags: bought, buyable now, or short of seals. */
export type GuildShopItemState = 'owned' | 'ready' | 'short';

export interface GuildShopItemView {
  id: string;
  /** The crest the Book of Deeds shows for the title's feat (painted, or its category's). */
  crestId: string;
  /** The title itself ("Writ-Runner"). */
  name: string;
  kindLabel: string;
  /** The bare price, for the seal-icon price tag. */
  priceValue: string;
  /** The price in words ("6 Lantern Seals"), for a screen reader and the hover card. */
  price: string;
  state: GuildShopItemState;
  /** The card's state chip: Owned, Buy, or how many seals are still wanted. */
  stateLabel: string;
  selected: boolean;
}

export interface GuildShopDetailView {
  id: string;
  crestId: string;
  name: string;
  kindLabel: string;
  plateHeading: string;
  /** The nameplate preview: the locale's text before the name, the name, the text after. */
  platePre: string;
  plateName: string;
  platePost: string;
  howTo: string;
  cosmetic: string;
  priceText: string;
  priceValue: string;
  haveText: string;
  state: GuildShopItemState;
  /** The buy button's label (Buy, Owned, or Needs N more) and whether it can be pressed. */
  action: string;
  actionEnabled: boolean;
  /** Why it cannot be bought yet, a sentence of its own (null when it can be, or is owned). */
  shortText: string | null;
}

export interface GuildShopView {
  stockLabel: string;
  items: GuildShopItemView[];
  /** The selected card's detail (null only for an empty stock). */
  detail: GuildShopDetailView | null;
}

export interface GuildShopInput {
  readonly seals: number;
  readonly playerName: string;
  readonly deedsEarned: ReadonlyMap<string, string>;
}

/** The card a fresh counter opens on: the cheapest title not yet owned, else the first. */
export function defaultGuildShopSelection(deedsEarned: ReadonlyMap<string, string>): string | null {
  const next = GUILD_QUARTERMASTER_STOCK.find((offer) => !deedsEarned.has(offer.deedId));
  return (next ?? GUILD_QUARTERMASTER_STOCK[0])?.id ?? null;
}

function stateOf(owned: boolean, affordable: boolean): GuildShopItemState {
  if (owned) return 'owned';
  return affordable ? 'ready' : 'short';
}

function actionLabel(state: GuildShopItemState, missing: number): string {
  if (state === 'owned') return t('hudChrome.guildHall.owned');
  if (state === 'ready') return t('hudChrome.guildHall.buy');
  return t('hudChrome.guildHall.needSeals', { count: whole(missing) });
}

export function buildGuildShopView(input: GuildShopInput, selected: string | null): GuildShopView {
  const chosen =
    selected && Object.hasOwn(GUILD_QUARTERMASTER_STOCK_BY_ID, selected)
      ? selected
      : defaultGuildShopSelection(input.deedsEarned);
  let detail: GuildShopDetailView | null = null;
  const items = GUILD_QUARTERMASTER_STOCK.map((offer): GuildShopItemView => {
    const owned = input.deedsEarned.has(offer.deedId);
    const missing = Math.max(0, offer.seals - input.seals);
    const state = stateOf(owned, missing === 0);
    const name = deedTitleText(offer.deedId);
    const crestId = deedCrestId(offer.deedId, DEEDS[offer.deedId]?.category ?? 'feat');
    const kindLabel = t('hudChrome.guildHall.shop.kindTitle');
    const price = sealCount(offer.seals);
    const priceValue = whole(offer.seals);
    const action = actionLabel(state, missing);
    if (offer.id === chosen) {
      const plate = titledNameDecoration(offer.deedId);
      detail = {
        id: offer.id,
        crestId,
        name,
        kindLabel,
        plateHeading: t('hudChrome.guildHall.shop.plateHeading'),
        platePre: plate.pre,
        plateName: input.playerName,
        platePost: plate.post,
        howTo:
          state === 'owned'
            ? t('hudChrome.guildHall.shop.ownedLong')
            : t('hudChrome.guildHall.shop.howTo'),
        cosmetic: t('hudChrome.guildHall.shop.cosmetic'),
        priceText: t('hudChrome.guildHall.shop.price', { price }),
        priceValue,
        haveText: t('hudChrome.guildHall.shop.have', { count: whole(input.seals) }),
        state,
        action,
        actionEnabled: state === 'ready',
        shortText:
          state === 'short'
            ? tPlural('hudChrome.guildHall.shop.short', missing, { count: whole(missing) })
            : null,
      };
    }
    return {
      id: offer.id,
      crestId,
      name,
      kindLabel,
      priceValue,
      price,
      state,
      stateLabel: action,
      selected: offer.id === chosen,
    };
  });
  return { stockLabel: t('hudChrome.guildHall.shop.stockLabel'), items, detail };
}

/** One line of a card's hover card, with its tone (the shared tooltip's classes). */
export interface GuildShopTipLine {
  text: string;
  tone: 'sub' | 'desc' | 'green' | 'red';
}

/** A stock card's hover card, written from the live rule (guild_quartermaster.ts): what the
 *  title is, how it shows, how to wear it, that it is cosmetic, its price, and why it cannot be
 *  bought when it cannot. */
export function guildShopTooltip(
  offerId: string,
  input: GuildShopInput,
): { title: string; lines: GuildShopTipLine[] } | null {
  if (!Object.hasOwn(GUILD_QUARTERMASTER_STOCK_BY_ID, offerId)) return null;
  const offer = GUILD_QUARTERMASTER_STOCK_BY_ID[offerId];
  const title = deedTitleText(offer.deedId);
  const owned = input.deedsEarned.has(offer.deedId);
  const missing = Math.max(0, offer.seals - input.seals);
  const lines: GuildShopTipLine[] = [
    {
      text: t('hudChrome.guildHall.titlePreview', {
        preview: titledDisplayName(input.playerName, offer.deedId),
      }),
      tone: 'sub',
    },
    {
      text: owned ? t('hudChrome.guildHall.shop.ownedLong') : t('hudChrome.guildHall.shop.howTo'),
      tone: 'desc',
    },
    { text: t('hudChrome.guildHall.shop.cosmetic'), tone: 'desc' },
    { text: t('hudChrome.guildHall.shop.price', { price: sealCount(offer.seals) }), tone: 'sub' },
  ];
  if (!owned && missing > 0) {
    lines.push({
      text: tPlural('hudChrome.guildHall.shop.short', missing, { count: whole(missing) }),
      tone: 'red',
    });
  }
  return { title: t('hudChrome.guildHall.titleOffer', { title }), lines };
}
