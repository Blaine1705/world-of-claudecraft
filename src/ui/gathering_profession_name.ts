// The one map from a gathering profession id to its localized display-name key.
//
// Extracted on the third consumer (root CLAUDE.md: extract on the rule of
// three, not before). It shipped duplicated byte for byte as the module-private
// GATHERING_PROFESSION_LABEL_KEY in char_window.ts and GATHERING_NAME_KEYS in
// professions_window.ts; the locked vendor row that names the proficiency a
// tool requires is the third, so the table lands here and those two consume it.
//
// String-keyed rather than keyed on GatheringProfessionId, exactly as both
// originals were: every caller looks the id up off wire-mirrored or content
// data, and an id with no entry here has no honest name to print, so callers
// treat `undefined` as "render no name" rather than inventing one. This is the
// gathering counterpart of char_window.ts's craftNameText for the ten-craft
// ring, which resolves its own unknown ids to the "none" copy because a craft
// row always exists to fill.

import type { TranslationKey } from './i18n';

/** Display-name key per gathering profession id (issue 1124; fishing landed
 *  with Professions 2.0). Mirrors src/sim/content/professions.ts
 *  GATHERING_PROFESSION_IDS: an id absent here renders no name. */
export const GATHERING_PROFESSION_NAME_KEYS: Record<string, TranslationKey> = {
  mining: 'hudChrome.gathering.mining',
  logging: 'hudChrome.gathering.logging',
  herbalism: 'hudChrome.gathering.herbalism',
  fishing: 'hudChrome.gathering.fishing',
};
