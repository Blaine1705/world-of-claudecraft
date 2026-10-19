// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyNameplateSetting,
  type NameplateSettingsRenderer,
} from '../src/game/nameplate_settings';
import { Settings } from '../src/game/settings';
import {
  newTargetHighlightFlags,
  TARGET_HIGHLIGHT_SETTING_FLAG,
} from '../src/render/target_highlight_core';

beforeEach(() => localStorage.clear());
function renderer(): NameplateSettingsRenderer {
  return {
    showDevBadges: false,
    showOwnNameplate: false,
    showPlayerNameplates: false,
    targetHighlight: newTargetHighlightFlags(),
  };
}

describe('nameplate and target settings seam', () => {
  it('keeps all optional cues off until explicitly enabled and persists each independently', () => {
    const settings = new Settings();
    const view = renderer();
    for (const [key, flag] of Object.entries(TARGET_HIGHLIGHT_SETTING_FLAG)) {
      expect(view.targetHighlight[flag]).toBe(false);
      expect(applyNameplateSetting(settings, view, key, true)).toBe(true);
      expect(view.targetHighlight[flag]).toBe(true);
      const reloaded = new Settings();
      expect(reloaded.all()[key as keyof ReturnType<Settings['all']>]).toBe(true);
      expect(applyNameplateSetting(settings, view, key, false)).toBe(true);
      expect(view.targetHighlight[flag]).toBe(false);
    }
    expect(applyNameplateSetting(settings, view, '__proto__', true)).toBe(false);
    expect(applyNameplateSetting(settings, view, 'spellEffects', false)).toBe(false);
  });

  it('retains existing nameplate boolean setters', () => {
    const settings = new Settings();
    const view = renderer();
    for (const key of ['showDevBadges', 'showOwnNameplate', 'showPlayerNameplates'] as const) {
      expect(applyNameplateSetting(settings, view, key, true)).toBe(true);
      expect(view[key]).toBe(true);
      expect(settings.get(key)).toBe(true);
      expect(applyNameplateSetting(settings, view, key, false)).toBe(true);
      expect(view[key]).toBe(false);
    }
  });
  it('carries enabled flags into a rebuilt view and restores persisted defaults', () => {
    const settings = new Settings();
    const view = renderer();
    for (const key of Object.keys(TARGET_HIGHLIGHT_SETTING_FLAG))
      applyNameplateSetting(settings, view, key, true);
    const rebuilt = renderer();
    Object.assign(rebuilt.targetHighlight, view.targetHighlight);
    expect(Object.values(rebuilt.targetHighlight)).toEqual([true, true, true, true]);
    settings.reset();
    for (const key of Object.keys(TARGET_HIGHLIGHT_SETTING_FLAG)) {
      applyNameplateSetting(
        settings,
        rebuilt,
        key,
        settings.all()[key as keyof ReturnType<Settings['all']>],
      );
    }
    expect(Object.values(rebuilt.targetHighlight)).toEqual([false, false, false, false]);
    const reloaded = new Settings();
    for (const key of Object.keys(TARGET_HIGHLIGHT_SETTING_FLAG))
      expect(reloaded.all()[key as keyof ReturnType<Settings['all']>]).toBe(false);
  });
});
