import {
  GLIDER_BOOST_COOLDOWN_SECONDS,
  GLIDER_BOOST_SPEED,
} from '../../../sim/minigames/glider_boost';
import { GLIDER_MAX_SPEED } from '../../../sim/minigames/glider_energy';
import { TICK_RATE } from '../../../sim/types';
import { formatNumber, t } from '../../i18n';
import { type ActionBarState, makeSlotState } from '../action_bar/action_bar_view';

export function gliderBoostDescription(): string {
  return t('questUi.worldQuest.glider.boostTip', {
    speed: formatNumber(GLIDER_BOOST_SPEED),
    seconds: formatNumber(GLIDER_BOOST_COOLDOWN_SECONDS),
    maximum: formatNumber(GLIDER_MAX_SPEED),
  });
}

export function createGliderActionBarView() {
  const state: ActionBarState = {
    slots: [makeSlotState(), makeSlotState(), makeSlotState()],
    manySpells: false,
  };
  return {
    tick(
      glider: { tick: number; phase: string; boostReadyTick?: number },
      keyLabel: string,
    ): ActionBarState {
      const slot = state.slots[0];
      const remaining = Math.max(0, (glider.boostReadyTick ?? 0) - glider.tick) / TICK_RATE;
      slot.kind = 'ability';
      slot.abilityId = 'glider_boost';
      slot.iconKey = 'sprint';
      slot.cooldownTotal = GLIDER_BOOST_COOLDOWN_SECONDS;
      slot.cooldownRemaining = remaining;
      slot.cooldownPercent = Math.min(100, (100 * remaining) / slot.cooldownTotal);
      slot.cdText = remaining > 0 ? formatNumber(Math.ceil(remaining)) : '';
      slot.usable = glider.phase === 'flying' && remaining === 0;
      slot.ariaLabel = t('questUi.worldQuest.glider.boost');
      slot.ariaDescription = gliderBoostDescription();
      slot.keybindLabel = keyLabel;
      return state;
    },
  };
}
