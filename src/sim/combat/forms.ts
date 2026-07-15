import type { AuraKind } from '../types';

export function isFormAuraKind(kind: AuraKind): boolean {
  return (
    kind === 'form_bear' ||
    kind === 'form_cat' ||
    kind === 'form_travel' ||
    kind === 'form_fireball' ||
    kind === 'form_moonkin' ||
    kind === 'form_shadow'
  );
}

export function isResourceShiftFormAuraKind(kind: AuraKind): boolean {
  return kind === 'form_bear' || kind === 'form_cat' || kind === 'form_travel';
}

export function isActionLockingFormAuraKind(kind: AuraKind): boolean {
  return isResourceShiftFormAuraKind(kind) || kind === 'form_fireball';
}

export function isTravelFormAuraKind(kind: AuraKind): boolean {
  return kind === 'form_travel' || kind === 'form_fireball';
}
