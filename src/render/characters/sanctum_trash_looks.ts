// The Gravewyrm Sanctum trash's own Blender bodies (delivered to
// E:/woc/entregas/santuario/trash; the builders are kept under
// scripts/assets/gravewyrm_sanctum_trash/). Each one replaces its re-tinted
// placeholder in sanctum_creature_looks.ts under the same visual key, so the
// mob ids, the templates and the fx stay as they are.
//
// Every body is drawn at its SANCTUM_DRAWN_HEIGHTS row (the fx place their
// fires, tethers and glows on it): `height` is that row over the template's
// sim scale, and the gaits' reference speeds are the authored ones times the
// drawn size over the authored size. Every bar the sim casts that has a body
// clip plays it with its contact frame on the bar's end (castClipSync, rate =
// contact / bar).

import { BONEGUARD_ID, BONEWALKER_ID } from '../../sim/encounters/gravewyrm_sanctum/ids';
import {
  BONEWALKER_RISE_GESTURE,
  SANCTUM_DRAWN_HEIGHTS,
  sanctumDrawnHeight,
} from '../gravewyrm_sanctum_fx/sanctum_fx_core';
import type { VisualDef } from './manifest';

const CREATURES = 'models/creatures';

/** One authored body: its Idle bounds height and gaits as built (yards, yd/s). */
export interface SanctumTrashBody {
  readonly url: string;
  /** The Idle bounds height as authored (what the renderer normalizes). */
  readonly idleHeight: number;
  readonly walkRef: number;
  readonly runRef: number;
}

/** In-game yards per authored yard: the template's drawn row over the body. */
export function trashModelScale(body: SanctumTrashBody, templateId: string): number {
  return (SANCTUM_DRAWN_HEIGHTS[templateId] ?? body.idleHeight) / body.idleHeight;
}

/** The url, the look's height and the gaits scaled to the drawn size. */
function sized(body: SanctumTrashBody, templateId: string) {
  const k = trashModelScale(body, templateId);
  return {
    url: body.url,
    height: sanctumDrawnHeight(templateId, 1),
    walkRef: body.walkRef * k,
    runRef: body.runRef * k,
  };
}

// ---- Sanctum Boneguard and the Raised Bonewalker ------------------------------------

/** The Sanctum Boneguard: one of the held dead thawed out, a tall soldier of
 *  the Smith's age in his old frosted plate, the Smith's rune glowing up his
 *  notched blade (52 bones, ten clips). */
export const BONEGUARD_BODY: SanctumTrashBody = {
  url: `${CREATURES}/sanctum_boneguard.glb`,
  idleHeight: 4.56,
  walkRef: 1.51,
  runRef: 5.81,
};

/** The Raised Bonewalker: the same dead worse kept (no helm, the skull split,
 *  no backplate, the sword snapped in half), on the same rig and clips. */
export const BONEWALKER_BODY: SanctumTrashBody = {
  url: `${CREATURES}/sanctum_raised_bonewalker.glb`,
  idleHeight: 4.4,
  walkRef: 1.51,
  runRef: 5.81,
};

/** Thaw: the soldier tears free of the ice, crouched, and straightens into
 *  his guard (the ice bursts at 0.45 s and 1.05 s). The Boneguard's respawn
 *  and every Bonewalker's arrival. */
const DEAD_CLIPS = {
  idle: 'Idle',
  combatIdle: 'CombatIdle',
  walk: 'Walk',
  // Onrush rides the run (the sim moves it at three times; the run clamps).
  run: 'Run',
  attack: ['Attack', 'Attack2', 'Attack3'],
  hit: ['Hit'],
  death: 'Death',
  flourish: 'Thaw',
} as const;

export const SANCTUM_TRASH_LOOKS: Record<string, VisualDef> = {
  // 4.6 yd to the helm's peak at its 1.15.
  sanctum_boneguard: {
    ...sized(BONEGUARD_BODY, BONEGUARD_ID),
    clips: { ...DEAD_CLIPS, attack: [...DEAD_CLIPS.attack], hit: [...DEAD_CLIPS.hit] },
    oneShotsHoldAttacks: ['Thaw'],
    attackTimeScale: 1,
    deathTimeScale: 1,
    authoredAtlas: true,
    selfIllumination: 0.06,
  },
  // 3.7 yd at its 1.0: a size smaller than the Boneguard it was. A Thaw the
  // Held corpse or one of Velkhar's adds climbs out of the ice on arrival
  // (sanctum_kit_fx.ts offers BONEWALKER_RISE_GESTURE when it is first seen).
  sanctum_raised_bonewalker: {
    ...sized(BONEWALKER_BODY, BONEWALKER_ID),
    clips: {
      ...DEAD_CLIPS,
      attack: [...DEAD_CLIPS.attack],
      hit: [...DEAD_CLIPS.hit],
      entrance: 'Thaw',
    },
    entranceGesture: BONEWALKER_RISE_GESTURE,
    oneShotsHoldAttacks: ['Thaw'],
    attackTimeScale: 1,
    deathTimeScale: 1,
    authoredAtlas: true,
    selfIllumination: 0.06,
  },
};
