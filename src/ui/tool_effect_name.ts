// The one map from a tool-effect id to its localized display-name key.
//
// The gathering-profession counterpart of GATHERING_PROFESSION_NAME_KEYS
// (./gathering_profession_name.ts), and it exists for the same reason: the sim
// and the wire are language-agnostic and carry only a ToolEffectId, so the id
// has to become a name somewhere on the UI side, once.
//
// String-keyed rather than keyed on ToolEffectId, matching the gathering table:
// every caller looks the id up off wire-mirrored data, and an id with no entry
// here has no honest name to print, so a caller treats `undefined` as "render
// no row" rather than inventing one or printing the raw id at a player. That
// matters more than usual here, because a persisted slot can name an effect a
// later content change retired.

import type { TranslationKey } from './i18n';

/** Display-name key per tool-effect id. Mirrors src/sim/content/professions.ts
 *  TOOL_EFFECTS; an id absent here renders no row. */
export const TOOL_EFFECT_NAME_KEYS: Record<string, TranslationKey> = {
  gatherers_cache: 'hudChrome.professions.toolEffectName.gatherersCache',
  artisans_eye: 'hudChrome.professions.toolEffectName.artisansEye',
  quickening_charm: 'hudChrome.professions.toolEffectName.quickeningCharm',
};
