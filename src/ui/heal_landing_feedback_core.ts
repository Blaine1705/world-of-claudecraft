import type { SimEvent } from '../sim/types';

type Heal2Event = Extract<SimEvent, { type: 'heal2' }>;

export type HealLandingLogKey =
  | 'hud.combat.healSelf'
  | 'hud.combat.healSelfCrit'
  | 'hud.combat.healOther'
  | 'hud.combat.healOtherCrit'
  | 'hud.combat.healSelfFull'
  | 'hud.combat.healOtherFull';

export function shouldShowHealLanding(ev: Heal2Event): boolean {
  if (ev.cueOnly) return false;
  if (ev.amount > 0) return true;
  return ev.hot !== true;
}

export function shouldFloatHealLanding(ev: Heal2Event): boolean {
  return ev.amount > 0 && shouldShowHealLanding(ev);
}

export function healLandingLogKey(ev: Heal2Event, selfTarget: boolean): HealLandingLogKey | null {
  if (!shouldShowHealLanding(ev)) return null;
  if (ev.amount <= 0) return selfTarget ? 'hud.combat.healSelfFull' : 'hud.combat.healOtherFull';
  if (selfTarget) return ev.crit ? 'hud.combat.healSelfCrit' : 'hud.combat.healSelf';
  return ev.crit ? 'hud.combat.healOtherCrit' : 'hud.combat.healOther';
}
