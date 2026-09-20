// The Pale Keeper's two-step revive copy: the dialogue is the same for everyone
// (and names the level floor), the confirmation is worded for whether the Toll
// will actually land on a character of this level.

import { describe, expect, it } from 'vitest';
import { RES_SICKNESS_MIN_LEVEL } from '../src/sim/resurrection';
import { t } from '../src/ui/i18n';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';
import { keeperReviveConfirm, keeperReviveDialogue } from '../src/ui/keeper_revive_dialog_core';

describe('keeper_revive_dialog_core', () => {
  it('the dialogue names the Toll, the free walk back, and the level floor', () => {
    const step = keeperReviveDialogue();
    expect(step.titleKey).toBe('hudChrome.death.keeperTalkTitle');
    const body = t(step.bodyKey);
    expect(body).toBe(hudChromeStrings.death.keeperTalkBody);
    expect(body).toContain(`level ${RES_SICKNESS_MIN_LEVEL}`);
    expect(body).toMatch(/75%/);
    expect(t(step.okKey)).toBe('Revive Me');
    expect(t(step.cancelKey)).toBe('Leave');
  });

  it('at or above the floor the confirmation says the raise will weaken them', () => {
    for (const level of [RES_SICKNESS_MIN_LEVEL, RES_SICKNESS_MIN_LEVEL + 5, 60]) {
      const step = keeperReviveConfirm(level);
      expect(step.titleKey).toBe('hudChrome.death.healerConfirmTitle');
      expect(step.bodyKey).toBe('hudChrome.death.keeperConfirmBody');
      expect(t(step.bodyKey)).toMatch(/weaker/);
      expect(t(step.bodyKey)).toMatch(/75%/);
    }
  });

  it('below the floor the confirmation says the Toll will not touch them', () => {
    for (const level of [1, RES_SICKNESS_MIN_LEVEL - 1]) {
      const step = keeperReviveConfirm(level);
      expect(step.titleKey).toBe('hudChrome.death.keeperConfirmSparedTitle');
      expect(step.bodyKey).toBe('hudChrome.death.keeperConfirmSparedBody');
      expect(t(step.bodyKey)).toContain(`level ${RES_SICKNESS_MIN_LEVEL}`);
      expect(t(step.bodyKey)).not.toMatch(/75%/);
    }
  });

  it('both steps share the Revive Me / Cancel pair on the confirmation', () => {
    const step = keeperReviveConfirm(20);
    expect(t(step.okKey)).toBe('Revive Me');
    expect(t(step.cancelKey)).toBe('Cancel');
    expect(keeperReviveConfirm(20, 30).bodyKey).toBe('hudChrome.death.keeperConfirmSparedBody');
  });
});
