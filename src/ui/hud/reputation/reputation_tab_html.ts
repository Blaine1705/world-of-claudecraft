// The Reputation tab's thin painter: turns the pure view into the character
// window's sidebar HTML. Cold chrome (the window re-renders it on open and on
// its own refresh), so it is a string builder over `esc()` and `t()` with no DOM
// reads; every player-visible string is a catalog key, including the faction
// names and standing titles the sim carries as identifiers.
import type { FactionId, StandingTier } from '../../../sim/factions';
import type { IWorld } from '../../../world_api';
import { esc } from '../../esc';
import { formatNumber, type TranslationKey, t, tPlural } from '../../i18n';
import { worldQuestTimeRemainingText } from '../../world_quest_view';
import {
  buildReputationView,
  type RegionalMasteryRowView,
  type ReputationRowView,
} from './reputation_view';

const factionNameKey = (id: FactionId): TranslationKey =>
  `hudChrome.reputation.faction.${id}` as TranslationKey;
const hubKey = (id: FactionId): TranslationKey =>
  `hudChrome.reputation.hub.${id}` as TranslationKey;
const tierKey = (tier: StandingTier): TranslationKey =>
  `hudChrome.reputation.tier.${tier}` as TranslationKey;
const factionTitleKey = (id: FactionId, tier: StandingTier): TranslationKey =>
  `hudChrome.reputation.factionTitle.${id}.${tier}` as TranslationKey;
const zoneNameKey = (zoneId: string): TranslationKey =>
  `entities.zones.${zoneId}.name` as TranslationKey;

const whole = (value: number): string => formatNumber(value, { maximumFractionDigits: 0 });

function rowHtml(row: ReputationRowView): string {
  const tierLabel = t(tierKey(row.tier));
  const hub = t('hudChrome.reputation.hubLine', {
    hub: t(hubKey(row.factionId)),
    zone: t(zoneNameKey(row.hubZoneId)),
  });
  let footer: string;
  if (row.nextTier === null) {
    footer = `<span class="char-rep-next">${esc(t('hudChrome.reputation.maxed'))}</span>`;
  } else if (row.cappedByLevel) {
    footer = `<span class="char-rep-next">${esc(t('hudChrome.reputation.cappedByLevel', { tier: tierLabel }))}</span>`;
  } else {
    footer = `<span class="char-rep-next">${esc(t('hudChrome.reputation.next', { tier: t(tierKey(row.nextTier)) }))}</span>`;
  }
  const progress =
    row.nextTier === null
      ? whole(row.current)
      : t('hudChrome.reputation.progress', {
          current: whole(row.tierProgress),
          next: whole(row.tierRequired),
        });
  return `<section class="char-rep-row ui-card char-rep-tier-${esc(row.tier)}"><div class="char-rep-head"><span class="char-rep-crest" aria-hidden="true"></span><span class="char-rep-copy"><b class="char-rep-name">${esc(t(factionNameKey(row.factionId)))}</b><span class="char-rep-hub">${esc(hub)}</span></span><span class="char-rep-pill">${esc(tierLabel)}</span></div><div class="char-rep-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${row.percent}" aria-label="${esc(t(factionNameKey(row.factionId)))}"><span style="--char-rep-pct:${row.percent}%"></span></div><div class="char-rep-foot"><span class="char-rep-progress">${esc(progress)}</span>${footer}</div></section>`;
}

// One Regional Mastery row: the zone, its faction, the permanent completion
// count, the milestone tally and a slim bar to the next milestone. The count
// is the headline (it never resets, so it is the number a player keeps).
function masteryRowHtml(row: RegionalMasteryRowView, milestoneCount: number): string {
  const count = tPlural('hudChrome.plurals.worldQuestsCompletedInZone', row.count);
  const next =
    row.nextMilestone === null
      ? t('hudChrome.reputation.masteryMaxed')
      : t('hudChrome.reputation.masteryNext', { count: whole(row.nextMilestone) });
  const reached = t('hudChrome.reputation.masteryReached', {
    reached: whole(row.reached),
    total: whole(milestoneCount),
  });
  const zone = t(zoneNameKey(row.zoneId));
  return `<div class="char-rep-mastery-row${row.count === 0 ? ' is-empty' : ''}"><div class="char-rep-mastery-head"><span class="char-rep-copy"><b class="char-rep-name">${esc(zone)}</b><span class="char-rep-hub">${esc(t(factionNameKey(row.factionId)))}</span></span><span class="char-rep-mastery-count">${esc(count)}</span></div><div class="char-rep-bar char-rep-mastery-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${row.percent}" aria-label="${esc(zone)}"><span style="--char-rep-pct:${row.percent}%"></span></div><div class="char-rep-foot"><span class="char-rep-progress">${esc(reached)}</span><span class="char-rep-next">${esc(next)}</span></div></div>`;
}

/** The whole sidebar body for the Reputation tab. `nowMs` is the window's clock. */
export function reputationTabHtml(world: IWorld, nowMs: number): string {
  const view = buildReputationView({
    factions: world.factions,
    level: world.player.level,
    worldQuestLog: world.worldQuestLog,
    worldQuestExpiresAtMs: world.worldQuestExpiresAtMs,
    nowMs,
    zoneCounts: world.worldQuestZoneCounts,
  });
  const rows = view.rows.map(rowHtml).join('');
  const legend = view.tiers
    .map(
      (tier) =>
        `<span class="char-rep-pill char-rep-legend-pill char-rep-tier-${esc(tier)}">${esc(t(tierKey(tier)))}</span>`,
    )
    .join('');
  const best = view.rows.reduce((a, b) => (b.current > a.current ? b : a), view.rows[0]);
  const resets =
    view.day.resetsInMs > 0
      ? worldQuestTimeRemainingText(world.worldQuestExpiresAtMs, nowMs)
      : t('hudChrome.reputation.resetsUnknown');
  const today = `<section class="char-rep-today ui-card"><h3>${esc(t('hudChrome.reputation.today'))}</h3><div class="char-rep-kv"><span>${esc(t('hudChrome.reputation.questsDone'))}</span><b>${esc(t('hudChrome.reputation.questsDoneValue', { done: whole(view.day.completed), total: whole(view.day.total) }))}</b></div><div class="char-rep-kv"><span>${esc(t('hudChrome.reputation.resetsIn'))}</span><b>${esc(resets)}</b></div></section>`;
  const title = best
    ? `<section class="char-rep-title ui-card"><h3>${esc(t('hudChrome.reputation.title'))}</h3><b class="char-rep-tier-${esc(best.tier)}">${esc(t(factionTitleKey(best.factionId, best.tier)))}</b><span class="char-rep-hub">${esc(t('hudChrome.reputation.titleLine', { faction: t(factionNameKey(best.factionId)), tier: t(tierKey(best.tier)) }))}</span></section>`
    : '';
  const mastery = `<section class="char-rep-mastery ui-card"><h3>${esc(t('hudChrome.reputation.mastery'))}</h3><p class="char-rep-mastery-intro">${esc(t('hudChrome.reputation.masteryIntro'))}</p>${view.mastery.map((row) => masteryRowHtml(row, view.masteryMilestoneCount)).join('')}</section>`;
  return `<div class="char-rep"><p class="char-rep-intro">${esc(t('hudChrome.reputation.intro'))}</p>${rows}${today}${title}${mastery}<div class="char-rep-legend" aria-label="${esc(t('hudChrome.reputation.legend'))}">${legend}</div></div>`;
}
