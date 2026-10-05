// The Hollow Crypt's wing-boss alert: the pure, DOM-free view core. It teaches
// the three reworked fights from the auras the sim already mirrors
// (encounters/hollow_crypt: marrow.ts, lady.ts, lady_embrace.ts, ilvane.ts):
//  - Measured for the Grave (Sexton Marrow's mark on the local player): a
//    grave caves in where they stand when it runs out, carry it to the edge of
//    the yard;
//  - the Frozen Embrace (the Lady holds them aloft): the group must hurt her
//    to make her set them down;
//  - the Bride's Lament being wailed (on every player): its value2 says whether
//    a lit lantern has room for the local player where they stand (1: hold
//    still) or not (0: get into a lit lantern's light, two to a lantern);
//  - standing in an Open Grave (Grave Dirt): get out;
//  - and, read off the player's target: Marrow ringing the Burial Bell (immune,
//    the Toll is coming) and Cantor Ilvane under Harmony (kill the Choristers
//    first, with the share her living Choristers take off).
// Every bar is the mark's own time left (none for the grave underfoot or the
// target readouts). Priority: the strike about to land on you (the grave mark)
// over being held over the Lament over the grave underfoot over the target's
// readout. The Dirge's silence is a plain silence and needs no alert. The
// painter is the shared encounter alert's (encounter_alert_painter.ts); every
// decision is here.

import { ILVANE_HARMONY, ILVANE_ID } from '../../../sim/encounters/hollow_crypt/ilvane_ids';
import { LADY_EMBRACED, LADY_LAMENT_DREAD } from '../../../sim/encounters/hollow_crypt/lady_ids';
import {
  MARROW_GRAVE_DIRT,
  MARROW_ID,
  MARROW_MEASURED,
  MARROW_TOLLING,
} from '../../../sim/encounters/hollow_crypt/marrow_ids';
import { formatNumber, t } from '../../i18n';
import type { EncounterAlertHidden, EncounterAlertLive } from './encounter_alert_view';

export type CryptAlertKind =
  | 'measured'
  | 'embraced'
  | 'lament-sheltered'
  | 'lament-open'
  | 'grave'
  | 'toll'
  | 'harmony';

/** Every kind class the painter toggles (the CSS keys on them). */
export const CRYPT_ALERT_KINDS: readonly CryptAlertKind[] = [
  'measured',
  'embraced',
  'lament-sheltered',
  'lament-open',
  'grave',
  'toll',
  'harmony',
];

export type CryptAlertLive = Omit<EncounterAlertLive, 'kind'> & { kind: CryptAlertKind };
export type CryptAlertView = CryptAlertLive | EncounterAlertHidden;

const HIDDEN: EncounterAlertHidden = { visible: false };

interface AlertAura {
  id: string;
  remaining?: number;
  duration?: number;
  value?: number;
  value2?: number;
}

export interface CryptAlertEntity {
  templateId?: string;
  dead?: boolean;
  auras?: readonly AlertAura[];
}

export interface CryptAlertInput {
  auras: readonly AlertAura[];
  targetId: number | null | undefined;
  entity: (id: number) => CryptAlertEntity | null | undefined;
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
  kind: CryptAlertKind,
  title: string,
  line: string,
  mark: AlertAura | null,
): CryptAlertLive {
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
    progressAria: mark ? t('hudChrome.cryptAlert.timeAria', { seconds }) : '',
    pressable: false,
    buttonAria: title,
  };
}

/** The readout for the player's target: Marrow at the bell, Ilvane in Harmony. */
function targetAlert(input: CryptAlertInput): CryptAlertView {
  if (input.targetId === null || input.targetId === undefined) return HIDDEN;
  const target = input.entity(input.targetId);
  if (!target || target.dead) return HIDDEN;
  if (target.templateId === MARROW_ID && auraOf(target.auras, MARROW_TOLLING))
    return live(
      'toll',
      t('hudChrome.cryptAlert.tollTitle'),
      t('hudChrome.cryptAlert.tollLine'),
      null,
    );
  if (target.templateId === ILVANE_ID) {
    const harmony = auraOf(target.auras, ILVANE_HARMONY);
    if (harmony && (harmony.value ?? 0) > 0) {
      const pct = formatNumber(Math.round((harmony.value ?? 0) * 100), {
        maximumFractionDigits: 0,
      });
      return live(
        'harmony',
        t('hudChrome.cryptAlert.harmonyTitle'),
        t('hudChrome.cryptAlert.harmonyLine', { pct }),
        null,
      );
    }
  }
  return HIDDEN;
}

export function buildCryptAlertView(input: CryptAlertInput): CryptAlertView {
  const measured = auraOf(input.auras, MARROW_MEASURED);
  if (measured)
    return live(
      'measured',
      t('hudChrome.cryptAlert.measuredTitle'),
      t('hudChrome.cryptAlert.measuredLine'),
      measured,
    );
  const embraced = auraOf(input.auras, LADY_EMBRACED);
  if (embraced)
    return live(
      'embraced',
      t('hudChrome.cryptAlert.embracedTitle'),
      t('hudChrome.cryptAlert.embracedLine'),
      embraced,
    );
  const lament = auraOf(input.auras, LADY_LAMENT_DREAD);
  if (lament) {
    // value2 1: a lit lantern's light with room for the player where they stand.
    const sheltered = lament.value2 === 1;
    return live(
      sheltered ? 'lament-sheltered' : 'lament-open',
      t('hudChrome.cryptAlert.lamentTitle'),
      sheltered
        ? t('hudChrome.cryptAlert.lamentShelteredLine')
        : t('hudChrome.cryptAlert.lamentOpenLine'),
      lament,
    );
  }
  if (auraOf(input.auras, MARROW_GRAVE_DIRT))
    return live(
      'grave',
      t('hudChrome.cryptAlert.graveTitle'),
      t('hudChrome.cryptAlert.graveLine'),
      null,
    );
  return targetAlert(input);
}
