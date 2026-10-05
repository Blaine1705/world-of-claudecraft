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

import { MOBS } from '../../sim/data';
import {
  BONEGUARD_ID,
  BONEWALKER_ID,
  SCALEGUARD_ID,
} from '../../sim/encounters/gravewyrm_sanctum/ids';
import {
  SANCTUM_CINDER_BREATH,
  SANCTUM_COUNTERWEIGHT_LASH,
} from '../../sim/mob/trash_kit/sanctum_cast_ids';
import {
  BONEWALKER_RISE_GESTURE,
  SANCTUM_DRAWN_HEIGHTS,
  sanctumDrawnHeight,
} from '../gravewyrm_sanctum_fx/sanctum_fx_core';
import type { VisualDef } from './manifest';

const CREATURES = 'models/creatures';

/** A clip's play rate that lands its contact frame on a bar's last frame. */
export function barRate(contact: number, bar: number | undefined): number {
  return bar && bar > 0 ? contact / bar : 1;
}

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

// ---- Sanctum Scaleguard ---------------------------------------------------------------

/** The Sanctum Scaleguard: one of Korzul's drowned brood, upright on digitigrade
 *  legs, gill fans and a spined crest, embers still glowing in its throat, the
 *  Smith's iron collar and pauldron, a ringed halberd (52 bones). */
export const SCALEGUARD_BODY: SanctumTrashBody = {
  url: `${CREATURES}/sanctum_scaleguard.glb`,
  idleHeight: 4.7,
  walkRef: 1.6,
  runRef: 6.33,
};

/** Its clips' contact frames (seconds at 1x): the cinders leave the jaws,
 *  the tail crosses the rear. */
export const SCALEGUARD_CLIP = { cinderBreath: 2.0, counterweightLash: 1.0 } as const;

const scaleguard = MOBS[SCALEGUARD_ID];

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
  // 4.7 yd to its halberd's spike at its 1.45 (the crest about 4.4). Both bars
  // land on their clips' contact: the Cinder Breath's head-drive on the 2 s
  // bar's end, the Counterweight Lash's tail crossing the cone behind it on
  // the 1 s bar's end; each plays its follow-through out.
  sanctum_scaleguard: {
    ...sized(SCALEGUARD_BODY, SCALEGUARD_ID),
    clips: {
      idle: 'Idle',
      combatIdle: 'CombatIdle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack', 'Attack2'],
      hit: ['Hit'],
      death: 'Death',
      castByAbility: {
        [SANCTUM_CINDER_BREATH]: 'CinderBreath',
        [SANCTUM_COUNTERWEIGHT_LASH]: 'CounterweightLash',
      },
      castTimeScaleByAbility: {
        [SANCTUM_CINDER_BREATH]: barRate(
          SCALEGUARD_CLIP.cinderBreath,
          scaleguard?.breathCone?.castTime,
        ),
        [SANCTUM_COUNTERWEIGHT_LASH]: barRate(
          SCALEGUARD_CLIP.counterweightLash,
          scaleguard?.trashKit?.tailLash?.castTime,
        ),
      },
      castPlayOut: ['CinderBreath', 'CounterweightLash'],
    },
    castClipSync: true,
    castPlayOutHoldsAttacks: true,
    attackTimeScale: 1,
    deathTimeScale: 1,
    authoredAtlas: true,
    selfIllumination: 0.06,
  },
};
