// The Smith's Heart's gating state (docs/design/raid/smith_heart.md, "Gating"):
// which veins burn on the heart seal, derived every tick from the claim's own
// roster, never a timer and never stored.
//
//   the Hammer guardian ALWAYS FIRST: its death splits the Slab (the gate
//     `the_slab`, bosses [hammer]); nothing past it is reachable before;
//   the other three in ANY order: no gate orders the Breath, the Quench and
//     the Heat against each other (each arena's mouth waits only on its own
//     vein's three packs);
//   the seal: each guardian's death lights its vein's colour on the seal;
//   the Heart: the three causeway gates wait on all four guardians and the
//     Ring's eight packs, and seal behind the raid while the final boss fights.
//
// Dead instance mobs stay dead for the claim's life, so a lit vein stays lit
// and a fresh claim (a reset) starts dark. The collision half is the shared
// gate engine (instances/dungeon_gates.ts); THIS module owns the seal's
// colours, carried in the template id of the run's seal markers
// (content/smith_heart.ts SMITH_HEART_SEAL_MARKERS, spread so every walkable
// point stands within interest range of one) so every client mirrors the seal
// with no wire change, and the raid's lines as each vein lights.
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
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';

/** Each vein's bit in the seal mask (the template id's number). */
export const SMITH_HEART_VEIN_BITS: Readonly<Record<SmithHeartVein, number>> = {
  hammer: 1,
  breath: 2,
  quench: 4,
  heat: 8,
};
/** Every vein lit. */
export const SMITH_HEART_SEAL_FULL = 15;

/** The seal marker template id for a lit-vein mask. */
export function smithHeartSealTemplate(mask: number): string {
  return `${SMITH_HEART_SEAL_PREFIX}${mask & SMITH_HEART_SEAL_FULL}`;
}

/** The lit-vein mask a seal marker's template id carries, or null. Pure (the
 *  renderer reads the mirrored entity through it). */
export function smithHeartSealMaskOf(templateId: string): number | null {
  if (!templateId.startsWith(SMITH_HEART_SEAL_PREFIX)) return null;
  const n = Number(templateId.slice(SMITH_HEART_SEAL_PREFIX.length));
  return Number.isInteger(n) && n >= 0 && n <= SMITH_HEART_SEAL_FULL ? n : null;
}

/** Is `vein` lit in `mask`? Pure. */
export function smithHeartVeinLit(mask: number, vein: SmithHeartVein): boolean {
  return (mask & SMITH_HEART_VEIN_BITS[vein]) !== 0;
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
  /** The causeways into the Heart are open (seal lit and the Ring clear). */
  heartOpen: boolean;
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
    heartOpen: sealLit && ringClear,
  };
}

/** The English line each vein's lighting sends to the raid (re-localized by
 *  src/ui/sim_i18n.ts, EXACT matcher). */
export const SMITH_HEART_VEIN_LIT_LOG: Readonly<Record<SmithHeartVein, string>> = {
  hammer: 'An ochre light runs down from the Pit toward the heart seal.',
  breath: 'A storm-blue light runs down the Breath toward the heart seal.',
  quench: 'An ice-pale light runs up the Quench toward the heart seal.',
  heat: 'A white-gold light runs out of the forge toward the heart seal.',
};

/** The claim's seal markers' current mask (the first marker's; all agree). */
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
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e || Math.abs(e.pos.x - o.x) >= 300 || Math.abs(e.pos.z - o.z) >= 250) continue;
    ctx.emit({ type: 'log', text, color: '#e8c070', pid: meta.entityId });
  }
}

/** One tick of one claim's seal: write the earned mask onto every marker and
 *  tell the raid about each vein that lit since the last tick. */
export function tickSmithHeartSeal(ctx: SimContext, inst: InstanceSlot): void {
  const before = markerMask(ctx, inst);
  if (before === null) return;
  const mask = smithHeartEarnedMask(ctx, inst);
  if (mask === before) return;
  const template = smithHeartSealTemplate(mask);
  for (const id of inst.objectIds) {
    const e = ctx.entities.get(id);
    if (e && smithHeartSealMaskOf(e.templateId) !== null) e.templateId = template;
  }
  for (const v of SMITH_HEART_VEINS) {
    if (smithHeartVeinLit(mask, v) && !smithHeartVeinLit(before, v)) {
      announce(ctx, inst, SMITH_HEART_VEIN_LIT_LOG[v]);
    }
  }
}

/** One tick of every Smith's Heart claim (instances/dungeons.ts). Allocation
 *  free: the claim list is walked in place. */
export function tickSmithHeart(ctx: SimContext): void {
  for (const inst of ctx.instances) {
    if (inst.partyKey === null || inst.dungeonId !== SMITH_HEART_DUNGEON) continue;
    tickSmithHeartSeal(ctx, inst);
  }
}
