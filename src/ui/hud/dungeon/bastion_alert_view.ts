// The Sunken Bastion's encounter alert on the Beacon Crown: the pure, DOM-free
// view core. It teaches Vael's fight from the auras the sim already mirrors
// (encounters/sunken_bastion: vael.ts, vael_shadowstep.ts):
//  - Marked by Death (he rises behind the local player): step out of the arc;
//  - the Fog Veil (the Drowning Hymn's mark on the local player): watch the
//    Fogbeacon's beam, the figure whose lantern flares is the real Vael; and,
//    when the player's target is a figure the beam just touched, which one it
//    is (Beacon-Lit: the real one, strike; Hollow Shade: leave it).
// Every bar is the mark's own time left. Priority: the scythe behind you over
// the target's tell over the veil's rule. The painter is the shared encounter
// alert's (encounter_alert_painter.ts); every decision is here.

import {
  VAEL_BEACON_LIT,
  VAEL_HYMN_DROWNING,
  VAEL_REAP_MARK,
  VAEL_SHADE_HOLLOW,
} from '../../../sim/encounters/sunken_bastion/ids';
import { formatNumber, t } from '../../i18n';
import type { EncounterAlertHidden, EncounterAlertLive } from './encounter_alert_view';

export type BastionAlertKind = 'reaped' | 'veil-real' | 'veil-shade' | 'veil';

/** Every kind class the painter toggles (the CSS keys on them). */
export const BASTION_ALERT_KINDS: readonly BastionAlertKind[] = [
  'reaped',
  'veil-real',
  'veil-shade',
  'veil',
];

export type BastionAlertLive = Omit<EncounterAlertLive, 'kind'> & { kind: BastionAlertKind };
export type BastionAlertView = BastionAlertLive | EncounterAlertHidden;

const HIDDEN: EncounterAlertHidden = { visible: false };

interface AlertAura {
  id: string;
  remaining?: number;
  duration?: number;
}

export interface BastionAlertEntity {
  dead?: boolean;
  auras?: readonly AlertAura[];
}

export interface BastionAlertInput {
  auras: readonly AlertAura[];
  targetId: number | null | undefined;
  entity: (id: number) => BastionAlertEntity | null | undefined;
}

function auraOf(auras: readonly AlertAura[] | undefined, id: string): AlertAura | null {
  if (!auras) return null;
  for (const a of auras) if (a.id === id) return a;
  return null;
}

function timeLeft(a: AlertAura): number {
  if (!a.duration || a.duration <= 0 || a.remaining === undefined) return 0;
  return Math.max(0, Math.min(1, a.remaining / a.duration));
}

function live(
  kind: BastionAlertKind,
  title: string,
  line: string,
  mark: AlertAura | null,
): BastionAlertLive {
  const seconds = formatNumber(Math.max(0, Math.ceil(mark?.remaining ?? 0)), {
    maximumFractionDigits: 0,
  });
  return {
    visible: true,
    kind,
    title,
    line,
    hint: '',
    key: '',
    progress: mark ? timeLeft(mark) : null,
    progressAria: mark ? t('hudChrome.bastionAlert.timeAria', { seconds }) : '',
    pressable: false,
    buttonAria: title,
  };
}

export function buildBastionAlertView(input: BastionAlertInput): BastionAlertView {
  const reaped = auraOf(input.auras, VAEL_REAP_MARK);
  if (reaped)
    return live(
      'reaped',
      t('hudChrome.bastionAlert.reapedTitle'),
      t('hudChrome.bastionAlert.reapedLine'),
      reaped,
    );
  const hymn = auraOf(input.auras, VAEL_HYMN_DROWNING);
  if (!hymn) return HIDDEN;
  if (input.targetId !== null && input.targetId !== undefined) {
    const target = input.entity(input.targetId);
    if (target && !target.dead) {
      if (auraOf(target.auras, VAEL_BEACON_LIT))
        return live(
          'veil-real',
          t('hudChrome.bastionAlert.realTitle'),
          t('hudChrome.bastionAlert.realLine'),
          hymn,
        );
      if (auraOf(target.auras, VAEL_SHADE_HOLLOW))
        return live(
          'veil-shade',
          t('hudChrome.bastionAlert.shadeTitle'),
          t('hudChrome.bastionAlert.shadeLine'),
          hymn,
        );
    }
  }
  return live(
    'veil',
    t('hudChrome.bastionAlert.veilTitle'),
    t('hudChrome.bastionAlert.veilLine'),
    hymn,
  );
}
