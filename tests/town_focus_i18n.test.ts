import { describe, expect, it } from 'vitest';
import { HARVEST_COMPONENT_ITEMS } from '../src/sim/content/professions';
import { t } from '../src/ui/i18n';

// Town Focus (src/ui/town_focus_window.ts) builds a component label key
// dynamically as `hudChrome.corpseHarvest.components.${component}` for every
// key of HARVEST_COMPONENT_ITEMS. The label map (i18n.catalog/hud_chrome.ts
// corpseHarvest.components) is a hand-maintained sibling list that must cover
// every one of those keys, or t()'s onUntrackedKey path throws in dev/test
// (and silently renders the raw key string in production) the first time that
// component's row renders (issue #2344). This pin iterates the real source of
// truth so a future new harvest component cannot silently reintroduce the gap.

describe('Town Focus component labels cover every HARVEST_COMPONENT_ITEMS key', () => {
  for (const component of Object.keys(HARVEST_COMPONENT_ITEMS)) {
    it(`resolves a real label for "${component}"`, () => {
      const key = `hudChrome.corpseHarvest.components.${component}` as Parameters<typeof t>[0];
      const label = t(key);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(key);
    });
  }
});
