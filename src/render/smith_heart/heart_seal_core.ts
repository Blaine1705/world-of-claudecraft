// The renderer's memory of each Smith's Heart claim's heart seal: which veins
// burn on it, and when each lit. The run's seal markers carry the lit-vein
// mask in their template id (`smith_heart_seal_<mask>`,
// sim/encounters/smith_heart/seal.ts); every marker view the renderer builds
// reports what it shows here (../gate_objects.ts, the same seam the
// Gravewyrm Sanctum's story markers ride), and the seal and the light-rivers
// read the slot's view each frame.
//
// A marker is rebuilt on every template swap, so the newest observation is
// the claim's current mask. A vein first seen already lit snaps (a raid
// arriving at a lit seal sees it burning, no replay); a vein seen lighting
// records when, so its river runs and its quarter flares. A mask that LOSES a
// vein is a fresh claim in the same slot (the run's mask only ever grows), so
// the slot starts over, snapped.
//
// Pure and Three-free (the clock is passed in, render seconds).

import {
  HEART_ALTARS,
  SMITH_HEART_VEINS,
  type SmithHeartVein,
} from '../../sim/content/smith_heart_layout';
import { DUNGEONS, instanceOrigin, instanceSlotForZ } from '../../sim/data';
import { smithHeartSealMaskOf, smithHeartVeinLit } from '../../sim/encounters/smith_heart/seal';

/** The dungeon id whose markers this memory reads. */
export const HEART_SEAL_DUNGEON = 'smith_heart';
/** Seconds a vein counts as "lit long ago" when first seen lit. */
const SNAPPED = 999;

interface SlotMemory {
  mask: number;
  /** When each vein (SMITH_HEART_VEINS order) lit, render seconds, or
   *  Infinity while dark. */
  litAt: number[];
}

const memory = new Map<string, SlotMemory>();

/** The memory key of the slot anchored at (ox, oz). */
export function heartSealSlotKey(ox: number, oz: number): string {
  return `${Math.round(ox)}|${Math.round(oz)}`;
}

function fresh(mask: number, now: number): SlotMemory {
  return {
    mask,
    litAt: SMITH_HEART_VEINS.map((v) => (smithHeartVeinLit(mask, v) ? now - SNAPPED : Infinity)),
  };
}

/** Record a seal mask seen for slot `key` at render time `now`. */
export function observeHeartSealMask(key: string, mask: number, now: number): void {
  const m = memory.get(key);
  // A vein going dark is a fresh claim (or a dev reset): start over, snapped.
  if (!m || (m.mask & ~mask) !== 0) {
    memory.set(key, fresh(mask, now));
    return;
  }
  if (mask === m.mask) return;
  SMITH_HEART_VEINS.forEach((v, i) => {
    if (smithHeartVeinLit(mask, v) && !smithHeartVeinLit(m.mask, v)) m.litAt[i] = now;
  });
  m.mask = mask;
}

interface MarkerLike {
  templateId: string;
  dungeonId: string | null;
  pos: { x: number; z: number };
}

/** Is this template id a Smith's Heart seal marker's? */
export function isHeartSealMarker(templateId: string): boolean {
  return smithHeartSealMaskOf(templateId) !== null;
}

/** Report a mirrored entity: a seal marker records its mask under its slot;
 *  any other entity is ignored. */
export function observeHeartSealMarker(e: MarkerLike, now: number): void {
  const mask = smithHeartSealMaskOf(e.templateId);
  if (mask === null || e.dungeonId !== HEART_SEAL_DUNGEON) return;
  const def = DUNGEONS[HEART_SEAL_DUNGEON];
  if (!def) return;
  const o = instanceOrigin(def.index, instanceSlotForZ(e.pos.z));
  observeHeartSealMask(heartSealSlotKey(o.x, o.z), mask, now);
}

export interface HeartSealView {
  mask: number;
  /** Seconds since each vein lit (SMITH_HEART_VEINS order), -1 while dark. */
  since: number[];
}

export function newHeartSealView(): HeartSealView {
  return { mask: 0, since: SMITH_HEART_VEINS.map(() => -1) };
}

/** The slot's seal at `now`, written into `out` (allocation-free: the frame
 *  driver calls it every frame). An unseen slot is dark. */
export function heartSealView(
  key: string,
  now: number,
  out: HeartSealView = newHeartSealView(),
): HeartSealView {
  const m = memory.get(key);
  out.mask = m ? m.mask : 0;
  for (let i = 0; i < SMITH_HEART_VEINS.length; i++) {
    const at = m ? m.litAt[i] : Infinity;
    out.since[i] = Number.isFinite(at) ? now - at : -1;
  }
  return out;
}

/** Seconds a quarter takes to flare up to full once its vein lights. */
export const HEART_SEAL_FLARE_SECONDS = 1.6;

/** A quarter's brightness: 0 dark, 1 burning; a fresh light overshoots a
 *  little and settles (a flare), then holds. */
export function heartSealQuarterLevel(since: number): number {
  if (since < 0) return 0;
  const t = since / HEART_SEAL_FLARE_SECONDS;
  if (t >= 1) return 1;
  return Math.min(1.35, t * 1.6) * (1 - t) + t;
}

/** The seal's four quarters: each vein's, centred on the bearing (degrees
 *  clockwise from north) of its altar before its mouth. */
export const HEART_SEAL_QUARTERS: readonly { vein: SmithHeartVein; bearingDeg: number }[] =
  HEART_ALTARS.map((a) => ({
    vein: a.vein,
    bearingDeg: ((((Math.atan2(a.x, a.z) * 180) / Math.PI) % 360) + 360) % 360,
  }));

/** Forget every slot (tests). */
export function clearHeartSealForTest(): void {
  memory.clear();
}
