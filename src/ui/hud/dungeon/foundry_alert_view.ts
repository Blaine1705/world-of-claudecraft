// The Stormbrass Foundry's encounter alert: the pure, DOM-free view core. It
// tells the local player what a Foundry mechanic asks of them, read off the
// auras and entities the sim already mirrors (encounters/stormbrass_foundry):
//  - carrying the Prime Draft's Storm Cell (the carry aura, whose sourceId
//    names the Core Hatch's ring): where the hatch stands (shut, shuddering,
//    open), the Static it deals a second, how to drop it, and the bar is the
//    time left before the cell shorts out;
//  - marked by the Rangewarden's Target Lock: keep moving, the bar is the
//    mark's time left;
//  - standing on Main Line floor that is not a belt while Line-Master Tock's
//    Scalding Vents warn or blow (the walkway aura; value2 0 warning, 1
//    scalding): get onto a belt, the bar is the phase's time left;
//  - the Rangewarden's Proof Shot bar (to the tank it aims at and to anyone
//    targeting the Rangewarden): a heavy shell at the tank, use a defensive or
//    swap the taunt, the Dented Plating stacks it already wears, the bar is the
//    cast;
//  - a Storm Cell lying on the Gantry floor near the player: take it;
//  - the Voltaic Warden's plating (to everyone near it in the fight, or when a
//    plated body is targeted): which face is up and which damage lands, the
//    drones line for the players whose damage is turned aside, the flip
//    countdown (or the flip itself), the back half on heroic Split Plating,
//    and (on the Warden) the bar is the Stored Charge released at the flip.
// Priority: the cell, the mark, the vents, the Proof Shot, a cell on the floor, then the
// plating readout. The bodies not on the player (the bosses, the drones, the
// floor cells) come from the frame's scene (foundry_alert_scene.ts). The
// painter (foundry_alert_painter.ts) only paints; every decision is here.

import {
  DRAFT_CELL_CARRY,
  FOUNDRY_CELL_TEMPLATES,
  hatchStateOf,
  RANGE_DENTED,
  RANGE_PROOF_SHOT,
  RANGE_TARGET_LOCK,
  TOCK_SCALDING_VENTS,
  RANGEWARDEN_ID,
  VOLTAIC_CHARGED,
  VOLTAIC_FLIP,
  VOLTAIC_GROUNDED,
  VOLTAIC_STORED,
  VOLTAIC_WARDEN_ID,
} from '../../../sim/encounters/stormbrass_foundry/ids';
import { formatNumber, t } from '../../i18n';

export type FoundryAlertKind =
  | 'cell-closed'
  | 'cell-warn'
  | 'cell-open'
  | 'locked'
  | 'vent-warn'
  | 'vent-scald'
  | 'proof'
  | 'floorcell'
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
  /** The words printed on the bar ('' when none). */
  barLabel?: string;
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
  value?: number;
  value2?: number;
}

export interface FoundryAlertEntity {
  id?: number;
  templateId?: string;
  dead?: boolean;
  pos?: { x: number; z: number };
  auras?: readonly AlertAura[];
  castingAbility?: string | null;
  castTargetId?: number | null;
  castRemaining?: number;
  castTotal?: number;
}

/** The Foundry bodies the alert reads that are not on the player: the bosses,
 *  the Warden's drones and the Storm Cells on the floor (each list may hold
 *  bodies of other templates or ones far away; the view filters). */
export interface FoundryAlertScene {
  rangewarden: FoundryAlertEntity | null;
  warden: FoundryAlertEntity | null;
  draft: FoundryAlertEntity | null;
  drones: readonly FoundryAlertEntity[];
  cells: readonly FoundryAlertEntity[];
}

export interface FoundryAlertInput {
  auras: readonly AlertAura[];
  targetId: number | null | undefined;
  entity: (id: number) => FoundryAlertEntity | null | undefined;
  /** The interact key's label ('' when unbound). */
  interactKey: string;
  touch: boolean;
  /** The local player (the Proof Shot's aim, the reach to a cell or the Warden). */
  selfId?: number;
  selfPos?: { x: number; z: number };
  scene?: FoundryAlertScene | null;
}

/** How near a Storm Cell on the floor must lie to call for a taker (yards). */
export const FLOOR_CELL_REACH = 30;
/** How near the Voltaic Warden counts as on the crown in its fight (yards):
 *  the crown's radius and the margin the encounter counts on it. */
export const WARDEN_REACH = 45;

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

function near(
  pos: { x: number; z: number } | undefined,
  at: { x: number; z: number } | undefined,
  reach: number,
): boolean {
  if (!pos || !at) return false;
  const dx = pos.x - at.x;
  const dz = pos.z - at.z;
  return dx * dx + dz * dz <= reach * reach;
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

function ventView(vent: AlertAura): FoundryAlertLive {
  const scalding = vent.value2 === 1;
  const left = timeLeft(vent);
  const title = scalding
    ? t('hudChrome.foundryAlert.ventScaldTitle')
    : t('hudChrome.foundryAlert.ventWarnTitle');
  return {
    visible: true,
    kind: scalding ? 'vent-scald' : 'vent-warn',
    title,
    line: scalding
      ? t('hudChrome.foundryAlert.ventScaldLine')
      : t('hudChrome.foundryAlert.ventWarnLine'),
    hint: '',
    key: '',
    progress: left,
    progressAria: t('hudChrome.foundryAlert.ventAria', { pct: pct(left) }),
    pressable: false,
    buttonAria: title,
  };
}

// ---- the Rangewarden's Proof Shot ---------------------------------------------

/** The Rangewarden mid Proof Shot that concerns the player: aimed at them, or
 *  the one they target. */
function proofShooter(input: FoundryAlertInput): FoundryAlertEntity | null {
  const shooting = (e: FoundryAlertEntity | null | undefined): e is FoundryAlertEntity =>
    !!e && !e.dead && e.templateId === RANGEWARDEN_ID && e.castingAbility === RANGE_PROOF_SHOT;
  const scene = input.scene?.rangewarden;
  if (shooting(scene) && input.selfId !== undefined && scene.castTargetId === input.selfId)
    return scene;
  if (input.targetId === null || input.targetId === undefined) return null;
  const target = input.entity(input.targetId);
  return shooting(target) ? target : null;
}

function proofView(shooter: FoundryAlertEntity, input: FoundryAlertInput): FoundryAlertLive {
  const total = shooter.castTotal ?? 0;
  const fill = total > 0 ? Math.max(0, Math.min(1, 1 - (shooter.castRemaining ?? 0) / total)) : 1;
  const aimed = shooter.castTargetId;
  const tank = aimed !== null && aimed !== undefined ? input.entity(aimed) : null;
  const dent = auraOf(tank?.auras, RANGE_DENTED);
  const hint =
    dent && (dent.stacks ?? 0) > 0
      ? t('hudChrome.foundryAlert.dentedLine', {
          stacks: formatNumber(dent.stacks ?? 0, { maximumFractionDigits: 0 }),
          pct: pct(dent.value ?? 0),
        })
      : '';
  const title = t('hudChrome.foundryAlert.proofTitle');
  return {
    visible: true,
    kind: 'proof',
    title,
    line: t('hudChrome.foundryAlert.proofLine'),
    hint,
    key: '',
    progress: fill,
    progressAria: t('hudChrome.foundryAlert.proofAria', { pct: pct(fill) }),
    pressable: false,
    buttonAria: title,
  };
}

// ---- the Prime Draft's Storm Cell on the floor ------------------------------

function floorCellNear(input: FoundryAlertInput): boolean {
  const cells = input.scene?.cells;
  if (!cells || !input.selfPos) return false;
  for (const c of cells) {
    if (c.dead || c.templateId !== FOUNDRY_CELL_TEMPLATES.ready) continue;
    if (near(input.selfPos, c.pos, FLOOR_CELL_REACH)) return true;
  }
  return false;
}

function floorCellView(input: FoundryAlertInput): FoundryAlertLive {
  const title = t('hudChrome.foundryAlert.floorCellTitle');
  return {
    visible: true,
    kind: 'floorcell',
    title,
    line: input.touch
      ? t('hudChrome.foundryAlert.floorCellLineTouch')
      : t('hudChrome.foundryAlert.floorCellLine'),
    hint: t('hudChrome.foundryAlert.floorCellHint'),
    key: '',
    progress: null,
    progressAria: '',
    pressable: false,
    buttonAria: title,
  };
}

// ---- the Voltaic Warden's plating ---------------------------------------------

function platingFace(e: FoundryAlertEntity | null | undefined): AlertAura | null {
  if (!e || e.dead) return null;
  return auraOf(e.auras, VOLTAIC_GROUNDED) ?? auraOf(e.auras, VOLTAIC_CHARGED);
}

/** Any living drone wearing a plating face (the Warden's opposite face). */
function platedDrones(scene: FoundryAlertScene | null | undefined): boolean {
  if (!scene) return false;
  for (const d of scene.drones) if (platingFace(d)) return true;
  return false;
}

/** The plated body the readout speaks of: the target when plated, else the
 *  Warden when the player is on the crown in its fight. */
function platedBody(input: FoundryAlertInput): FoundryAlertEntity | null {
  if (input.targetId !== null && input.targetId !== undefined) {
    const target = input.entity(input.targetId);
    if (platingFace(target)) return target ?? null;
  }
  const warden = input.scene?.warden;
  if (platingFace(warden) && near(input.selfPos, warden?.pos, WARDEN_REACH)) return warden ?? null;
  return null;
}

/** The flip line: flipping now, or the seconds to it off the face aura's
 *  clock (the encounter keeps it on the next flip); '' with no clock. */
function flipLine(body: FoundryAlertEntity, face: AlertAura): string {
  const split = face.value2 === 1;
  if (body.castingAbility === VOLTAIC_FLIP) return t('hudChrome.foundryAlert.flipNow');
  if (!face.duration || face.duration <= 0 || face.remaining === undefined)
    return split ? t('hudChrome.foundryAlert.splitLine') : '';
  // Whole seconds, rounded up (a hair of slack so 10.0 never reads as 11).
  const seconds = formatNumber(Math.max(1, Math.ceil(face.remaining - 0.05)), {
    maximumFractionDigits: 0,
  });
  return split
    ? t('hudChrome.foundryAlert.flipInSplit', { seconds })
    : t('hudChrome.foundryAlert.flipIn', { seconds });
}

function platingView(body: FoundryAlertEntity, input: FoundryAlertInput): FoundryAlertLive | null {
  const face = platingFace(body);
  if (!face) return null;
  const grounded = face.id === VOLTAIC_GROUNDED;
  const kind: FoundryAlertKind = grounded ? 'grounded' : 'charged';
  const stored = auraOf(body.auras, VOLTAIC_STORED);
  const share =
    stored && stored.value2 && stored.value2 > 0
      ? Math.max(0, Math.min(1, (stored.stacks ?? 0) / stored.value2))
      : null;
  const title = grounded
    ? t('hudChrome.foundryAlert.groundedTitle')
    : t('hudChrome.foundryAlert.chargedTitle');
  // On the Warden with plated drones up: the players whose damage is turned
  // aside have a job (the drones wear the opposite face).
  const warden = body.templateId === VOLTAIC_WARDEN_ID || stored !== null;
  const dronesUp = warden && platedDrones(input.scene);
  const line = dronesUp
    ? grounded
      ? t('hudChrome.foundryAlert.groundedDronesLine')
      : t('hudChrome.foundryAlert.chargedDronesLine')
    : grounded
      ? t('hudChrome.foundryAlert.groundedLine')
      : t('hudChrome.foundryAlert.chargedLine');
  const barLabel =
    share === null ? '' : t('hudChrome.foundryAlert.storedAria', { pct: pct(share) });
  return {
    visible: true,
    kind,
    title,
    line,
    hint: flipLine(body, face),
    key: '',
    progress: share,
    progressAria: barLabel,
    barLabel,
    pressable: false,
    buttonAria: title,
  };
}

export function buildFoundryAlertView(input: FoundryAlertInput): FoundryAlertView {
  const carry = auraOf(input.auras, DRAFT_CELL_CARRY);
  if (carry) return cellView(carry, input);
  const mark = auraOf(input.auras, RANGE_TARGET_LOCK);
  if (mark) return lockView(mark);
  const vent = auraOf(input.auras, TOCK_SCALDING_VENTS);
  if (vent) return ventView(vent);
  const shooter = proofShooter(input);
  if (shooter) return proofView(shooter, input);
  if (floorCellNear(input)) return floorCellView(input);
  const plated = platedBody(input);
  if (plated) {
    const plating = platingView(plated, input);
    if (plating) return plating;
  }
  return HIDDEN;
}
