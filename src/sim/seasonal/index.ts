// The seasonal-event core (barrel): the public surface Sim, items.ts, dev
// commands and tests import. Module map and rules: ./CLAUDE.md.
export {
  pumpkinHeadAura,
  SEASONAL_COSMETIC_AURA_IDS,
  trickAura,
} from './seasonal_cosmetics';
export { handleSeasonalDevChat } from './seasonal_dev';
export { openGourdlightPouch, type SeasonalItemAction, useSeasonalItem } from './seasonal_items';
export { seasonalBlockedQuestIds } from './seasonal_quests';
export {
  activeSeasonalEventOf,
  freshSeasonalPlayerState,
  freshSeasonalWorldState,
  knockedToday,
  knockedTodayView,
  restoreSeasonalState,
  type SavedSeasonalState,
  type SeasonalPlayerState,
  type SeasonalWorldState,
  seasonalSaveFragment,
} from './seasonal_state';
export { KNOWN_SEASONAL_EVENTS, updateSeasonal } from './seasonal_tick';
export { isTrickOrTreatNpc, type TrickOrTreatOutcome, trickOrTreat } from './trick_or_treat';
