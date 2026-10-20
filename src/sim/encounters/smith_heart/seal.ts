// The Smith's Heart's gating state (docs/design/raid/smith_heart.md, "Gating"):
// which veins burn on the heart seal and whether the seal has opened into the
// portal, derived every tick from the claim's own roster, never a timer and
// never stored.
//
//   the Hammer guardian ALWAYS FIRST: its death splits the Slab (the gate
//     `the_slab`, bosses [hammer]); nothing past it is reachable before;
//   the other three in ANY order: no gate orders the Breath, the Quench and
//     the Heat against each other (each arena's mouth waits only on its own
//     vein's three packs);
//   the seal: each guardian's death lights its vein's colour on the seal;
//   the portal: with all four lit AND the Ring's eight packs dead, the seal
//     opens into the portal to the Heart (portal.ts walks the raid through).
//
// Dead instance mobs stay dead for the claim's life, so a lit vein stays lit,
// an opened portal stays open for the lockout, and a fresh claim (a reset)
// starts dark and shut. The collision half is the shared gate engine
// (instances/dungeon_gates.ts); THIS module owns the seal's colours and the
// portal's state, carried in the template id of the run's seal markers
// (content/smith_heart.ts SMITH_HEART_SEAL_MARKERS, spread so every walkable
// point stands within interest range of one) so every client mirrors the seal
// and the portal with no wire change, and the raid's lines as each vein
// lights and as the portal opens.
//
// Draws NO rng; reads the roster through the gate engine's placed-boss read.

import {
  SMITH_HEART_DUNGEON,
  SMITH_HEART_GUARDIANS,
  SMITH_HEART_PACKS,
  SMITH_HEART_SEAL_PREFIX,
} from '../../content/smith_heart';
import { SMITH_HEART_VEINS, type SmithHeartVein } from '../../content/smith_heart_layout';
import { DUNGEONS, instanceOrigin } from '../../data';
import { dungeonPacksDead, dungeonPlacedBossDead } from '../../instances/dungeon_gates';
import { instanceHalfWidthOf } from '../../instances/instance_footprint';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { tickSmithHeartPortal } from './portal';

/** Each vein's bit in the seal mask (the template id's number). */
export const SMITH_HEART_VEIN_BITS: Readonly<Record<SmithHeartVein, number>> = {
  hammer: 1,
  breath: 2,
  quench: 4,
  heat: 8,
};
/** Every vein lit. */
export const SMITH_HEART_SEAL_FULL = 15;
/** The portal's bit: the seal has opened (all four lit and the Ring clear). */
export const SMITH_HEART_PORTAL_BIT = 16;
/** Every bit a marker can carry. */
const MARKER_BITS = SMITH_HEART_SEAL_FULL | SMITH_HEART_PORTAL_BIT;

/** The seal marker template id for a marker value (lit veins plus the
 *  portal bit). */
export function smithHeartSealTemplate(mask: number): string {
  return `${SMITH_HEART_SEAL_PREFIX}${mask & MARKER_BITS}`;
}

/** The value a seal marker's template id carries (lit-vein mask plus the
 *  portal bit), or null. Pure (the renderer reads the mirrored entity
 *  through it). */
export function smithHeartSealMaskOf(templateId: string): number | null {
  if (!templateId.startsWith(SMITH_HEART_SEAL_PREFIX)) return null;
  const n = Number(templateId.slice(SMITH_HEART_SEAL_PREFIX.length));
  return Number.isInteger(n) && n >= 0 && n <= MARKER_BITS ? n : null;
}

/** Is `vein` lit in `mask`? Pure. */
export function smithHeartVeinLit(mask: number, vein: SmithHeartVein): boolean {
  return (mask & SMITH_HEART_VEIN_BITS[vein]) !== 0;
}

/** Does a marker value say the portal is open? Pure. */
export function smithHeartPortalBitSet(mask: number): boolean {
  return (mask & SMITH_HEART_PORTAL_BIT) !== 0;
}

/** How many veins `mask` lights. Pure. */
export function smithHeartLitCount(mask: number): number {
  let n = 0;
  for (const v of SMITH_HEART_VEINS) if (smithHeartVeinLit(mask, v)) n++;
  return n;
}

/** The lit-vein mask the claim has earned right now: one bit per dead guardian. */
export function smithHeartEarnedMask(ctx: SimContext, inst: InstanceSlot): number {
  let mask = 0;
  for (const v of SMITH_HEART_VEINS) {
    if (dungeonPlacedBossDead(ctx, inst, SMITH_HEART_GUARDIANS[v]))
      mask |= SMITH_HEART_VEIN_BITS[v];
  }
  return mask;
}

/** Claims whose portal a dev playtest forced open (`/dev heart portal`),
 *  keyed by the claim's identity so a recycled slot never inherits it. */
const devPortal = new WeakMap<InstanceSlot, number>();

/** Force (or stop forcing) a live claim's portal open for a dev playtest.
 *  Dev-gated by its one caller (sim/dev/smith_heart_dev.ts). */
export function setSmithHeartPortalDevOpen(inst: InstanceSlot, open: boolean): void {
  if (open && inst.partyKey !== null && inst.exitId !== null) devPortal.set(inst, inst.exitId);
  else devPortal.delete(inst);
}

function devPortalOpen(inst: InstanceSlot): boolean {
  return inst.exitId !== null && devPortal.get(inst) === inst.exitId;
}

/** The whole gating readout of one claim (dev tools, tests, the design doc's
 *  state table). */
export interface SmithHeartProgress {
  /** Lit-vein mask (SMITH_HEART_VEIN_BITS). */
  mask: number;
  /** The Hammer is down: the Slab is split, the Ring and the three veins open. */
  slabOpen: boolean;
  /** All four colours burn on the seal. */
  sealLit: boolean;
  /** The Ring's eight packs are dead. */
  ringClear: boolean;
  /** The seal has opened into the portal to the Heart (seal lit and the Ring
   *  clear, or forced open by `/dev heart portal`). */
  portalOpen: boolean;
}

export function smithHeartProgress(ctx: SimContext, inst: InstanceSlot): SmithHeartProgress {
  const mask = smithHeartEarnedMask(ctx, inst);
  const ringClear = dungeonPacksDead(ctx, inst, SMITH_HEART_PACKS.ring);
  const sealLit = mask === SMITH_HEART_SEAL_FULL;
  return {
    mask,
    slabOpen: smithHeartVeinLit(mask, 'hammer'),
    sealLit,
    ringClear,
    portalOpen: (sealLit && ringClear) || devPortalOpen(inst),
  };
}

/** The English line each vein's lighting sends to the raid (re-localized by
 *  src/ui/sim_i18n.ts, EXACT matcher). */
export const SMITH_HEART_VEIN_LIT_LOG: Readonly<Record<SmithHeartVein, string>> = {
  hammer: 'An ochre light runs down from the Quarry toward the heart seal.',
  breath: 'A storm-blue light runs down the Breath toward the heart seal.',
  quench: 'An ice-pale light runs up the Quench toward the heart seal.',
  heat: 'A white-gold light runs out of the forge toward the heart seal.',
};

/** The English line the raid reads when the seal opens into the portal. */
export const SMITH_HEART_PORTAL_OPEN_LOG =
  'Four colours burn on the heart seal. It splits open, and a way down into the heart of the mountain whirls in its place.';

/** The claim's seal markers' current value (the first marker's; all agree). */
function markerMask(ctx: SimContext, inst: InstanceSlot): number | null {
  for (const id of inst.objectIds) {
    const e = ctx.entities.get(id);
    const m = e ? smithHeartSealMaskOf(e.templateId) : null;
    if (m !== null) return m;
  }
  return null;
}

function announce(ctx: SimContext, inst: InstanceSlot, text: string): void {
  const o = instanceOrigin(DUNGEONS[inst.dungeonId].index, inst.slot);
  const half = instanceHalfWidthOf(inst.dungeonId);
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e || Math.abs(e.pos.x - o.x) >= half || Math.abs(e.pos.z - o.z) >= 250) continue;
    ctx.emit({ type: 'log', text, color: '#e8c070', pid: meta.entityId });
  }
}

/**
 * One tick of one claim's seal: write the earned value (lit veins plus the
 * portal bit) onto every marker and tell the raid about each vein that lit
 * and the portal opening since the last tick. Returns the claim's current
 * marker value, or null for a claim without markers.
 */
export function tickSmithHeartSeal(ctx: SimContext, inst: InstanceSlot): number | null {
  const before = markerMask(ctx, inst);
  if (before === null) return null;
  const p = smithHeartProgress(ctx, inst);
  const value = p.mask | (p.portalOpen ? SMITH_HEART_PORTAL_BIT : 0);
  if (value === before) return value;
  const template = smithHeartSealTemplate(value);
  for (const id of inst.objectIds) {
    const e = ctx.entities.get(id);
    if (e && smithHeartSealMaskOf(e.templateId) !== null) e.templateId = template;
  }
  for (const v of SMITH_HEART_VEINS) {
    if (smithHeartVeinLit(value, v) && !smithHeartVeinLit(before, v)) {
      announce(ctx, inst, SMITH_HEART_VEIN_LIT_LOG[v]);
    }
  }
  if (smithHeartPortalBitSet(value) && !smithHeartPortalBitSet(before)) {
    announce(ctx, inst, SMITH_HEART_PORTAL_OPEN_LOG);
  }
  return value;
}

/** One tick of every Smith's Heart claim (instances/dungeons.ts): the seal,
 *  then the portal hops (the Ring's portal only while the seal stands open). Allocation free: the claim list
 *  is walked in place. */
export function tickSmithHeart(ctx: SimContext): void {
  for (const inst of ctx.instances) {
    if (inst.partyKey === null || inst.dungeonId !== SMITH_HEART_DUNGEON) continue;
    const value = tickSmithHeartSeal(ctx, inst);
    if (value !== null) tickSmithHeartPortal(ctx, inst, smithHeartPortalBitSet(value));
  }
}
