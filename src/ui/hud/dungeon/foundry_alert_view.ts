// The Stormbrass Foundry's encounter alert: the pure, DOM-free view core. It
// tells the local player what a Foundry mechanic asks of them, read off the
// auras and entities the sim already mirrors (encounters/stormbrass_foundry):
//  - carrying the Prime Draft's Storm Cell (the carry aura, whose sourceId
//    names the Core Hatch's ring): where the hatch stands (shut, shuddering,
//    open), the Static it deals a second, how to drop it, and the bar is the
//    time left before the cell shorts out;
//  - marked by the Rangewarden's Target Lock: keep moving, the bar is the
//    mark's time left;
//  - targeting a plated body (the Voltaic Warden or one of its drones): which
//    kind of damage lands and which is stored, the back half on heroic Split
//    Plating, and (on the Warden) the bar is the Stored Charge banked toward
//    the next Discharge.
// Priority: the cell over the mark over the plating readout. The painter
// (foundry_alert_painter.ts) only paints; every decision is here.

import {
  DRAFT_CELL_CARRY,
  hatchStateOf,
  RANGE_TARGET_LOCK,
  VOLTAIC_CHARGED,
  VOLTAIC_GROUNDED,
  VOLTAIC_STORED,
} from '../../../sim/encounters/stormbrass_foundry/ids';
import { formatNumber, t } from '../../i18n';

export type FoundryAlertKind =
  | 'cell-closed'
  | 'cell-warn'
  | 'cell-open'
  | 'locked'
  | 'grounded'
  | 'charged';

export interface FoundryAlertLive {
  visible: true;
  kind: FoundryAlertKind;
  title: string;
  line: string;
  /** The second line ('' when none): how to drop the cell, the split back. */
  hint: string;
  /** The key the hint names ('' on touch, when unbound, or no hint). */
  key: string;
  /** 0 to 1, or null when this alert carries no bar. */
  progress: number | null;
  progressAria: string;
  /** A tap or click on the panel is an interact press (the cell drop). */
  pressable: boolean;
  buttonAria: string;
}

export interface FoundryAlertHidden {
  visible: false;
}

export type FoundryAlertView = FoundryAlertLive | FoundryAlertHidden;

const HIDDEN: FoundryAlertHidden = { visible: false };

interface AlertAura {
  id: string;
  sourceId?: number;
  remaining?: number;
  duration?: number;
  stacks?: number;
  value2?: number;
}

export interface FoundryAlertEntity {
  templateId?: string;
  dead?: boolean;
  auras?: readonly AlertAura[];
}

export interface FoundryAlertInput {
  auras: readonly AlertAura[];
  targetId: number | null | undefined;
  entity: (id: number) => FoundryAlertEntity | null | undefined;
  /** The interact key's label ('' when unbound). */
  interactKey: string;
  touch: boolean;
}

function auraOf(auras: readonly AlertAura[] | undefined, id: string): AlertAura | null {
  if (!auras) return null;
  for (const a of auras) if (a.id === id) return a;
  return null;
}

function pct(share: number): string {
  return formatNumber(share, { style: 'percent', maximumFractionDigits: 0 });
}

function timeLeft(a: AlertAura): number {
  if (!a.duration || a.duration <= 0 || a.remaining === undefined) return 0;
  return Math.max(0, Math.min(1, a.remaining / a.duration));
}

function cellView(carry: AlertAura, input: FoundryAlertInput): FoundryAlertLive {
  const hatch = input.entity(carry.sourceId ?? -1);
  const state = hatch?.templateId ? hatchStateOf(hatch.templateId) : null;
  const kind: FoundryAlertKind =
    state === 'open' ? 'cell-open' : state === 'warn' ? 'cell-warn' : 'cell-closed';
  const line =
    kind === 'cell-open'
      ? t('hudChrome.foundryAlert.cellOpenLine')
      : kind === 'cell-warn'
        ? t('hudChrome.foundryAlert.cellWarnLine')
        : t('hudChrome.foundryAlert.cellClosedLine');
  const key = input.touch ? '' : input.interactKey;
  const hint = input.touch
    ? t('hudChrome.foundryAlert.dropTap')
    : key
      ? t('hudChrome.foundryAlert.dropKey', { key })
      : t('hudChrome.foundryAlert.dropClick');
  const left = timeLeft(carry);
  return {
    visible: true,
    kind,
    title: t('hudChrome.foundryAlert.cellTitle', {
      amount: formatNumber(carry.stacks ?? 0, { maximumFractionDigits: 0 }),
    }),
    line,
    hint,
    key,
    progress: left,
    progressAria: t('hudChrome.foundryAlert.cellAria', { pct: pct(left) }),
    pressable: true,
    buttonAria: t('hudChrome.foundryAlert.dropAria'),
  };
}

function lockView(mark: AlertAura): FoundryAlertLive {
  const left = timeLeft(mark);
  return {
    visible: true,
    kind: 'locked',
    title: t('hudChrome.foundryAlert.lockTitle'),
    line: t('hudChrome.foundryAlert.lockLine'),
    hint: '',
    key: '',
    progress: left,
    progressAria: t('hudChrome.foundryAlert.lockAria', { pct: pct(left) }),
    pressable: false,
    buttonAria: t('hudChrome.foundryAlert.lockTitle'),
  };
}

function platingView(target: FoundryAlertEntity): FoundryAlertLive | null {
  const grounded = auraOf(target.auras, VOLTAIC_GROUNDED);
  const charged = grounded ? null : auraOf(target.auras, VOLTAIC_CHARGED);
  const face = grounded ?? charged;
  if (!face) return null;
  const kind: FoundryAlertKind = grounded ? 'grounded' : 'charged';
  const stored = auraOf(target.auras, VOLTAIC_STORED);
  const share =
    stored && stored.value2 && stored.value2 > 0
      ? Math.max(0, Math.min(1, (stored.stacks ?? 0) / stored.value2))
      : null;
  const title = grounded
    ? t('hudChrome.foundryAlert.groundedTitle')
    : t('hudChrome.foundryAlert.chargedTitle');
  return {
    visible: true,
    kind,
    title,
    line: grounded
      ? t('hudChrome.foundryAlert.groundedLine')
      : t('hudChrome.foundryAlert.chargedLine'),
    hint: face.value2 === 1 ? t('hudChrome.foundryAlert.splitLine') : '',
    key: '',
    progress: share,
    progressAria: share === null ? '' : t('hudChrome.foundryAlert.storedAria', { pct: pct(share) }),
    pressable: false,
    buttonAria: title,
  };
}

export function buildFoundryAlertView(input: FoundryAlertInput): FoundryAlertView {
  const carry = auraOf(input.auras, DRAFT_CELL_CARRY);
  if (carry) return cellView(carry, input);
  const mark = auraOf(input.auras, RANGE_TARGET_LOCK);
  if (mark) return lockView(mark);
  if (input.targetId !== null && input.targetId !== undefined) {
    const target = input.entity(input.targetId);
    if (target && !target.dead) {
      const plating = platingView(target);
      if (plating) return plating;
    }
  }
  return HIDDEN;
}
