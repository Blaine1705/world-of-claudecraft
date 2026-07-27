import type { SimEvent } from '../sim/types';

type Heal2Event = Extract<SimEvent, { type: 'heal2' }>;

export function shouldShowHealLanding(ev: Heal2Event): boolean {
  if (ev.cueOnly) return false;
  if (ev.amount > 0) return true;
  return ev.hot !== true;
}
