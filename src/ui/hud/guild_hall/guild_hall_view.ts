// Pure view core for Lantern Hall's guild window: the week's three contract cards, the
// quartermaster's rows, the seal count and the reset countdown. DOM-free; the painter
// (guild_hall_window.ts) renders exactly what this shapes. Reads the world only through the
// IWorld members it names (guildContracts, inventory, deedsEarned, the weekly reset, the
// player's name), so a test drives it with a plain object.

import {
  GUILD_CONTRACTS_BY_ID,
  GUILD_QUARTERMASTER_STOCK,
  type GuildContractDef,
  type GuildContractKind,
  LANTERN_SEAL_ITEM_ID,
} from '../../../sim/content/guild_contracts';
import type { GuildContractsView } from '../../../sim/guild_contracts';
import type { InvSlot } from '../../../sim/types';
import { deedDesc, deedName, deedTitleText, titledDisplayName } from '../../deed_i18n';
import { mobDisplayName } from '../../entity_display_core';
import { dungeonDisplayName } from '../../entity_i18n';
import { formatList, formatNumber, t } from '../../i18n';

export type GuildHallTab = 'contracts' | 'quartermaster';

export interface GuildHallWorld {
  readonly guildContracts: GuildContractsView;
  readonly inventory: readonly InvSlot[];
  readonly deedsEarned: ReadonlyMap<string, string>;
  readonly weeklyQuestResetAtMs: number;
  readonly player: { readonly name: string };
}

export interface GuildContractCardView {
  id: string;
  kind: GuildContractKind;
  kindLabel: string;
  dungeon: string;
  goal: string;
  reward: string;
  done: boolean;
  stateLabel: string;
}

export interface GuildOfferRowView {
  id: string;
  title: string;
  preview: string;
  price: string;
  owned: boolean;
  affordable: boolean;
  /** The button's label: buy, owned, or how many seals are still wanted. */
  action: string;
}

export interface GuildHallView {
  title: string;
  tabs: { id: GuildHallTab; label: string; selected: boolean }[];
  seals: number;
  sealsText: string;
  resetText: string;
  intro: string;
  contracts: GuildContractCardView[];
  emptyText: string | null;
  lifetimeText: string;
  offers: GuildOfferRowView[];
}

const whole = (value: number): string => formatNumber(value, { maximumFractionDigits: 0 });

/** The Lantern Seals in the bags. */
export function lanternSeals(inventory: readonly InvSlot[]): number {
  let total = 0;
  for (const slot of inventory) if (slot?.itemId === LANTERN_SEAL_ITEM_ID) total += slot.count;
  return total;
}

function sealCount(count: number): string {
  return count === 1
    ? t('hudChrome.guildHall.rewardOne', { count: whole(count) })
    : t('hudChrome.guildHall.reward', { count: whole(count) });
}

/** Days and hours until the weekly reset, the locale's own unit words. */
export function guildResetText(resetAtMs: number, nowMs: number): string {
  if (!(resetAtMs > 0)) return t('hudChrome.guildHall.resetSoon');
  const seconds = Math.max(0, Math.floor((resetAtMs - nowMs) / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const parts: string[] = [];
  if (days > 0) parts.push(formatNumber(days, { style: 'unit', unit: 'day', unitDisplay: 'long' }));
  parts.push(formatNumber(hours, { style: 'unit', unit: 'hour', unitDisplay: 'long' }));
  return t('hudChrome.guildHall.resetIn', { time: formatList(parts) });
}

function contractGoal(contract: GuildContractDef): string {
  const dungeon = dungeonDisplayName(contract.dungeonId);
  const boss = mobDisplayName(contract.mobId);
  if (contract.kind === 'boss') return t('hudChrome.guildHall.goals.boss', { boss, dungeon });
  if (contract.kind === 'heroic') return t('hudChrome.guildHall.goals.heroic', { boss, dungeon });
  const deed = contract.taskDeedId ?? '';
  return `${t('hudChrome.guildHall.goals.task', { task: deedName(deed), dungeon })} ${deedDesc(deed)}`;
}

export function buildGuildContractCard(
  contract: GuildContractDef,
  done: boolean,
): GuildContractCardView {
  return {
    id: contract.id,
    kind: contract.kind,
    kindLabel: t(`hudChrome.guildHall.kinds.${contract.kind}`),
    dungeon: dungeonDisplayName(contract.dungeonId),
    goal: contractGoal(contract),
    reward: sealCount(contract.seals),
    done,
    stateLabel: done ? t('hudChrome.guildHall.done') : t('hudChrome.guildHall.open'),
  };
}

/** The contract's short name for the completion toast. */
export function guildContractLabel(contractId: string): string {
  const contract = GUILD_CONTRACTS_BY_ID[contractId];
  if (!contract) return '';
  return `${t(`hudChrome.guildHall.kinds.${contract.kind}`)}: ${dungeonDisplayName(contract.dungeonId)}`;
}

export function buildGuildHallView(
  world: GuildHallWorld,
  nowMs: number,
  tab: GuildHallTab,
): GuildHallView {
  const board = world.guildContracts;
  const seals = lanternSeals(world.inventory);
  const contracts = board.offered
    .map((id) => GUILD_CONTRACTS_BY_ID[id])
    .filter((contract): contract is GuildContractDef => !!contract)
    .map((contract) => buildGuildContractCard(contract, board.done.includes(contract.id)));
  const offers = GUILD_QUARTERMASTER_STOCK.map((offer): GuildOfferRowView => {
    const owned = world.deedsEarned.has(offer.deedId);
    const affordable = seals >= offer.seals;
    const title = deedTitleText(offer.deedId);
    return {
      id: offer.id,
      title: t('hudChrome.guildHall.titleOffer', { title }),
      preview: t('hudChrome.guildHall.titlePreview', {
        preview: titledDisplayName(world.player.name, offer.deedId),
      }),
      price: t('hudChrome.guildHall.price', { count: whole(offer.seals) }),
      owned,
      affordable,
      action: owned
        ? t('hudChrome.guildHall.owned')
        : affordable
          ? t('hudChrome.guildHall.buy')
          : t('hudChrome.guildHall.needSeals', { count: whole(offer.seals - seals) }),
    };
  });
  return {
    title: t('hudChrome.guildHall.title'),
    tabs: (['contracts', 'quartermaster'] as const).map((id) => ({
      id,
      label: t(`hudChrome.guildHall.tabs.${id}`),
      selected: id === tab,
    })),
    seals,
    sealsText: t('hudChrome.guildHall.seals', { count: whole(seals) }),
    resetText: guildResetText(world.weeklyQuestResetAtMs, nowMs),
    intro:
      tab === 'contracts'
        ? t('hudChrome.guildHall.contractsIntro')
        : t('hudChrome.guildHall.quartermasterIntro'),
    contracts,
    emptyText: contracts.length === 0 ? t('hudChrome.guildHall.emptyBoard') : null,
    lifetimeText: t('hudChrome.guildHall.lifetime', { count: whole(board.lifetime) }),
    offers,
  };
}
