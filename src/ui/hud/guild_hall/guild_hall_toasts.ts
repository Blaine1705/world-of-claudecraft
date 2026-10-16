// The log lines Lantern Hall's events take (src/ui/hud/quest/quest_event_router.ts): a paid
// contract and a bought title. Pure: strings through t(), numbers through formatNumber.
import { GUILD_QUARTERMASTER_STOCK_BY_ID } from '../../../sim/content/guild_contracts';
import { deedTitleText } from '../../deed_i18n';
import { formatNumber, t } from '../../i18n';
import { guildContractLabel } from './guild_hall_view';

export function guildContractToast(contractId: string, seals: number): string {
  const count = formatNumber(seals, { maximumFractionDigits: 0 });
  const contract = guildContractLabel(contractId);
  return seals === 1
    ? t('hudChrome.guildHall.contractDoneOne', { contract, count })
    : t('hudChrome.guildHall.contractDone', { contract, count });
}

export function guildCosmeticToast(offerId: string): string {
  const offer = Object.hasOwn(GUILD_QUARTERMASTER_STOCK_BY_ID, offerId)
    ? GUILD_QUARTERMASTER_STOCK_BY_ID[offerId]
    : undefined;
  return t('hudChrome.guildHall.bought', { title: offer ? deedTitleText(offer.deedId) : '' });
}
